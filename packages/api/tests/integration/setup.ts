import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import type { TestProject } from 'vitest/node';
import { ensureDynamoDbLocal } from '../../../../scripts/ensure-dynamodb-local.mjs';
import { createTable, deleteTable } from '../../src/local/table.js';

const ENDPOINT = process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8000';

declare module 'vitest' {
  export interface ProvidedContext {
    tableName: string;
    // A second table for local-data.test.ts, whose delete-all would disturb other files.
    localDataTableName: string;
    dynamoEndpoint: string;
  }
}

// Vitest global setup: makes sure DynamoDB Local is running (starting it with docker compose
// if needed) and gives this test run its own table, deleted again afterwards.
export default async function setup(project: TestProject) {
  await ensureDynamoDbLocal();

  const tableName = `JobTracker-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  await createTable(client, tableName);
  // Created here, not in a test file's beforeAll: Stryker reports a mutant that breaks a
  // beforeAll hook as "Survived" (stryker-js#6234).
  const localDataTableName = `${tableName}-local-data`;
  await createTable(client, localDataTableName);

  project.provide('tableName', tableName);
  project.provide('localDataTableName', localDataTableName);
  project.provide('dynamoEndpoint', ENDPOINT);

  return async () => {
    // Some test files create tables named after this run's table (for example `-extra`);
    // remove those too, in case a test stopped before deleting its own.
    const { TableNames = [] } = await client.send(new ListTablesCommand({}));
    for (const name of TableNames.filter((n) => n === tableName || n.startsWith(`${tableName}-`))) {
      await deleteTable(client, name);
    }
    client.destroy();
  };
}
