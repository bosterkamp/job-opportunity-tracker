// @module-tag capture
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();

let clock = new Date('2026-10-17T12:00:00.000Z');
let nextId = 0;
// Builds the handler inside each test (not at module load) so Stryker links the route code
// to these tests.
const handle = (event: ApiEvent) =>
  createHandler(config, { now: () => clock, newId: () => `TEST${Date.now()}${nextId++}` })(event);

const parse = (result: { body?: string }) =>
  JSON.parse(result.body ?? '') as Record<string, unknown>;

async function create(body: unknown) {
  return handle(apiEvent('POST', '/opportunities', { body }));
}

async function itemsFor(id: string) {
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

describe('POST /opportunities', () => {
  it('creates an opportunity with only company and title, in Considering, with its first history entry', async () => {
    clock = new Date('2026-10-17T12:00:00.000Z');

    const result = await create({ company: '  Acme ', title: 'Senior Engineer' });

    expect(result.statusCode).toBe(201);
    const body = parse(result);
    expect(body).toEqual({
      id: expect.stringMatching(/^TEST/) as unknown,
      company: 'Acme',
      title: 'Senior Engineer',
      stage: 'CONSIDERING',
      status: 'OPEN',
      createdAt: '2026-10-17T12:00:00.000Z',
      updatedAt: '2026-10-17T12:00:00.000Z',
      lastStageChangeAt: '2026-10-17T12:00:00.000Z',
      changeCount: 1,
      history: [
        {
          seq: 1,
          fromStage: null,
          toStage: 'CONSIDERING',
          changedAt: '2026-10-17T12:00:00.000Z',
          note: null,
          recordedAt: '2026-10-17T12:00:00.000Z',
        },
      ],
      interviews: [],
    });
  });

  it('stores the opportunity and its first history entry under one partition with the GSI1 keys', async () => {
    clock = new Date('2026-10-17T13:00:00.000Z');
    const { id } = parse(await create({ company: 'Globex', title: 'Staff Engineer' })) as {
      id: string;
    };

    const items = await itemsFor(id);

    expect(items.map((item) => item.SK)).toEqual(['CHANGE#000001', 'OPP']);
    expect(items.find((item) => item.SK === 'OPP')).toMatchObject({
      PK: `OPP#${id}`,
      GSI1PK: 'STATUS#OPEN',
      GSI1SK: `2026-10-17T13:00:00.000Z#${id}`,
    });
  });

  describe('with an earlier date added', () => {
    it('dates the opportunity, its first history entry, its last change, and its list order', async () => {
      clock = new Date('2026-10-17T14:00:00.000Z');

      const body = parse(
        await create({ company: 'Old', title: 'Engineer', createdAt: '2026-07-04T12:00:00-05:00' }),
      ) as Record<string, unknown> & { id: string };

      expect(body).toMatchObject({
        createdAt: '2026-07-04T17:00:00.000Z',
        updatedAt: '2026-10-17T14:00:00.000Z',
        lastStageChangeAt: '2026-07-04T17:00:00.000Z',
        history: [
          { seq: 1, changedAt: '2026-07-04T17:00:00.000Z', recordedAt: '2026-10-17T14:00:00.000Z' },
        ],
      });
      const items = await itemsFor(body.id);
      expect(items.find((item) => item.SK === 'OPP')).toMatchObject({
        GSI1SK: `2026-07-04T17:00:00.000Z#${body.id}`,
      });
    });

    it('allows up to a minute of clock skew, and refuses more with 400 on the field', async () => {
      clock = new Date('2026-10-17T14:00:00.000Z');
      const ids = nextId;

      const skewed = await create({
        company: 'A',
        title: 'B',
        createdAt: '2026-10-17T14:01:00.000Z',
      });
      const future = await create({
        company: 'A',
        title: 'B',
        createdAt: '2026-10-17T14:01:00.001Z',
      });

      expect(skewed.statusCode).toBe(201);
      expect(future.statusCode).toBe(400);
      expect(parse(future)).toEqual({
        code: 'VALIDATION_ERROR',
        message: "The date can't be in the future",
        fields: ['createdAt'],
      });
      expect(nextId).toBe(ids + 1); // only the skewed one was created
    });
  });

  it('round-trips every optional field through GET /opportunities/{id}', async () => {
    const full = {
      company: 'Initech',
      title: 'Principal Engineer',
      contact: {
        name: 'Sam Lee',
        role: 'Recruiter',
        email: 'sam@initech.example',
        phone: '+1 555 0100',
      },
      description: 'Build things.\n\n- Lead the platform team\n- Mentor',
      interest: 4,
      postingUrl: 'https://initech.example/jobs/42',
      location: 'Austin, TX',
      workArrangement: 'HYBRID',
      salaryMin: 180_000,
      salaryMax: 210_000,
      compensation: '$180k-$210k',
      source: 'Referral: Pat',
      followUpDate: '2026-10-24',
      notes: 'Ask about on-call.',
    };

    const created = parse(await create(full)) as { id: string };
    const fetched = await handle(apiEvent('GET', `/opportunities/${created.id}`));

    expect(fetched.statusCode).toBe(200);
    expect(parse(fetched)).toMatchObject(full);
    expect(parse(fetched)).toEqual(created);
  });

  it('treats a contact with every field blank as absent', async () => {
    const created = parse(
      await create({ company: 'Hooli', title: 'Engineer', contact: { name: ' ', email: '' } }),
    );

    expect(created).not.toHaveProperty('contact');
  });

  it.each([
    [{ title: 'Engineer' }, ['company'], 'Company is required'],
    [{ company: 'Acme', title: '   ' }, ['title'], 'Job title is required'],
    [
      { company: '', title: '' },
      ['company', 'title'],
      'Company is required; Job title is required',
    ],
  ])('rejects %j with 400 and writes nothing', async (body, fields, message) => {
    const ids = nextId;

    const result = await create(body);

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({ code: 'VALIDATION_ERROR', message, fields });
    expect(nextId).toBe(ids); // no id was even generated
  });

  it('rejects a salary minimum above its maximum, on the minimum', async () => {
    const result = await create({ company: 'Acme', title: 'Engineer', salaryMin: 2, salaryMax: 1 });

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: "The minimum can't be more than the maximum",
      fields: ['salaryMin'],
    });
  });

  it('rejects a request with no body', async () => {
    const result = await handle(apiEvent('POST', '/opportunities'));

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('GET /opportunities/{id}', () => {
  it('returns 404 for an unknown id', async () => {
    const result = await handle(apiEvent('GET', '/opportunities/does-not-exist'));

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
  });
});
