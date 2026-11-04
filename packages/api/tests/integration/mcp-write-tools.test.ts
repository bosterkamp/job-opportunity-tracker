// @module-tag mcp
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { IMPORT_MESSAGES, type PostingDetails } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import { createRoutes, defaultDeps } from '../../src/handler.js';
import { createTable, deleteTable } from '../../src/local/table.js';
import { apiCaller, ToolError } from '../../src/mcp/apiCall.js';
import { createChangeLimiter } from '../../src/mcp/rateLimit.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { registerReadTools, registerWriteTools } from '../../src/mcp/tools.js';
import { createDispatcher, createRouter } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, rawClient, testConfig } from './dynamo.js';

type Json = Record<string, unknown>;
type Result = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };

const posting: PostingDetails = {
  company: 'Initrode',
  title: 'Staff Engineer',
  description: 'Lead the platform.',
  source: 'Lever',
};

// A fresh table; the web API (to seed and compare) and the tools as McpFunction wires them:
// changes marked via CLAUDE, the real change limit, and a fake posting reader.
async function setup(
  readPosting: (url: string) => Promise<PostingDetails> = () => Promise.resolve(posting),
) {
  const tableName = `JobTracker-mcpw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await createTable(rawClient(), tableName);
  const config = { ...testConfig(), tableName, appEnv: 'aws' as const };
  let n = 0;
  const clock = { now: new Date('2026-10-20T15:00:00.000Z') };
  const base = { ...defaultDeps(config), now: () => clock.now, newId: () => `opp-${n++}` };
  const web = createRouter(createRoutes(base), 'aws');
  const claude = createDispatcher(createRoutes({ ...base, via: 'CLAUDE' }));
  const reads: string[] = [];
  const deps = { api: apiCaller(claude, 'owner-sub'), now: () => clock.now };
  const server = createMcpServer([
    (s) => registerReadTools(s, deps),
    (s) =>
      registerWriteTools(s, {
        ...deps,
        takeChange: createChangeLimiter(documentClient(), tableName),
        readPosting: (url) => {
          reads.push(url);
          return readPosting(url);
        },
      }),
  ]);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);

  const call = async (name: string, args: Json = {}) =>
    (await client.callTool({ name, arguments: args })) as Result;
  const viaWeb = async (method: string, path: string, body?: unknown) => {
    const result = await web(apiEvent(method, path, { body, sub: 'owner-sub' }));
    return { status: result.statusCode, body: JSON.parse(result.body ?? 'null') as Json };
  };
  return {
    call,
    viaWeb,
    client,
    clock,
    reads,
    tableName,
    close: async () => {
      await client.close();
      await deleteTable(rawClient(), tableName);
    },
  };
}

const refusal = (result: Result) => (result.isError ? result.content[0]?.text : undefined);

describe('add_opportunity', () => {
  it('adds it in Considering with the details given, marked as added through Claude', async () => {
    const t = await setup();
    try {
      const result = await t.call('add_opportunity', {
        company: 'Acme',
        title: 'Senior Engineer',
        interest: 4,
        location: 'Remote',
        salaryMin: 140_000,
        compensation: 'Plus bonus',
        contact: { name: 'Joel' },
        createdAt: '2026-09-01T12:00:00.000Z',
      });

      expect(result.structuredContent).toMatchObject({
        added: true,
        opportunity: {
          company: 'Acme',
          title: 'Senior Engineer',
          interest: 4,
          location: 'Remote',
          salaryMin: 140_000,
          compensation: 'Plus bonus',
          contact: { name: 'Joel' },
          stage: 'CONSIDERING',
          createdAt: '2026-09-01T12:00:00.000Z',
          history: [
            { toStage: 'CONSIDERING', via: 'CLAUDE', changedAt: '2026-09-01T12:00:00.000Z' },
          ],
        },
      });
    } finally {
      await t.close();
    }
  });

  it("refuses a missing company or title with the web app's message", async () => {
    const t = await setup();
    try {
      const fromClaude = refusal(await t.call('add_opportunity', { company: 'Acme', title: ' ' }));
      const fromWeb = await t.viaWeb('POST', '/opportunities', { company: 'Acme', title: ' ' });

      expect(fromClaude).toBe(`VALIDATION_ERROR: ${String(fromWeb.body.message)}`);
      expect(fromClaude).toBe('VALIDATION_ERROR: Job title is required');
    } finally {
      await t.close();
    }
  });

  it('warns about a matching open opportunity instead of adding, unless asked to add anyway', async () => {
    const t = await setup();
    try {
      await t.viaWeb('POST', '/opportunities', { company: 'Acme', title: 'Senior Engineer' });

      const warned = await t.call('add_opportunity', { company: 'acme', title: 'senior engineer' });
      const added = await t.call('add_opportunity', {
        company: 'acme',
        title: 'senior engineer',
        add_anyway: true,
      });
      const open = await t.call('list_opportunities');

      expect(warned.structuredContent).toEqual({
        added: false,
        duplicateOf: expect.objectContaining({ company: 'Acme', title: 'Senior Engineer' }) as Json,
      });
      expect(added.structuredContent).toMatchObject({ added: true });
      expect(open.structuredContent).toMatchObject({ total: 2 });
    } finally {
      await t.close();
    }
  });
});

describe('update_opportunity', () => {
  it('changes only the given fields, clears with null, and records that Claude changed them', async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', {
        company: 'Farmers',
        title: 'Engineer',
        notes: 'Old note',
        location: 'Austin',
      });
      t.clock.now = new Date('2026-10-20T16:30:00.000Z');

      const result = await t.call('update_opportunity', {
        id: body.id,
        followUpDate: '2026-10-21',
        notes: 'Expecting a call from Joel',
        location: null,
      });

      expect(result.structuredContent).toMatchObject({
        company: 'Farmers',
        followUpDate: '2026-10-21',
        notes: 'Expecting a call from Joel',
        detailsEditedViaClaudeAt: '2026-10-20T16:30:00.000Z',
      });
      expect(result.structuredContent).not.toHaveProperty('location');
    } finally {
      await t.close();
    }
  });

  it("sets a salary range, and refuses one out of order with the web app's message", async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'Farmers', title: 'E' });

      const set = await t.call('update_opportunity', {
        id: body.id,
        salaryMin: 150_000,
        salaryMax: 180_000,
      });
      const lowered = refusal(await t.call('update_opportunity', { id: body.id, salaryMax: 1 }));
      const web = await t.viaWeb('PATCH', `/opportunities/${String(body.id)}`, { salaryMax: 1 });
      const found = await t.call('find_opportunities', { query: 'farmers' });

      expect(set.structuredContent).toMatchObject({ salaryMin: 150_000, salaryMax: 180_000 });
      expect(lowered).toBe(`VALIDATION_ERROR: ${String(web.body.message)}`);
      expect(lowered).toBe("VALIDATION_ERROR: The minimum can't be more than the maximum");
      expect(found.structuredContent).toMatchObject({
        items: [{ salaryMin: 150_000, salaryMax: 180_000 }],
      });
    } finally {
      await t.close();
    }
  });

  it("moves the date added, and refuses one in the future with the web app's message", async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'Old', title: 'E' });

      const moved = await t.call('update_opportunity', {
        id: body.id,
        createdAt: '2026-07-04T12:00:00.000Z',
      });
      const future = { createdAt: '2026-10-21T00:00:00.000Z' };
      const refused = refusal(await t.call('update_opportunity', { id: body.id, ...future }));
      const web = await t.viaWeb('PATCH', `/opportunities/${String(body.id)}`, future);

      expect(moved.structuredContent).toMatchObject({
        createdAt: '2026-07-04T12:00:00.000Z',
        lastStageChangeAt: '2026-07-04T12:00:00.000Z',
      });
      expect(refused).toBe(`VALIDATION_ERROR: ${String(web.body.message)}`);
      expect(refused).toBe("VALIDATION_ERROR: The date can't be in the future");
    } finally {
      await t.close();
    }
  });

  it("refuses clearing the company, and an unknown id, with the web app's messages", async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'A', title: 'B' });

      const cleared = refusal(await t.call('update_opportunity', { id: body.id, company: null }));
      const web = await t.viaWeb('PATCH', `/opportunities/${String(body.id)}`, { company: null });
      const missing = refusal(await t.call('update_opportunity', { id: 'nope', notes: 'x' }));

      expect(cleared).toBe(`VALIDATION_ERROR: ${String(web.body.message)}`);
      expect(missing).toBe('NOT_FOUND: Opportunity not found');
    } finally {
      await t.close();
    }
  });
});

describe('move_opportunity', () => {
  it('records the move with its note and date, marked as made through Claude', async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'A', title: 'B' });

      const result = await t.call('move_opportunity', {
        id: body.id,
        to_stage: 'APPLIED',
        note: 'Sent CV',
        changed_at: '2026-10-19T15:00:00.000Z',
        expected_change_count: 1,
      });

      const history = result.structuredContent?.history as Json[];
      expect(result.structuredContent).toMatchObject({ stage: 'APPLIED' });
      // History is oldest first by date, so the backdated move comes before the creation.
      expect(history.find((entry) => entry.toStage === 'APPLIED')).toMatchObject({
        note: 'Sent CV',
        changedAt: '2026-10-19T15:00:00.000Z',
        via: 'CLAUDE',
      });
      expect(history.find((entry) => entry.toStage === 'CONSIDERING')).not.toHaveProperty('via');
    } finally {
      await t.close();
    }
  });

  it('closes into the archive, and reopens', async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'A', title: 'B' });

      await t.call('move_opportunity', {
        id: body.id,
        to_stage: 'NO_LONGER_AVAILABLE',
        expected_change_count: 1,
      });
      const archived = await t.call('list_opportunities', { view: 'archive' });
      const reopened = await t.call('move_opportunity', {
        id: body.id,
        to_stage: 'APPLIED',
        expected_change_count: 2,
      });

      expect(archived.structuredContent).toMatchObject({ total: 1 });
      expect(reopened.structuredContent).toMatchObject({ stage: 'APPLIED', status: 'OPEN' });
    } finally {
      await t.close();
    }
  });

  it.each([
    [
      'the current stage',
      { to_stage: 'CONSIDERING', expected_change_count: 1 },
      { toStage: 'CONSIDERING', expectedChangeCount: 1 },
    ],
    [
      'a future date',
      { to_stage: 'APPLIED', changed_at: '2099-01-01T00:00:00.000Z', expected_change_count: 1 },
      { toStage: 'APPLIED', changedAt: '2099-01-01T00:00:00.000Z', expectedChangeCount: 1 },
    ],
    [
      'a stale change count',
      { to_stage: 'APPLIED', expected_change_count: 5 },
      { toStage: 'APPLIED', expectedChangeCount: 5 },
    ],
  ])("refuses %s with the web app's message", async (_label, args, webBody) => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'A', title: 'B' });

      const fromClaude = refusal(await t.call('move_opportunity', { id: body.id, ...args }));
      const fromWeb = await t.viaWeb(
        'POST',
        `/opportunities/${String(body.id)}/stage-changes`,
        webBody,
      );

      expect(fromClaude).toBe(`${String(fromWeb.body.code)}: ${String(fromWeb.body.message)}`);
    } finally {
      await t.close();
    }
  });
});

describe('interview tools (feature 005)', () => {
  type WithInterviews = Json & {
    interviewCount: number;
    interviews: { id: string; heldAt: string; note: string | null; via?: string }[];
  };

  async function withOpportunity(t: Awaited<ReturnType<typeof setup>>) {
    const { body } = await t.viaWeb('POST', '/opportunities', {
      company: 'Farmers',
      title: 'Engineer',
      createdAt: '2026-10-01T12:00:00.000Z',
    });
    return String(body.id);
  }

  it('logs an interview, marked as through Claude, without changing the stage', async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);

      const result = await t.call('add_interview', {
        opportunity_id: id,
        held_at: '2026-10-19T14:00:00.000Z',
        note: 'Panel',
      });

      const body = result.structuredContent as WithInterviews;
      expect(body.interviews).toMatchObject([
        { heldAt: '2026-10-19T14:00:00.000Z', note: 'Panel', via: 'CLAUDE' },
      ]);
      expect(body.interviewCount).toBe(1);
      expect(body.stage).toBe('CONSIDERING');
    } finally {
      await t.close();
    }
  });

  it('dates an interview now when no date is given', async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);

      const result = await t.call('add_interview', { opportunity_id: id });

      expect((result.structuredContent as WithInterviews).interviews[0]?.heldAt).toBe(
        '2026-10-20T15:00:00.000Z',
      );
    } finally {
      await t.close();
    }
  });

  it("changes an interview's date and note, and clears the note with null", async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);
      const added = (await t.call('add_interview', { opportunity_id: id, note: 'Phone' }))
        .structuredContent as WithInterviews;
      const interviewId = added.interviews[0]?.id;

      const moved = await t.call('update_interview', {
        opportunity_id: id,
        interview_id: interviewId,
        held_at: '2026-10-19T12:00:00.000Z',
      });
      const cleared = await t.call('update_interview', {
        opportunity_id: id,
        interview_id: interviewId,
        note: null,
      });

      expect((moved.structuredContent as WithInterviews).interviews[0]).toMatchObject({
        heldAt: '2026-10-19T12:00:00.000Z',
        note: 'Phone',
        via: 'CLAUDE',
      });
      expect((cleared.structuredContent as WithInterviews).interviews[0]?.note).toBeNull();
    } finally {
      await t.close();
    }
  });

  it("refuses a future date and a 7th interview with the web app's messages", async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);
      const future = { held_at: '2026-10-21T00:00:00.000Z' };
      const fromWeb = await t.viaWeb('POST', `/opportunities/${id}/interviews`, {
        heldAt: future.held_at,
      });

      const refused = refusal(await t.call('add_interview', { opportunity_id: id, ...future }));
      for (let i = 0; i < 6; i++) {
        await t.viaWeb('POST', `/opportunities/${id}/interviews`, {});
      }
      const seventh = refusal(await t.call('add_interview', { opportunity_id: id }));

      expect(refused).toBe(`VALIDATION_ERROR: ${String(fromWeb.body.message)}`);
      expect(refused).toBe("VALIDATION_ERROR: The date can't be in the future");
      expect(seventh).toBe(
        'VALIDATION_ERROR: This opportunity already has 6 interviews, the most it can have',
      );
    } finally {
      await t.close();
    }
  });

  it('refuses an unknown interview', async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);

      const refused = refusal(
        await t.call('update_interview', { opportunity_id: id, interview_id: 'nope', note: 'x' }),
      );

      expect(refused).toBe('NOT_FOUND: Interview not found');
    } finally {
      await t.close();
    }
  });

  it('takes one from the change limit for each change', async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);
      for (let i = 0; i < 20; i++) {
        await t.call('find_opportunities', { query: 'farmers' });
      }
      for (let i = 0; i < 6; i++) {
        expect((await t.call('add_interview', { opportunity_id: id })).isError).toBeUndefined();
      }
      const interviewId = (
        (await t.call('get_opportunity', { id })).structuredContent as WithInterviews
      ).interviews[0]?.id;
      for (let i = 0; i < 14; i++) {
        await t.call('update_interview', {
          opportunity_id: id,
          interview_id: interviewId,
          note: `n${i}`,
        });
      }

      const limited = refusal(
        await t.call('update_interview', {
          opportunity_id: id,
          interview_id: interviewId,
          note: 'x',
        }),
      );

      expect(limited).toMatch(/^RATE_LIMITED: /);
    } finally {
      await t.close();
    }
  });

  it('has no tool that removes interviews, and describes both for Claude', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      type Property = { description?: string };
      const props = (name: string) =>
        byName[name]?.inputSchema.properties as Record<string, Property>;

      expect(tools.map((tool) => tool.name).filter((name) => /remove|delete/.test(name))).toEqual(
        [],
      );
      expect(byName.add_interview).toMatchObject({
        title: 'Log an interview',
        description:
          "Logs an interview the owner has had for an opportunity (at most 6 each). It doesn't " +
          'change the stage: use move_opportunity for that.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      });
      expect(byName.update_interview).toMatchObject({
        title: 'Change an interview',
        description:
          "Changes an interview's date or note. Interviews can be removed only in the web app.",
      });
      const heldAt =
        'When the interview happened: an ISO date-time, not in the future; defaults to now';
      expect(props('add_interview').opportunity_id?.description).toBe("The opportunity's id");
      expect(props('add_interview').held_at?.description).toBe(heldAt);
      expect(props('add_interview').note?.description).toBe(
        'Optional note, such as the interviewer or the kind of interview',
      );
      expect(props('update_interview').opportunity_id?.description).toBe("The opportunity's id");
      expect(props('update_interview').interview_id?.description).toBe(
        "The interview's id, from get_opportunity",
      );
      expect(props('update_interview').held_at?.description).toBe(heldAt);
      expect(props('update_interview').note?.description).toBe('null clears the note');
    } finally {
      await t.close();
    }
  });

  it('counts interviews in the summaries, and returns them with the opportunity', async () => {
    const t = await setup();
    try {
      const id = await withOpportunity(t);
      await t.call('add_interview', { opportunity_id: id, note: 'Phone' });

      const found = await t.call('find_opportunities', { query: 'farmers' });
      const got = await t.call('get_opportunity', { id });

      expect(found.structuredContent).toMatchObject({ items: [{ interviewCount: 1 }] });
      expect((got.structuredContent as WithInterviews).interviews).toMatchObject([
        { note: 'Phone' },
      ]);
    } finally {
      await t.close();
    }
  });
});

describe('read_posting', () => {
  it('returns what the posting says, and saves nothing', async () => {
    const t = await setup();
    try {
      const result = await t.call('read_posting', { url: 'https://jobs.lever.co/initrode/1' });
      const open = await t.call('list_opportunities');

      expect(result.structuredContent).toEqual(posting);
      expect(t.reads).toEqual(['https://jobs.lever.co/initrode/1']);
      expect(open.structuredContent).toMatchObject({ total: 0 });
    } finally {
      await t.close();
    }
  });

  it("passes on the import's refusal with its message", async () => {
    const t = await setup(() =>
      Promise.reject(new ToolError('SIGN_IN_REQUIRED', IMPORT_MESSAGES.SIGN_IN_REQUIRED)),
    );
    try {
      expect(refusal(await t.call('read_posting', { url: 'https://linkedin.com/jobs/1' }))).toBe(
        `SIGN_IN_REQUIRED: ${IMPORT_MESSAGES.SIGN_IN_REQUIRED}`,
      );
    } finally {
      await t.close();
    }
  });
});

describe('the change limit through the tools', () => {
  it('counts every change, refuses the 21st in a minute, and never counts reads', async () => {
    const t = await setup();
    try {
      const { body } = await t.viaWeb('POST', '/opportunities', { company: 'A', title: 'B' });
      for (let i = 0; i < 10; i++) {
        await t.call('add_opportunity', { company: `Co ${i}`, title: 'T' });
        await t.call('update_opportunity', { id: body.id, notes: `n${i}` });
        await t.call('list_opportunities');
        await t.call('read_posting', { url: 'https://a.example' });
      }

      const limited = await t.call('move_opportunity', {
        id: body.id,
        to_stage: 'APPLIED',
        expected_change_count: 1,
      });
      t.clock.now = new Date('2026-10-20T15:01:00.000Z');
      const nextMinute = await t.call('move_opportunity', {
        id: body.id,
        to_stage: 'APPLIED',
        expected_change_count: 1,
      });

      expect(refusal(limited)).toBe(
        'RATE_LIMITED: Too many changes through Claude in the last minute. Try again shortly.',
      );
      expect(nextMinute.structuredContent).toMatchObject({ stage: 'APPLIED' });
    } finally {
      await t.close();
    }
  });

  it("doesn't count a duplicate warning as a change", async () => {
    const t = await setup();
    try {
      await t.viaWeb('POST', '/opportunities', { company: 'A', title: 'B' });
      for (let i = 0; i < 25; i++) {
        await t.call('add_opportunity', { company: 'A', title: 'B' });
      }

      expect(
        (await t.call('add_opportunity', { company: 'C', title: 'D' })).structuredContent,
      ).toMatchObject({ added: true });
    } finally {
      await t.close();
    }
  });
});

describe('the write tools', () => {
  it('names and describes each tool, and its less obvious fields, for Claude', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      const described = [
        'read_posting',
        'add_opportunity',
        'update_opportunity',
        'move_opportunity',
      ].map((name) => ({
        name,
        title: byName[name]?.title,
        description: byName[name]?.description,
      }));

      expect(described).toEqual([
        {
          name: 'read_posting',
          title: 'Read a job posting',
          description:
            'Reads the job details (company, title, description, location, work arrangement, pay, ' +
            'the date the posting is up until, and the site) from a public job posting link, as ' +
            '"Fill from link" does in the web app. ' +
            'Nothing is saved: show the owner what was found, then use add_opportunity.',
        },
        {
          name: 'add_opportunity',
          title: 'Add an opportunity',
          description:
            'Adds a job opportunity in the Considering stage. Company and title are required; ' +
            'everything else is optional. If an open opportunity has the same company and title, ' +
            'nothing is added and duplicateOf describes it: ask the owner, and call again with ' +
            'add_anyway true only if they want both.',
        },
        {
          name: 'update_opportunity',
          title: 'Update an opportunity',
          description:
            "Changes an opportunity's details (not its stage: use move_opportunity). Give only the " +
            'fields to change; null clears an optional field. Company and title can be changed but ' +
            'not cleared.',
        },
        {
          name: 'move_opportunity',
          title: 'Move an opportunity to another stage',
          description:
            'Moves an opportunity to another stage, recorded in its history with an optional note ' +
            'and an optional earlier date (an ISO date-time, not in the future). expected_change_count ' +
            'is the changeCount from get_opportunity; if the opportunity changed since then, call ' +
            'get_opportunity again and retry.',
        },
      ]);
      type Property = { description?: string };
      for (const name of ['add_opportunity', 'update_opportunity']) {
        const properties = byName[name]?.inputSchema.properties as Record<string, Property>;
        expect(properties.interest?.description).toBe('1 to 5 stars');
        expect(properties.source?.description).toBe('Where the owner found the job');
        expect(properties.followUpDate?.description).toBe('YYYY-MM-DD');
        expect(properties.postedUntil?.description).toBe(
          'YYYY-MM-DD: the date the job posting is up until',
        );
        expect(properties.salaryMin?.description).toBe(
          'Lowest salary as a whole number, like 150000 (no currency or pay period)',
        );
        expect(properties.salaryMax?.description).toBe(
          'Highest salary as a whole number, like 180000 (no currency or pay period)',
        );
        expect(properties.compensation?.description).toBe(
          'Pay notes: bonus, equity, currency, or pay period',
        );
        expect(properties.createdAt?.description).toBe(
          'Date added: an ISO date-time, not in the future; defaults to now',
        );
        expect(properties.leadId?.description).toBe(
          'The networking lead it came through: an id from list_leads',
        );
      }
    } finally {
      await t.close();
    }
  });

  it('are described for Claude as changing data without deleting anything', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const write = tools.filter(
        (tool) => tool.name !== 'read_posting' && !tool.annotations?.readOnlyHint,
      );

      expect(write.map((tool) => tool.name)).toEqual([
        'add_opportunity',
        'update_opportunity',
        'move_opportunity',
        'add_interview',
        'update_interview',
        'add_lead',
        'update_lead',
        'add_lead_note',
        'update_lead_note',
      ]);
      for (const tool of write) {
        expect(tool.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        });
      }
      expect(tools.find((tool) => tool.name === 'read_posting')?.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: true,
      });
    } finally {
      await t.close();
    }
  });
});

describe('the posting closing date through Claude (feature 009)', { tags: ['deadline'] }, () => {
  it('is set when adding, changed and cleared when updating, and listed', async () => {
    const t = await setup();
    try {
      const added = await t.call('add_opportunity', {
        company: 'Initrode',
        title: 'Staff Engineer',
        postedUntil: '2026-11-30',
      });
      const { id } = (added.structuredContent as { opportunity: { id: string } }).opportunity;

      const listed = await t.call('list_opportunities');
      const found = await t.call('find_opportunities', { query: 'initrode' });
      const changed = await t.call('update_opportunity', { id, postedUntil: '2026-12-15' });
      const cleared = await t.call('update_opportunity', { id, postedUntil: null });
      const after = await t.call('list_opportunities');

      expect(listed.structuredContent).toMatchObject({ items: [{ postedUntil: '2026-11-30' }] });
      expect(found.structuredContent).toMatchObject({ items: [{ postedUntil: '2026-11-30' }] });
      expect(changed.structuredContent).toMatchObject({ postedUntil: '2026-12-15' });
      expect(cleared.structuredContent).not.toHaveProperty('postedUntil');
      expect(after.structuredContent).toMatchObject({ items: [{ postedUntil: null }] });
    } finally {
      await t.close();
    }
  });

  it("refuses a date that isn't one, with the web app's message", async () => {
    const t = await setup();
    try {
      const refused = refusal(
        await t.call('add_opportunity', { company: 'A', title: 'B', postedUntil: 'next week' }),
      );

      expect(refused).toContain('Use a date like 2026-11-03');
    } finally {
      await t.close();
    }
  });

  it('comes back from read_posting when the posting states it', async () => {
    const t = await setup(() => Promise.resolve({ ...posting, postedUntil: '2026-11-30' }));
    try {
      const result = await t.call('read_posting', { url: 'https://jobs.lever.co/initrode/1' });

      expect(result.structuredContent).toMatchObject({ postedUntil: '2026-11-30' });
    } finally {
      await t.close();
    }
  });
});

describe('networking leads through Claude (feature 010)', { tags: ['leads'] }, () => {
  it('adds and changes a lead, and lists it with its opportunities', async () => {
    const t = await setup();
    try {
      const added = await t.call('add_lead', {
        name: 'Dana Ruiz',
        email: 'dana@example.com',
        phone: '555 0100',
      });
      const lead = added.structuredContent as Json & { id: string };
      expect(lead).toMatchObject({
        name: 'Dana Ruiz',
        email: 'dana@example.com',
        phone: '555 0100',
      });

      const updated = await t.call('update_lead', { id: lead.id, name: 'Dana R.', phone: null });
      expect(updated.structuredContent).toMatchObject({
        name: 'Dana R.',
        email: 'dana@example.com',
      });
      expect(updated.structuredContent).not.toHaveProperty('phone');

      const linked = await t.call('add_opportunity', {
        company: 'Acme',
        title: 'Staff Engineer',
        leadId: lead.id,
      });
      const opportunity = (linked.structuredContent?.opportunity ?? {}) as Json & { id: string };
      await t.call('add_lead', { name: 'Sam Lee' });

      expect((await t.call('list_leads')).structuredContent).toEqual({
        leads: [
          {
            id: lead.id,
            name: 'Dana R.',
            email: 'dana@example.com',
            phone: null,
            opportunities: [
              {
                id: opportunity.id,
                company: 'Acme',
                title: 'Staff Engineer',
                stage: 'CONSIDERING',
              },
            ],
            notes: [],
          },
          {
            id: expect.any(String) as string,
            name: 'Sam Lee',
            email: null,
            phone: null,
            opportunities: [],
            notes: [],
          },
        ],
      });
    } finally {
      await t.close();
    }
  });

  it("refuses a bad lead with the web app's message", async () => {
    const t = await setup();
    try {
      expect(refusal(await t.call('add_lead', { name: 'Dana', email: 'dana@' }))).toBe(
        'VALIDATION_ERROR: Enter a valid email address',
      );
      expect(refusal(await t.call('update_lead', { id: 'missing', name: 'X' }))).toBe(
        'NOT_FOUND: Lead not found',
      );
    } finally {
      await t.close();
    }
  });

  it('links and unlinks an opportunity, and get_opportunity returns its lead', async () => {
    const t = await setup();
    try {
      const lead = (await t.call('add_lead', { name: 'Dana', email: 'dana@example.com' }))
        .structuredContent as Json & { id: string };
      // Listed first, so only the right id finds Dana.
      await t.call('add_lead', { name: 'Avery' });
      const added = await t.call('add_opportunity', { company: 'Acme', title: 'Engineer' });
      const id = (added.structuredContent?.opportunity as Json & { id: string }).id;
      expect((await t.call('get_opportunity', { id })).structuredContent?.lead).toBeNull();

      await t.call('update_opportunity', { id, leadId: lead.id });
      expect((await t.call('get_opportunity', { id })).structuredContent?.lead).toEqual({
        id: lead.id,
        name: 'Dana',
        email: 'dana@example.com',
        phone: null,
      });

      await t.call('update_opportunity', { id, leadId: null });
      const unlinked = (await t.call('get_opportunity', { id })).structuredContent;
      expect(unlinked?.lead).toBeNull();
      expect(unlinked).not.toHaveProperty('leadId');
    } finally {
      await t.close();
    }
  });

  it("refuses a lead that doesn't exist, and reads a link to a deleted one as none", async () => {
    const t = await setup();
    try {
      expect(
        refusal(
          await t.call('add_opportunity', { company: 'Acme', title: 'Engineer', leadId: 'nope' }),
        ),
      ).toBe("VALIDATION_ERROR: That lead doesn't exist");

      const lead = (await t.call('add_lead', { name: 'Dana' })).structuredContent as Json & {
        id: string;
      };
      const added = await t.call('add_opportunity', {
        company: 'Acme',
        title: 'Engineer',
        leadId: lead.id,
      });
      const id = (added.structuredContent?.opportunity as Json & { id: string }).id;
      // Gone without the unlink, as if deleted in the same instant as the link was saved.
      await documentClient().send(
        new DeleteCommand({ TableName: t.tableName, Key: { PK: `LEAD#${lead.id}`, SK: 'LEAD' } }),
      );

      expect((await t.call('get_opportunity', { id })).structuredContent?.lead).toBeNull();
    } finally {
      await t.close();
    }
  });

  it('counts each lead change toward the limit, but not listing', async () => {
    const t = await setup();
    try {
      const lead = (await t.call('add_lead', { name: 'Dana' })).structuredContent as Json & {
        id: string;
      };
      for (let i = 0; i < 19; i++) {
        await t.call('update_lead', { id: lead.id, name: `Dana ${i}` });
      }
      await t.call('list_leads');

      expect(refusal(await t.call('add_lead', { name: 'One too many' }))).toMatch(/^RATE_LIMITED/);
      expect(refusal(await t.call('update_lead', { id: lead.id, name: 'Again' }))).toMatch(
        /^RATE_LIMITED/,
      );
      expect((await t.call('list_leads')).isError).toBeFalsy();
    } finally {
      await t.close();
    }
  });

  it('has no tool that deletes a lead, and describes the lead tools for Claude', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      type Property = { description?: string };
      const props = (name: string) =>
        byName[name]?.inputSchema.properties as Record<string, Property>;

      expect(tools.map((tool) => tool.name).filter((name) => /lead/.test(name))).toEqual([
        'list_leads',
        'add_lead',
        'update_lead',
        'add_lead_note',
        'update_lead_note',
      ]);
      expect(byName.add_lead).toMatchObject({
        title: 'Add a networking lead',
        description:
          'Adds a networking lead: someone helping the owner find jobs. A name, and optionally an ' +
          'email and a phone; a lead has nothing else. Link opportunities to it with leadId.',
      });
      expect(byName.update_lead).toMatchObject({
        title: 'Change a networking lead',
        description:
          "Changes a lead's name, email or phone. Give only the fields to change; null clears the " +
          'email or phone. Leads can be deleted only in the web app.',
      });
      expect(props('update_lead').id?.description).toBe("The lead's id, from list_leads");
      expect(props('update_lead').email?.description).toBe('null clears it');
      expect(props('update_lead').phone?.description).toBe('null clears it');
    } finally {
      await t.close();
    }
  });
});

describe('notes on leads through Claude (feature 011)', { tags: ['leads'] }, () => {
  async function aLead(t: Awaited<ReturnType<typeof setup>>, name = 'Dana') {
    return (await t.call('add_lead', { name })).structuredContent as Json & { id: string };
  }

  it('adds notes, for now or an earlier date, and lists them newest first', async () => {
    const t = await setup();
    try {
      const lead = await aLead(t);

      const older = await t.call('add_lead_note', {
        lead_id: lead.id,
        text: 'First call',
        held_at: '2026-10-12T17:00:00.000Z',
      });
      expect(older.structuredContent).toMatchObject({
        leadId: lead.id,
        text: 'First call',
        heldAt: '2026-10-12T17:00:00.000Z',
      });
      const newer = await t.call('add_lead_note', { lead_id: lead.id, text: 'Coffee' });
      const newerNote = newer.structuredContent as Json & { id: string; heldAt: string };
      expect(Date.parse(newerNote.heldAt)).toBeGreaterThan(Date.parse('2026-10-12T17:00:00Z'));

      const { leads } = (await t.call('list_leads')).structuredContent as {
        leads: (Json & { id: string })[];
      };
      expect(leads.find((l) => l.id === lead.id)?.notes).toEqual([
        { id: newerNote.id, heldAt: newerNote.heldAt, text: 'Coffee' },
        {
          id: (older.structuredContent as Json & { id: string }).id,
          heldAt: '2026-10-12T17:00:00.000Z',
          text: 'First call',
        },
      ]);
    } finally {
      await t.close();
    }
  });

  it("refuses a blank note, a future date and an unknown lead with the web app's messages", async () => {
    const t = await setup();
    try {
      const lead = await aLead(t);

      expect(refusal(await t.call('add_lead_note', { lead_id: lead.id, text: ' ' }))).toBe(
        'VALIDATION_ERROR: Write a note',
      );
      expect(
        refusal(
          await t.call('add_lead_note', {
            lead_id: lead.id,
            text: 'x',
            held_at: '2999-01-01T00:00:00.000Z',
          }),
        ),
      ).toBe("VALIDATION_ERROR: A note can't be dated in the future");
      expect(refusal(await t.call('add_lead_note', { lead_id: 'nope', text: 'x' }))).toBe(
        'NOT_FOUND: Lead not found',
      );
    } finally {
      await t.close();
    }
  });

  it("changes a note's text or date, and refuses an unknown note", async () => {
    const t = await setup();
    try {
      const lead = await aLead(t);
      const note = (await t.call('add_lead_note', { lead_id: lead.id, text: 'Coffee' }))
        .structuredContent as Json & { id: string };

      const text = await t.call('update_lead_note', {
        lead_id: lead.id,
        note_id: note.id,
        text: 'Lunch',
      });
      expect(text.structuredContent).toMatchObject({ id: note.id, text: 'Lunch' });
      const date = await t.call('update_lead_note', {
        lead_id: lead.id,
        note_id: note.id,
        held_at: '2026-10-20T12:00:00.000Z',
      });
      expect(date.structuredContent).toMatchObject({
        text: 'Lunch',
        heldAt: '2026-10-20T12:00:00.000Z',
      });
      expect(
        refusal(await t.call('update_lead_note', { lead_id: lead.id, note_id: 'nope', text: 'x' })),
      ).toBe('NOT_FOUND: Note not found');
    } finally {
      await t.close();
    }
  });

  it('counts each note change toward the limit, but not listing', async () => {
    const t = await setup();
    try {
      const lead = await aLead(t);
      const note = (await t.call('add_lead_note', { lead_id: lead.id, text: 'Coffee' }))
        .structuredContent as Json & { id: string };
      for (let i = 0; i < 18; i++) {
        await t.call('update_lead_note', { lead_id: lead.id, note_id: note.id, text: `v${i}` });
      }
      await t.call('list_leads');

      expect(refusal(await t.call('add_lead_note', { lead_id: lead.id, text: 'x' }))).toMatch(
        /^RATE_LIMITED/,
      );
      expect(
        refusal(
          await t.call('update_lead_note', { lead_id: lead.id, note_id: note.id, text: 'y' }),
        ),
      ).toMatch(/^RATE_LIMITED/);
      expect((await t.call('list_leads')).isError).toBeFalsy();
    } finally {
      await t.close();
    }
  });

  it('has no tool that deletes a note, and describes the note tools for Claude', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      type Property = { description?: string };
      const props = (name: string) =>
        byName[name]?.inputSchema.properties as Record<string, Property>;

      expect(tools.map((tool) => tool.name).filter((name) => /note/.test(name))).toEqual([
        'add_lead_note',
        'update_lead_note',
      ]);
      expect(byName.add_lead_note).toMatchObject({
        title: 'Add a note to a lead',
        description:
          'Adds a dated note to a networking lead, for a conversation with them: what was said, ' +
          'who they will introduce, when to follow up. A lead can have at most 200.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      });
      expect(byName.update_lead_note).toMatchObject({
        title: 'Change a note on a lead',
        description:
          "Changes a note's text or date. Give only what changes. Notes can be deleted only in " +
          'the web app.',
      });
      const heldAt =
        'When the conversation happened: an ISO date-time, not in the future; defaults to now';
      expect(props('add_lead_note').lead_id?.description).toBe("The lead's id, from list_leads");
      expect(props('add_lead_note').text?.description).toBe('What was said, as the owner tells it');
      expect(props('add_lead_note').held_at?.description).toBe(heldAt);
      expect(props('update_lead_note').lead_id?.description).toBe("The lead's id, from list_leads");
      expect(props('update_lead_note').note_id?.description).toBe("The note's id, from list_leads");
      expect(props('update_lead_note').held_at?.description).toBe(
        'When the conversation happened: an ISO date-time, not in the future',
      );
    } finally {
      await t.close();
    }
  });
});
