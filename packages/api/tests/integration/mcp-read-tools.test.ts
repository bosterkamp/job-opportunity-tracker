// @module-tag mcp
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createRoutes, defaultDeps } from '../../src/handler.js';
import { createTable, deleteTable } from '../../src/local/table.js';
import { apiCaller } from '../../src/mcp/apiCall.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { registerReadTools } from '../../src/mcp/tools.js';
import { createDispatcher, createRouter } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { rawClient, testConfig } from './dynamo.js';

type Json = Record<string, unknown>;

// A fresh table, the web API in AWS mode over it, and an MCP client connected to the tools.
async function setup(today = '2026-10-20T12:00:00.000Z') {
  const tableName = `JobTracker-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await createTable(rawClient(), tableName);
  const config = { ...testConfig(), tableName, appEnv: 'aws' as const };
  let clock = '2026-10-01T12:00:00.000Z';
  let n = 0;
  const routes = createRoutes({
    ...defaultDeps(config),
    now: () => new Date(clock),
    newId: () => `opp-${String(n++).padStart(3, '0')}`,
  });
  // The web API as API Gateway calls it (to seed and compare), and as the tools call it.
  const route = createRouter(routes, 'aws');
  const dispatch = createDispatcher(routes);
  const server = createMcpServer([
    (s) =>
      registerReadTools(s, { api: apiCaller(dispatch, 'owner-sub'), now: () => new Date(today) }),
  ]);
  const client = new Client({ name: 'test', version: '1' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const asOwner = { sub: 'owner-sub' };
  async function add(company: string, title: string, extra: Json = {}, at = clock) {
    clock = at;
    const result = await route(
      apiEvent('POST', '/opportunities', { body: { company, title, ...extra }, ...asOwner }),
    );
    return JSON.parse(result.body ?? '') as Json & { id: string };
  }
  async function move(id: string, toStage: string, at: string) {
    clock = at;
    await route(
      apiEvent('POST', `/opportunities/${id}/stage-changes`, {
        body: { toStage, expectedChangeCount: 1 },
        ...asOwner,
      }),
    );
  }
  async function call(name: string, args: Json = {}) {
    const result = await client.callTool({ name, arguments: args });
    return result as { isError?: boolean; structuredContent?: Json; content: { text: string }[] };
  }
  return {
    add,
    move,
    call,
    client,
    route,
    close: async () => {
      await client.close();
      await deleteTable(rawClient(), tableName);
    },
  };
}

describe('the read tools', () => {
  it('lists open opportunities, most recent stage change first, in the contract shape', async () => {
    const t = await setup();
    try {
      const acme = await t.add(
        'Acme',
        'Engineer',
        { interest: 4, salaryMin: 150_000, salaryMax: 180_000 },
        '2026-10-01T12:00:00.000Z',
      );
      const globex = await t.add('Globex', 'Designer', {}, '2026-10-02T12:00:00.000Z');
      await t.move(acme.id, 'INTERVIEWING', '2026-10-05T12:00:00.000Z');

      const result = await t.call('list_opportunities');

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        total: 2,
        offset: 0,
        items: [
          {
            id: acme.id,
            company: 'Acme',
            title: 'Engineer',
            stage: 'INTERVIEWING',
            status: 'OPEN',
            interest: 4,
            salaryMin: 150_000,
            salaryMax: 180_000,
            interviewCount: 0,
            lastStageChangeAt: '2026-10-05T12:00:00.000Z',
            followUpDate: null,
            postedUntil: null,
          },
          {
            id: globex.id,
            company: 'Globex',
            title: 'Designer',
            stage: 'CONSIDERING',
            status: 'OPEN',
            interest: null,
            salaryMin: null,
            salaryMax: null,
            interviewCount: 0,
            lastStageChangeAt: '2026-10-02T12:00:00.000Z',
            followUpDate: null,
            postedUntil: null,
          },
        ],
      });
      expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(result.structuredContent);
    } finally {
      await t.close();
    }
  });

  it('filters by stage, lists the archive, and pages through', async () => {
    const t = await setup();
    try {
      const a = await t.add('Acme', 'Engineer');
      await t.add('Globex', 'Designer');
      const c = await t.add('Initech', 'Analyst');
      await t.move(a.id, 'APPLIED', '2026-10-03T12:00:00.000Z');
      await t.move(c.id, 'REJECTED', '2026-10-04T12:00:00.000Z');

      const applied = await t.call('list_opportunities', { stage: 'APPLIED' });
      const archive = await t.call('list_opportunities', { view: 'archive' });
      const page = await t.call('list_opportunities', { limit: 1, offset: 1 });

      expect((applied.structuredContent?.items as Json[]).map((o) => o.company)).toEqual(['Acme']);
      expect((archive.structuredContent?.items as Json[]).map((o) => o.stage)).toEqual([
        'REJECTED',
      ]);
      expect(page.structuredContent).toMatchObject({
        total: 2,
        offset: 1,
        items: [{ company: 'Globex' }],
      });
    } finally {
      await t.close();
    }
  });

  it('lists open opportunities whose follow-up is due today or earlier, by the UTC date', async () => {
    // 23:30 UTC on the 20th is already the 21st in Asia and still the 20th in the Americas.
    const t = await setup('2026-10-20T23:30:00.000Z');
    try {
      await t.add('Past', 'Engineer', { followUpDate: '2026-10-19' });
      await t.add('Today', 'Engineer', { followUpDate: '2026-10-20' });
      await t.add('Later', 'Engineer', { followUpDate: '2026-10-21' });
      await t.add('None', 'Engineer');
      const closed = await t.add('Closed', 'Engineer', { followUpDate: '2026-10-01' });
      await t.move(closed.id, 'WITHDRAWN', '2026-10-02T12:00:00.000Z');

      const due = await t.call('list_opportunities', { view: 'follow_up_due' });

      expect((due.structuredContent?.items as Json[]).map((o) => o.company).sort()).toEqual([
        'Past',
        'Today',
      ]);
    } finally {
      await t.close();
    }
  });

  it('finds opportunities by company or title, open or closed, in any case', async () => {
    const t = await setup();
    try {
      await t.add('Acme Rockets', 'Engineer');
      await t.add('Globex', 'ACME liaison');
      const c = await t.add('Initech', 'Analyst');
      await t.move(c.id, 'NO_RESPONSE', '2026-10-03T12:00:00.000Z');
      await t.add('Hooli', 'Initech migration lead');

      const acme = await t.call('find_opportunities', { query: 'acme' });
      const initech = await t.call('find_opportunities', { query: 'INITECH', limit: 1 });

      expect((acme.structuredContent?.items as Json[]).map((o) => o.company).sort()).toEqual([
        'Acme Rockets',
        'Globex',
      ]);
      expect(initech.structuredContent).toMatchObject({ total: 2 });
      expect(initech.structuredContent?.items).toHaveLength(1);
    } finally {
      await t.close();
    }
  });

  it('gets one opportunity with every detail and its history, as the web API returns it', async () => {
    const t = await setup();
    try {
      const a = await t.add('Acme', 'Engineer', { location: 'Austin', notes: 'Call back' });
      await t.move(a.id, 'APPLIED', '2026-10-03T12:00:00.000Z');

      const result = await t.call('get_opportunity', { id: a.id });
      const web = JSON.parse(
        (await t.route(apiEvent('GET', `/opportunities/${a.id}`, { sub: 'owner-sub' }))).body ?? '',
      ) as Json;

      expect(result.structuredContent).toEqual({ ...web, lead: null });
      expect(result.structuredContent).toMatchObject({ location: 'Austin', notes: 'Call back' });
      expect((result.structuredContent?.history as Json[]).map((h) => h.toStage)).toEqual([
        'CONSIDERING',
        'APPLIED',
      ]);
    } finally {
      await t.close();
    }
  });

  it("explains an unknown id with the web API's message", async () => {
    const t = await setup();
    try {
      const result = await t.call('get_opportunity', { id: 'missing/id' });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'NOT_FOUND: Opportunity not found' }],
      });
    } finally {
      await t.close();
    }
  });

  it.each([
    [
      'a stage outside the open view',
      { view: 'archive', stage: 'APPLIED' },
      'A stage only applies to the open view',
    ],
  ])('refuses %s', async (_label, args, message) => {
    const t = await setup();
    try {
      expect(await t.call('list_opportunities', args)).toEqual({
        isError: true,
        content: [{ type: 'text', text: `VALIDATION_ERROR: ${message}` }],
      });
    } finally {
      await t.close();
    }
  });

  it.each([
    ['list_opportunities', { stage: 'REJECTED' }],
    ['list_opportunities', { view: 'everything' }],
    ['list_opportunities', { limit: 0 }],
    ['list_opportunities', { limit: 101 }],
    ['list_opportunities', { offset: -1 }],
    ['find_opportunities', { query: '  ' }],
    ['find_opportunities', { query: 'x', limit: 51 }],
    ['get_opportunity', { id: '' }],
  ])('rejects invalid input to %s: %j', async (name, args) => {
    const t = await setup();
    try {
      const result = await t.call(name, args);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Input validation error|Invalid/);
    } finally {
      await t.close();
    }
  });

  it('tells Claude what the server is for', async () => {
    const t = await setup();
    try {
      expect(t.client.getInstructions()).toBe(
        "Tools for the owner's personal job opportunity tracker. Use the stage names and ids the " +
          'tools return. Deleting opportunities is only possible in the web app.',
      );
    } finally {
      await t.close();
    }
  });

  it('names and describes each tool for Claude', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();

      expect(tools.map(({ name, title, description }) => ({ name, title, description }))).toEqual([
        {
          name: 'list_opportunities',
          title: 'List opportunities',
          description:
            'Lists the owner\'s job opportunities, most recent stage change first. view "open" (the ' +
            'default) lists open ones, optionally in one stage; "archive" lists closed ones with their ' +
            'outcome; "follow_up_due" lists open ones whose follow-up date is today or earlier (UTC). ' +
            'Use limit and offset to page through long lists.',
        },
        {
          name: 'find_opportunities',
          title: 'Find opportunities',
          description:
            'Finds opportunities, open or closed, whose company or job title contains the text ' +
            '(any case). Use it to get an id before get_opportunity, update_opportunity, or ' +
            'move_opportunity. If several match, ask the owner which one they mean.',
        },
        {
          name: 'get_opportunity',
          title: 'Get an opportunity',
          description:
            'Gets one opportunity with every detail and its full stage history, oldest first. ' +
            'History entries with via "CLAUDE" were made through Claude. changeCount is needed to ' +
            'move it to another stage. lead is the networking lead it came through, or null.',
        },
        {
          name: 'list_leads',
          title: 'List networking leads',
          description:
            "Lists the owner's networking leads: people helping them find jobs, by name, each with " +
            'the opportunities linked to it and its notes from conversations, newest first. Use ' +
            "a lead's id as leadId in add_opportunity or update_opportunity, and as lead_id in " +
            'add_lead_note.',
        },
      ]);
    } finally {
      await t.close();
    }
  });

  it('accepts a find limit from 1 up', async () => {
    const t = await setup();
    try {
      await t.add('Acme', 'Engineer');
      await t.add('Acme', 'Designer');

      const one = await t.call('find_opportunities', { query: 'acme', limit: 1 });
      expect(one.structuredContent?.items).toHaveLength(1);
      expect((await t.call('find_opportunities', { query: 'acme', limit: 0 })).isError).toBe(true);
    } finally {
      await t.close();
    }
  });

  it('describes the tools as read-only', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        'list_opportunities',
        'find_opportunities',
        'get_opportunity',
        'list_leads',
      ]);
      for (const tool of tools) {
        expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
        expect(tool.description?.length).toBeGreaterThan(40);
      }
    } finally {
      await t.close();
    }
  });
});
