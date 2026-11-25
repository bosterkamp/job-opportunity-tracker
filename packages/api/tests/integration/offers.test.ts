// @module-tag offer
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import { createOfferFieldsRepo } from '../../src/repo/offerFieldsRepo.js';
import { createOpportunityRepo } from '../../src/repo/opportunityRepo.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

// Feature 013: an opportunity's offer, its history and scores, and the custom fields.

const config = testConfig();
const docs = documentClient();
const run = `OFR${Date.now()}`;
let clock = new Date('2026-11-20T15:00:00.000Z');
let n = 0;
const newId = () => `${run}-${String(n++).padStart(4, '0')}`;
// Each test gets its own fields list, so tests (and other files) don't share one.
let settingsPk = `SETTINGS#${run}`;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent, via?: 'CLAUDE') =>
  createHandler(config, {
    now: () => clock,
    newId,
    via,
    offerFieldsRepo: createOfferFieldsRepo(docs, config.tableName, { settingsPk }),
  })(event);

type Change = { seq: number; at: string; kind: string; changes: unknown[]; via?: string };
type Body = Record<string, unknown> & {
  id: string;
  offer?: Record<string, unknown> & { custom?: Record<string, string> };
  offerScores?: Record<string, number>;
  offerHistory?: Change[];
  history: unknown[];
  code?: string;
  message?: string;
  fields?: string[];
};
const parse = (result: { body?: string }) => JSON.parse(result.body ?? 'null') as Body;
const conflict = 'This opportunity changed since you loaded it. Reload and try again.';

async function opportunity() {
  const result = await handle(
    apiEvent('POST', '/opportunities', {
      body: { company: 'Acme', title: 'Engineer', salaryMin: 150000, salaryMax: 180000 },
    }),
  );
  return parse(result);
}

const saveOffer = (id: string, body: unknown, via?: 'CLAUDE') =>
  handle(apiEvent('PATCH', `/opportunities/${id}/offer`, { body }), via);
const score = (id: string, scores: unknown) =>
  handle(apiEvent('PATCH', `/opportunities/${id}/offer/scores`, { body: { scores } }));
const removeOffer = (id: string, confirm = true) =>
  handle(
    apiEvent('DELETE', `/opportunities/${id}/offer`, {
      headers: confirm ? { 'x-confirm-delete': 'true' } : {},
    }),
  );
const get = async (id: string) => parse(await handle(apiEvent('GET', `/opportunities/${id}`)));
const getFields = async () => {
  const result = await handle(apiEvent('GET', '/offer-fields'));
  return JSON.parse(result.body ?? 'null') as {
    fields: { id: string; name: string }[];
    removed: { id: string; name: string }[];
    version: number;
  };
};
const putFields = (body: unknown, confirm = false) =>
  handle(
    apiEvent('PATCH', '/offer-fields', {
      body,
      headers: confirm ? { 'x-confirm-delete': 'true' } : {},
    }),
  );

async function items(id: string) {
  const result = await docs.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `OPP#${id}` },
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}
const opp = async (id: string) => (await items(id)).find((item) => item.SK === 'OPP');
const historyItems = async (id: string) =>
  (await items(id)).filter((item) => String(item.SK).startsWith('OFFERCHANGE#'));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  clock = new Date('2026-11-20T15:00:00.000Z');
  settingsPk = `SETTINGS#${run}-${n++}`;
});

afterAll(() => {
  docs.destroy();
});

describe('PATCH /opportunities/{id}/offer', () => {
  it('adds the offer with its first history entry, leaving the rest alone', async () => {
    const created = await opportunity();
    const before = await opp(created.id);

    const result = await saveOffer(created.id, {
      baseSalary: 165000,
      bonusPercent: 10,
      pto: ' 20 days ',
      respondBy: '2026-11-28',
    });

    expect(result.statusCode).toBe(200);
    const body = parse(result);
    expect(body.offer).toEqual({
      baseSalary: 165000,
      bonusPercent: 10,
      pto: '20 days',
      respondBy: '2026-11-28',
      createdAt: '2026-11-20T15:00:00.000Z',
      updatedAt: '2026-11-20T15:00:00.000Z',
    });
    expect(body.offerScores).toEqual({});
    expect(body.offerHistory).toEqual([
      {
        seq: 1,
        at: '2026-11-20T15:00:00.000Z',
        kind: 'RECORDED',
        changes: [
          { field: 'baseSalary', from: null, to: 165000 },
          { field: 'bonusPercent', from: null, to: 10 },
          { field: 'pto', from: null, to: '20 days' },
          { field: 'respondBy', from: null, to: '2026-11-28' },
        ],
      },
    ]);
    const after = await opp(created.id);
    expect(after?.offerVersion).toBe(1);
    // FR-015: the stage and its history are untouched; so is the salary range.
    for (const key of [
      'stage',
      'status',
      'lastStageChangeAt',
      'changeCount',
      'salaryMin',
      'salaryMax',
      'GSI1SK',
    ]) {
      expect(after?.[key]).toEqual(before?.[key]);
    }
    expect(body.history).toHaveLength(1);
  });

  it('adds an empty offer too', async () => {
    const created = await opportunity();
    const body = parse(await saveOffer(created.id, {}));
    expect(body.offer).toEqual({
      createdAt: '2026-11-20T15:00:00.000Z',
      updatedAt: '2026-11-20T15:00:00.000Z',
    });
    expect(body.offerHistory).toEqual([
      { seq: 1, at: '2026-11-20T15:00:00.000Z', kind: 'RECORDED', changes: [] },
    ]);
  });

  it('records each change, with what changed, and keeps the first terms', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { baseSalary: 160000, equity: 'RSUs' });
    clock = new Date('2026-11-21T09:00:00.000Z');

    const body = parse(
      await saveOffer(created.id, { baseSalary: 170000, signOnBonus: 10000, equity: null }),
    );

    expect(body.offer).toEqual({
      baseSalary: 170000,
      signOnBonus: 10000,
      createdAt: '2026-11-20T15:00:00.000Z',
      updatedAt: '2026-11-21T09:00:00.000Z',
    });
    expect(body.offerHistory?.[1]).toEqual({
      seq: 2,
      at: '2026-11-21T09:00:00.000Z',
      kind: 'CHANGED',
      changes: [
        { field: 'baseSalary', from: 160000, to: 170000 },
        { field: 'signOnBonus', from: null, to: 10000 },
        { field: 'equity', from: 'RSUs', to: null },
      ],
    });
    expect(body.offerHistory?.[0]?.changes).toContainEqual({
      field: 'baseSalary',
      from: null,
      to: 160000,
    });
    expect((await opp(created.id))?.offerVersion).toBe(2);
  });

  it('writes nothing for a save that changes nothing', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { pto: '20 days' });
    clock = new Date('2026-11-22T09:00:00.000Z');

    const result = await saveOffer(created.id, { pto: '20 days', equity: null });

    expect(result.statusCode).toBe(200);
    expect(parse(result).offerHistory).toHaveLength(1);
    expect(await historyItems(created.id)).toHaveLength(1);
    expect((await opp(created.id))?.updatedAt).toBe('2026-11-20T15:00:00.000Z');
  });

  it('marks changes made through Claude', async () => {
    const created = await opportunity();
    const body = parse(await saveOffer(created.id, { pto: '25 days' }, 'CLAUDE'));
    expect(body.offerHistory?.[0]?.via).toBe('CLAUDE');
  });

  it('keeps every change when two saves race', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { baseSalary: 160000 });

    const results = await Promise.all([
      saveOffer(created.id, { baseSalary: 165000 }),
      saveOffer(created.id, { baseSalary: 170000 }),
    ]);

    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409]);
    const refused = results.find((r) => r.statusCode === 409);
    expect(parse(refused ?? {})).toMatchObject({ code: 'CONFLICT', message: conflict });
    const body = await get(created.id);
    expect(body.offerHistory).toHaveLength(2);
    expect(body.offerHistory?.[1]?.changes).toEqual([
      { field: 'baseSalary', from: 160000, to: body.offer?.baseSalary },
    ]);
  });

  it('refuses bad values with their field', async () => {
    const created = await opportunity();
    const result = await saveOffer(created.id, { bonusPercent: 12.55 });
    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Enter a percentage from 0 to 100, like 12.5',
      fields: ['bonusPercent'],
    });
    expect((await opp(created.id))?.offer).toBeUndefined();
  });

  it('is 404 for an unknown opportunity', async () => {
    const result = await saveOffer(`${run}-missing`, { pto: 'x' });
    expect(result.statusCode).toBe(404);
    expect(parse(result).message).toBe('Opportunity not found');
  });

  describe('custom values', () => {
    it('keeps values for current fields and refuses unknown ones', async () => {
      const fields = parse(await putFields({ fields: [{ name: 'Commute' }], expectedVersion: 0 }));
      const [commute] = (fields as unknown as { fields: { id: string }[] }).fields;
      const created = await opportunity();

      const body = parse(await saveOffer(created.id, { custom: { [commute!.id]: '20 min' } }));
      expect(body.offer?.custom).toEqual({ [commute!.id]: '20 min' });
      expect(body.offerHistory?.[0]?.changes).toEqual([
        { field: `custom:${commute!.id}`, from: null, to: '20 min' },
      ]);

      const refused = await saveOffer(created.id, { custom: { nope: 'x' } });
      expect(refused.statusCode).toBe(400);
      expect(parse(refused)).toMatchObject({
        message: 'Unknown custom field',
        fields: ['custom.nope'],
      });
      // Clearing a value for a field that's gone is fine.
      expect((await saveOffer(created.id, { custom: { nope: null } })).statusCode).toBe(200);
    });

    it('drops values and scores of a removed field on the next save', async () => {
      const put = parse(
        await putFields({ fields: [{ name: 'Commute' }, { name: 'Tuition' }], expectedVersion: 0 }),
      ) as unknown as { fields: { id: string; name: string }[] };
      const [commute, tuition] = put.fields as unknown as [{ id: string }, { id: string }];
      const created = await opportunity();
      await saveOffer(created.id, { custom: { [commute.id]: '20 min', [tuition.id]: 'Yes' } });
      await score(created.id, { [`custom:${commute.id}`]: 2, [`custom:${tuition.id}`]: 4 });
      await putFields({ fields: [put.fields[1]], expectedVersion: 1 }, true);

      const body = parse(await saveOffer(created.id, { pto: '20 days' }));

      expect(body.offer?.custom).toEqual({ [tuition.id]: 'Yes' });
      expect(body.offerScores).toEqual({ [`custom:${tuition.id}`]: 4 });
      expect(body.offerHistory?.[1]?.changes).toEqual([
        { field: 'pto', from: null, to: '20 days' },
        { field: `custom:${commute.id}`, from: '20 min', to: null },
      ]);
    });
  });
});

describe('PATCH /opportunities/{id}/offer/scores', () => {
  it('sets, changes and clears scores one at a time, with no history entry', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { baseSalary: 165000 });

    expect(parse(await score(created.id, { baseSalary: 5, equity: 0 })).offerScores).toEqual({
      baseSalary: 5,
      equity: 0,
    });
    const body = parse(await score(created.id, { baseSalary: 3, equity: null }));

    expect(body.offerScores).toEqual({ baseSalary: 3 });
    expect(body.offerHistory).toHaveLength(1);
    expect((await opp(created.id))?.offerVersion).toBe(1);
  });

  it('keeps both when two scores are set at once', async () => {
    const created = await opportunity();
    await saveOffer(created.id, {});
    await Promise.all([score(created.id, { pto: 4 }), score(created.id, { culture: 2 })]);
    expect((await get(created.id)).offerScores).toEqual({ pto: 4, culture: 2 });
  });

  it('needs an offer', async () => {
    const created = await opportunity();
    const result = await score(created.id, { pto: 4 });
    expect(result.statusCode).toBe(400);
    expect(parse(result).message).toBe('Add the offer before scoring it');
    // Even for a custom field that doesn't exist: the missing offer is the problem to fix.
    expect(parse(await score(created.id, { 'custom:nope': 2 })).message).toBe(
      'Add the offer before scoring it',
    );
  });

  it('needs an offer still there when the scores are written', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { pto: 'x' });
    // The offer is removed between reading the opportunity and writing the scores.
    const real = createOpportunityRepo(docs, config.tableName);
    const racing = createHandler(config, {
      now: () => clock,
      newId,
      repo: { ...real, setOfferScores: () => Promise.resolve(false) },
      offerFieldsRepo: createOfferFieldsRepo(docs, config.tableName, { settingsPk }),
    });

    const result = await racing(
      apiEvent('PATCH', `/opportunities/${created.id}/offer/scores`, {
        body: { scores: { pto: 4 } },
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(parse(result).message).toBe('Add the offer before scoring it');
  });

  it('refuses bad scores, unknown keys and unknown custom fields', async () => {
    const created = await opportunity();
    await saveOffer(created.id, {});
    expect(parse(await score(created.id, { pto: 6 }))).toMatchObject({
      message: 'Score with a whole number from 0 to 5',
      fields: ['scores.pto'],
    });
    expect(parse(await score(created.id, { salary: 1 })).message).toBe('Unknown detail to score');
    expect(parse(await score(created.id, { 'custom:nope': 1 }))).toMatchObject({
      message: 'Unknown custom field',
      fields: ['scores.custom:nope'],
    });
    // Clearing a removed field's score is fine.
    expect((await score(created.id, { 'custom:nope': null })).statusCode).toBe(200);
  });

  it('changes nothing for no scores, and is 404 for an unknown opportunity', async () => {
    const created = await opportunity();
    await saveOffer(created.id, {});
    const before = await opp(created.id);
    expect((await score(created.id, {})).statusCode).toBe(200);
    expect((await opp(created.id))?.updatedAt).toBe(before?.updatedAt);
    expect((await score(`${run}-missing`, { pto: 1 })).statusCode).toBe(404);
  });
});

describe('DELETE /opportunities/{id}/offer', () => {
  it('needs the confirm header', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { pto: 'x' });
    const result = await removeOffer(created.id, false);
    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({
      message: 'Confirm removing the offer and its history with the header X-Confirm-Delete: true',
      fields: ['X-Confirm-Delete'],
    });
    expect((await opp(created.id))?.offer).toBeDefined();
  });

  it('removes the offer, its scores and all its history, and a new one starts again', async () => {
    const created = await opportunity();
    // More entries than fit in one transaction with the offer.
    for (let i = 1; i <= 101; i += 1) {
      await saveOffer(created.id, { baseSalary: i });
    }
    await score(created.id, { baseSalary: 2 });
    const before = await opp(created.id);

    const result = await removeOffer(created.id);

    expect(result.statusCode).toBe(200);
    const body = parse(result);
    expect(body.offer).toBeUndefined();
    expect(body.offerScores).toBeUndefined();
    expect(body.offerHistory).toBeUndefined();
    expect(await historyItems(created.id)).toEqual([]);
    const after = await opp(created.id);
    expect(after?.offerVersion).toBeUndefined();
    expect(after?.stage).toBe(before?.stage);
    expect(after?.changeCount).toBe(before?.changeCount);

    const again = parse(await saveOffer(created.id, { pto: '10 days' }));
    expect(again.offerHistory).toEqual([
      expect.objectContaining({ seq: 1, kind: 'RECORDED' }) as unknown,
    ]);
    expect(again.offerScores).toEqual({});
  }, 60_000);

  it('says when there is no offer', async () => {
    const created = await opportunity();
    const result = await removeOffer(created.id);
    expect(result.statusCode).toBe(404);
    expect(parse(result).message).toBe('No offer to remove');
    expect((await removeOffer(`${run}-missing`)).statusCode).toBe(404);
  });
});

describe('reading offers', () => {
  it('lists the offer and scores, but not the history', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { baseSalary: 165000 });
    await score(created.id, { baseSalary: 4 });

    const result = await handle(apiEvent('GET', '/opportunities'));
    const list = JSON.parse(result.body ?? '[]') as { items: Body[] } | Body[];
    const items = Array.isArray(list) ? list : list.items;
    const listed = items.find((o) => o.id === created.id);

    expect(listed?.offer?.baseSalary).toBe(165000);
    expect(listed?.offerScores).toEqual({ baseSalary: 4 });
    expect(listed?.offerHistory).toBeUndefined();
    expect(listed?.offerVersion).toBeUndefined();
  });

  it('reads an opportunity without an offer as before', async () => {
    const created = await opportunity();
    const body = await get(created.id);
    expect(body.offer).toBeUndefined();
    expect(body.offerHistory).toBeUndefined();
  });

  it('deletes the history with the opportunity', async () => {
    const created = await opportunity();
    await saveOffer(created.id, { pto: 'x' });
    await handle(
      apiEvent('DELETE', `/opportunities/${created.id}`, {
        headers: { 'x-confirm-delete': 'true' },
      }),
    );
    expect(await items(created.id)).toEqual([]);
  });
});

describe('the custom fields', () => {
  it('starts empty', async () => {
    expect(await getFields()).toEqual({ fields: [], removed: [], version: 0 });
  });

  it('adds, renames and reorders, giving new fields an id', async () => {
    const added = parse(
      await putFields({ fields: [{ name: ' Commute ' }, { name: 'Tuition' }], expectedVersion: 0 }),
    ) as unknown as { fields: { id: string; name: string }[]; version: number };
    expect(added.fields).toEqual([
      { id: expect.stringMatching(new RegExp(`^${run}`)) as unknown, name: 'Commute' },
      { id: expect.stringMatching(new RegExp(`^${run}`)) as unknown, name: 'Tuition' },
    ]);
    expect(added.version).toBe(1);
    const [commute, tuition] = added.fields as unknown as [{ id: string }, { id: string }];

    const result = await putFields({
      fields: [
        { id: tuition.id, name: 'Tuition support' },
        { id: commute.id, name: 'Commute' },
      ],
      expectedVersion: 1,
    });

    expect(result.statusCode).toBe(200);
    expect(await getFields()).toEqual({
      fields: [
        { id: tuition.id, name: 'Tuition support' },
        { id: commute.id, name: 'Commute' },
      ],
      removed: [],
      version: 2,
    });
  });

  it('needs the confirm header to drop a field, and keeps its last name', async () => {
    const added = (await putFields({
      fields: [{ name: 'Commute' }, { name: 'Tuition' }],
      expectedVersion: 0,
    }).then(parse)) as unknown as { fields: { id: string; name: string }[] };
    const [commute, tuition] = added.fields as [
      { id: string; name: string },
      { id: string; name: string },
    ];

    const refused = await putFields({ fields: [tuition], expectedVersion: 1 });
    expect(refused.statusCode).toBe(400);
    expect(parse(refused)).toMatchObject({
      message: 'Confirm removing a custom field with the header X-Confirm-Delete: true',
      fields: ['X-Confirm-Delete'],
    });

    await putFields({ fields: [tuition], expectedVersion: 1 }, true);
    // The name can be used again, by a new field.
    await putFields({ fields: [tuition, { name: 'commute' }], expectedVersion: 2 });

    const now = await getFields();
    expect(now.removed).toEqual([commute]);
    expect(now.fields).toHaveLength(2);
    expect(now.fields[1]?.id).not.toBe(commute.id);
  });

  it('refuses a stale version, an unknown id, and the schema limits', async () => {
    await putFields({ fields: [{ name: 'Commute' }], expectedVersion: 0 });

    const stale = await putFields({ fields: [], expectedVersion: 0 }, true);
    expect(stale.statusCode).toBe(409);
    expect(parse(stale)).toMatchObject({
      code: 'CONFLICT',
      message: 'The custom fields changed since you loaded them. Reload and try again.',
    });

    expect(
      parse(await putFields({ fields: [{ id: 'nope', name: 'X' }], expectedVersion: 1 })),
    ).toMatchObject({ message: 'Unknown custom field', fields: ['fields.0.id'] });

    const tooMany = Array.from({ length: 21 }, (_, i) => ({ name: `F${i}` }));
    expect(parse(await putFields({ fields: tooMany, expectedVersion: 1 })).message).toBe(
      'You can have at most 20 custom fields',
    );
    expect(parse(await putFields({ fields: [], expectedVersion: 1, extra: 1 })).message).toBe(
      'Unknown field: extra',
    );
  });

  it('lets only one of two racing changes through', async () => {
    const results = await Promise.all([
      putFields({ fields: [{ name: 'A' }], expectedVersion: 0 }),
      putFields({ fields: [{ name: 'B' }], expectedVersion: 0 }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(parse(results.find((r) => r.statusCode === 409) ?? {}).message).toBe(
      'The custom fields changed since you loaded them. Reload and try again.',
    );
    expect((await getFields()).fields).toHaveLength(1);
  });
});
