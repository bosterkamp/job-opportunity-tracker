import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { inject } from 'vitest';
import type { ApiConfig } from '../../src/config.js';

// Clients and config for the per-run test table created in setup.ts.
export function testConfig(): ApiConfig {
  return {
    tableName: inject('tableName'),
    appEnv: 'local',
    region: 'us-east-1',
    dynamoEndpoint: inject('dynamoEndpoint'),
  };
}

export function rawClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: 'us-east-1',
    endpoint: inject('dynamoEndpoint'),
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

export function documentClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(rawClient());
}
