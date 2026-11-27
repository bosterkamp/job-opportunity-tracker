import { z } from 'zod';
import { VIA } from './changeSource.js';
import {
  INTERVIEW_FORMATS,
  INTERVIEW_KINDS,
  INTERVIEW_MESSAGES,
  INTERVIEW_OUTCOMES,
  isLinkedInProfile,
  MAX_INTERVIEWERS,
  MAX_INTERVIEWS,
  withHttps,
} from './interviews.js';
import { LEAD_NOTE_MESSAGES, MAX_NOTE_LENGTH } from './leadNotes.js';
import {
  isFieldId,
  isScoreKey,
  MAX_BONUS_PERCENT,
  MAX_IMPORTANCE,
  MAX_OFFER_FIELD_NAME,
  MAX_OFFER_FIELDS,
  MAX_OFFER_TEXT,
  MAX_OFFER_TITLE,
  MAX_SCORE,
  OFFER_MESSAGES,
} from './offers.js';
import { MAX_SALARY, SALARY_MESSAGE, SALARY_RANGE_MESSAGE, salaryRangeIsValid } from './salary.js';
import { STAGE_IDS } from './stages.js';

// Field rules from specs/001-job-opportunity-tracker/data-model.md. API input and the web
// forms both validate with these schemas, so the rules live in one place.

const tooLong = (max: number) => ({ error: `Must be ${max} characters or fewer` });

function isBlank(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '';
}

// Drops keys whose value is undefined, so "not provided" never appears as a key.
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function unknownFieldError(issue: { code?: string; keys?: string[] }) {
  return issue.code === 'unrecognized_keys'
    ? `Unknown field: ${issue.keys?.join(', ')}`
    : undefined;
}

// On create, a blank optional field means "not provided".
function optionalOnCreate<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (isBlank(v) ? undefined : v), schema.optional());
}

// On edit, a blank or null optional field means "clear it".
function clearableOnEdit<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (isBlank(v) ? null : v), schema.nullable()).optional();
}

// The string's own error also covers min(1), so a blank value reports the same message.
const requiredText = (message: string) =>
  z.string({ error: message }).trim().min(1).max(200, tooLong(200));

const shortText = (max: number) => z.string().trim().max(max, tooLong(max));
// Long text keeps its whitespace and line breaks exactly as pasted.
const longText = z.string().max(20_000, tooLong(20_000));

const interestMessage = { error: 'Interest must be a whole number from 1 to 5' };
const Interest = z
  .number(interestMessage)
  .int(interestMessage)
  .min(1, interestMessage)
  .max(5, interestMessage);

export const PostingUrlSchema = z.url({
  protocol: /^https?$/,
  error: 'Must be an http or https link',
});
const PostingUrl = PostingUrlSchema;

export const WORK_ARRANGEMENTS = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
const WorkArrangement = z.enum(WORK_ARRANGEMENTS, { error: 'Choose on-site, hybrid, or remote' });

// Whole numbers with no currency or pay period (feature 004). Any wrong value, including a
// string, gets the same message: the web form has already turned "150k" into a number.
const salaryMessage = { error: SALARY_MESSAGE };
const Salary = z
  .number(salaryMessage)
  .int(salaryMessage)
  .min(0, salaryMessage)
  .max(MAX_SALARY, salaryMessage);

// On create, null means not given too, as it does for an unrated interest.
const amountOnCreate = z.preprocess(
  (v) => (v === null || isBlank(v) ? undefined : v),
  Salary.optional(),
);

// When both ends are given, the minimum can't be above the maximum. A patch that changes only
// one end is checked against the stored other end by the API route.
function checkSalaryRange(
  value: { salaryMin?: number | null; salaryMax?: number | null },
  ctx: z.RefinementCtx,
) {
  if (!salaryRangeIsValid(value.salaryMin, value.salaryMax)) {
    ctx.addIssue({ code: 'custom', path: ['salaryMin'], message: SALARY_RANGE_MESSAGE });
  }
}

// A calendar date with no time: the follow-up date, and the date a posting is up until.
const CalendarDate = z.iso.date({ error: 'Use a date like 2026-11-03' });
const Timestamp = z.iso.datetime({ offset: true, error: 'Use a date and time with a time zone' });

const Email = z
  .string()
  .trim()
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const ContactSchema = z
  .strictObject(
    {
      name: optionalOnCreate(shortText(200)),
      role: optionalOnCreate(shortText(200)),
      email: optionalOnCreate(Email),
      phone: optionalOnCreate(shortText(50)),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

const hasAnyValue = (contact: object) => Object.keys(contact).length > 0;

// The networking lead an opportunity came through (feature 010), by its id.
const LeadId = shortText(100);

const createFields = {
  // A missing contact stays missing (the outer .optional()); an all-blank one is dropped.
  contact: ContactSchema.transform((c) => (hasAnyValue(c) ? c : undefined)).optional(),
  description: optionalOnCreate(longText),
  interest: Interest.nullable().optional(),
  postingUrl: optionalOnCreate(PostingUrl),
  location: optionalOnCreate(shortText(200)),
  workArrangement: optionalOnCreate(WorkArrangement),
  salaryMin: amountOnCreate,
  salaryMax: amountOnCreate,
  compensation: optionalOnCreate(shortText(500)),
  source: optionalOnCreate(shortText(200)),
  followUpDate: z.preprocess(
    (v) => (isBlank(v) ? undefined : v),
    CalendarDate.nullable().optional(),
  ),
  // When the posting says it's up until (feature 009). Any date: it may already have ended.
  postedUntil: z.preprocess((v) => (isBlank(v) ? undefined : v), CalendarDate.optional()),
  notes: optionalOnCreate(longText),
  leadId: optionalOnCreate(LeadId),
  // The date added, when it isn't now (feature 004). The API checks it isn't in the future.
  createdAt: Timestamp.optional(),
};

export const OpportunityInputSchema = z
  .strictObject(
    {
      company: requiredText('Company is required'),
      title: requiredText('Job title is required'),
      ...createFields,
    },
    { error: unknownFieldError },
  )
  .superRefine(checkSalaryRange)
  .transform(withoutUndefined);

export const OpportunityPatchSchema = z
  .strictObject(
    {
      company: requiredText('Company is required').optional(),
      title: requiredText('Job title is required').optional(),
      // Missing: unchanged (the outer .optional()). Null or all blank: cleared.
      contact: ContactSchema.nullable()
        .transform((c) => (c && hasAnyValue(c) ? c : null))
        .optional(),
      description: clearableOnEdit(longText),
      interest: Interest.nullable().optional(),
      postingUrl: clearableOnEdit(PostingUrl),
      location: clearableOnEdit(shortText(200)),
      workArrangement: clearableOnEdit(WorkArrangement),
      salaryMin: clearableOnEdit(Salary),
      salaryMax: clearableOnEdit(Salary),
      compensation: clearableOnEdit(shortText(500)),
      source: clearableOnEdit(shortText(200)),
      followUpDate: clearableOnEdit(CalendarDate),
      postedUntil: clearableOnEdit(CalendarDate),
      notes: clearableOnEdit(longText),
      leadId: clearableOnEdit(LeadId),
      // Moves the date added and the first history entry; it can't be cleared.
      createdAt: Timestamp.optional(),
    },
    { error: unknownFieldError },
  )
  .superRefine(checkSalaryRange)
  .transform(withoutUndefined);

const StageEnum = z.enum(STAGE_IDS, { error: 'Unknown stage' });
const positiveWholeNumber = { error: 'Must be a positive whole number' };
const wholeNumber = { error: 'Must be a whole number' };

export const StageChangeInputSchema = z
  .strictObject(
    {
      toStage: StageEnum,
      note: optionalOnCreate(z.string().trim().max(2000, tooLong(2000))),
      changedAt: Timestamp.optional(),
      expectedChangeCount: z
        .number(positiveWholeNumber)
        .int(positiveWholeNumber)
        .positive(positiveWholeNumber),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

// An offer (feature 013). Every detail is optional; amounts are whole numbers as the salary
// range is, and the bonus a percentage with at most one decimal place.
const bonusMessage = { error: OFFER_MESSAGES.BONUS };
const hasOneDecimal = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
const BonusPercent = z
  .number(bonusMessage)
  .min(0, bonusMessage)
  .max(MAX_BONUS_PERCENT, bonusMessage)
  .refine(hasOneDecimal, bonusMessage);

const offerText = shortText(MAX_OFFER_TEXT);
// A record's key error comes from the record, not from the key's own schema.
const keyError = (message: string) => ({
  error: (issue: { code?: string }) => (issue.code === 'invalid_key' ? message : undefined),
});
const FieldId = z.string().refine(isFieldId, { error: OFFER_MESSAGES.UNKNOWN_FIELD });

const offerTitle = shortText(MAX_OFFER_TITLE);

// Changing an offer, or adding it: only what's given; a blank or null value clears it.
// `custom` maps a custom field's id to its value, or null to clear it.
export const OfferInputSchema = z
  .strictObject(
    {
      baseSalary: clearableOnEdit(Salary),
      bonusPercent: clearableOnEdit(BonusPercent),
      signOnBonus: clearableOnEdit(Salary),
      equity: clearableOnEdit(offerText),
      retirement: clearableOnEdit(offerText),
      insurance: clearableOnEdit(offerText),
      location: clearableOnEdit(offerText),
      workArrangement: clearableOnEdit(WorkArrangement),
      title: clearableOnEdit(offerTitle),
      role: clearableOnEdit(offerText),
      pto: clearableOnEdit(offerText),
      leadership: clearableOnEdit(offerText),
      culture: clearableOnEdit(offerText),
      startDate: clearableOnEdit(CalendarDate),
      respondBy: clearableOnEdit(CalendarDate),
      custom: z
        .record(
          FieldId,
          z.preprocess((v) => (isBlank(v) ? null : v), offerText.nullable()),
          keyError(OFFER_MESSAGES.UNKNOWN_FIELD),
        )
        .optional(),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

// The offer as stored and returned.
export const OfferSchema = z.object({
  baseSalary: Salary.optional(),
  bonusPercent: z.number().optional(),
  signOnBonus: Salary.optional(),
  equity: z.string().optional(),
  retirement: z.string().optional(),
  insurance: z.string().optional(),
  location: z.string().optional(),
  workArrangement: WorkArrangement.optional(),
  title: z.string().optional(),
  role: z.string().optional(),
  pto: z.string().optional(),
  leadership: z.string().optional(),
  culture: z.string().optional(),
  startDate: CalendarDate.optional(),
  respondBy: CalendarDate.optional(),
  custom: z.record(z.string(), z.string()).optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

const scoreMessage = { error: OFFER_MESSAGES.SCORE };
const Score = z
  .number(scoreMessage)
  .int(scoreMessage)
  .min(0, scoreMessage)
  .max(MAX_SCORE, scoreMessage);
const ScoreKey = z.string().refine(isScoreKey, { error: OFFER_MESSAGES.SCORE_KEY });

// Setting scores: each key to 0–5, or null to clear it. Others are left as they are.
export const OfferScoresPatchSchema = z.strictObject(
  { scores: z.record(ScoreKey, Score.nullable(), keyError(OFFER_MESSAGES.SCORE_KEY)) },
  { error: unknownFieldError },
);

export const OfferScoresSchema = z.record(z.string(), Score);

// One saved change to an offer: what changed, from and to (null for none).
const OfferValue = z.union([z.string(), z.number()]).nullable();
export const OfferChangeSchema = z.object({
  seq: z.number().int(),
  at: Timestamp,
  kind: z.enum(['RECORDED', 'CHANGED']),
  changes: z.array(z.object({ field: z.string(), from: OfferValue, to: OfferValue })),
  via: z.enum(VIA).optional(),
});

// The custom fields every offer shares, in display order.
export const OfferFieldSchema = z.object({ id: z.string(), name: z.string() });
export const OfferFieldsSchema = z.object({
  fields: z.array(OfferFieldSchema),
  // Removed fields with their last name, so the history can still name them.
  removed: z.array(OfferFieldSchema),
  // How much each detail counts (feature 014); Normal is left out, so a missing map is all
  // Normal.
  weights: z.record(z.string(), z.number().int().min(0).max(MAX_IMPORTANCE)).default({}),
  version: z.number().int().min(0),
});

const FieldName = z
  // The string's own error also covers min(1), so a blank name says the same.
  .string({ error: OFFER_MESSAGES.FIELD_NAME })
  .trim()
  .min(1)
  .max(MAX_OFFER_FIELD_NAME, tooLong(MAX_OFFER_FIELD_NAME));

// Replacing the list: new fields have no id yet. Names are unique regardless of case.
export const OfferFieldsPatchSchema = z.strictObject(
  {
    fields: z
      .array(
        z.strictObject({ id: FieldId.optional(), name: FieldName }, { error: unknownFieldError }),
      )
      .max(MAX_OFFER_FIELDS, { error: OFFER_MESSAGES.TOO_MANY_FIELDS })
      .superRefine((fields, ctx) => {
        const seen = new Set<string>();
        fields.forEach((field, index) => {
          const key = field.name.toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'name'],
              message: OFFER_MESSAGES.duplicateField(field.name),
            });
          }
          seen.add(key);
        });
      }),
    expectedVersion: z.number(wholeNumber).int(wholeNumber).min(0, wholeNumber),
  },
  { error: unknownFieldError },
);

// Setting how much details count (feature 014): each key named to 0–3. Others are kept.
const importanceMessage = { error: OFFER_MESSAGES.IMPORTANCE };
const Importance = z
  .number(importanceMessage)
  .int(importanceMessage)
  .min(0, importanceMessage)
  .max(MAX_IMPORTANCE, importanceMessage);
const WeightKey = z.string().refine(isScoreKey, { error: OFFER_MESSAGES.WEIGHT_KEY });

export const OfferWeightsPatchSchema = z.strictObject(
  {
    weights: z
      .record(WeightKey, Importance, keyError(OFFER_MESSAGES.WEIGHT_KEY))
      .refine((weights) => Object.keys(weights).length > 0, { error: OFFER_MESSAGES.NO_WEIGHTS }),
    expectedVersion: z.number(wholeNumber).int(wholeNumber).min(0, wholeNumber),
  },
  { error: unknownFieldError },
);

// Response shapes (contracts/api.openapi.yaml), used by the web client to validate replies.
export const OpportunitySchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  contact: z
    .object({
      name: z.string().optional(),
      role: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  description: z.string().optional(),
  interest: Interest.nullable().optional(),
  postingUrl: z.string().optional(),
  location: z.string().optional(),
  workArrangement: WorkArrangement.optional(),
  salaryMin: Salary.optional(),
  salaryMax: Salary.optional(),
  // Shown as "Pay notes" (feature 004); the stored name is unchanged.
  compensation: z.string().optional(),
  source: z.string().optional(),
  followUpDate: CalendarDate.nullable().optional(),
  // The date the posting is up until (feature 009); missing when it isn't known.
  postedUntil: CalendarDate.nullable().optional(),
  notes: z.string().optional(),
  // The networking lead it came through (feature 010).
  leadId: z.string().optional(),
  stage: StageEnum,
  status: z.enum(['OPEN', 'CLOSED']),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastStageChangeAt: Timestamp,
  changeCount: z.number().int(),
  // When the details were last changed through Claude; cleared by an edit in the web app.
  detailsEditedViaClaudeAt: Timestamp.nullable().optional(),
  // How many interviews are logged (feature 005), past and upcoming. Missing on older items,
  // meaning none.
  interviewCount: z.number().int().min(0).max(MAX_INTERVIEWS).optional(),
  // When each interview is, sorted (feature 012), so the board can tell held from upcoming.
  // Missing on older items until their first interview change.
  interviewTimes: z.array(Timestamp).optional(),
  // The offer it received and the owner's scores for it (feature 013). Missing: no offer.
  offer: OfferSchema.optional(),
  offerScores: OfferScoresSchema.optional(),
});

export const StageChangeSchema = z.object({
  seq: z.number().int(),
  fromStage: StageEnum.nullable(),
  toStage: StageEnum,
  changedAt: Timestamp,
  note: z.string().nullable(),
  recordedAt: Timestamp,
  // Set only when the change was made through Claude (feature 003).
  via: z.enum(VIA).optional(),
});

// An interview's details (feature 012).
const InterviewKind = z.enum(INTERVIEW_KINDS, {
  error: 'Choose HR / talent advisor, hiring manager, business, engineering, or other',
});
const InterviewFormat = z.enum(INTERVIEW_FORMATS, { error: 'Choose phone, video, or in person' });
const InterviewOutcome = z.enum(INTERVIEW_OUTCOMES, {
  error: 'Choose went well, not sure, or went badly',
});
const Panel = z.boolean({ error: 'Choose yes or no' });

const LinkedIn = z
  .string()
  .trim()
  .transform(withHttps)
  .pipe(
    z
      .string()
      .max(300, tooLong(300))
      .refine(isLinkedInProfile, { error: INTERVIEW_MESSAGES.LINKEDIN }),
  );

// Someone met in the interview: a name, and any of the rest. Blank details are left out.
export const InterviewerSchema = z
  .strictObject(
    {
      name: z
        // The string's own error also covers min(1), so a blank name says the same.
        .string({ error: 'Name is required' })
        .trim()
        .min(1)
        .max(100, tooLong(100)),
      title: optionalOnCreate(shortText(100)),
      email: optionalOnCreate(Email.pipe(z.string().max(254, tooLong(254)))),
      phone: optionalOnCreate(shortText(50)),
      linkedin: optionalOnCreate(LinkedIn),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

const Interviewers = z
  .array(InterviewerSchema)
  .max(MAX_INTERVIEWERS, { error: INTERVIEW_MESSAGES.TOO_MANY_INTERVIEWERS });

// On create, null means not given, as a blank does.
function absentOnCreate<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === null || isBlank(v) ? undefined : v), schema.optional());
}

const isEmptyList = (v: unknown) => Array.isArray(v) && v.length === 0;

// An interview (feature 005), with its details and interviewers since feature 012.
export const InterviewSchema = z.object({
  id: z.string(),
  heldAt: Timestamp,
  note: z.string().nullable(),
  recordedAt: Timestamp,
  // Set when it was logged or last changed through Claude.
  via: z.enum(VIA).optional(),
  kind: InterviewKind.optional(),
  panel: z.boolean().optional(),
  format: InterviewFormat.optional(),
  outcome: InterviewOutcome.optional(),
  nextSteps: z.string().optional(),
  interviewers: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        linkedin: z.string().optional(),
      }),
    )
    .optional(),
});

// Logging an interview: when it is (defaults to now) and any of its details.
export const InterviewInputSchema = z
  .strictObject(
    {
      heldAt: Timestamp.optional(),
      note: optionalOnCreate(shortText(200)),
      kind: absentOnCreate(InterviewKind),
      panel: absentOnCreate(Panel),
      format: absentOnCreate(InterviewFormat),
      outcome: absentOnCreate(InterviewOutcome),
      nextSteps: optionalOnCreate(shortText(500)),
      interviewers: z.preprocess(
        (v) => (v === null || isEmptyList(v) ? undefined : v),
        Interviewers.optional(),
      ),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

// Changing one: only what's given; a blank or null value clears it, and so does an empty list
// of interviewers. A list given replaces the whole list.
export const InterviewPatchSchema = z
  .strictObject(
    {
      heldAt: Timestamp.optional(),
      note: clearableOnEdit(shortText(200)),
      kind: clearableOnEdit(InterviewKind),
      panel: Panel.nullable().optional(),
      format: clearableOnEdit(InterviewFormat),
      outcome: clearableOnEdit(InterviewOutcome),
      nextSteps: clearableOnEdit(shortText(500)),
      interviewers: z
        .preprocess((v) => (isEmptyList(v) ? null : v), Interviewers.nullable())
        .optional(),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

export const OpportunityWithHistorySchema = OpportunitySchema.extend({
  history: z.array(StageChangeSchema),
  // Oldest first. Present on every response from the API since feature 005.
  interviews: z.array(InterviewSchema).optional(),
  // The offer's history, oldest first (feature 013); on the detail response only.
  offerHistory: z.array(OfferChangeSchema).optional(),
});

// A networking lead (feature 010): someone helping the owner find jobs. A name, and an email
// and phone, nothing else (its spec, FR-002).
export const LeadInputSchema = z
  .strictObject(
    {
      name: requiredText('Name is required'),
      email: optionalOnCreate(Email),
      phone: optionalOnCreate(shortText(50)),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

export const LeadPatchSchema = z
  .strictObject(
    {
      name: requiredText('Name is required').optional(),
      email: clearableOnEdit(Email),
      phone: clearableOnEdit(shortText(50)),
    },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

export const LeadSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

// An opportunity as a lead lists it.
export const LeadOpportunitySchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  stage: StageEnum,
  status: z.enum(['OPEN', 'CLOSED']),
});

// A note on a lead (feature 011): one conversation, dated. The text keeps its line breaks.
const NoteText = z
  .string({ error: LEAD_NOTE_MESSAGES.TEXT_REQUIRED })
  .trim()
  .min(1)
  .max(MAX_NOTE_LENGTH, tooLong(MAX_NOTE_LENGTH));

export const LeadNoteSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  heldAt: Timestamp,
  text: z.string(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

// Adding one: the text, and when the conversation was (now if not given).
export const LeadNoteInputSchema = z
  .strictObject({ text: NoteText, heldAt: Timestamp.optional() }, { error: unknownFieldError })
  .transform(withoutUndefined);

// Changing one: only what's given. The text can't be cleared.
export const LeadNotePatchSchema = z
  .strictObject(
    { text: NoteText.optional(), heldAt: Timestamp.optional() },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

export const LeadWithOpportunitiesSchema = LeadSchema.extend({
  // Newest stage change first, open and closed.
  opportunities: z.array(LeadOpportunitySchema),
  // Newest first (byNewestNote).
  notes: z.array(LeadNoteSchema),
});

export type Contact = z.output<typeof ContactSchema>;
export type OpportunityInput = z.output<typeof OpportunityInputSchema>;
export type OpportunityPatch = z.output<typeof OpportunityPatchSchema>;
export type StageChangeInput = z.output<typeof StageChangeInputSchema>;
export type Opportunity = z.output<typeof OpportunitySchema>;
export type StageChange = z.output<typeof StageChangeSchema>;
export type OpportunityWithHistory = z.output<typeof OpportunityWithHistorySchema>;
export type Interview = z.output<typeof InterviewSchema>;
export type InterviewInput = z.output<typeof InterviewInputSchema>;
export type InterviewPatch = z.output<typeof InterviewPatchSchema>;
export type Interviewer = z.output<typeof InterviewerSchema>;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type LeadInput = z.output<typeof LeadInputSchema>;
export type LeadPatch = z.output<typeof LeadPatchSchema>;
export type Lead = z.output<typeof LeadSchema>;
export type LeadOpportunity = z.output<typeof LeadOpportunitySchema>;
export type LeadWithOpportunities = z.output<typeof LeadWithOpportunitiesSchema>;
export type LeadNote = z.output<typeof LeadNoteSchema>;
export type LeadNoteInput = z.output<typeof LeadNoteInputSchema>;
export type LeadNotePatch = z.output<typeof LeadNotePatchSchema>;
export type Offer = z.output<typeof OfferSchema>;
export type OfferInput = z.output<typeof OfferInputSchema>;
export type OfferScoresPatch = z.output<typeof OfferScoresPatchSchema>;
export type OfferChange = z.output<typeof OfferChangeSchema>;
export type OfferField = z.output<typeof OfferFieldSchema>;
export type OfferFields = z.output<typeof OfferFieldsSchema>;
export type OfferFieldsPatch = z.output<typeof OfferFieldsPatchSchema>;
export type OfferWeightsPatch = z.output<typeof OfferWeightsPatchSchema>;
