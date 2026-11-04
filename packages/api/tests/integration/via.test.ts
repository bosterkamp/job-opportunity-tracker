// @module-tag mcp
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Via } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../../src/handler.js';
import { apiEvent } from '../unit/event.js';
import { documentClient, testConfig } from './dynamo.js';

const config = testConfig();
const docs = documentClient();
const run = `VIA${Date.now()}`;
let n = 0;

type Body = Record<string, unknown> & { id: string; history: Record<string, unknown>[] };
const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as Body;

// A handler for the web app (no via) or for Claude, with a fixed clock.
function handler(via: Via | undefined, at = '2026-10-20T12:00:00.000Z') {
  return createHandler(config, {
    now: () => new Date(at),
    newId: () => `${run}-${n++}`,
    ...(via && { via }),
  });
}

async function items(id: string) {
  const result = await docs.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `OPP#${id}` },
    }),
  );
  return result.Items ?? [];
}

const create = (via?: Via) =>
  handler(via)(
    apiEvent('POST', '/opportunities', { body: { company: 'Acme', title: 'Engineer' } }),
  );

describe('changes made through Claude', () => {
  it('marks the first history entry of an opportunity added through Claude', async () => {
    const created = parse(await create('CLAUDE'));

    expect(created.history[0]).toMatchObject({ seq: 1, via: 'CLAUDE' });
    expect((await items(created.id)).find((i) => i.SK === 'CHANGE#000001')).toMatchObject({
      via: 'CLAUDE',
    });
  });

  it('marks a stage change made through Claude', async () => {
    const { id } = parse(await create());

    const moved = parse(
      await handler('CLAUDE')(
        apiEvent('POST', `/opportunities/${id}/stage-changes`, {
          body: { toStage: 'APPLIED', expectedChangeCount: 1 },
        }),
      ),
    );

    expect(moved.history.map((entry) => entry.via)).toEqual([undefined, 'CLAUDE']);
  });

  it('records when details were changed through Claude, and a web edit clears it', async () => {
    const { id } = parse(await create());
    const edit = (via?: Via, at?: string) =>
      handler(via, at)(apiEvent('PATCH', `/opportunities/${id}`, { body: { location: 'Remote' } }));

    expect(parse(await edit('CLAUDE', '2026-10-20T13:00:00.000Z')).detailsEditedViaClaudeAt).toBe(
      '2026-10-20T13:00:00.000Z',
    );
    const fetched = parse(await handler(undefined)(apiEvent('GET', `/opportunities/${id}`)));
    expect(fetched.detailsEditedViaClaudeAt).toBe('2026-10-20T13:00:00.000Z');

    expect(parse(await edit(undefined)).detailsEditedViaClaudeAt).toBeUndefined();
    expect((await items(id)).find((i) => i.SK === 'OPP')).not.toHaveProperty(
      'detailsEditedViaClaudeAt',
    );
  });

  it('keeps the details mark when the stage moves', async () => {
    const { id } = parse(await create());
    await handler(
      'CLAUDE',
      '2026-10-20T13:00:00.000Z',
    )(apiEvent('PATCH', `/opportunities/${id}`, { body: { location: 'Remote' } }));

    const moved = parse(
      await handler(undefined)(
        apiEvent('POST', `/opportunities/${id}/stage-changes`, {
          body: { toStage: 'APPLIED', expectedChangeCount: 1 },
        }),
      ),
    );

    expect(moved.detailsEditedViaClaudeAt).toBe('2026-10-20T13:00:00.000Z');
  });

  it('marks nothing for the web app', async () => {
    const { id } = parse(await create());
    await handler(undefined)(
      apiEvent('POST', `/opportunities/${id}/stage-changes`, {
        body: { toStage: 'APPLIED', expectedChangeCount: 1 },
      }),
    );

    for (const item of await items(id)) {
      expect(item).not.toHaveProperty('via');
      expect(item).not.toHaveProperty('detailsEditedViaClaudeAt');
    }
  });
});
