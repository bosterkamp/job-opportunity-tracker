// @module-tag core
import { describe, expect, it } from 'vitest';
import {
  OPEN_STAGES,
  OUTCOME_STAGES,
  stageDescription,
  STAGE_IDS,
  STAGES,
  isOutcome,
  stageLabel,
  statusForStage,
  type Stage,
} from '../../src/stages.js';

describe('stages', () => {
  it('lists the 10 stages in display order with label and category', () => {
    expect(STAGES.map(({ id, label, category }) => ({ id, label, category }))).toEqual([
      { id: 'CONSIDERING', label: 'Considering', category: 'open' },
      { id: 'APPLIED', label: 'Applied', category: 'open' },
      { id: 'CONTACTED', label: 'Contacted', category: 'open' },
      { id: 'INTERVIEWING', label: 'Interviewing', category: 'open' },
      { id: 'OFFER', label: 'Offer', category: 'open' },
      { id: 'ACCEPTED', label: 'Accepted', category: 'outcome' },
      { id: 'DECLINED', label: 'Declined', category: 'outcome' },
      { id: 'REJECTED', label: 'Rejected', category: 'outcome' },
      { id: 'NO_LONGER_AVAILABLE', label: 'No Longer Available', category: 'outcome' },
      { id: 'WITHDRAWN', label: 'Withdrawn', category: 'outcome' },
      { id: 'NO_RESPONSE', label: 'No Response', category: 'outcome' },
    ]);
  });

  it('exposes the stage ids in display order', () => {
    expect(STAGE_IDS).toEqual(STAGES.map((stage) => stage.id));
  });

  it('splits stages into open and outcome groups', () => {
    expect(OPEN_STAGES).toEqual(['CONSIDERING', 'APPLIED', 'CONTACTED', 'INTERVIEWING', 'OFFER']);
    expect(OUTCOME_STAGES).toEqual([
      'ACCEPTED',
      'DECLINED',
      'REJECTED',
      'NO_LONGER_AVAILABLE',
      'WITHDRAWN',
      'NO_RESPONSE',
    ]);
  });

  it.each(OUTCOME_STAGES)('treats %s as an outcome that closes the opportunity', (stage) => {
    expect(isOutcome(stage)).toBe(true);
    expect(statusForStage(stage)).toBe('CLOSED');
  });

  it.each(OPEN_STAGES)('treats %s as an open stage', (stage) => {
    expect(isOutcome(stage)).toBe(false);
    expect(statusForStage(stage)).toBe('OPEN');
  });

  it('returns the display label for a stage', () => {
    expect(stageLabel('NO_RESPONSE')).toBe('No Response');
    expect(stageLabel('NO_LONGER_AVAILABLE')).toBe('No Longer Available');
    expect(stageLabel('CONSIDERING')).toBe('Considering');
  });

  it('says what each outcome means, and nothing for open stages', () => {
    expect(OUTCOME_STAGES.map(stageDescription)).toEqual([
      'You took the job.',
      'They made an offer and you turned it down.',
      'They turned you down.',
      'The role was filled or taken down without a decision on you.',
      'You pulled out before any offer.',
      'You never heard back.',
    ]);
    expect(OPEN_STAGES.map(stageDescription)).toEqual(OPEN_STAGES.map(() => undefined));
    expect(stageDescription('UNKNOWN' as Stage)).toBeUndefined();
  });
});
