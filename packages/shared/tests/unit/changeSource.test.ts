// @module-tag mcp
import { describe, expect, it } from 'vitest';
import { VIA } from '../../src/changeSource.js';
import { OpportunitySchema, StageChangeSchema } from '../../src/schemas.js';

const entry = {
  seq: 1,
  fromStage: null,
  toStage: 'CONSIDERING',
  changedAt: '2026-10-20T12:00:00.000Z',
  note: null,
  recordedAt: '2026-10-20T12:00:00.000Z',
};

const opportunity = {
  id: '01J',
  company: 'Acme',
  title: 'Engineer',
  stage: 'CONSIDERING',
  status: 'OPEN',
  createdAt: '2026-10-20T12:00:00.000Z',
  updatedAt: '2026-10-20T12:00:00.000Z',
  lastStageChangeAt: '2026-10-20T12:00:00.000Z',
  changeCount: 1,
};

describe('change source', () => {
  it('marks only changes made through Claude', () => {
    expect(VIA).toEqual(['CLAUDE']);
  });

  it('accepts a history entry made through Claude, and one without a mark', () => {
    expect(StageChangeSchema.parse({ ...entry, via: 'CLAUDE' }).via).toBe('CLAUDE');
    expect(StageChangeSchema.parse(entry)).not.toHaveProperty('via');
  });

  it('rejects any other mark', () => {
    expect(StageChangeSchema.safeParse({ ...entry, via: 'WEB' }).success).toBe(false);
  });

  it('accepts when details were last changed through Claude, or no such time', () => {
    expect(
      OpportunitySchema.parse({
        ...opportunity,
        detailsEditedViaClaudeAt: '2026-10-20T13:00:00.000Z',
      }).detailsEditedViaClaudeAt,
    ).toBe('2026-10-20T13:00:00.000Z');
    expect(
      OpportunitySchema.parse({ ...opportunity, detailsEditedViaClaudeAt: null })
        .detailsEditedViaClaudeAt,
    ).toBeNull();
    expect(OpportunitySchema.parse(opportunity)).not.toHaveProperty('detailsEditedViaClaudeAt');
    expect(
      OpportunitySchema.safeParse({ ...opportunity, detailsEditedViaClaudeAt: 'yesterday' })
        .success,
    ).toBe(false);
  });
});
