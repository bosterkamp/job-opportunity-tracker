// @module-tag leads
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../src/handler.js';
import { createLeadRepo } from '../../src/repo/leadRepo.js';
import type { ApiEvent } from '../../src/router.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

// Notes on networking leads (feature 011): a dated note for each conversation with a lead.

const config = testConfig();
const docs = documentClient();
const run = `NOTE${Date.now()}`;
let clock = new Date('2026-11-01T12:00:00.000Z');
let n = 0;
// Built inside each test (not at module load) so Stryker links the route code to these tests.
const handle = (event: ApiEvent) =>
  createHandler(config, { now: () => clock, newId: () => `${run}-${n++}` })(event);

type Body = Record<string, unknown> & { id: string };
const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as Body;
const CONFIRM = { 'x-confirm-delete': 'true' };

async function addLead(name = 'Dana') {
  const result = await handle(apiEvent('POST', '/leads', { body: { name } }));
  expect(result.statusCode).toBe(201);
  return parse(result);
}

async function addNote(leadId: string, body: Record<string, unknown>) {
  return handle(apiEvent('POST', `/leads/${leadId}/notes`, { body }));
}

async function added(leadId: string, body: Record<string, unknown>) {
  const result = await addNote(leadId, body);
  expect(result.statusCode).toBe(201);
  return parse(result);
}

async function leadFromList(id: string) {
  const result = await handle(apiEvent('GET', '/leads'));
  expect(result.statusCode).toBe(200);
  const { items } = parse(result) as unknown as { items: Body[] };
  return items.find((lead) => lead.id === id);
}

async function leadItem(id: string) {
  const result = await docs.send(
    new GetCommand({ TableName: config.tableName, Key: { PK: `LEAD#${id}`, SK: 'LEAD' } }),
  );
  return result.Item as Record<string, unknown> | undefined;
}

async function partition(id: string) {
  const result = await docs.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `LEAD#${id}` },
    }),
  );
  return result.Items ?? [];
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  clock = new Date('2026-11-01T12:00:00.000Z');
});

afterAll(() => {
  docs.destroy();
});

describe('POST /leads/{id}/notes', () => {
  it('adds a note dated now, keeping its line breaks', async () => {
    const lead = await addLead();

    const note = await added(lead.id, { text: ' Coffee chat.\n\nIntro to Acme next week. ' });

    expect(note).toEqual({
      id: expect.stringMatching(new RegExp(`^${run}-`)) as string,
      leadId: lead.id,
      heldAt: '2026-11-01T12:00:00.000Z',
      text: 'Coffee chat.\n\nIntro to Acme next week.',
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    });
    const stored = await docs.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: `LEAD#${lead.id}`, SK: `NOTE#${note.id}` },
      }),
    );
    expect(stored.Item).toMatchObject({ GSI1PK: 'LEADS', GSI1SK: `${lead.id}#NOTE#${note.id}` });
    expect((await leadItem(lead.id))?.noteCount).toBe(1);
  });

  it('keeps an earlier date, in UTC', async () => {
    const lead = await addLead();

    const note = await added(lead.id, { text: 'First call', heldAt: '2026-10-12T12:00:00-05:00' });

    expect(note.heldAt).toBe('2026-10-12T17:00:00.000Z');
  });

  it('refuses a future date, a blank note and another field, on the field', async () => {
    const lead = await addLead();

    const future = await addNote(lead.id, { text: 'x', heldAt: '2026-11-02T12:00:00.000Z' });
    expect(future.statusCode).toBe(400);
    expect(parse(future)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: "A note can't be dated in the future",
      fields: ['heldAt'],
    });
    const blank = await addNote(lead.id, { text: '  ' });
    expect(parse(blank)).toMatchObject({ message: 'Write a note', fields: ['text'] });
    expect((await addNote(lead.id, { text: 'x', title: 'y' })).statusCode).toBe(400);
    expect(await partition(lead.id)).toHaveLength(1);
  });

  it('refuses a lead that does not exist', async () => {
    const result = await addNote(`${run}-nope`, { text: 'x' });

    expect(result.statusCode).toBe(404);
    expect(parse(result).message).toBe('Lead not found');
    expect(await partition(`${run}-nope`)).toEqual([]);
  });

  it('holds 200 notes a lead, even when two are added at once', async () => {
    const lead = await addLead();
    await docs.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: `LEAD#${lead.id}`, SK: 'LEAD' },
        UpdateExpression: 'SET noteCount = :count',
        ExpressionAttributeValues: { ':count': 199 },
      }),
    );

    const results = await Promise.all([
      addNote(lead.id, { text: 'one' }),
      addNote(lead.id, { text: 'two' }),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 400]);
    const refused = results.find((r) => r.statusCode === 400);
    expect(parse(refused ?? {}).message).toBe(
      'This lead already has 200 notes, the most it can have',
    );
    expect((await leadItem(lead.id))?.noteCount).toBe(200);
  });
});

describe('GET /leads with notes', () => {
  it('gives each lead its notes, newest first, and none to a lead without any', async () => {
    const lead = await addLead();
    const empty = await addLead('Sam');
    const older = await added(lead.id, { text: 'Older', heldAt: '2026-10-01T12:00:00.000Z' });
    clock = new Date('2026-11-01T12:00:00.000Z');
    const first = await added(lead.id, { text: 'First today' });
    clock = new Date('2026-11-01T13:00:00.000Z');
    // Dated the same moment as the first, but added later: it comes first.
    const second = await added(lead.id, { text: 'Second', heldAt: '2026-11-01T12:00:00.000Z' });

    const listed = await leadFromList(lead.id);

    expect((listed?.notes as Body[]).map((note) => note.id)).toEqual([
      second.id,
      first.id,
      older.id,
    ]);
    expect(listed?.notes).toContainEqual(older);
    expect((await leadFromList(empty.id))?.notes).toEqual([]);
    // Notes never show up as leads.
    const result = await handle(apiEvent('GET', '/leads'));
    const ids = (parse(result) as unknown as { items: Body[] }).items.map((item) => item.id);
    expect(ids).not.toContain(older.id);
  });
});

describe('PATCH /leads/{id}/notes/{noteId}', () => {
  it('changes the text or the date', async () => {
    const lead = await addLead();
    const note = await added(lead.id, { text: 'Coffee' });
    clock = new Date('2026-11-01T15:00:00.000Z');

    const text = await handle(
      apiEvent('PATCH', `/leads/${lead.id}/notes/${note.id}`, { body: { text: 'Lunch' } }),
    );
    expect(text.statusCode).toBe(200);
    expect(parse(text)).toEqual({ ...note, text: 'Lunch', updatedAt: '2026-11-01T15:00:00.000Z' });

    const date = await handle(
      apiEvent('PATCH', `/leads/${lead.id}/notes/${note.id}`, {
        body: { heldAt: '2026-10-20T12:00:00.000Z' },
      }),
    );
    expect(parse(date)).toMatchObject({ text: 'Lunch', heldAt: '2026-10-20T12:00:00.000Z' });
  });

  it('refuses a future date and a blank note', async () => {
    const lead = await addLead();
    const note = await added(lead.id, { text: 'Coffee' });

    for (const body of [{ heldAt: '2026-11-02T12:00:00.000Z' }, { text: ' ' }]) {
      const result = await handle(
        apiEvent('PATCH', `/leads/${lead.id}/notes/${note.id}`, { body }),
      );
      expect(result.statusCode).toBe(400);
    }
    expect((await leadFromList(lead.id))?.notes).toEqual([note]);
  });

  it('gives 404 for a note or lead that does not exist', async () => {
    const lead = await addLead();
    const note = await added(lead.id, { text: 'Coffee' });

    for (const path of [`/leads/${lead.id}/notes/nope`, `/leads/${run}-nope/notes/${note.id}`]) {
      const result = await handle(apiEvent('PATCH', path, { body: { text: 'x' } }));
      expect(result.statusCode).toBe(404);
      expect(parse(result).message).toBe('Note not found');
    }
    expect(await partition(`${run}-nope`)).toEqual([]);
  });
});

describe('DELETE /leads/{id}/notes/{noteId}', () => {
  it('needs confirming', async () => {
    const lead = await addLead();
    const note = await added(lead.id, { text: 'Coffee' });

    const result = await handle(apiEvent('DELETE', `/leads/${lead.id}/notes/${note.id}`));

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Confirm deleting the note with the header X-Confirm-Delete: true',
      fields: ['X-Confirm-Delete'],
    });
    expect((await leadFromList(lead.id))?.notes).toEqual([note]);
  });

  it('deletes it, making room for another at the limit', async () => {
    const lead = await addLead();
    const note = await added(lead.id, { text: 'Coffee' });

    const result = await handle(
      apiEvent('DELETE', `/leads/${lead.id}/notes/${note.id}`, { headers: CONFIRM }),
    );

    expect(result.statusCode).toBe(204);
    expect((await leadFromList(lead.id))?.notes).toEqual([]);
    expect((await leadItem(lead.id))?.noteCount).toBe(0);
  });

  it('gives 404 for a note that does not exist, changing nothing', async () => {
    const lead = await addLead();
    await added(lead.id, { text: 'Coffee' });

    const result = await handle(
      apiEvent('DELETE', `/leads/${lead.id}/notes/nope`, { headers: CONFIRM }),
    );

    expect(result.statusCode).toBe(404);
    expect(parse(result).message).toBe('Note not found');
    expect((await leadItem(lead.id))?.noteCount).toBe(1);
  });
});

describe("notes don't change anything else", () => {
  it('leaves the lead and its linked opportunities as they were', async () => {
    const lead = await addLead();
    const opportunity = parse(
      await handle(
        apiEvent('POST', '/opportunities', {
          body: { company: 'Acme', title: 'Engineer', leadId: lead.id },
        }),
      ),
    );
    const opportunityBefore = await handle(apiEvent('GET', `/opportunities/${opportunity.id}`));
    const { noteCount: _before, ...leadBefore } = (await leadItem(lead.id)) ?? {};
    clock = new Date('2026-11-01T14:00:00.000Z');

    const note = await added(lead.id, { text: 'Coffee' });
    await handle(
      apiEvent('PATCH', `/leads/${lead.id}/notes/${note.id}`, { body: { text: 'Lunch' } }),
    );
    await handle(apiEvent('DELETE', `/leads/${lead.id}/notes/${note.id}`, { headers: CONFIRM }));

    const { noteCount: _after, ...leadAfter } = (await leadItem(lead.id)) ?? {};
    expect(leadAfter).toEqual(leadBefore);
    const opportunityAfter = await handle(apiEvent('GET', `/opportunities/${opportunity.id}`));
    expect(parse(opportunityAfter)).toEqual(parse(opportunityBefore));
  });
});

describe('deleting a lead with notes', () => {
  it('deletes its notes too', async () => {
    const lead = await addLead();
    await added(lead.id, { text: 'One' });
    await added(lead.id, { text: 'Two' });

    const result = await handle(apiEvent('DELETE', `/leads/${lead.id}`, { headers: CONFIRM }));

    expect(result.statusCode).toBe(204);
    expect(await partition(lead.id)).toEqual([]);
  });

  it('deletes more notes than one transaction holds, the lead last', async () => {
    const lead = await addLead();
    // Bare items, outside the index, so other files' listings don't page through them.
    await Promise.all(
      Array.from({ length: 150 }, (_, i) =>
        docs.send(
          new PutCommand({
            TableName: config.tableName,
            Item: { PK: `LEAD#${lead.id}`, SK: `NOTE#${run}-bulk-${i}`, id: `${run}-bulk-${i}` },
          }),
        ),
      ),
    );

    await createLeadRepo(docs, config.tableName).delete(lead.id, [], '2026-11-01T12:00:00.000Z');

    expect(await partition(lead.id)).toEqual([]);
  });
});
