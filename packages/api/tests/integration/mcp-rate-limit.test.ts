// @module-tag mcp
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { ToolError } from '../../src/mcp/apiCall.js';
import {
  createChangeLimiter,
  MAX_CHANGES_PER_MINUTE,
  RATE_LIMITED_MESSAGE,
} from '../../src/mcp/rateLimit.js';
import { documentClient, testConfig } from './dynamo.js';

// Each test uses its own minute, far apart, so tests never share a counter.
const minute = (n: number) => new Date(Date.UTC(2031, 0, 1, 0, n, 30));

describe('the change limit', () => {
  it(`allows ${MAX_CHANGES_PER_MINUTE} changes in a minute, and refuses the next one`, async () => {
    const take = createChangeLimiter(documentClient(), testConfig().tableName);
    const now = minute(1 + (Date.now() % 1000));
    expect(MAX_CHANGES_PER_MINUTE).toBe(20);

    for (let i = 0; i < 20; i++) {
      await take(now);
    }
    const refused = take(now);

    await expect(refused).rejects.toBeInstanceOf(ToolError);
    await expect(refused).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many changes through Claude in the last minute. Try again shortly.',
    });
    expect(RATE_LIMITED_MESSAGE).toBe(
      'Too many changes through Claude in the last minute. Try again shortly.',
    );
  });

  it('starts again in the next minute', async () => {
    const take = createChangeLimiter(documentClient(), testConfig().tableName);
    const base = 2000 + (Date.now() % 1000) * 2;
    for (let i = 0; i < 20; i++) {
      await take(minute(base));
    }

    await expect(take(minute(base + 1))).resolves.toBeUndefined();
  });

  it('keeps the count in its own item, expiring an hour later', async () => {
    const docs = documentClient();
    const take = createChangeLimiter(docs, testConfig().tableName);
    const now = minute(5000 + (Date.now() % 1000));

    await take(now);
    await take(now);

    const { Item } = await docs.send(
      new GetCommand({
        TableName: testConfig().tableName,
        Key: { PK: 'RATE#mcp', SK: now.toISOString().slice(0, 16) },
      }),
    );
    expect(Item).toEqual({
      PK: 'RATE#mcp',
      SK: now.toISOString().slice(0, 16),
      count: 2,
      expiresAt: Math.floor(now.getTime() / 1000) + 3600,
    });
  });

  it('passes on any other failure', async () => {
    const boom = new Error('throttled');
    const docs = { send: vi.fn(() => Promise.reject(boom)) };
    const take = createChangeLimiter(docs as never, 'table');

    await expect(take(new Date())).rejects.toBe(boom);
  });
});
