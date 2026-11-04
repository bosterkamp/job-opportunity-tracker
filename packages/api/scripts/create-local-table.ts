// Creates the local JobTracker table in DynamoDB Local; does nothing if it already exists.
import './local-env.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { loadConfig } from '../src/config.js';
import { createTable } from '../src/local/table.js';

const config = loadConfig();
const client = new DynamoDBClient({
  region: config.region,
  endpoint: config.dynamoEndpoint,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const result = await createTable(client, config.tableName);
console.log(`Table ${config.tableName}: ${result === 'created' ? 'created' : 'already exists'}`);
