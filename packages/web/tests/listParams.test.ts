// @module-tag overview
import { describe, expect, it } from 'vitest';
import {
  OVERVIEW_DEFAULTS,
  readListParams,
  writeListParams,
} from '../src/features/overview/listParams';

describe('readListParams', () => {
  it('uses the defaults for an empty query', () => {
    expect(OVERVIEW_DEFAULTS).toEqual({ stage: 'ALL', sort: 'closing', salary: null, q: '' });
    expect(readListParams(new URLSearchParams(), OVERVIEW_DEFAULTS)).toEqual(OVERVIEW_DEFAULTS);
  });

  it('reads a valid stage, sort, and search', () => {
    expect(
      readListParams(
        new URLSearchParams('stage=OFFER&sort=stale&salary=150000&q=acme'),
        OVERVIEW_DEFAULTS,
      ),
    ).toEqual({
      stage: 'OFFER',
      sort: 'stale',
      salary: 150_000,
      q: 'acme',
    });
  });

  it('accepts every open stage and Closed, but not an outcome stage', () => {
    for (const stage of ['CONSIDERING', 'OFFER', 'CLOSED']) {
      expect(readListParams(new URLSearchParams({ stage }), OVERVIEW_DEFAULTS).stage).toBe(stage);
    }
    expect(
      readListParams(new URLSearchParams({ stage: 'REJECTED' }), OVERVIEW_DEFAULTS).stage,
    ).toBe('ALL');
    expect(
      writeListParams({ ...OVERVIEW_DEFAULTS, stage: 'CLOSED' }, OVERVIEW_DEFAULTS).toString(),
    ).toBe('stage=CLOSED');
  });

  it('accepts every sort option', () => {
    for (const sort of [
      'closing',
      'recent',
      'stale',
      'interest',
      'added',
      'salary-min',
      'salary-max',
    ]) {
      expect(readListParams(new URLSearchParams({ sort }), OVERVIEW_DEFAULTS).sort).toBe(sort);
    }
  });

  it('ignores unknown values instead of failing', () => {
    expect(
      readListParams(new URLSearchParams('stage=HIRED&sort=random'), OVERVIEW_DEFAULTS),
    ).toEqual(OVERVIEW_DEFAULTS);
    for (const salary of ['123', 'abc', '', '0', '150000.5']) {
      expect(readListParams(new URLSearchParams({ salary }), OVERVIEW_DEFAULTS).salary).toBeNull();
    }
  });
});

describe('writeListParams', () => {
  it('leaves out defaults to keep links short', () => {
    expect(writeListParams(OVERVIEW_DEFAULTS, OVERVIEW_DEFAULTS).toString()).toBe('');
  });

  it('writes every non-default value', () => {
    expect(
      writeListParams(
        { stage: 'APPLIED', sort: 'added', salary: 75_000, q: 'x y' },
        OVERVIEW_DEFAULTS,
      ).toString(),
    ).toBe('stage=APPLIED&sort=added&salary=75000&q=x+y');
  });

  it('round-trips through readListParams', () => {
    const state = { stage: 'CONTACTED', sort: 'interest', salary: 300_000, q: 'staff' } as const;

    expect(readListParams(writeListParams(state, OVERVIEW_DEFAULTS), OVERVIEW_DEFAULTS)).toEqual(
      state,
    );
  });
});
