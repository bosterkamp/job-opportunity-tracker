// @module-tag pipeline
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();
const run = `MOVE${Date.now()}`;
let clock = new Date('2026-10-18T12:00:00.000Z');
let n = 0;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent) =>
  createHandler(config, { now: () => clock, newId: () => `${run}-${n++}` })(event);

type Body = Record<string, unknown> & {
  id: string;
  changeCount: number;
  history: Record<string, unknown>[];
};
const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as Body;

async function create(): Promise<Body> {
  clock = new Date('2026-10-10T12:00:00.000Z');
  return parse(
    await handle(
      apiEvent('POST', '/opportunities', { body: { company: 'Acme', title: 'Engineer' } }),
    ),
  );
}

async function move(id: string, body: Record<string, unknown>, at = '2026-10-18T12:00:00.000Z') {
  clock = new Date(at);
  return handle(apiEvent('POST', `/opportunities/${id}/stage-changes`, { body }));
}

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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  docs.destroy();
});

describe('POST /opportunities/{id}/stage-changes', () => {
  it('moves the stage and records the change with its note, in one transaction', async () => {
    const { id } = await create();

    const result = await move(id, {
      toStage: 'APPLIED',
      note: ' Applied via site ',
      expectedChangeCount: 1,
    });

    expect(result.statusCode).toBe(201);
    const body = parse(result);
    expect(body).toMatchObject({
      id,
      stage: 'APPLIED',
      status: 'OPEN',
      changeCount: 2,
      updatedAt: '2026-10-18T12:00:00.000Z',
      lastStageChangeAt: '2026-10-18T12:00:00.000Z',
    });
    expect(body.history).toEqual([
      expect.objectContaining({ seq: 1, toStage: 'CONSIDERING' }),
      {
        seq: 2,
        fromStage: 'CONSIDERING',
        toStage: 'APPLIED',
        changedAt: '2026-10-18T12:00:00.000Z',
        note: 'Applied via site',
        recordedAt: '2026-10-18T12:00:00.000Z',
      },
    ]);

    const stored = await items(id);
    expect(stored.map((item) => item.SK)).toEqual(['CHANGE#000001', 'CHANGE#000002', 'OPP']);
    expect(stored.find((item) => item.SK === 'OPP')).toMatchObject({
      stage: 'APPLIED',
      status: 'OPEN',
      changeCount: 2,
      GSI1PK: 'STATUS#OPEN',
      GSI1SK: `2026-10-18T12:00:00.000Z#${id}`,
    });
  });

  it('stores a null note when none is given', async () => {
    const { id } = await create();

    const body = parse(await move(id, { toStage: 'APPLIED', expectedChangeCount: 1 }));

    expect(body.history[1]).toMatchObject({ note: null });
  });

  it('stores a backdated change, still moves to it, and keeps the latest date as lastStageChangeAt', async () => {
    const { id } = await create();
    await move(id, { toStage: 'CONTACTED', expectedChangeCount: 1 }, '2026-10-16T12:00:00.000Z');

    const result = await move(id, {
      toStage: 'APPLIED',
      changedAt: '2026-10-12T09:00:00-05:00',
      expectedChangeCount: 2,
    });

    const body = parse(result);
    expect(body).toMatchObject({
      stage: 'APPLIED',
      changeCount: 3,
      lastStageChangeAt: '2026-10-16T12:00:00.000Z',
    });
    // History is shown by date, so the backdated entry comes before the later one.
    expect(body.history.map((c) => [c.seq, c.toStage, c.changedAt])).toEqual([
      [1, 'CONSIDERING', '2026-10-10T12:00:00.000Z'],
      [3, 'APPLIED', '2026-10-12T14:00:00.000Z'],
      [2, 'CONTACTED', '2026-10-16T12:00:00.000Z'],
    ]);
    expect(body.history[1]).toMatchObject({
      fromStage: 'CONTACTED',
      recordedAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it('closes an opportunity with an outcome and reopens it into an open stage', async () => {
    const { id } = await create();

    const closed = parse(await move(id, { toStage: 'REJECTED', expectedChangeCount: 1 }));
    expect(closed).toMatchObject({ stage: 'REJECTED', status: 'CLOSED' });
    expect((await items(id)).find((item) => item.SK === 'OPP')).toMatchObject({
      GSI1PK: 'STATUS#CLOSED',
    });
    const archived = parse(
      await handle(apiEvent('GET', '/opportunities', { query: { status: 'CLOSED' } })),
    );
    expect((archived as unknown as { items: { id: string }[] }).items.map((o) => o.id)).toContain(
      id,
    );

    const reopened = parse(
      await move(id, { toStage: 'APPLIED', expectedChangeCount: 2 }, '2026-10-19T12:00:00.000Z'),
    );
    expect(reopened).toMatchObject({ stage: 'APPLIED', status: 'OPEN' });
    expect((await items(id)).find((item) => item.SK === 'OPP')).toMatchObject({
      GSI1PK: 'STATUS#OPEN',
      GSI1SK: `2026-10-19T12:00:00.000Z#${id}`,
    });
    expect(reopened.history.at(-1)).toMatchObject({ fromStage: 'REJECTED', toStage: 'APPLIED' });
  });

  it('closes a job that is no longer available, with a note on why', async () => {
    const { id } = await create();

    const closed = parse(
      await move(id, {
        toStage: 'NO_LONGER_AVAILABLE',
        note: 'Someone else was hired',
        expectedChangeCount: 1,
      }),
    );

    expect(closed).toMatchObject({ stage: 'NO_LONGER_AVAILABLE', status: 'CLOSED' });
    expect(closed.history.at(-1)).toMatchObject({
      fromStage: 'CONSIDERING',
      toStage: 'NO_LONGER_AVAILABLE',
      note: 'Someone else was hired',
    });
    const archived = parse(
      await handle(apiEvent('GET', '/opportunities', { query: { status: 'CLOSED' } })),
    ) as unknown as { items: { id: string; stage: string }[] };
    expect(archived.items.find((o) => o.id === id)?.stage).toBe('NO_LONGER_AVAILABLE');
  });

  it('rejects a change made against a newer version than exists with 409 and writes nothing', async () => {
    const { id } = await create();

    const result = await move(id, { toStage: 'APPLIED', expectedChangeCount: 5 });

    expect(result.statusCode).toBe(409);
    expect((await items(id)).filter((item) => item.SK !== 'OPP')).toHaveLength(1);
  });

  it('rejects a change made against an older version with 409 CONFLICT', async () => {
    const { id } = await create();
    await move(id, { toStage: 'APPLIED', expectedChangeCount: 1 });

    const stale = await move(id, { toStage: 'CONTACTED', expectedChangeCount: 1 });

    expect(stale.statusCode).toBe(409);
    expect(parse(stale)).toEqual({
      code: 'CONFLICT',
      message: 'This opportunity changed since you loaded it. Reload and try again.',
    });
    expect((await items(id)).find((item) => item.SK === 'OPP')).toMatchObject({
      stage: 'APPLIED',
      changeCount: 2,
    });
  });

  it('turns a lost race at write time into 409 CONFLICT', async () => {
    const { id } = await create();
    // Both requests read changeCount 1; only one write can win the conditional transaction.
    const [first, second] = await Promise.all([
      move(id, { toStage: 'APPLIED', expectedChangeCount: 1 }),
      move(id, { toStage: 'CONTACTED', expectedChangeCount: 1 }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
    expect((await items(id)).filter((item) => item.SK !== 'OPP')).toHaveLength(2);
  });

  it('rejects a move to the current stage with 422 SAME_STAGE and writes nothing', async () => {
    const { id } = await create();

    const result = await move(id, { toStage: 'CONSIDERING', expectedChangeCount: 1 });

    expect(result.statusCode).toBe(422);
    expect(parse(result)).toEqual({ code: 'SAME_STAGE', message: 'Already in Considering' });
    expect(await items(id)).toHaveLength(2);
  });

  it('rejects a future date with 422 FUTURE_DATE and writes nothing', async () => {
    const { id } = await create();

    const result = await move(id, {
      toStage: 'APPLIED',
      changedAt: '2026-10-19T12:00:00.000Z',
      expectedChangeCount: 1,
    });

    expect(result.statusCode).toBe(422);
    expect(parse(result)).toEqual({
      code: 'FUTURE_DATE',
      message: "The date can't be in the future",
    });
    expect(await items(id)).toHaveLength(2);
  });

  it('validates the body with the shared schema', async () => {
    const { id } = await create();

    const result = await move(id, { toStage: 'HIRED', expectedChangeCount: 1 });

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({ code: 'VALIDATION_ERROR', fields: ['toStage'] });
  });

  it('returns 404 for an unknown opportunity', async () => {
    const result = await move('does-not-exist', { toStage: 'APPLIED', expectedChangeCount: 1 });

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
  });
});
