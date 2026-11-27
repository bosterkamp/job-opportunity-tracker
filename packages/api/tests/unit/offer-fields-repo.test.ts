// @module-tag offer
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createOfferFieldsRepo } from '../../src/repo/offerFieldsRepo.js';

// The custom offer fields' item (feature 013): what's hard to see against DynamoDB Local.

const NEXT = {
  fields: [{ id: 'f1', name: 'Commute' }],
  removed: [],
  weights: { title: 0 },
  version: 3,
};

function recordingClient(reply: () => Promise<unknown> = () => Promise.resolve({})) {
  const sent: unknown[] = [];
  const client = {
    send: vi.fn((command: GetCommand | PutCommand) => {
      sent.push(command.input);
      return reply();
    }),
  } as unknown as DynamoDBDocumentClient;
  return { client, sent };
}

describe('the custom offer fields in the repository', () => {
  it('reads them strongly consistent, so a change shows at once', async () => {
    const { client, sent } = recordingClient();
    await createOfferFieldsRepo(client, 'T').get();
    expect(sent).toEqual([
      { TableName: 'T', Key: { PK: 'SETTINGS', SK: 'OFFER_FIELDS' }, ConsistentRead: true },
    ]);
  });

  it('writes the first list only if there is none, and later ones only at the version read', async () => {
    const { client, sent } = recordingClient();
    const repo = createOfferFieldsRepo(client, 'T');

    await repo.put({ ...NEXT, version: 1 }, 0);
    await repo.put(NEXT, 2);

    expect(sent).toEqual([
      {
        TableName: 'T',
        Item: { PK: 'SETTINGS', SK: 'OFFER_FIELDS', ...NEXT, version: 1 },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
      {
        TableName: 'T',
        Item: { PK: 'SETTINGS', SK: 'OFFER_FIELDS', ...NEXT },
        ConditionExpression: 'version = :expected',
        ExpressionAttributeValues: { ':expected': 2 },
      },
    ]);
  });

  it('says false when the version has moved on, and passes any other failure through', async () => {
    const stale = recordingClient(() =>
      Promise.reject(new ConditionalCheckFailedException({ message: 'no', $metadata: {} })),
    );
    await expect(createOfferFieldsRepo(stale.client, 'T').put(NEXT, 2)).resolves.toBe(false);

    const failure = new Error('throttled');
    const failing = recordingClient(() => Promise.reject(failure));
    await expect(createOfferFieldsRepo(failing.client, 'T').put(NEXT, 2)).rejects.toBe(failure);
  });
});
