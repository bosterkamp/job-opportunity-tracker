// @module-tag pipeline
// @module-tag edit
// @module-tag interview
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/http.js';
import { CONFLICT_MESSAGE, createOpportunityRepo } from '../../src/repo/opportunityRepo.js';

// changeStage must report a failed changeCount condition as CONFLICT, and pass every other
// failure through unchanged (it becomes a 500), so a real problem is never mistaken for
// "someone else changed it".
const change = {
  expectedChangeCount: 1,
  fromStage: 'CONSIDERING',
  toStage: 'APPLIED',
  status: 'OPEN',
  changedAt: '2026-10-18T12:00:00.000Z',
  lastStageChangeAt: '2026-10-18T12:00:00.000Z',
  note: null,
  now: '2026-10-18T12:00:00.000Z',
} as const;

function repoFailingWith(error: unknown) {
  // The failures under test are all Error subclasses; the cast only satisfies the lint rule.
  const client = {
    send: vi.fn(() => Promise.reject(error as Error)),
  } as unknown as DynamoDBDocumentClient;
  return createOpportunityRepo(client, 'T');
}

const cancelled = (codes: string[] | undefined) =>
  new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: codes?.map((Code) => ({ Code })),
  });

describe('changeStage failures', () => {
  it('reports a failed changeCount condition as CONFLICT', async () => {
    const error = await repoFailingWith(cancelled(['ConditionalCheckFailed', 'None']))
      .changeStage('id', change)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'CONFLICT', message: CONFLICT_MESSAGE, status: 409 });
    expect(CONFLICT_MESSAGE).toBe(
      'This opportunity changed since you loaded it. Reload and try again.',
    );
  });

  it('finds the condition failure on any item of the transaction', async () => {
    const error = await repoFailingWith(cancelled(['None', 'ConditionalCheckFailed']))
      .changeStage('id', change)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'CONFLICT' });
  });

  it.each([
    ['a cancellation for another reason', cancelled(['None', 'ValidationError'])],
    ['a cancellation without reasons', cancelled(undefined)],
    ['an unrelated error', new Error('network down')],
  ])('passes %s through unchanged', async (_label, failure) => {
    await expect(repoFailingWith(failure).changeStage('id', change)).rejects.toBe(failure);
  });
});

// Moving the date added (feature 004) uses the same transaction condition.
describe('changeDateAdded failures', () => {
  const move = {
    createdAt: '2026-09-01T12:00:00.000Z',
    expectedChangeCount: 2,
    now: '2026-10-18T12:00:00.000Z',
  };

  it('reports a failed condition as CONFLICT', async () => {
    const error = await repoFailingWith(cancelled(['ConditionalCheckFailed', 'None']))
      .changeDateAdded('id', move)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'CONFLICT', message: CONFLICT_MESSAGE });
  });

  it.each([
    ['a cancellation for another reason', cancelled(['None', 'ValidationError'])],
    ['an unrelated error', new Error('network down')],
  ])('passes %s through unchanged', async (_label, failure) => {
    await expect(repoFailingWith(failure).changeDateAdded('id', move)).rejects.toBe(failure);
  });
});

// Interviews (feature 005): a failed condition is the limit (adding) or a missing interview
// (editing, removing); anything else passes through.
describe('interview failures', () => {
  const interview = {
    id: 'i1',
    heldAt: '2026-10-20T12:00:00.000Z',
    note: null,
    recordedAt: '2026-10-20T12:00:00.000Z',
  };
  const now = '2026-10-20T12:00:00.000Z';
  const unrelated = new Error('network down');

  it('reports a failed condition on adding as the limit', async () => {
    const error = await repoFailingWith(cancelled(['None', 'ConditionalCheckFailed']))
      .addInterview('id', interview, now)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'This opportunity already has 6 interviews, the most it can have',
    });
  });

  it('reports a missing interview on editing and removing as false', async () => {
    const missing = new ConditionalCheckFailedException({ message: 'no', $metadata: {} });

    await expect(repoFailingWith(missing).updateInterview('id', 'i1', { note: 'x' })).resolves.toBe(
      false,
    );
    await expect(
      repoFailingWith(cancelled(['ConditionalCheckFailed', 'None'])).removeInterview(
        'id',
        'i1',
        now,
      ),
    ).resolves.toBe(false);
  });

  it('passes any other failure through unchanged', async () => {
    await expect(repoFailingWith(unrelated).addInterview('id', interview, now)).rejects.toBe(
      unrelated,
    );
    await expect(repoFailingWith(unrelated).updateInterview('id', 'i1', {})).rejects.toBe(
      unrelated,
    );
    await expect(repoFailingWith(unrelated).removeInterview('id', 'i1', now)).rejects.toBe(
      unrelated,
    );
    const other = cancelled(['None', 'ValidationError']);
    await expect(repoFailingWith(other).addInterview('id', interview, now)).rejects.toBe(other);
    await expect(repoFailingWith(other).removeInterview('id', 'i1', now)).rejects.toBe(other);
  });
});
