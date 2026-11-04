import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ApiConfig } from '../config.js';

// DynamoDB Local accepts any credentials, but the SDK insists on having some.
const LOCAL_CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };

export function createDocumentClient(config: ApiConfig): DynamoDBDocumentClient {
  const client = config.dynamoEndpoint
    ? new DynamoDBClient({
        region: config.region,
        endpoint: config.dynamoEndpoint,
        credentials: LOCAL_CREDENTIALS,
      })
    : new DynamoDBClient({ region: config.region });

  return DynamoDBDocumentClient.from(client, {
    // Optional fields are simply left off the item rather than stored as null or undefined.
    marshallOptions: { removeUndefinedValues: true },
  });
}
