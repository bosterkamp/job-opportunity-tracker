import { z } from 'zod';
import { VIA } from './changeSource.js';
import { MAX_INTERVIEWS } from './interviews.js';
import { LEAD_NOTE_MESSAGES, MAX_NOTE_LENGTH } from './leadNotes.js';
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
  // How many interviews are logged (feature 005). Missing on older items, meaning none.
  interviewCount: z.number().int().min(0).max(MAX_INTERVIEWS).optional(),
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

// An interview the owner has had (feature 005).
export const InterviewSchema = z.object({
  id: z.string(),
  heldAt: Timestamp,
  note: z.string().nullable(),
  recordedAt: Timestamp,
  // Set when it was logged or last changed through Claude.
  via: z.enum(VIA).optional(),
});

// Logging an interview: when it happened (defaults to now) and an optional note.
export const InterviewInputSchema = z
  .strictObject(
    { heldAt: Timestamp.optional(), note: optionalOnCreate(shortText(200)) },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

// Changing one: only what's given; a blank or null note clears it.
export const InterviewPatchSchema = z
  .strictObject(
    { heldAt: Timestamp.optional(), note: clearableOnEdit(shortText(200)) },
    { error: unknownFieldError },
  )
  .transform(withoutUndefined);

export const OpportunityWithHistorySchema = OpportunitySchema.extend({
  history: z.array(StageChangeSchema),
  // Oldest first. Present on every response from the API since feature 005.
  interviews: z.array(InterviewSchema).optional(),
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
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type LeadInput = z.output<typeof LeadInputSchema>;
export type LeadPatch = z.output<typeof LeadPatchSchema>;
export type Lead = z.output<typeof LeadSchema>;
export type LeadOpportunity = z.output<typeof LeadOpportunitySchema>;
export type LeadWithOpportunities = z.output<typeof LeadWithOpportunitiesSchema>;
export type LeadNote = z.output<typeof LeadNoteSchema>;
export type LeadNoteInput = z.output<typeof LeadNoteInputSchema>;
export type LeadNotePatch = z.output<typeof LeadNotePatchSchema>;
