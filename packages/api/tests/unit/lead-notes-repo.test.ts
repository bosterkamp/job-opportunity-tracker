// @module-tag leads
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createLeadRepo } from '../../src/repo/leadRepo.js';

// Note behavior that's hard to reach against DynamoDB Local (feature 011): failures other than a
// failed condition pass through, so they become a 500 rather than the limit or a 404.

function failingClient(failure: Error) {
  return {
    send: vi.fn(() => Promise.reject(failure)),
  } as unknown as DynamoDBDocumentClient;
}

const NOTE = {
  id: 'n1',
  leadId: 'l1',
  heldAt: '2026-10-30T17:00:00.000Z',
  text: 'Coffee chat',
  createdAt: '2026-10-30T17:00:00.000Z',
  updatedAt: '2026-10-30T17:00:00.000Z',
};

describe('lead notes in the repository', () => {
  it('passes any other failure through when adding a note', async () => {
    const failure = new Error('throttled');

    await expect(createLeadRepo(failingClient(failure), 'T').addNote(NOTE)).rejects.toBe(failure);
  });

  it('passes any other failure through when changing a note', async () => {
    const failure = new Error('throttled');

    await expect(
      createLeadRepo(failingClient(failure), 'T').updateNote('l1', 'n1', { text: 'x' }, 'now'),
    ).rejects.toBe(failure);
  });

  it('passes a failed condition outside a transaction through when deleting a note', async () => {
    // Only a cancelled transaction means "no such note"; anything else is a real failure.
    const failure = new ConditionalCheckFailedException({ message: 'no', $metadata: {} });

    await expect(createLeadRepo(failingClient(failure), 'T').deleteNote('l1', 'n1')).rejects.toBe(
      failure,
    );
  });
});
