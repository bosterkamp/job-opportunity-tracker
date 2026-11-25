// @module-tag offer
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createRoutes, defaultDeps } from '../../src/handler.js';
import { createTable, deleteTable } from '../../src/local/table.js';
import { apiCaller } from '../../src/mcp/apiCall.js';
import { createChangeLimiter, MAX_CHANGES_PER_MINUTE } from '../../src/mcp/rateLimit.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { registerReadTools, registerWriteTools } from '../../src/mcp/tools.js';
import { createDispatcher, createRouter } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, rawClient, testConfig } from './dynamo.js';

// Feature 013 through Claude: reading, recording and scoring offers, and the custom fields.

type Json = Record<string, unknown>;
type Result = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };

async function setup() {
  const tableName = `JobTracker-mcpo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await createTable(rawClient(), tableName);
  const config = { ...testConfig(), tableName, appEnv: 'aws' as const };
  let n = 0;
  const clock = { now: new Date('2026-11-20T15:00:00.000Z') };
  const base = { ...defaultDeps(config), now: () => clock.now, newId: () => `id-${n++}` };
  const web = createRouter(createRoutes(base), 'aws');
  const claude = createDispatcher(createRoutes({ ...base, via: 'CLAUDE' }));
  // Every API path the tools call, to check what they read.
  const paths: string[] = [];
  const caller = apiCaller(claude, 'owner-sub');
  const api: typeof caller = (method, path, options) => {
    paths.push(path);
    return caller(method, path, options);
  };
  const deps = { api, now: () => clock.now };
  const server = createMcpServer([
    (s) => registerReadTools(s, deps),
    (s) =>
      registerWriteTools(s, {
        ...deps,
        takeChange: createChangeLimiter(documentClient(), tableName),
        readPosting: () => Promise.reject(new Error('not used')),
      }),
  ]);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);

  const call = async (name: string, args: Json = {}) =>
    (await client.callTool({ name, arguments: args })) as Result;
  const viaWeb = async (method: string, path: string, body?: unknown, confirm = false) => {
    const result = await web(
      apiEvent(method, path, {
        body,
        sub: 'owner-sub',
        headers: confirm ? { 'x-confirm-delete': 'true' } : {},
      }),
    );
    return { status: result.statusCode, body: JSON.parse(result.body ?? 'null') as Json };
  };
  const opportunity = async (company: string, stage?: string) => {
    const created = (await viaWeb('POST', '/opportunities', { company, title: 'Engineer' }))
      .body as { id: string };
    if (stage) {
      await viaWeb('POST', `/opportunities/${created.id}/stage-changes`, {
        toStage: stage,
        expectedChangeCount: 1,
      });
    }
    return created.id;
  };
  return {
    call,
    viaWeb,
    client,
    opportunity,
    paths,
    close: async () => {
      await client.close();
      await deleteTable(rawClient(), tableName);
    },
  };
}

const refusal = (result: Result) => (result.isError ? result.content[0]?.text : undefined);

describe('offers through Claude', () => {
  it('records an offer by name, marked via Claude, and the web app shows it', async () => {
    const t = await setup();
    try {
      await t.call('add_offer_field', { name: 'Commute' });
      const id = await t.opportunity('Acme');

      const result = await t.call('update_offer', {
        opportunity_id: id,
        base_salary: '170k',
        bonus_percent: 15,
        pto: '25 days',
        respond_by: '2026-11-28',
        work_arrangement: 'REMOTE',
        custom: { commute: '20 min' },
      });

      expect(refusal(result)).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        offer: {
          baseSalary: 170000,
          bonusPercent: 15,
          pto: '25 days',
          respondBy: '2026-11-28',
          workArrangement: 'REMOTE',
          custom: { Commute: '20 min' },
        },
        offerScores: {},
        offerOverall: null,
        offerHistory: [{ seq: 1, kind: 'RECORDED', via: 'CLAUDE' }],
      });
      const web = (await t.viaWeb('GET', `/opportunities/${id}`)).body as {
        offer: { custom: Json; baseSalary: number };
      };
      expect(web.offer.baseSalary).toBe(170000);
      expect(Object.values(web.offer.custom)).toEqual(['20 min']);
    } finally {
      await t.close();
    }
  });

  it('changes and clears details, and names custom fields in the history', async () => {
    const t = await setup();
    try {
      await t.call('add_offer_field', { name: 'Commute' });
      const id = await t.opportunity('Acme');
      await t.call('update_offer', { opportunity_id: id, base_salary: 160000, equity: 'RSUs' });

      const result = await t.call('update_offer', {
        opportunity_id: id,
        base_salary: 165000,
        equity: null,
        custom: { Commute: '1 hour' },
      });

      expect(result.structuredContent?.offerHistory).toMatchObject([
        { seq: 1 },
        {
          seq: 2,
          kind: 'CHANGED',
          via: 'CLAUDE',
          changes: [
            { field: 'baseSalary', from: 160000, to: 165000 },
            { field: 'equity', from: 'RSUs', to: null },
            { field: 'Commute', from: null, to: '1 hour' },
          ],
        },
      ]);
    } finally {
      await t.close();
    }
  });

  it("refuses an unknown custom field and the web app's rules", async () => {
    const t = await setup();
    try {
      const id = await t.opportunity('Acme');
      expect(
        refusal(await t.call('update_offer', { opportunity_id: id, custom: { Gym: 'x' } })),
      ).toBe('VALIDATION_ERROR: Unknown custom field: Gym');
      expect(
        refusal(await t.call('update_offer', { opportunity_id: id, base_salary: 'lots' })),
      ).toBe('VALIDATION_ERROR: Enter a whole number, like 150000');
      expect(
        refusal(await t.call('update_offer', { opportunity_id: id, bonus_percent: 12.55 })),
      ).toBe('VALIDATION_ERROR: Enter a percentage from 0 to 100, like 12.5');
    } finally {
      await t.close();
    }
  });

  it('scores details and custom fields by name, with the overall', async () => {
    const t = await setup();
    try {
      await t.call('add_offer_field', { name: 'Commute' });
      const id = await t.opportunity('Acme');
      expect(refusal(await t.call('score_offer', { opportunity_id: id, scores: { pto: 4 } }))).toBe(
        'VALIDATION_ERROR: Add the offer before scoring it',
      );
      await t.call('update_offer', { opportunity_id: id, pto: '20 days' });

      const result = await t.call('score_offer', {
        opportunity_id: id,
        scores: { pto: 4, base_salary: 5, equity: 0, commute: 3 },
      });

      expect(result.structuredContent).toMatchObject({
        offerScores: { pto: 4, baseSalary: 5, equity: 0, Commute: 3 },
        offerOverall: 3,
      });
      const cleared = await t.call('score_offer', {
        opportunity_id: id,
        scores: { equity: null },
      });
      expect(cleared.structuredContent?.offerOverall).toBe(4);
      expect(refusal(await t.call('score_offer', { opportunity_id: id, scores: { gym: 1 } }))).toBe(
        'VALIDATION_ERROR: Unknown custom field: gym',
      );
    } finally {
      await t.close();
    }
  });

  it('lists every offer and the Offer stage, open first, with the fields by name', async () => {
    const t = await setup();
    try {
      await t.call('add_offer_field', { name: 'Commute' });
      const acme = await t.opportunity('Acme', 'OFFER');
      const bolt = await t.opportunity('Bolt', 'DECLINED');
      await t.opportunity('Cove');
      await t.call('update_offer', { opportunity_id: bolt, base_salary: 150000 });
      await t.call('score_offer', { opportunity_id: bolt, scores: { base_salary: 2 } });

      const result = await t.call('list_offers');

      expect(result.structuredContent).toEqual({
        fields: ['Commute'],
        items: [
          {
            id: acme,
            company: 'Acme',
            title: 'Engineer',
            stage: 'OFFER',
            status: 'OPEN',
            offer: null,
            scores: null,
            overall: null,
          },
          {
            id: bolt,
            company: 'Bolt',
            title: 'Engineer',
            stage: 'DECLINED',
            status: 'CLOSED',
            offer: expect.objectContaining({ baseSalary: 150000, custom: {} }) as unknown,
            scores: { baseSalary: 2 },
            overall: 2,
          },
        ],
      });
    } finally {
      await t.close();
    }
  });

  it('gives get_opportunity the offer, and nothing when there is none', async () => {
    const t = await setup();
    try {
      const id = await t.opportunity('Acme');
      t.paths.length = 0;
      expect((await t.call('get_opportunity', { id })).structuredContent).toMatchObject({
        offer: null,
        offerScores: null,
        offerOverall: null,
        offerHistory: [],
      });
      // Without an offer there's nothing to name, so the custom fields aren't read.
      expect(t.paths).toEqual([`/opportunities/${id}`]);
      await t.call('update_offer', { opportunity_id: id, pto: '20 days' });
      expect((await t.call('get_opportunity', { id })).structuredContent).toMatchObject({
        offer: { pto: '20 days', custom: {} },
        offerHistory: [{ kind: 'RECORDED' }],
      });
    } finally {
      await t.close();
    }
  });

  it("names a removed field's history as removed, and leaves out its value and score", async () => {
    const t = await setup();
    try {
      await t.call('add_offer_field', { name: 'Commute' });
      const id = await t.opportunity('Acme');
      await t.call('update_offer', { opportunity_id: id, custom: { Commute: '20 min' } });
      await t.call('score_offer', { opportunity_id: id, scores: { Commute: 2 } });
      const fields = (await t.viaWeb('GET', '/offer-fields')).body as { version: number };
      await t.viaWeb(
        'PATCH',
        '/offer-fields',
        { fields: [], expectedVersion: fields.version },
        true,
      );

      const result = await t.call('get_opportunity', { id });

      expect(result.structuredContent).toMatchObject({
        offerOverall: null,
        offerHistory: [{ changes: [{ field: 'Commute (removed)', to: '20 min' }] }],
      });
      // The removed field's value and score are still stored until the next save, but left out.
      expect((result.structuredContent?.offer as Json).custom).toEqual({});
      expect(result.structuredContent?.offerScores).toEqual({});
    } finally {
      await t.close();
    }
  });

  it('adds and renames custom fields by name, but not to a duplicate', async () => {
    const t = await setup();
    try {
      expect((await t.call('add_offer_field', { name: 'Commute' })).structuredContent).toEqual({
        fields: ['Commute'],
      });
      await t.call('add_offer_field', { name: 'Tuition' });
      expect(refusal(await t.call('add_offer_field', { name: 'commute' }))).toBe(
        "VALIDATION_ERROR: There's already a field called commute",
      );
      expect(
        (await t.call('rename_offer_field', { name: 'commute', new_name: 'Commute time' }))
          .structuredContent,
      ).toEqual({ fields: ['Commute time', 'Tuition'] });
      expect(refusal(await t.call('rename_offer_field', { name: 'Gym', new_name: 'X' }))).toBe(
        'VALIDATION_ERROR: Unknown custom field: Gym',
      );
    } finally {
      await t.close();
    }
  });

  it('has no tool to remove an offer or a field, and says removing is in the web app', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const names = tools.map((tool) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'list_offers',
          'update_offer',
          'score_offer',
          'add_offer_field',
          'rename_offer_field',
        ]),
      );
      expect(names.filter((name) => /offer/.test(name) && /remove|delete/.test(name))).toEqual([]);
      const describe = (name: string) => tools.find((tool) => tool.name === name)?.description;
      expect(describe('update_offer')).toMatch(/removed only in the web app/);
      expect(describe('add_offer_field')).toMatch(/removed only in the web app/);
      expect(describe('score_offer')).toMatch(/0 means not offered/);
    } finally {
      await t.close();
    }
  });

  it('reads amounts only for base salary and sign-on bonus, and fields by trimmed name', async () => {
    const t = await setup();
    try {
      await t.call('add_offer_field', { name: 'Commute' });
      const id = await t.opportunity('Acme');
      const result = await t.call('update_offer', {
        opportunity_id: id,
        sign_on_bonus: '$10k',
        equity: '5000',
        pto: '25',
        custom: { '  commute ': '20 min' },
      });
      expect(refusal(result)).toBeUndefined();
      expect(result.structuredContent?.offer).toEqual({
        signOnBonus: 10000,
        equity: '5000',
        pto: '25',
        custom: { Commute: '20 min' },
        createdAt: '2026-11-20T15:00:00.000Z',
        updatedAt: '2026-11-20T15:00:00.000Z',
      });
      expect(
        refusal(await t.call('update_offer', { opportunity_id: id, base_salary: 'lots' })),
      ).toMatch(/^VALIDATION_ERROR: /);
    } finally {
      await t.close();
    }
  });

  it('describes the offer tools and their inputs for Claude', async () => {
    const t = await setup();
    try {
      const { tools } = await t.client.listTools();
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      type Property = { description?: string };
      const props = (name: string) =>
        byName[name]?.inputSchema.properties as Record<string, Property>;
      const hint = (name: string, input: string) => props(name)[input]?.description;

      expect(byName.update_offer).toMatchObject({
        title: 'Record or change an offer',
        description:
          'Records the offer an opportunity received, or changes it; the first call adds it. ' +
          'Give only the details to change; null clears one. custom sets custom fields by name ' +
          "(see list_offers). Each change is kept in the offer's history. The offer can be " +
          'removed only in the web app.',
      });
      expect(byName.score_offer).toMatchObject({
        title: 'Score an offer',
        description:
          "Scores an offer's details for comparing offers: 0 means not offered or not applicable, " +
          '1 is worst and 5 best; null clears a score. Keys are detail names (base_salary, ' +
          'bonus_percent, sign_on_bonus, equity, retirement, insurance, location, ' +
          'work_arrangement, title, role, pto, leadership, culture, start_date, respond_by) or ' +
          'custom field names. Scores count toward the overall score, their average.',
      });
      expect(byName.add_offer_field).toMatchObject({
        title: 'Add a custom offer field',
        description:
          'Adds a custom field every offer gets, to compare offers on, such as "Commute". At most ' +
          '20; names are unique regardless of case. Fields can be removed only in the web app.',
      });
      expect(byName.rename_offer_field).toMatchObject({
        title: 'Rename a custom offer field',
        description: "Renames a custom offer field, keeping every offer's value and score for it.",
      });

      const amount = 'A whole amount, like 165000 or "165k" (no currency); null clears it';
      expect(
        Object.fromEntries(
          Object.entries(props('update_offer')).map(([name, p]) => [name, p.description]),
        ),
      ).toEqual({
        opportunity_id: "The opportunity's id",
        base_salary: amount,
        bonus_percent: 'The bonus as a percentage of base, 0 to 100, like 12.5; null clears it',
        sign_on_bonus: amount,
        equity: 'Equity or stock, as offered; null clears it',
        retirement: 'The 401k contribution, such as "100% match up to 6%"; null clears it',
        insurance: 'Insurance benefits; null clears it',
        location: 'Where the job is; null clears it',
        work_arrangement: 'ONSITE, HYBRID or REMOTE; null clears it',
        title: 'The job title as offered; null clears it',
        role: 'The role as offered; null clears it',
        pto: 'Paid time off, such as "20 days"; null clears it',
        leadership: 'What the owner knows of the leadership; null clears it',
        culture: 'What the owner knows of the culture; null clears it',
        start_date: 'YYYY-MM-DD; null clears it',
        respond_by: 'YYYY-MM-DD: when the owner must answer by; null clears it',
        custom: 'Custom field name to its value; null clears it',
      });
      expect(hint('score_offer', 'opportunity_id')).toBe("The opportunity's id");
      expect(hint('score_offer', 'scores')).toBe(
        'Detail or custom field name to a score from 0 to 5, or null',
      );
      expect(hint('add_offer_field', 'name')).toBe('The new field, at most 60 characters');
      expect(hint('rename_offer_field', 'name')).toBe("The field's current name");
      expect(hint('rename_offer_field', 'new_name')).toBe('Its new name, at most 60 characters');
    } finally {
      await t.close();
    }
  });

  it('takes one change from the limit for each change', async () => {
    const t = await setup();
    try {
      const id = await t.opportunity('Acme');
      for (let i = 0; i < MAX_CHANGES_PER_MINUTE; i += 1) {
        expect(
          refusal(await t.call('update_offer', { opportunity_id: id, pto: `${i} days` })),
        ).toBeUndefined();
      }
      expect(
        refusal(await t.call('score_offer', { opportunity_id: id, scores: { pto: 1 } })),
      ).toMatch(/^RATE_LIMITED/);
      expect(refusal(await t.call('add_offer_field', { name: 'X' }))).toMatch(/^RATE_LIMITED/);
    } finally {
      await t.close();
    }
  }, 60_000);
});
