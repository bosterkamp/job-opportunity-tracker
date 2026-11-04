import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ToolError } from './apiCall.js';

// At most this many changes through Claude in a minute (spec FR-017, data-model.md "Rate
// counter"), counted in the table so every Lambda instance shares the count.

export const MAX_CHANGES_PER_MINUTE = 20;
export const RATE_LIMITED_MESSAGE =
  'Too many changes through Claude in the last minute. Try again shortly.';
// Counters expire an hour later through the table's TTL.
const KEEP_SECONDS = 3600;

export type TakeChange = (now: Date) => Promise<void>;

export function createChangeLimiter(docs: DynamoDBDocumentClient, tableName: string): TakeChange {
  return async function takeChange(now) {
    try {
      await docs.send(
        new UpdateCommand({
          TableName: tableName,
          // A partition no opportunity uses, and no index entry, so it never appears in lists.
          Key: { PK: 'RATE#mcp', SK: now.toISOString().slice(0, 16) },
          UpdateExpression: 'ADD #count :one SET expiresAt = :expires',
          ConditionExpression: 'attribute_not_exists(#count) OR #count < :max',
          // "count" is a DynamoDB reserved word.
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: {
            ':one': 1,
            ':max': MAX_CHANGES_PER_MINUTE,
            ':expires': Math.floor(now.getTime() / 1000) + KEEP_SECONDS,
          },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ToolError('RATE_LIMITED', RATE_LIMITED_MESSAGE);
      }
      throw error;
    }
  };
}
