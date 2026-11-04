import {
  CreateTableCommand,
  DeleteTableCommand,
  ResourceInUseException,
  ResourceNotFoundException,
  waitUntilTableExists,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { GSI1 } from '../repo/keys.js';

// Local and test copy of the table defined in packages/infra/lib/data-stack.ts.
// Keep the key schema and GSI1 in step with that stack.
export async function createTable(
  client: DynamoDBClient,
  tableName: string,
): Promise<'created' | 'exists'> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: GSI1,
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      }),
    );
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      return 'exists';
    }
    throw error;
  }
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
  return 'created';
}

export async function deleteTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
  }
}
