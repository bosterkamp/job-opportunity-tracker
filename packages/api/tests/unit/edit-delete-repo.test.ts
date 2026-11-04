// @module-tag edit
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createOpportunityRepo } from '../../src/repo/opportunityRepo.js';

// Repository behavior that's hard to reach against DynamoDB Local: unexpected failures, and
// opportunities with more history items than one transaction can hold.

function fakeClient(send: (command: unknown) => unknown) {
  return {
    send: vi.fn((command: unknown) => Promise.resolve().then(() => send(command))),
  } as unknown as DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> };
}

describe('updateDetails', () => {
  it('returns undefined when the opportunity does not exist', async () => {
    const client = fakeClient(() => {
      throw new ConditionalCheckFailedException({ message: 'no', $metadata: {} });
    });

    await expect(
      createOpportunityRepo(client, 'T').updateDetails('x', {}, 'now'),
    ).resolves.toBeUndefined();
  });

  it('passes any other failure through, so it becomes a 500 rather than a 404', async () => {
    const failure = new Error('throttled');
    const client = fakeClient(() => {
      throw failure;
    });

    await expect(createOpportunityRepo(client, 'T').updateDetails('x', {}, 'now')).rejects.toBe(
      failure,
    );
  });

  it('only sends an UpdateCommand', async () => {
    const client = fakeClient(() => {
      throw new ConditionalCheckFailedException({ message: 'no', $metadata: {} });
    });

    await createOpportunityRepo(client, 'T').updateDetails('x', { notes: 'a' }, 'now');

    expect(client.send.mock.calls.map(([command]) => (command as object).constructor)).toEqual([
      UpdateCommand,
    ]);
  });
});

describe('deletePermanently', () => {
  it('splits a long history into transactions of at most 100 items', async () => {
    const keys = Array.from({ length: 250 }, (_, i) => ({ PK: 'OPP#x', SK: `CHANGE#${i}` }));
    const transactions: number[] = [];
    const client = fakeClient((command) => {
      if (command instanceof QueryCommand) {
        return { Items: keys };
      }
      if (command instanceof TransactWriteCommand) {
        transactions.push(command.input.TransactItems?.length ?? 0);
        return {};
      }
      throw new Error('unexpected command');
    });

    await expect(createOpportunityRepo(client, 'T').deletePermanently('x')).resolves.toBe(true);

    expect(transactions).toEqual([100, 100, 50]);
  });
});
