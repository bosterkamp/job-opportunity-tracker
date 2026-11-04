// @module-tag edit
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, defaultDeps } from '../../src/handler.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();
const run = `EDIT${Date.now()}`;
let clock = new Date('2026-10-10T12:00:00.000Z');
let n = 0;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent) =>
  createHandler(config, { now: () => clock, newId: () => `${run}-${n++}` })(event);

type Body = Record<string, unknown> & { id: string };
const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as Body;

const full = {
  company: 'Initech',
  title: 'Principal Engineer',
  contact: { name: 'Sam', email: 'sam@initech.example' },
  description: 'Build things',
  interest: 3,
  postingUrl: 'https://initech.example/jobs/1',
  location: 'Austin',
  workArrangement: 'HYBRID',
  compensation: '$180k',
  source: 'Referral',
  followUpDate: '2026-10-24',
  notes: 'Ask about on-call',
};

async function create(body: Record<string, unknown> = full): Promise<Body> {
  clock = new Date('2026-10-10T12:00:00.000Z');
  return parse(await handle(apiEvent('POST', '/opportunities', { body })));
}

async function patch(id: string, body: unknown) {
  clock = new Date('2026-10-18T12:00:00.000Z');
  return handle(apiEvent('PATCH', `/opportunities/${id}`, { body }));
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

describe('PATCH /opportunities/{id}', () => {
  it('updates only the given fields and updatedAt', async () => {
    const created = await create();

    const result = await patch(created.id, { interest: 5, notes: 'Second round next week' });

    expect(result.statusCode).toBe(200);
    expect(parse(result)).toEqual({
      ...created,
      history: undefined,
      interviews: undefined,
      interest: 5,
      notes: 'Second round next week',
      updatedAt: '2026-10-18T12:00:00.000Z',
    });
    const fetched = parse(await handle(apiEvent('GET', `/opportunities/${created.id}`)));
    expect(fetched).toMatchObject({
      interest: 5,
      notes: 'Second round next week',
      location: 'Austin',
    });
  });

  it('never changes the stage, status, change count, history, or GSI keys', async () => {
    const created = await create();
    const before = await items(created.id);

    await patch(created.id, { company: 'Initech Inc', title: 'Distinguished Engineer' });

    const after = await items(created.id);
    const opp = (list: Record<string, unknown>[]) => list.find((item) => item.SK === 'OPP');
    expect(opp(after)).toMatchObject({
      company: 'Initech Inc',
      title: 'Distinguished Engineer',
      stage: 'CONSIDERING',
      status: 'OPEN',
      changeCount: 1,
      lastStageChangeAt: '2026-10-10T12:00:00.000Z',
      GSI1PK: opp(before)?.GSI1PK,
      GSI1SK: opp(before)?.GSI1SK,
      createdAt: '2026-10-10T12:00:00.000Z',
    });
    expect(after.filter((item) => item.SK !== 'OPP')).toEqual(
      before.filter((item) => item.SK !== 'OPP'),
    );
  });

  it('clears optional fields set to null or left blank', async () => {
    const created = await create();

    const result = await patch(created.id, {
      contact: { name: '', email: '' },
      description: '',
      interest: null,
      postingUrl: null,
      location: ' ',
      workArrangement: '',
      compensation: null,
      source: '',
      followUpDate: null,
      notes: '',
    });

    const body = parse(result);
    expect(body).toEqual({
      id: created.id,
      company: 'Initech',
      title: 'Principal Engineer',
      stage: 'CONSIDERING',
      status: 'OPEN',
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-18T12:00:00.000Z',
      lastStageChangeAt: '2026-10-10T12:00:00.000Z',
      changeCount: 1,
    });
    const stored = (await items(created.id)).find((item) => item.SK === 'OPP') ?? {};
    for (const field of [
      'contact',
      'description',
      'interest',
      'postingUrl',
      'location',
      'notes',
      'followUpDate',
    ]) {
      expect(stored).not.toHaveProperty(field);
    }
  });

  it('adds fields the opportunity did not have yet', async () => {
    const created = await create({ company: 'Acme', title: 'Engineer' });

    const result = await patch(created.id, { location: 'Remote', contact: { name: 'Pat' } });

    expect(parse(result)).toMatchObject({ location: 'Remote', contact: { name: 'Pat' } });
  });

  it('accepts an empty patch, only touching updatedAt', async () => {
    const created = await create();

    const result = await patch(created.id, {});

    expect(result.statusCode).toBe(200);
    expect(parse(result)).toMatchObject({
      company: 'Initech',
      updatedAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it.each([
    [{ company: '' }, 'company', 'Company is required'],
    [{ title: null }, 'title', 'Job title is required'],
  ])('rejects %j with 400 and keeps the original', async (body, field, message) => {
    const created = await create();

    const result = await patch(created.id, body);

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({ code: 'VALIDATION_ERROR', message, fields: [field] });
    expect((await items(created.id)).find((item) => item.SK === 'OPP')).toMatchObject({
      company: 'Initech',
      title: 'Principal Engineer',
      updatedAt: '2026-10-10T12:00:00.000Z',
    });
  });

  describe('salary', () => {
    const range = { ...full, salaryMin: 150_000, salaryMax: 180_000 };
    const tooHigh = {
      code: 'VALIDATION_ERROR',
      message: "The minimum can't be more than the maximum",
      fields: ['salaryMin'],
    };

    it('checks a new minimum against the stored maximum, and keeps both', async () => {
      const created = await create(range);

      const result = await patch(created.id, { salaryMin: 180_001 });

      expect(result.statusCode).toBe(400);
      expect(parse(result)).toEqual(tooHigh);
      expect((await items(created.id)).find((item) => item.SK === 'OPP')).toMatchObject({
        salaryMin: 150_000,
        salaryMax: 180_000,
      });
    });

    it('checks a new maximum against the stored minimum', async () => {
      const created = await create(range);

      expect(parse(await patch(created.id, { salaryMax: 149_999 }))).toEqual(tooHigh);
    });

    it.each([
      ['raises both ends together', { salaryMin: 200_000, salaryMax: 250_000 }, [200_000, 250_000]],
      ['matches the stored maximum', { salaryMin: 180_000 }, [180_000, 180_000]],
      [
        'clears the maximum, so any minimum fits',
        { salaryMin: 900_000, salaryMax: null },
        [900_000, undefined],
      ],
      [
        'clears the minimum, so any maximum fits',
        { salaryMin: null, salaryMax: 1 },
        [undefined, 1],
      ],
    ])('accepts a change that %s', async (_label, body, [min, max]) => {
      const created = await create(range);

      const result = await patch(created.id, body);

      expect(result.statusCode).toBe(200);
      expect([parse(result).salaryMin, parse(result).salaryMax]).toEqual([min, max]);
    });

    it('accepts any minimum when there is no stored maximum', async () => {
      const created = await create();

      expect((await patch(created.id, { salaryMin: 10_000_000 })).statusCode).toBe(200);
    });

    it('returns 404 for an unknown id', async () => {
      const result = await patch(`${run}-missing`, { salaryMin: 1 });

      expect(result.statusCode).toBe(404);
      expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
      expect(await items(`${run}-missing`)).toEqual([]);
    });
  });

  describe('date added', () => {
    async function moveTo(id: string, toStage: string, changedAt: string, expectedChangeCount = 1) {
      const saved = clock;
      clock = new Date('2026-10-15T12:00:00.000Z');
      const result = await handle(
        apiEvent('POST', `/opportunities/${id}/stage-changes`, {
          body: { toStage, changedAt, expectedChangeCount },
        }),
      );
      clock = saved;
      expect(result.statusCode).toBe(201);
    }
    const opp = async (id: string) => (await items(id)).find((item) => item.SK === 'OPP');
    const first = async (id: string) =>
      (await items(id)).find((item) => item.SK === 'CHANGE#000001');

    it('moves the date, the first entry, the last change, and the list order before any move', async () => {
      const created = await create();

      const result = await patch(created.id, { createdAt: '2026-07-04T12:00:00-05:00' });

      expect(result.statusCode).toBe(200);
      expect(parse(result)).toMatchObject({
        createdAt: '2026-07-04T17:00:00.000Z',
        lastStageChangeAt: '2026-07-04T17:00:00.000Z',
        updatedAt: '2026-10-18T12:00:00.000Z',
      });
      expect(await opp(created.id)).toMatchObject({
        GSI1SK: `2026-07-04T17:00:00.000Z#${created.id}`,
      });
      expect(await first(created.id)).toMatchObject({
        changedAt: '2026-07-04T17:00:00.000Z',
        recordedAt: '2026-10-10T12:00:00.000Z',
      });
    });

    it('moves only the date and the first entry once the opportunity has moved', async () => {
      const created = await create();
      await moveTo(created.id, 'APPLIED', '2026-10-12T09:00:00.000Z');

      const result = await patch(created.id, { createdAt: '2026-09-01T12:00:00.000Z' });

      expect(result.statusCode).toBe(200);
      expect(parse(result)).toMatchObject({
        createdAt: '2026-09-01T12:00:00.000Z',
        lastStageChangeAt: '2026-10-12T09:00:00.000Z',
        changeCount: 2,
      });
      expect(await opp(created.id)).toMatchObject({
        GSI1SK: `2026-10-12T09:00:00.000Z#${created.id}`,
      });
      expect(await first(created.id)).toMatchObject({ changedAt: '2026-09-01T12:00:00.000Z' });
      const history = parse(await handle(apiEvent('GET', `/opportunities/${created.id}`)))
        .history as { changedAt: string }[];
      expect(history.map((h) => h.changedAt)).toEqual([
        '2026-09-01T12:00:00.000Z',
        '2026-10-12T09:00:00.000Z',
      ]);
    });

    it('allows the moment of the first move, and refuses anything after it', async () => {
      const created = await create();
      await moveTo(created.id, 'APPLIED', '2026-10-12T09:00:00.000Z');
      await moveTo(created.id, 'CONTACTED', '2026-10-11T09:00:00.000Z', 2);

      const after = await patch(created.id, { createdAt: '2026-10-11T09:00:00.001Z' });
      const same = await patch(created.id, { createdAt: '2026-10-11T09:00:00.000Z' });

      expect(after.statusCode).toBe(400);
      expect(parse(after)).toEqual({
        code: 'VALIDATION_ERROR',
        message: "The date added can't be after the first stage change",
        fields: ['createdAt'],
      });
      expect(same.statusCode).toBe(200);
    });

    it('refuses a date in the future, and keeps the original', async () => {
      const created = await create();

      const result = await patch(created.id, { createdAt: '2026-10-18T12:01:00.001Z' });

      expect(parse(result)).toEqual({
        code: 'VALIDATION_ERROR',
        message: "The date can't be in the future",
        fields: ['createdAt'],
      });
      expect(await opp(created.id)).toMatchObject({ createdAt: '2026-10-10T12:00:00.000Z' });
      expect(await first(created.id)).toMatchObject({ changedAt: '2026-10-10T12:00:00.000Z' });
    });

    it('changes other fields in the same patch', async () => {
      const created = await create();

      const result = await patch(created.id, {
        createdAt: '2026-09-01T12:00:00.000Z',
        notes: 'Found in September',
      });

      expect(parse(result)).toMatchObject({
        createdAt: '2026-09-01T12:00:00.000Z',
        notes: 'Found in September',
      });
    });

    it('cannot be cleared', async () => {
      const created = await create();

      const result = await patch(created.id, { createdAt: null });

      expect(result.statusCode).toBe(400);
      expect(parse(result)).toMatchObject({ fields: ['createdAt'] });
    });

    it('returns 404 for an unknown id', async () => {
      const result = await patch(`${run}-missing`, { createdAt: '2026-09-01T12:00:00.000Z' });

      expect(result.statusCode).toBe(404);
      expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
      expect(await items(`${run}-missing`)).toEqual([]);
    });

    it('refuses with CONFLICT, and changes nothing, when the opportunity moves meanwhile', async () => {
      const created = await create();
      const repo = defaultDeps(config).repo;
      // A stage move lands between the route's read and its write.
      const racing = createHandler(config, {
        now: () => new Date('2026-10-18T12:00:00.000Z'),
        repo: {
          ...repo,
          async changeDateAdded(id, change) {
            await moveTo(id, 'APPLIED', '2026-10-12T09:00:00.000Z');
            return repo.changeDateAdded(id, change);
          },
        },
      });

      const result = await racing(
        apiEvent('PATCH', `/opportunities/${created.id}`, {
          body: { createdAt: '2026-09-01T12:00:00.000Z' },
        }),
      );

      expect(result.statusCode).toBe(409);
      expect(parse(result)).toMatchObject({ code: 'CONFLICT' });
      expect(await opp(created.id)).toMatchObject({ createdAt: '2026-10-10T12:00:00.000Z' });
      expect(await first(created.id)).toMatchObject({ changedAt: '2026-10-10T12:00:00.000Z' });
    });
  });

  it.each([
    ['other fields', { notes: 'x' }, 0],
    ['the salary minimum', { salaryMin: 1 }, 1],
    ['the salary maximum', { salaryMax: 1 }, 1],
    ['the date added', { createdAt: '2026-09-01T12:00:00.000Z' }, 1],
  ])('reads the opportunity first only for a patch that needs it: %s', async (_l, body, reads) => {
    const created = await create();
    const repo = defaultDeps(config).repo;
    const getWithHistory = vi.spyOn(repo, 'getWithHistory');
    clock = new Date('2026-10-18T12:00:00.000Z');

    const result = await createHandler(config, { now: () => clock, repo })(
      apiEvent('PATCH', `/opportunities/${created.id}`, { body }),
    );

    expect(result.statusCode).toBe(200);
    expect(getWithHistory).toHaveBeenCalledTimes(reads);
  });

  it('rejects stage fields, which only change through stage changes', async () => {
    const created = await create();

    const result = await patch(created.id, { stage: 'OFFER' });

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 404 for an unknown id and creates nothing', async () => {
    const result = await patch(`${run}-missing`, { notes: 'x' });

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
    expect(await items(`${run}-missing`)).toEqual([]);
  });
});

describe('DELETE /opportunities/{id}', () => {
  const remove = (id: string, headers: Record<string, string> = {}) =>
    handle(apiEvent('DELETE', `/opportunities/${id}`, { headers }));

  it('requires the X-Confirm-Delete: true header', async () => {
    const created = await create();

    const attempts: Record<string, string>[] = [{}, { 'X-Confirm-Delete': 'yes' }];
    for (const headers of attempts) {
      const result = await remove(created.id, headers);
      expect(result.statusCode).toBe(400);
      expect(parse(result)).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Confirm permanent deletion with the header X-Confirm-Delete: true',
        fields: ['X-Confirm-Delete'],
      });
    }
    expect(await items(created.id)).toHaveLength(2);
  });

  it('removes the opportunity and its whole history', async () => {
    const created = await create();
    // Give it a longer history first.
    for (const [i, stage] of ['APPLIED', 'CONTACTED', 'INTERVIEWING'].entries()) {
      clock = new Date(`2026-10-1${i + 1}T12:00:00.000Z`);
      await handle(
        apiEvent('POST', `/opportunities/${created.id}/stage-changes`, {
          body: { toStage: stage, expectedChangeCount: i + 1 },
        }),
      );
    }
    expect(await items(created.id)).toHaveLength(5);

    const result = await remove(created.id, { 'X-Confirm-Delete': 'true' });

    expect(result.statusCode).toBe(204);
    expect(result.body).toBeUndefined();
    expect(await items(created.id)).toEqual([]);
    expect((await handle(apiEvent('GET', `/opportunities/${created.id}`))).statusCode).toBe(404);
  });

  it('returns 404 for an unknown id', async () => {
    const result = await remove(`${run}-missing`, { 'X-Confirm-Delete': 'true' });

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
  });
});

describe('posted until (feature 009)', { tags: ['deadline'] }, () => {
  const opp = async (id: string) => (await items(id)).find((item) => item.SK === 'OPP') ?? {};

  it('is stored when adding, and comes back', async () => {
    const created = await create({ ...full, postedUntil: '2026-11-30' });

    expect(created.postedUntil).toBe('2026-11-30');
    const read = parse(await handle(apiEvent('GET', `/opportunities/${created.id}`)));
    expect(read.postedUntil).toBe('2026-11-30');
  });

  it('changes and clears like any detail, without touching the history', async () => {
    const created = await create({ ...full, postedUntil: '2026-11-30' });
    const historyBefore = (await items(created.id)).filter((item) => item.SK !== 'OPP');

    const changed = parse(await patch(created.id, { postedUntil: '2026-10-01' }));
    expect(changed).toMatchObject({
      postedUntil: '2026-10-01',
      changeCount: 1,
      lastStageChangeAt: '2026-10-10T12:00:00.000Z',
    });

    const cleared = parse(await patch(created.id, { postedUntil: null }));
    expect(cleared).not.toHaveProperty('postedUntil');
    expect(await opp(created.id)).not.toHaveProperty('postedUntil');
    expect((await items(created.id)).filter((item) => item.SK !== 'OPP')).toEqual(historyBefore);
  });

  it('is kept when the opportunity moves stage', async () => {
    const created = await create({ ...full, postedUntil: '2026-11-30' });

    clock = new Date('2026-10-15T12:00:00.000Z');
    const moved = await handle(
      apiEvent('POST', `/opportunities/${created.id}/stage-changes`, {
        body: { toStage: 'APPLIED', expectedChangeCount: 1 },
      }),
    );

    expect(moved.statusCode).toBe(201);
    expect(await opp(created.id)).toMatchObject({ stage: 'APPLIED', postedUntil: '2026-11-30' });
  });

  it('refuses a date that is not a calendar date, with 400', async () => {
    const created = await create();

    const result = await patch(created.id, { postedUntil: '2026-11-31' });

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Use a date like 2026-11-03',
      fields: ['postedUntil'],
    });
    const added = await handle(
      apiEvent('POST', '/opportunities', { body: { ...full, postedUntil: 'soon' } }),
    );
    expect(added.statusCode).toBe(400);
  });
});
