// @module-tag overview
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import { createOpportunityRepo } from '../../src/repo/opportunityRepo.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();
const run = `LIST${Date.now()}`;
let clock = new Date();
let n = 0;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent) =>
  createHandler(config, { now: () => clock, newId: () => `${run}-${n++}` })(event);

const parse = (result: { body?: string }) =>
  JSON.parse(result.body ?? '') as Record<string, unknown>;
const ids: string[] = [];

// Other test files share this table, so only look at the opportunities created here.
const mine = <T extends { id: string }>(items: T[]) =>
  items.filter((item) => item.id.startsWith(run));

// Creates the three opportunities once, from inside whichever test runs first. Not a
// beforeAll hook: Stryker reports a mutant that breaks a hook as "Survived" (stryker-js#6234).
let seeding: Promise<void> | undefined;
function seeded(): Promise<void> {
  seeding ??= (async () => {
    for (const [i, minute] of ['01', '03', '02'].entries()) {
      clock = new Date(`2026-10-17T09:${minute}:00.000Z`);
      const created = await handle(
        apiEvent('POST', '/opportunities', { body: { company: `Co ${i}`, title: 'Engineer' } }),
      );
      ids.push((parse(created) as { id: string }).id);
    }
  })();
  return seeding;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  docs.destroy();
});

describe('GET /opportunities', () => {
  it('lists open opportunities by default, most recent stage change first, without history', async () => {
    await seeded();

    const result = await handle(apiEvent('GET', '/opportunities'));

    expect(result.statusCode).toBe(200);
    const items = mine((parse(result) as { items: { id: string; history?: unknown }[] }).items);
    expect(items.map((item) => item.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(items.every((item) => item.history === undefined)).toBe(true);
    expect(items[0]).toMatchObject({ company: 'Co 1', stage: 'CONSIDERING', status: 'OPEN' });
  });

  it('lists the same opportunities for status=OPEN', async () => {
    await seeded();

    const result = await handle(apiEvent('GET', '/opportunities', { query: { status: 'OPEN' } }));

    expect(mine((parse(result) as { items: { id: string }[] }).items)).toHaveLength(3);
  });

  it('does not list open opportunities for status=CLOSED', async () => {
    await seeded();

    const result = await handle(apiEvent('GET', '/opportunities', { query: { status: 'CLOSED' } }));

    expect(result.statusCode).toBe(200);
    expect(mine((parse(result) as { items: { id: string }[] }).items)).toEqual([]);
  });

  it('rejects an unknown status', async () => {
    await seeded();

    const result = await handle(apiEvent('GET', '/opportunities', { query: { status: 'open' } }));

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'status must be OPEN or CLOSED',
      fields: ['status'],
    });
  });
});

describe('opportunity repository paging', () => {
  it('follows every Query page when listing and when loading history', async () => {
    await seeded();

    const repo = createOpportunityRepo(docs, config.tableName, { pageSize: 1 });

    const listed = mine(await repo.listByStatus('OPEN'));
    const loaded = await repo.getWithHistory(ids[0] as string);

    expect(listed.map((item) => item.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(loaded?.company).toBe('Co 0');
    expect(loaded?.history).toHaveLength(1);
  });
});
