// @module-tag core
import type { StageChange } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import { defaultDeps } from '../../src/handler.js';
import { sortHistory } from '../../src/repo/opportunityRepo.js';

const change = (seq: number, changedAt: string): StageChange => ({
  seq,
  fromStage: null,
  toStage: 'APPLIED',
  changedAt,
  note: null,
  recordedAt: changedAt,
});

describe('sortHistory', () => {
  it('orders by date, so a backdated entry sorts before later ones', () => {
    const history = [
      change(1, '2026-10-10T00:00:00Z'),
      change(2, '2026-10-12T00:00:00Z'),
      change(3, '2026-10-11T00:00:00Z'),
    ];

    expect(sortHistory(history).map((c) => c.seq)).toEqual([1, 3, 2]);
  });

  it('keeps entry order for entries on the same date', () => {
    const history = [change(2, '2026-10-10T00:00:00Z'), change(1, '2026-10-10T00:00:00Z')];

    expect(sortHistory(history).map((c) => c.seq)).toEqual([1, 2]);
  });

  it('does not change the original list', () => {
    const history = [change(2, '2026-10-12T00:00:00Z'), change(1, '2026-10-10T00:00:00Z')];

    sortHistory(history);

    expect(history.map((c) => c.seq)).toEqual([2, 1]);
  });
});

describe('defaultDeps', () => {
  it('uses ULIDs for ids and the real clock', () => {
    const deps = defaultDeps({ tableName: 'T', appEnv: 'aws', region: 'us-east-1' });
    const before = Date.now();

    expect(deps.newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(deps.now().getTime()).toBeGreaterThanOrEqual(before);
    expect(deps.now().getTime()).toBeLessThanOrEqual(Date.now());
  });
});
