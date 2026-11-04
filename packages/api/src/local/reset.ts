import { BatchWriteCommand, ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const BATCH_SIZE = 25; // DynamoDB's BatchWriteItem limit

// Deletes every item in the table. Only the local server exposes this (POST /__test/reset),
// so Playwright tests can start from an empty table. It never exists in the Lambda.
// DynamoDB Local never throttles, so unprocessed batch items aren't retried here.
export async function deleteAllItems(
  client: DynamoDBDocumentClient,
  tableName: string,
  { pageSize }: { pageSize?: number } = {},
): Promise<number> {
  let deleted = 0;
  let startKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: startKey,
        Limit: pageSize,
      }),
    );
    const keys = (page.Items ?? []) as { PK: string; SK: string }[];

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: batch.map((key) => ({
              DeleteRequest: { Key: { PK: key.PK, SK: key.SK } },
            })),
          },
        }),
      );
      deleted += batch.length;
    }

    startKey = page.LastEvaluatedKey;
  } while (startKey);

  return deleted;
}
