import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  customFieldId,
  customKey,
  findPossibleDuplicate,
  INTERVIEW_FORMATS,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  interviewSummary,
  isFollowUpDue,
  isOffer,
  isPastInterview,
  OFFER_DETAILS,
  offerFieldName,
  offerOverall,
  OPEN_STAGES,
  parseAmount,
  STAGE_IDS,
  WORK_ARRANGEMENTS,
  type LeadWithOpportunities,
  type OfferDetail,
  type OfferFields,
  type Opportunity,
  type OpportunityWithHistory,
  type OpportunityStatus,
  type PostingDetails,
} from '@jot/shared';
import { z } from 'zod';
import { expectOk, ToolError, type ApiCall } from './apiCall.js';
import type { TakeChange } from './rateLimit.js';

// The tools Claude can call (contracts/mcp-tools.md).

export interface ToolDeps {
  api: ApiCall;
  now: () => Date;
}

// A tool's result: the data as structured content, with a JSON copy as text.
function ok(data: Record<string, unknown>): CallToolResult {
  return {
    structuredContent: data,
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

// A refusal Claude can explain: the web app's code and message.
function refused(error: unknown): CallToolResult {
  if (error instanceof ToolError) {
    return { isError: true, content: [{ type: 'text', text: `${error.code}: ${error.message}` }] };
  }
  throw error;
}

async function run(work: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    return ok(await work());
  } catch (error) {
    return refused(error);
  }
}

// In a summary, interviewCount is how many have happened, as the board shows it, and
// nextInterviewAt is the next upcoming one (feature 012).
const summary = (o: Opportunity, now: Date) => ({
  id: o.id,
  company: o.company,
  title: o.title,
  stage: o.stage,
  status: o.status,
  interest: o.interest ?? null,
  salaryMin: o.salaryMin ?? null,
  salaryMax: o.salaryMax ?? null,
  interviewCount: interviewSummary(o, now).held,
  nextInterviewAt: interviewSummary(o, now).nextAt ?? null,
  lastStageChangeAt: o.lastStageChangeAt,
  followUpDate: o.followUpDate ?? null,
  postedUntil: o.postedUntil ?? null,
});

// The opportunity as the web API returns it, with each interview marked upcoming or not.
function withUpcoming(o: OpportunityWithHistory, now: Date): Record<string, unknown> {
  return {
    ...o,
    interviews: o.interviews?.map((interview) => ({
      ...interview,
      upcoming: !isPastInterview(interview.heldAt, now),
    })),
  };
}

async function list(api: ApiCall, status: OpportunityStatus): Promise<Opportunity[]> {
  const body = (await expectOk(api('GET', '/opportunities', { query: { status } }))) as {
    items: Opportunity[];
  };
  return body.items;
}

async function listLeads(api: ApiCall): Promise<LeadWithOpportunities[]> {
  const body = (await expectOk(api('GET', '/leads'))) as { items: LeadWithOpportunities[] };
  return body.items;
}

// A networking lead (feature 010), with null for a missing email or phone.
const leadFields = ({ id, name, email, phone }: LeadWithOpportunities) => ({
  id,
  name,
  email: email ?? null,
  phone: phone ?? null,
});

// Offers (feature 013). Claude names custom fields, not their ids: values and scores are keyed
// by the field's name, and the history names fields as the web app does.
async function offerFields(api: ApiCall): Promise<OfferFields> {
  return (await expectOk(api('GET', '/offer-fields'))) as OfferFields;
}

function namedKey(key: string, fields: OfferFields): string {
  return customFieldId(key) === undefined
    ? key
    : offerFieldName(key, fields.fields, fields.removed);
}

function namedOffer(o: Opportunity, fields: OfferFields) {
  if (!o.offer) {
    return { offer: null, offerScores: null, offerOverall: null };
  }
  const { custom, ...details } = o.offer;
  const current = new Map(fields.fields.map((field) => [field.id, field.name]));
  const scores = o.offerScores ?? {};
  return {
    offer: {
      ...details,
      custom: Object.fromEntries(
        Object.entries(custom ?? {}).flatMap(([id, value]): [string, string][] => {
          const name = current.get(id);
          return name === undefined ? [] : [[name, value]];
        }),
      ),
    },
    offerScores: Object.fromEntries(
      Object.entries(scores).flatMap(([key, score]): [string, number][] => {
        const id = customFieldId(key);
        return id === undefined || current.has(id) ? [[namedKey(key, fields), score]] : [];
      }),
    ),
    offerOverall: offerOverall(scores, fields.fields) ?? null,
  };
}

// The opportunity as get_opportunity gives it, with its offer and the offer's history named.
async function withOffer(api: ApiCall, o: OpportunityWithHistory, now: Date) {
  const view = withUpcoming(o, now);
  if (!o.offer) {
    return { ...view, offer: null, offerScores: null, offerOverall: null, offerHistory: [] };
  }
  const fields = await offerFields(api);
  return {
    ...view,
    ...namedOffer(o, fields),
    offerHistory: (o.offerHistory ?? []).map((entry) => ({
      ...entry,
      changes: entry.changes.map((change) => ({
        ...change,
        field: namedKey(change.field, fields),
      })),
    })),
  };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function registerReadTools(server: McpServer, { api, now }: ToolDeps): void {
  server.registerTool(
    'list_opportunities',
    {
      title: 'List opportunities',
      description:
        'Lists the owner\'s job opportunities, most recent stage change first. view "open" (the ' +
        'default) lists open ones, optionally in one stage; "archive" lists closed ones with their ' +
        'outcome; "follow_up_due" lists open ones whose follow-up date is today or earlier (UTC). ' +
        'Use limit and offset to page through long lists.',
      inputSchema: {
        view: z.enum(['open', 'archive', 'follow_up_due']).default('open'),
        stage: z.enum(OPEN_STAGES as [string, ...string[]]).optional(),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
      },
      annotations: READ_ONLY,
    },
    ({ view, stage, limit, offset }) =>
      run(async () => {
        if (stage && view !== 'open') {
          throw new ToolError('VALIDATION_ERROR', 'A stage only applies to the open view');
        }
        // The server has no browser time zone, so "today" is the UTC date.
        // Stryker disable next-line MethodExpression: a YYYY-MM-DD date compares the same against the full timestamp
        const today = now().toISOString().slice(0, 10);
        const all = (await list(api, view === 'archive' ? 'CLOSED' : 'OPEN')).filter(
          (o) =>
            (!stage || o.stage === stage) &&
            (view !== 'follow_up_due' || isFollowUpDue(o.followUpDate, today)),
        );
        return {
          total: all.length,
          offset,
          items: all.slice(offset, offset + limit).map((o) => summary(o, now())),
        };
      }),
  );

  server.registerTool(
    'find_opportunities',
    {
      title: 'Find opportunities',
      description:
        'Finds opportunities, open or closed, whose company or job title contains the text ' +
        '(any case). Use it to get an id before get_opportunity, update_opportunity, or ' +
        'move_opportunity. If several match, ask the owner which one they mean.',
      inputSchema: {
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: READ_ONLY,
    },
    ({ query, limit }) =>
      run(async () => {
        const needle = query.toLowerCase();
        const matches = [...(await list(api, 'OPEN')), ...(await list(api, 'CLOSED'))].filter((o) =>
          `${o.company}\n${o.title}`.toLowerCase().includes(needle),
        );
        return {
          total: matches.length,
          items: matches.slice(0, limit).map((o) => summary(o, now())),
        };
      }),
  );

  server.registerTool(
    'get_opportunity',
    {
      title: 'Get an opportunity',
      description:
        'Gets one opportunity with every detail and its full stage history, oldest first. ' +
        'History entries with via "CLAUDE" were made through Claude. changeCount is needed to ' +
        'move it to another stage. lead is the networking lead it came through, or null. offer ' +
        'is its offer (custom fields by name), with offerScores (0 not offered, 1 worst to 5 ' +
        'best), offerOverall (their average) and offerHistory (each saved change, oldest first).',
      inputSchema: { id: z.string().min(1).max(100) },
      annotations: READ_ONLY,
    },
    ({ id }) =>
      run(async () => {
        const opportunity = (await expectOk(
          api('GET', `/opportunities/${encodeURIComponent(id)}`),
        )) as OpportunityWithHistory;
        // A link to a lead that's gone reads as no lead.
        const lead = opportunity.leadId
          ? (await listLeads(api)).find((l) => l.id === opportunity.leadId)
          : undefined;
        return {
          ...(await withOffer(api, opportunity, now())),
          lead: lead ? leadFields(lead) : null,
        };
      }),
  );

  server.registerTool(
    'list_leads',
    {
      title: 'List networking leads',
      description:
        "Lists the owner's networking leads: people helping them find jobs, by name, each with " +
        'the opportunities linked to it and its notes from conversations, newest first. Use ' +
        "a lead's id as leadId in add_opportunity or update_opportunity, and as lead_id in " +
        'add_lead_note.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => ({
        leads: (await listLeads(api)).map((lead) => ({
          ...leadFields(lead),
          opportunities: lead.opportunities.map(({ id, company, title, stage }) => ({
            id,
            company,
            title,
            stage,
          })),
          notes: lead.notes.map(({ id, heldAt, text }) => ({ id, heldAt, text })),
        })),
      })),
  );

  server.registerTool(
    'list_offers',
    {
      title: 'List offers',
      description:
        'Lists every opportunity with an offer, or in the Offer stage, open ones first, each ' +
        'with its offer (custom fields by name), its scores (0 not offered, 1 worst to 5 best) ' +
        'and its overall score, the average of its scores. fields are the custom fields every ' +
        'offer shares. Use it to compare offers.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const fields = await offerFields(api);
        const all = [...(await list(api, 'OPEN')), ...(await list(api, 'CLOSED'))].filter(isOffer);
        return {
          fields: fields.fields.map(({ name }) => name),
          items: all.map((o) => {
            const named = namedOffer(o, fields);
            return {
              id: o.id,
              company: o.company,
              title: o.title,
              stage: o.stage,
              status: o.status,
              offer: named.offer,
              scores: named.offerScores,
              overall: named.offerOverall,
            };
          }),
        };
      }),
  );
}

// What Claude calls each offer detail, and the API's name for it.
const OFFER_TOOL_NAMES: Record<string, OfferDetail> = {
  base_salary: 'baseSalary',
  bonus_percent: 'bonusPercent',
  sign_on_bonus: 'signOnBonus',
  equity: 'equity',
  retirement: 'retirement',
  insurance: 'insurance',
  location: 'location',
  work_arrangement: 'workArrangement',
  title: 'title',
  role: 'role',
  pto: 'pto',
  leadership: 'leadership',
  culture: 'culture',
  start_date: 'startDate',
  respond_by: 'respondBy',
};
const toolName = (detail: OfferDetail) =>
  Object.keys(OFFER_TOOL_NAMES).find((name) => OFFER_TOOL_NAMES[name] === detail) as string;

const amount = z
  .union([z.number(), z.string()])
  .describe('A whole amount, like 165000 or "165k" (no currency)');
const offerText = (hint: string) => z.string().describe(hint);
const OFFER_INPUTS = {
  base_salary: amount,
  bonus_percent: z.number().describe('The bonus as a percentage of base, 0 to 100, like 12.5'),
  sign_on_bonus: amount,
  equity: offerText('Equity or stock, as offered'),
  retirement: offerText('The 401k contribution, such as "100% match up to 6%"'),
  insurance: offerText('Insurance benefits'),
  location: offerText('Where the job is'),
  work_arrangement: z.enum(WORK_ARRANGEMENTS).describe('ONSITE, HYBRID or REMOTE'),
  title: offerText('The job title as offered'),
  role: offerText('The role as offered'),
  pto: offerText('Paid time off, such as "20 days"'),
  leadership: offerText('What the owner knows of the leadership'),
  culture: offerText('What the owner knows of the culture'),
  start_date: offerText('YYYY-MM-DD'),
  respond_by: offerText('YYYY-MM-DD: when the owner must answer by'),
};
const offerInputs = Object.fromEntries(
  Object.entries(OFFER_INPUTS).map(([name, type]) => [
    name,
    type
      .nullable()
      .describe(`${type.description as string}; null clears it`)
      .optional(),
  ]),
) as Record<string, z.ZodOptional<z.ZodNullable<z.ZodType>>>;

// A custom field by name, regardless of case.
function fieldByName(fields: OfferFields, name: string) {
  const wanted = name.trim().toLowerCase();
  const field = fields.fields.find((f) => f.name.toLowerCase() === wanted);
  if (!field) {
    throw new ToolError('VALIDATION_ERROR', `Unknown custom field: ${name}`);
  }
  return field;
}

export interface WriteToolDeps extends ToolDeps {
  // Takes one change from the per-minute limit, or throws RATE_LIMITED.
  takeChange: TakeChange;
  // Reads a posting link through the import function (feature 002).
  readPosting: (url: string) => Promise<PostingDetails>;
}

// Plain inputs: the web API validates them, so refusals carry the web app's own messages.
const detailTypes = {
  contact: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  description: z.string(),
  interest: z.number().int().describe('1 to 5 stars'),
  postingUrl: z.string(),
  location: z.string(),
  workArrangement: z.enum(WORK_ARRANGEMENTS),
  salaryMin: z
    .number()
    .int()
    .describe('Lowest salary as a whole number, like 150000 (no currency or pay period)'),
  salaryMax: z
    .number()
    .int()
    .describe('Highest salary as a whole number, like 180000 (no currency or pay period)'),
  compensation: z.string().describe('Pay notes: bonus, equity, currency, or pay period'),
  source: z.string().describe('Where the owner found the job'),
  followUpDate: z.string().describe('YYYY-MM-DD'),
  postedUntil: z.string().describe('YYYY-MM-DD: the date the job posting is up until'),
  leadId: z.string().describe('The networking lead it came through: an id from list_leads'),
  notes: z.string(),
  createdAt: z
    .string()
    .describe('Date added: an ISO date-time, not in the future; defaults to now'),
};
type DetailTypes = typeof detailTypes;
// Adding: every detail is optional.
const detailFields = Object.fromEntries(
  Object.entries(detailTypes).map(([name, type]) => [name, type.optional()]),
) as { [K in keyof DetailTypes]: z.ZodOptional<DetailTypes[K]> };
// Editing: give only the fields to change; null clears one. The hint moves to the outer
// type, or Claude would see it only inside the "or null" alternative.
const patchFields = Object.fromEntries(
  Object.entries({ company: z.string(), title: z.string(), ...detailTypes }).map(([name, type]) => {
    const field = type.nullable().optional();
    return [name, type.description ? field.describe(type.description) : field];
  }),
) as Record<string, z.ZodOptional<z.ZodNullable<z.ZodType>>>;

const CHANGES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export function registerWriteTools(
  server: McpServer,
  { api, now, takeChange, readPosting }: WriteToolDeps,
): void {
  server.registerTool(
    'read_posting',
    {
      title: 'Read a job posting',
      description:
        'Reads the job details (company, title, description, location, work arrangement, pay, ' +
        'the date the posting is up until, and the site) from a public job posting link, as ' +
        '"Fill from link" does in the web app. ' +
        'Nothing is saved: show the owner what was found, then use add_opportunity.',
      inputSchema: { url: z.string().min(1).max(2000) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ url }) => run(async () => await readPosting(url)),
  );

  server.registerTool(
    'add_opportunity',
    {
      title: 'Add an opportunity',
      description:
        'Adds a job opportunity in the Considering stage. Company and title are required; ' +
        'everything else is optional. If an open opportunity has the same company and title, ' +
        'nothing is added and duplicateOf describes it: ask the owner, and call again with ' +
        'add_anyway true only if they want both.',
      inputSchema: {
        company: z.string(),
        title: z.string(),
        ...detailFields,
        add_anyway: z.boolean().default(false),
      },
      annotations: CHANGES,
    },
    ({ add_anyway: addAnyway, ...input }) =>
      run(async () => {
        if (!addAnyway) {
          const existing = findPossibleDuplicate(input, await list(api, 'OPEN'));
          if (existing) {
            return { added: false, duplicateOf: summary(existing, now()) };
          }
        }
        await takeChange(now());
        const created = (await expectOk(api('POST', '/opportunities', { body: input }))) as Record<
          string,
          unknown
        >;
        return { added: true, opportunity: created };
      }),
  );

  server.registerTool(
    'update_opportunity',
    {
      title: 'Update an opportunity',
      description:
        "Changes an opportunity's details (not its stage: use move_opportunity). Give only the " +
        'fields to change; null clears an optional field. Company and title can be changed but ' +
        'not cleared.',
      inputSchema: { id: z.string().min(1).max(100), ...patchFields },
      annotations: CHANGES,
    },
    ({ id, ...patch }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(
          api('PATCH', `/opportunities/${encodeURIComponent(id)}`, { body: patch }),
        )) as Record<string, unknown>;
      }),
  );

  server.registerTool(
    'move_opportunity',
    {
      title: 'Move an opportunity to another stage',
      description:
        'Moves an opportunity to another stage, recorded in its history with an optional note ' +
        'and an optional earlier date (an ISO date-time, not in the future). expected_change_count ' +
        'is the changeCount from get_opportunity; if the opportunity changed since then, call ' +
        'get_opportunity again and retry.',
      inputSchema: {
        id: z.string().min(1).max(100),
        to_stage: z.enum(STAGE_IDS),
        note: z.string().max(2000).optional(),
        changed_at: z.string().optional(),
        expected_change_count: z.number().int().min(1),
      },
      annotations: CHANGES,
    },
    ({ id, to_stage: toStage, note, changed_at: changedAt, expected_change_count: expected }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(
          api('POST', `/opportunities/${encodeURIComponent(id)}/stage-changes`, {
            body: { toStage, note, changedAt, expectedChangeCount: expected },
          }),
        )) as Record<string, unknown>;
      }),
  );

  // Interviews (features 005 and 012). Claude can add and change them, but not remove them:
  // removing is deleting data, which only the web app does (Principle IV).
  const heldAt = z
    .string()
    .describe('When the interview is: an ISO date-time, at most a year ahead; defaults to now');
  const interviewsPath = (id: string) => `/opportunities/${encodeURIComponent(id)}/interviews`;
  // The details, shared by both tools; on a change, null clears one. The API checks them.
  const details = {
    kind: z
      .enum(INTERVIEW_KINDS)
      .describe(
        'The type: HR (HR / talent advisor), HIRING_MANAGER, BUSINESS, ENGINEERING, or OTHER',
      ),
    panel: z.boolean().describe('Whether it was a panel interview'),
    format: z.enum(INTERVIEW_FORMATS).describe('PHONE, VIDEO, or IN_PERSON'),
    outcome: z
      .enum(INTERVIEW_OUTCOMES)
      .describe('How it went: WENT_WELL, NOT_SURE, or WENT_BADLY. Only once it has happened'),
    next_steps: z.string().describe('What happens next, such as "Decision by Friday"'),
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
      .describe(
        'Who was in it, at most 10: each a name, and optionally a title, email, phone, and ' +
          'LinkedIn profile address',
      ),
  };
  // On a change, null clears a detail. The description is moved outside the null, where
  // Claude reads it; every detail above has one.
  const clearable = <T extends z.ZodType>(schema: T) =>
    schema
      .nullable()
      .describe(schema.description as string)
      .optional();
  // The API's names for what Claude sends.
  const body = ({
    held_at: heldAtValue,
    next_steps: nextSteps,
    ...rest
  }: Record<string, unknown> & { held_at?: string; next_steps?: string | null }) => ({
    ...rest,
    heldAt: heldAtValue,
    nextSteps,
  });

  server.registerTool(
    'add_interview',
    {
      title: 'Add an interview',
      description:
        'Adds an interview for an opportunity, one that has happened or one coming up (at most ' +
        "6 each, upcoming ones included). It doesn't change the stage: use move_opportunity for " +
        'that. Every detail is optional. Set outcome only once the interview has happened.',
      inputSchema: {
        opportunity_id: z.string().min(1).max(100).describe("The opportunity's id"),
        held_at: heldAt.optional(),
        note: z.string().describe('A short note').optional(),
        kind: details.kind.optional(),
        panel: details.panel.optional(),
        format: details.format.optional(),
        outcome: details.outcome.optional(),
        next_steps: details.next_steps.optional(),
        interviewers: details.interviewers.optional(),
      },
      annotations: CHANGES,
    },
    ({ opportunity_id: id, ...input }) =>
      run(async () => {
        await takeChange(now());
        const updated = (await expectOk(
          api('POST', interviewsPath(id), { body: body(input) }),
        )) as OpportunityWithHistory;
        return withUpcoming(updated, now());
      }),
  );

  server.registerTool(
    'update_interview',
    {
      title: 'Change an interview',
      description:
        "Changes an interview's time or details; null clears a detail, and interviewers " +
        'replaces the whole list. Interviews can be removed only in the web app.',
      inputSchema: {
        opportunity_id: z.string().min(1).max(100).describe("The opportunity's id"),
        interview_id: z
          .string()
          .min(1)
          .max(100)
          .describe("The interview's id, from get_opportunity"),
        held_at: heldAt.optional(),
        note: z.string().nullable().describe('A short note; null clears it').optional(),
        kind: clearable(details.kind),
        panel: clearable(details.panel),
        format: clearable(details.format),
        outcome: clearable(details.outcome),
        next_steps: clearable(details.next_steps),
        interviewers: clearable(details.interviewers),
      },
      annotations: CHANGES,
    },
    ({ opportunity_id: id, interview_id: interviewId, ...patch }) =>
      run(async () => {
        await takeChange(now());
        const updated = (await expectOk(
          api('PATCH', `${interviewsPath(id)}/${encodeURIComponent(interviewId)}`, {
            body: body(patch),
          }),
        )) as OpportunityWithHistory;
        return withUpcoming(updated, now());
      }),
  );

  // Offers (feature 013). Claude can record and change them, score them, and add or rename
  // custom fields, but not remove an offer or a field: that's deleting data (Principle IV).
  const offerPath = (id: string) => `/opportunities/${encodeURIComponent(id)}/offer`;
  const opportunityId = z.string().min(1).max(100).describe("The opportunity's id");
  const changeFields = async (change: (fields: OfferFields) => { id?: string; name: string }[]) => {
    const fields = await offerFields(api);
    const next = change(fields);
    await takeChange(now());
    const saved = (await expectOk(
      api('PATCH', '/offer-fields', {
        body: { fields: next, expectedVersion: fields.version },
      }),
    )) as OfferFields;
    return { fields: saved.fields.map(({ name }) => name) };
  };

  server.registerTool(
    'update_offer',
    {
      title: 'Record or change an offer',
      description:
        'Records the offer an opportunity received, or changes it; the first call adds it. ' +
        'Give only the details to change; null clears one. custom sets custom fields by name ' +
        "(see list_offers). Each change is kept in the offer's history. The offer can be " +
        'removed only in the web app.',
      inputSchema: {
        opportunity_id: opportunityId,
        ...offerInputs,
        custom: z
          .record(z.string(), z.string().nullable())
          .describe('Custom field name to its value; null clears it')
          .optional(),
      },
      annotations: CHANGES,
    },
    ({ opportunity_id: id, custom, ...details }) =>
      run(async () => {
        const body: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(details)) {
          const detail = OFFER_TOOL_NAMES[name] as OfferDetail;
          // "170k" is read as the web form reads it; anything else goes to the API as is.
          body[detail] =
            typeof value === 'string' && (detail === 'baseSalary' || detail === 'signOnBonus')
              ? (parseAmount(value) ?? null)
              : value;
        }
        if (custom) {
          const fields = await offerFields(api);
          body.custom = Object.fromEntries(
            Object.entries(custom).map(([name, value]) => [fieldByName(fields, name).id, value]),
          );
        }
        await takeChange(now());
        const updated = (await expectOk(
          api('PATCH', offerPath(id), { body }),
        )) as OpportunityWithHistory;
        return withOffer(api, updated, now());
      }),
  );

  server.registerTool(
    'score_offer',
    {
      title: 'Score an offer',
      description:
        "Scores an offer's details for comparing offers: 0 means not offered or not applicable, " +
        '1 is worst and 5 best; null clears a score. Keys are detail names (base_salary, ' +
        `${OFFER_DETAILS.slice(1).map(toolName).join(', ')}) or custom field names. ` +
        'Scores count toward the overall score, their average.',
      inputSchema: {
        opportunity_id: opportunityId,
        scores: z
          .record(z.string(), z.number().int().min(0).max(5).nullable())
          .describe('Detail or custom field name to a score from 0 to 5, or null'),
      },
      annotations: CHANGES,
    },
    ({ opportunity_id: id, scores }) =>
      run(async () => {
        const fields = await offerFields(api);
        const body = Object.fromEntries(
          Object.entries(scores).map(([name, score]) => {
            const detail = OFFER_TOOL_NAMES[name];
            return [detail ?? customKey(fieldByName(fields, name).id), score];
          }),
        );
        await takeChange(now());
        const updated = (await expectOk(
          api('PATCH', `${offerPath(id)}/scores`, { body: { scores: body } }),
        )) as OpportunityWithHistory;
        return withOffer(api, updated, now());
      }),
  );

  server.registerTool(
    'add_offer_field',
    {
      title: 'Add a custom offer field',
      description:
        'Adds a custom field every offer gets, to compare offers on, such as "Commute". At most ' +
        '20; names are unique regardless of case. Fields can be removed only in the web app.',
      inputSchema: { name: z.string().describe('The new field, at most 60 characters') },
      annotations: CHANGES,
    },
    ({ name }) =>
      run(() =>
        changeFields((fields) => [
          ...fields.fields.map(({ id, name: n }) => ({ id, name: n })),
          { name },
        ]),
      ),
  );

  server.registerTool(
    'rename_offer_field',
    {
      title: 'Rename a custom offer field',
      description: "Renames a custom offer field, keeping every offer's value and score for it.",
      inputSchema: {
        name: z.string().describe("The field's current name"),
        new_name: z.string().describe('Its new name, at most 60 characters'),
      },
      annotations: CHANGES,
    },
    ({ name, new_name: newName }) =>
      run(() =>
        changeFields((fields) => {
          const renamed = fieldByName(fields, name);
          return fields.fields.map(({ id, name: n }) => ({
            id,
            name: id === renamed.id ? newName : n,
          }));
        }),
      ),
  );

  // Networking leads (feature 010). They can be deleted only in the web app.
  server.registerTool(
    'add_lead',
    {
      title: 'Add a networking lead',
      description:
        'Adds a networking lead: someone helping the owner find jobs. A name, and optionally an ' +
        'email and a phone; a lead has nothing else. Link opportunities to it with leadId.',
      inputSchema: {
        name: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
      },
      annotations: CHANGES,
    },
    (input) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(api('POST', '/leads', { body: input }))) as Record<string, unknown>;
      }),
  );

  server.registerTool(
    'update_lead',
    {
      title: 'Change a networking lead',
      description:
        "Changes a lead's name, email or phone. Give only the fields to change; null clears the " +
        'email or phone. Leads can be deleted only in the web app.',
      inputSchema: {
        id: z.string().min(1).max(100).describe("The lead's id, from list_leads"),
        name: z.string().optional(),
        email: z.string().nullable().describe('null clears it').optional(),
        phone: z.string().nullable().describe('null clears it').optional(),
      },
      annotations: CHANGES,
    },
    ({ id, ...patch }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(
          api('PATCH', `/leads/${encodeURIComponent(id)}`, { body: patch }),
        )) as Record<string, unknown>;
      }),
  );

  // Notes on leads (feature 011): one for each conversation. They can be deleted only in the
  // web app.
  const leadId = z.string().min(1).max(100).describe("The lead's id, from list_leads");
  const noteHeldAt = 'When the conversation happened: an ISO date-time, not in the future';
  const notesPath = (id: string) => `/leads/${encodeURIComponent(id)}/notes`;

  server.registerTool(
    'add_lead_note',
    {
      title: 'Add a note to a lead',
      description:
        'Adds a dated note to a networking lead, for a conversation with them: what was said, ' +
        'who they will introduce, when to follow up. A lead can have at most 200.',
      inputSchema: {
        lead_id: leadId,
        text: z.string().describe('What was said, as the owner tells it'),
        held_at: z.string().describe(`${noteHeldAt}; defaults to now`).optional(),
      },
      annotations: CHANGES,
    },
    ({ lead_id: id, text, held_at: heldAt }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(api('POST', notesPath(id), { body: { text, heldAt } }))) as Record<
          string,
          unknown
        >;
      }),
  );

  server.registerTool(
    'update_lead_note',
    {
      title: 'Change a note on a lead',
      description:
        "Changes a note's text or date. Give only what changes. Notes can be deleted only in " +
        'the web app.',
      inputSchema: {
        lead_id: leadId,
        note_id: z.string().min(1).max(100).describe("The note's id, from list_leads"),
        text: z.string().optional(),
        held_at: z.string().describe(noteHeldAt).optional(),
      },
      annotations: CHANGES,
    },
    ({ lead_id: id, note_id: noteId, text, held_at: heldAt }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(
          api('PATCH', `${notesPath(id)}/${encodeURIComponent(noteId)}`, {
            body: { text, heldAt },
          }),
        )) as Record<string, unknown>;
      }),
  );
}
