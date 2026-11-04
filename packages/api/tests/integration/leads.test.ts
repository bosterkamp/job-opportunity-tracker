// @module-tag leads
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import { byName, createLeadRepo } from '../../src/repo/leadRepo.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();
const run = `LEAD${Date.now()}`;
let clock = new Date('2026-10-31T12:00:00.000Z');
let n = 0;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent) =>
  createHandler(config, { now: () => clock, newId: () => `${run}-${n++}` })(event);

type Body = Record<string, unknown> & { id: string };
const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as Body;
const CONFIRM = { 'x-confirm-delete': 'true' };

async function addLead(body: Record<string, unknown>) {
  const result = await handle(apiEvent('POST', '/leads', { body }));
  expect(result.statusCode).toBe(201);
  return parse(result);
}

async function addOpportunity(body: Record<string, unknown> = {}) {
  const result = await handle(
    apiEvent('POST', '/opportunities', { body: { company: 'Acme', title: 'Engineer', ...body } }),
  );
  expect(result.statusCode).toBe(201);
  return parse(result);
}

// This run's leads only: other test files share the table.
async function listLeads() {
  const result = await handle(apiEvent('GET', '/leads'));
  expect(result.statusCode).toBe(200);
  const { items } = parse(result) as unknown as { items: Body[] };
  return items.filter((lead) => lead.id.startsWith(run));
}

async function opportunityItem(id: string) {
  const result = await docs.send(
    new GetCommand({ TableName: config.tableName, Key: { PK: `OPP#${id}`, SK: 'OPP' } }),
  );
  return result.Item as Record<string, unknown>;
}

async function historyOf(id: string) {
  const result = await docs.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :change)',
      ExpressionAttributeValues: { ':pk': `OPP#${id}`, ':change': 'CHANGE#' },
    }),
  );
  return result.Items ?? [];
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  clock = new Date('2026-10-31T12:00:00.000Z');
});

afterAll(() => {
  docs.destroy();
});

describe('POST /leads', () => {
  it('adds a lead with only its name, email and phone', async () => {
    const lead = await addLead({ name: ' Dana Ruiz ', email: 'dana@example.com', phone: '555' });

    expect(lead).toEqual({
      id: expect.stringMatching(new RegExp(`^${run}-`)) as string,
      name: 'Dana Ruiz',
      email: 'dana@example.com',
      phone: '555',
      createdAt: '2026-10-31T12:00:00.000Z',
      updatedAt: '2026-10-31T12:00:00.000Z',
    });
    const stored = await docs.send(
      new GetCommand({ TableName: config.tableName, Key: { PK: `LEAD#${lead.id}`, SK: 'LEAD' } }),
    );
    expect(stored.Item).toMatchObject({ GSI1PK: 'LEADS', GSI1SK: lead.id, name: 'Dana Ruiz' });
  });

  it('refuses a lead without a name, or with other fields', async () => {
    for (const body of [
      {},
      { name: ' ' },
      { name: 'Dana', notes: 'x' },
      { name: 'Dana', email: 'x' },
    ]) {
      const result = await handle(apiEvent('POST', '/leads', { body }));
      expect(result.statusCode).toBe(400);
      expect(parse(result).code).toBe('VALIDATION_ERROR');
    }
    expect(parse(await handle(apiEvent('POST', '/leads', { body: {} }))).message).toBe(
      'Name is required',
    );
  });
});

describe('GET /leads', () => {
  it('lists leads by name, ignoring case, each with its opportunities', async () => {
    const carol = await addLead({ name: `${run} carol` });
    const alice = await addLead({ name: `${run} Alice`, phone: '555 0100' });
    const bob = await addLead({ name: `${run} bob` });
    clock = new Date('2026-10-31T13:00:00.000Z');
    const older = await addOpportunity({ title: 'Older', leadId: bob.id });
    clock = new Date('2026-10-31T14:00:00.000Z');
    const newer = await addOpportunity({ title: 'Newer', leadId: bob.id });
    await addOpportunity({ title: 'Unlinked' });
    // A closed one is listed too.
    clock = new Date('2026-10-31T15:00:00.000Z');
    await handle(
      apiEvent('POST', `/opportunities/${older.id}/stage-changes`, {
        body: { toStage: 'REJECTED', expectedChangeCount: 1 },
      }),
    );

    const leads = (await listLeads()).filter((lead) => String(lead.name).startsWith(run));

    expect(leads.map((lead) => lead.id)).toEqual([alice.id, bob.id, carol.id]);
    expect(leads[0]).toEqual({ ...alice, opportunities: [], notes: [] });
    expect(leads[1]?.opportunities).toEqual([
      { id: older.id, company: 'Acme', title: 'Older', stage: 'REJECTED', status: 'CLOSED' },
      { id: newer.id, company: 'Acme', title: 'Newer', stage: 'CONSIDERING', status: 'OPEN' },
    ]);
  });
});

describe('PATCH /leads/{id}', () => {
  it('changes and clears fields, and keeps the rest', async () => {
    const lead = await addLead({ name: 'Dana', email: 'dana@example.com', phone: '555' });
    clock = new Date('2026-11-01T09:00:00.000Z');

    const result = await handle(
      apiEvent('PATCH', `/leads/${lead.id}`, { body: { name: 'Dana Ruiz', phone: null } }),
    );

    expect(result.statusCode).toBe(200);
    expect(parse(result)).toEqual({
      id: lead.id,
      name: 'Dana Ruiz',
      email: 'dana@example.com',
      createdAt: '2026-10-31T12:00:00.000Z',
      updatedAt: '2026-11-01T09:00:00.000Z',
    });
    expect((await listLeads()).find((l) => l.id === lead.id)).toMatchObject({ name: 'Dana Ruiz' });
  });

  it('clears the email and the phone together', async () => {
    const lead = await addLead({ name: 'Dana', email: 'dana@example.com', phone: '555' });

    const result = await handle(
      apiEvent('PATCH', `/leads/${lead.id}`, { body: { email: null, phone: null } }),
    );

    expect(result.statusCode).toBe(200);
    expect(parse(result)).not.toHaveProperty('email');
    expect(parse(result)).not.toHaveProperty('phone');
  });

  it('refuses an unknown lead and invalid changes', async () => {
    const missing = await handle(apiEvent('PATCH', `/leads/${run}-nope`, { body: { name: 'X' } }));
    expect(missing.statusCode).toBe(404);
    expect(parse(missing)).toMatchObject({ code: 'NOT_FOUND', message: 'Lead not found' });

    const lead = await addLead({ name: 'Dana' });
    const blank = await handle(apiEvent('PATCH', `/leads/${lead.id}`, { body: { name: '' } }));
    expect(blank.statusCode).toBe(400);
  });
});

describe('DELETE /leads/{id}', () => {
  it('needs confirming', async () => {
    const lead = await addLead({ name: 'Dana' });

    const result = await handle(apiEvent('DELETE', `/leads/${lead.id}`));

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Confirm permanent deletion with the header X-Confirm-Delete: true',
      fields: ['X-Confirm-Delete'],
    });
    expect((await listLeads()).map((l) => l.id)).toContain(lead.id);
  });

  it('deletes the lead and unlinks its opportunities, changing nothing else', async () => {
    const lead = await addLead({ name: 'Dana' });
    const linked = await addOpportunity({ leadId: lead.id });
    const other = await addLead({ name: 'Sam' });
    const keeps = await addOpportunity({ leadId: other.id });
    const before = await opportunityItem(linked.id);
    clock = new Date('2026-11-02T10:00:00.000Z');

    const result = await handle(apiEvent('DELETE', `/leads/${lead.id}`, { headers: CONFIRM }));

    expect(result.statusCode).toBe(204);
    expect((await listLeads()).map((l) => l.id)).not.toContain(lead.id);
    const after = await opportunityItem(linked.id);
    const { leadId: _leadId, updatedAt: _updatedAt, ...unchanged } = before;
    expect(after).toEqual({ ...unchanged, updatedAt: '2026-11-02T10:00:00.000Z' });
    expect(await historyOf(linked.id)).toHaveLength(1);
    expect((await opportunityItem(keeps.id)).leadId).toBe(other.id);
  });

  it('unlinks more opportunities than one transaction holds', async () => {
    const lead = await addLead({ name: 'Busy' });
    // Bare items, outside the status index, so other files' listings don't page through them.
    // With the lead, exactly two full transactions: no empty third one is sent.
    const ids = Array.from({ length: 199 }, (_, i) => `${run}-busy-${i}`);
    await Promise.all(
      ids.map((id) =>
        docs.send(
          new PutCommand({
            TableName: config.tableName,
            Item: { PK: `OPP#${id}`, SK: 'OPP', id, leadId: lead.id },
          }),
        ),
      ),
    );

    await createLeadRepo(docs, config.tableName).delete(lead.id, ids, '2026-11-02T10:00:00.000Z');

    const items = await Promise.all(ids.map(opportunityItem));
    expect(items.filter((item) => 'leadId' in item)).toEqual([]);
    expect(items.every((item) => item.updatedAt === '2026-11-02T10:00:00.000Z')).toBe(true);
    expect((await listLeads()).map((l) => l.id)).not.toContain(lead.id);
  });

  it('refuses an unknown lead', async () => {
    const result = await handle(apiEvent('DELETE', `/leads/${run}-nope`, { headers: CONFIRM }));

    expect(result.statusCode).toBe(404);
    expect(parse(result).message).toBe('Lead not found');
  });
});

describe('linking an opportunity to a lead', () => {
  it('stores the lead on add and edit, and removes it with null', async () => {
    const lead = await addLead({ name: 'Dana' });
    const opportunity = await addOpportunity({ leadId: lead.id });
    expect(opportunity.leadId).toBe(lead.id);

    const cleared = await handle(
      apiEvent('PATCH', `/opportunities/${opportunity.id}`, { body: { leadId: null } }),
    );
    expect(parse(cleared)).not.toHaveProperty('leadId');

    const linked = await handle(
      apiEvent('PATCH', `/opportunities/${opportunity.id}`, { body: { leadId: lead.id } }),
    );
    expect(parse(linked).leadId).toBe(lead.id);
    expect(await historyOf(opportunity.id)).toHaveLength(1);
  });

  it('keeps the lead when the opportunity moves stage', async () => {
    const lead = await addLead({ name: 'Dana' });
    const opportunity = await addOpportunity({ leadId: lead.id });

    await handle(
      apiEvent('POST', `/opportunities/${opportunity.id}/stage-changes`, {
        body: { toStage: 'APPLIED', expectedChangeCount: 1 },
      }),
    );

    expect(parse(await handle(apiEvent('GET', `/opportunities/${opportunity.id}`))).leadId).toBe(
      lead.id,
    );
  });

  it("refuses a lead that doesn't exist, on add and on edit", async () => {
    const added = await handle(
      apiEvent('POST', '/opportunities', {
        body: { company: 'Acme', title: 'Engineer', leadId: `${run}-nope` },
      }),
    );
    expect(added.statusCode).toBe(400);
    expect(parse(added)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: "That lead doesn't exist",
      fields: ['leadId'],
    });

    const opportunity = await addOpportunity();
    const edited = await handle(
      apiEvent('PATCH', `/opportunities/${opportunity.id}`, { body: { leadId: `${run}-nope` } }),
    );
    expect(edited.statusCode).toBe(400);
    expect(parse(edited).message).toBe("That lead doesn't exist");
    expect(await opportunityItem(opportunity.id)).not.toHaveProperty('leadId');
  });
});

describe('the lead repository', () => {
  it('sorts by name ignoring case, then by id', () => {
    const lead = (name: string, id: string) =>
      ({ name, id, createdAt: '', updatedAt: '' }) as Parameters<typeof byName>[0];

    expect(byName(lead('dana', 'b'), lead('Dana', 'a'))).toBeGreaterThan(0);
    expect(byName(lead('Dana', 'a'), lead('dana', 'b'))).toBeLessThan(0);
  });

  it('reads every page of leads', async () => {
    const a = await addLead({ name: `${run} paged a` });
    const b = await addLead({ name: `${run} paged b` });

    const leads = await createLeadRepo(docs, config.tableName, { pageSize: 1 }).list();

    expect(leads.map((lead) => lead.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("passes on a failure that isn't a missing lead", async () => {
    const repo = createLeadRepo(docs, `${config.tableName}-missing`);

    await expect(repo.update('l1', { name: 'X' }, '2026-11-02T10:00:00.000Z')).rejects.toThrow(
      /non-existent table|not found/i,
    );
  });

  it('deletes nothing if a linked opportunity was deleted meanwhile', async () => {
    const lead = await addLead({ name: 'Gone' });
    const repo = createLeadRepo(docs, config.tableName);

    await expect(
      repo.delete(lead.id, [`${run}-deleted`], '2026-11-02T10:00:00.000Z'),
    ).rejects.toThrow();

    expect(await repo.get(lead.id)).toEqual(lead);
    expect(await opportunityItem(`${run}-deleted`)).toBeUndefined();
  });
});
