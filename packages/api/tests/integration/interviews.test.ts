// @module-tag interview
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import { createOpportunityRepo } from '../../src/repo/opportunityRepo.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();
const run = `INT${Date.now()}`;
let clock = new Date('2026-10-20T15:00:00.000Z');
let n = 0;
const newId = () => `${run}-${String(n++).padStart(4, '0')}`;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent, via?: 'CLAUDE') =>
  createHandler(config, { now: () => clock, newId, via })(event);

type Body = Record<string, unknown> & {
  id: string;
  interviews: { id: string; heldAt: string; note: string | null; via?: string }[];
};
const parse = (result: { body?: string }) => JSON.parse(result.body ?? 'null') as Body;
const limit = 'This opportunity already has 6 interviews, the most it can have';

async function opportunity(createdAt = '2026-10-01T12:00:00.000Z') {
  clock = new Date('2026-10-01T12:00:00.000Z');
  const result = await handle(
    apiEvent('POST', '/opportunities', {
      body: { company: 'Farmers', title: 'Engineer', createdAt },
    }),
  );
  clock = new Date('2026-10-20T15:00:00.000Z');
  return parse(result);
}

const add = (id: string, body: unknown = {}, via?: 'CLAUDE') =>
  handle(apiEvent('POST', `/opportunities/${id}/interviews`, { body }), via);
const edit = (id: string, iid: string, body: unknown, via?: 'CLAUDE') =>
  handle(apiEvent('PATCH', `/opportunities/${id}/interviews/${iid}`, { body }), via);
const remove = (id: string, iid: string, confirm = true) =>
  handle(
    apiEvent('DELETE', `/opportunities/${id}/interviews/${iid}`, {
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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  docs.destroy();
});

describe('POST /opportunities/{id}/interviews', () => {
  it('logs an interview dated now, raising the count and nothing else', async () => {
    const created = await opportunity();
    const before = await opp(created.id);

    const result = await add(created.id, { note: '  Hiring manager ' });

    expect(result.statusCode).toBe(201);
    const body = parse(result);
    expect(body.interviews).toEqual([
      {
        id: expect.stringMatching(new RegExp(`^${run}`)) as unknown,
        heldAt: '2026-10-20T15:00:00.000Z',
        note: 'Hiring manager',
        recordedAt: '2026-10-20T15:00:00.000Z',
      },
    ]);
    expect(body.interviewCount).toBe(1);
    expect(body.updatedAt).toBe('2026-10-20T15:00:00.000Z');
    const after = await opp(created.id);
    for (const field of [
      'stage',
      'status',
      'lastStageChangeAt',
      'changeCount',
      'GSI1PK',
      'GSI1SK',
    ]) {
      expect(after?.[field]).toEqual(before?.[field]);
    }
    expect(
      (await items(created.id)).filter((i) => String(i.SK).startsWith('INTERVIEW#')),
    ).toHaveLength(1);
  });

  it('takes an earlier date in UTC, and lists interviews oldest first', async () => {
    const created = await opportunity();

    await add(created.id, { heldAt: '2026-10-15T10:00:00-05:00', note: 'Panel' });
    await add(created.id, { heldAt: '2026-10-05T12:00:00.000Z' });
    const fetched = parse(await handle(apiEvent('GET', `/opportunities/${created.id}`)));

    expect(fetched.interviews.map((i) => [i.heldAt, i.note])).toEqual([
      ['2026-10-05T12:00:00.000Z', null],
      ['2026-10-15T15:00:00.000Z', 'Panel'],
    ]);
    expect(fetched.interviewCount).toBe(2);
  });

  it.each([
    ['in the future', '2026-10-20T15:01:00.001Z', "The date can't be in the future"],
    [
      'before the date added',
      '2026-10-01T11:59:59.999Z',
      "An interview can't be before the date added",
    ],
  ])('refuses a date %s, on the field, and writes nothing', async (_label, heldAt, message) => {
    const created = await opportunity();

    const result = await add(created.id, { heldAt });

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({ code: 'VALIDATION_ERROR', message, fields: ['heldAt'] });
    expect(await opp(created.id)).not.toHaveProperty('interviewCount');
  });

  it('allows up to a minute of clock skew, and the moment it was added', async () => {
    const created = await opportunity();

    expect((await add(created.id, { heldAt: '2026-10-20T15:01:00.000Z' })).statusCode).toBe(201);
    expect((await add(created.id, { heldAt: '2026-10-01T12:00:00.000Z' })).statusCode).toBe(201);
  });

  it('refuses a 7th interview, keeping the count at 6', async () => {
    const created = await opportunity();
    for (let i = 0; i < 6; i++) {
      expect((await add(created.id)).statusCode).toBe(201);
    }

    const result = await add(created.id);

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({ code: 'VALIDATION_ERROR', message: limit });
    expect((await opp(created.id))?.interviewCount).toBe(6);
  });

  it('holds the limit when two adds race at 5', async () => {
    const created = await opportunity();
    for (let i = 0; i < 5; i++) {
      await add(created.id);
    }

    const results = await Promise.all([add(created.id), add(created.id)]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 400]);
    expect((await opp(created.id))?.interviewCount).toBe(6);
    expect(
      (await items(created.id)).filter((i) => String(i.SK).startsWith('INTERVIEW#')),
    ).toHaveLength(6);
  });

  it('marks an interview logged through Claude', async () => {
    const created = await opportunity();

    const body = parse(await add(created.id, {}, 'CLAUDE'));

    expect(body.interviews[0]?.via).toBe('CLAUDE');
  });

  it('returns 404 for an unknown opportunity, and writes nothing', async () => {
    const result = await add(`${run}-missing`);

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
    expect(await items(`${run}-missing`)).toEqual([]);
  });

  it('rejects unknown fields and a long note', async () => {
    const created = await opportunity();

    expect(parse(await add(created.id, { kind: 'Panel' }))).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(parse(await add(created.id, { note: 'x'.repeat(201) }))).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Must be 200 characters or fewer',
      fields: ['note'],
    });
  });
});

describe('PATCH /opportunities/{id}/interviews/{interviewId}', () => {
  async function withInterview() {
    const created = await opportunity();
    const body = parse(
      await add(created.id, { heldAt: '2026-10-10T12:00:00.000Z', note: 'Phone' }),
    );
    return { id: created.id, iid: (body.interviews[0] as { id: string }).id };
  }

  it('changes the date and the note, keeping the count', async () => {
    const { id, iid } = await withInterview();

    const result = await edit(id, iid, { heldAt: '2026-10-11T12:00:00-05:00', note: 'Panel' });

    expect(result.statusCode).toBe(200);
    expect(parse(result).interviews).toMatchObject([
      { id: iid, heldAt: '2026-10-11T17:00:00.000Z', note: 'Panel' },
    ]);
    expect(parse(result).interviewCount).toBe(1);
  });

  it("clears the note with null or blank, and leaves what isn't given", async () => {
    const { id, iid } = await withInterview();

    const cleared = parse(await edit(id, iid, { note: null }));
    const untouched = parse(await edit(id, iid, {}));

    expect(cleared.interviews[0]).toMatchObject({ note: null, heldAt: '2026-10-10T12:00:00.000Z' });
    expect(untouched.interviews[0]).toMatchObject({
      note: null,
      heldAt: '2026-10-10T12:00:00.000Z',
    });
  });

  it('applies the same date rules', async () => {
    const { id, iid } = await withInterview();

    const result = await edit(id, iid, { heldAt: '2026-10-21T00:00:00.000Z' });

    expect(parse(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: "The date can't be in the future",
      fields: ['heldAt'],
    });
  });

  it('marks an edit through Claude, and a web edit removes the mark', async () => {
    const { id, iid } = await withInterview();

    const viaClaude = parse(await edit(id, iid, { note: 'Panel' }, 'CLAUDE'));
    const viaWeb = parse(await edit(id, iid, { note: 'Panel, 3 people' }));

    expect(viaClaude.interviews[0]?.via).toBe('CLAUDE');
    expect(viaWeb.interviews[0]).not.toHaveProperty('via');
  });

  it('returns 404 for an unknown interview or opportunity', async () => {
    const { id } = await withInterview();

    const unknownInterview = await edit(id, 'nope', { note: 'x' });
    const unknownOpportunity = await edit(`${run}-missing`, 'nope', { note: 'x' });

    expect(parse(unknownInterview)).toEqual({ code: 'NOT_FOUND', message: 'Interview not found' });
    expect(parse(unknownOpportunity)).toEqual({
      code: 'NOT_FOUND',
      message: 'Opportunity not found',
    });
    expect(await items(`${run}-missing`)).toEqual([]);
  });
});

describe('DELETE /opportunities/{id}/interviews/{interviewId}', () => {
  it('needs the confirm header', async () => {
    const created = await opportunity();
    const iid = (parse(await add(created.id)).interviews[0] as { id: string }).id;

    const result = await remove(created.id, iid, false);

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Confirm removing the interview with the header X-Confirm-Delete: true',
      fields: ['X-Confirm-Delete'],
    });
    expect((await opp(created.id))?.interviewCount).toBe(1);
  });

  it('removes the interview and lowers the count', async () => {
    const created = await opportunity();
    const first = parse(await add(created.id, { heldAt: '2026-10-05T12:00:00.000Z' }));
    await add(created.id);
    const iid = (first.interviews[0] as { id: string }).id;

    const result = await remove(created.id, iid);

    expect(result.statusCode).toBe(200);
    expect(parse(result).interviews.map((i) => i.id)).not.toContain(iid);
    expect(parse(result).interviewCount).toBe(1);
    expect((await items(created.id)).some((i) => i.SK === `INTERVIEW#${iid}`)).toBe(false);
  });

  it('returns 404 for an unknown interview, keeping the count', async () => {
    const created = await opportunity();
    await add(created.id);

    const result = await remove(created.id, 'nope');

    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Interview not found' });
    expect((await opp(created.id))?.interviewCount).toBe(1);
  });
});

describe('the repository', () => {
  it("never adds an interview, or a count, to an opportunity that doesn't exist", async () => {
    const repo = createOpportunityRepo(docs, config.tableName);
    const id = `${run}-ghost`;

    await expect(
      repo.addInterview(
        id,
        { id: 'i1', heldAt: clock.toISOString(), note: null, recordedAt: clock.toISOString() },
        clock.toISOString(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await items(id)).toEqual([]);
  });
});

describe('interviews and the rest of the opportunity', () => {
  it('lists the count on the board', async () => {
    const created = await opportunity();
    await add(created.id);
    await add(created.id);

    const list = parse(await handle(apiEvent('GET', '/opportunities'))) as unknown as {
      items: { id: string; interviewCount?: number }[];
    };

    expect(list.items.find((o) => o.id === created.id)?.interviewCount).toBe(2);
  });

  it('are removed with the opportunity', async () => {
    const created = await opportunity();
    await add(created.id);

    await handle(
      apiEvent('DELETE', `/opportunities/${created.id}`, {
        headers: { 'x-confirm-delete': 'true' },
      }),
    );

    expect(await items(created.id)).toEqual([]);
  });

  it('keep the date added from moving after the first interview', async () => {
    const created = await opportunity('2026-09-01T12:00:00.000Z');
    await add(created.id, { heldAt: '2026-09-10T08:00:00.000Z' });

    const after = await handle(
      apiEvent('PATCH', `/opportunities/${created.id}`, {
        body: { createdAt: '2026-09-10T08:00:00.001Z' },
      }),
    );
    const same = await handle(
      apiEvent('PATCH', `/opportunities/${created.id}`, {
        body: { createdAt: '2026-09-10T08:00:00.000Z' },
      }),
    );

    expect(parse(after)).toEqual({
      code: 'VALIDATION_ERROR',
      message: "The date added can't be after the first interview",
      fields: ['createdAt'],
    });
    expect(same.statusCode).toBe(200);
  });
});
