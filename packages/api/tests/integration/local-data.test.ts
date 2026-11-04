// @module-tag core
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { deleteAllItems } from '../../src/local/reset.js';
import { createTable, deleteTable } from '../../src/local/table.js';
import { documentClient, rawClient } from './dynamo.js';

const raw = rawClient();
const docs = documentClient();
// Its own table (made in setup.ts): these tests delete every item, which would disturb other
// test files that share the per-run table.
const tableName = inject('localDataTableName');

afterAll(() => {
  raw.destroy();
});

async function putItems(count: number) {
  const items = Array.from({ length: count }, (_, i) => ({ PK: `OPP#${i}`, SK: 'OPP', n: i }));
  for (let i = 0; i < items.length; i += 25) {
    await docs.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })),
        },
      }),
    );
  }
}

async function countItems() {
  return (await docs.send(new ScanCommand({ TableName: tableName, Select: 'COUNT' }))).Count;
}

describe('createTable', () => {
  it('reports an existing table instead of failing', async () => {
    expect(await createTable(raw, tableName)).toBe('exists');
  });

  it('creates the single-table layout with GSI1', async () => {
    const name = `${tableName}-extra`;

    expect(await createTable(raw, name)).toBe('created');
    const { Table } = await raw.send(new DescribeTableCommand({ TableName: name }));
    expect(Table?.KeySchema).toEqual([
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ]);
    expect(Table?.AttributeDefinitions).toEqual(
      expect.arrayContaining([
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ]),
    );
    expect(Table?.GlobalSecondaryIndexes).toEqual([
      expect.objectContaining({
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      }),
    ]);
    expect(Table?.BillingModeSummary?.BillingMode).toBe('PAY_PER_REQUEST');

    await deleteTable(raw, name);
    await expect(raw.send(new DescribeTableCommand({ TableName: name }))).rejects.toThrow();
  });

  it('passes other errors through', async () => {
    await expect(createTable(raw, 'x')).rejects.toThrow('Invalid table/index name');
  });
});

describe('deleteTable', () => {
  it('ignores a table that does not exist', async () => {
    await expect(deleteTable(raw, `${tableName}-missing`)).resolves.toBeUndefined();
  });

  it('passes other errors through', async () => {
    await expect(deleteTable(raw, 'x')).rejects.toThrow('Invalid table/index name');
  });
});

describe('deleteAllItems', () => {
  beforeEach(async () => {
    await deleteAllItems(docs, tableName);
  });

  // 60 writes and deletes against DynamoDB Local can pass 5 seconds on a busy machine.
  it('deletes every item across several batches and scan pages', { timeout: 20_000 }, async () => {
    await putItems(60);

    expect(await deleteAllItems(docs, tableName, { pageSize: 20 })).toBe(60);
    expect(await countItems()).toBe(0);
  });

  it('deletes more than one batch of 25 within a single page', async () => {
    await putItems(30);

    expect(await deleteAllItems(docs, tableName)).toBe(30);
    expect(await countItems()).toBe(0);
  });

  it('returns 0 for an empty table', async () => {
    expect(await deleteAllItems(docs, tableName)).toBe(0);
  });
});
