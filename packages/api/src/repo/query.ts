import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

export type Item = Record<string, unknown>;

// DynamoDB allows at most 100 items in one transaction.
export const MAX_TRANSACTION_ITEMS = 100;

// A transaction refused because one of its conditions failed.
export function isConditionFailure(error: unknown): boolean {
  return (
    error instanceof TransactionCanceledException &&
    (error.CancellationReasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed')
  );
}

// Runs a Query and follows its pages until every matching item is read. `pageSize` is set only
// by tests, to exercise the paging.
export function pagedQuery(client: DynamoDBDocumentClient, tableName: string, pageSize?: number) {
  return async function queryAll(input: Omit<QueryCommandInput, 'TableName'>): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Item | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          ...input,
          TableName: tableName,
          Limit: pageSize,
          ExclusiveStartKey: startKey,
        }),
      );
      items.push(...(page.Items ?? []));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return items;
  };
}
