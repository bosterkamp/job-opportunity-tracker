import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  findPossibleDuplicate,
  isFollowUpDue,
  OPEN_STAGES,
  STAGE_IDS,
  WORK_ARRANGEMENTS,
  type LeadWithOpportunities,
  type Opportunity,
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

const summary = (o: Opportunity) => ({
  id: o.id,
  company: o.company,
  title: o.title,
  stage: o.stage,
  status: o.status,
  interest: o.interest ?? null,
  salaryMin: o.salaryMin ?? null,
  salaryMax: o.salaryMax ?? null,
  interviewCount: o.interviewCount ?? 0,
  lastStageChangeAt: o.lastStageChangeAt,
  followUpDate: o.followUpDate ?? null,
  postedUntil: o.postedUntil ?? null,
});

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
          items: all.slice(offset, offset + limit).map(summary),
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
        return { total: matches.length, items: matches.slice(0, limit).map(summary) };
      }),
  );

  server.registerTool(
    'get_opportunity',
    {
      title: 'Get an opportunity',
      description:
        'Gets one opportunity with every detail and its full stage history, oldest first. ' +
        'History entries with via "CLAUDE" were made through Claude. changeCount is needed to ' +
        'move it to another stage. lead is the networking lead it came through, or null.',
      inputSchema: { id: z.string().min(1).max(100) },
      annotations: READ_ONLY,
    },
    ({ id }) =>
      run(async () => {
        const opportunity = (await expectOk(
          api('GET', `/opportunities/${encodeURIComponent(id)}`),
        )) as Opportunity;
        // A link to a lead that's gone reads as no lead.
        const lead = opportunity.leadId
          ? (await listLeads(api)).find((l) => l.id === opportunity.leadId)
          : undefined;
        return { ...opportunity, lead: lead ? leadFields(lead) : null };
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
            return { added: false, duplicateOf: summary(existing) };
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

  // Interviews (feature 005). Claude can log and change them, but not remove them: removing
  // is deleting data, which only the web app does (Principle IV).
  const heldAt = z
    .string()
    .describe('When the interview happened: an ISO date-time, not in the future; defaults to now');
  const interviewsPath = (id: string) => `/opportunities/${encodeURIComponent(id)}/interviews`;

  server.registerTool(
    'add_interview',
    {
      title: 'Log an interview',
      description:
        "Logs an interview the owner has had for an opportunity (at most 6 each). It doesn't " +
        'change the stage: use move_opportunity for that.',
      inputSchema: {
        opportunity_id: z.string().min(1).max(100).describe("The opportunity's id"),
        held_at: heldAt.optional(),
        note: z
          .string()
          .describe('Optional note, such as the interviewer or the kind of interview')
          .optional(),
      },
      annotations: CHANGES,
    },
    ({ opportunity_id: id, held_at: heldAtValue, note }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(
          api('POST', interviewsPath(id), { body: { heldAt: heldAtValue, note } }),
        )) as Record<string, unknown>;
      }),
  );

  server.registerTool(
    'update_interview',
    {
      title: 'Change an interview',
      description:
        "Changes an interview's date or note. Interviews can be removed only in the web app.",
      inputSchema: {
        opportunity_id: z.string().min(1).max(100).describe("The opportunity's id"),
        interview_id: z
          .string()
          .min(1)
          .max(100)
          .describe("The interview's id, from get_opportunity"),
        held_at: heldAt.optional(),
        note: z.string().nullable().describe('null clears the note').optional(),
      },
      annotations: CHANGES,
    },
    ({ opportunity_id: id, interview_id: interviewId, held_at: heldAtValue, note }) =>
      run(async () => {
        await takeChange(now());
        return (await expectOk(
          api('PATCH', `${interviewsPath(id)}/${encodeURIComponent(interviewId)}`, {
            body: { heldAt: heldAtValue, note },
          }),
        )) as Record<string, unknown>;
      }),
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
