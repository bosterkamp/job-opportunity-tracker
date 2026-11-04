// @module-tag overview
import type { Opportunity } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import {
  SALARY_FILTERS,
  SORT_OPTIONS,
  boardGroups,
  filterBySalary,
  search,
  sinceLabel,
  sortBy,
} from '../src/features/overview/overviewModel';

function opp(overrides: Partial<Opportunity> & { id: string }): Opportunity {
  return {
    company: 'Company',
    title: 'Engineer',
    stage: 'CONSIDERING',
    status: 'OPEN',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    lastStageChangeAt: '2026-10-01T12:00:00.000Z',
    changeCount: 1,
    ...overrides,
  };
}

const ids = (items: Opportunity[]) => items.map((o) => o.id);

describe('boardGroups', () => {
  const open = [
    opp({ id: 'a', stage: 'OFFER' }),
    opp({ id: 'b', stage: 'CONSIDERING' }),
    opp({ id: 'c', stage: 'OFFER' }),
  ];
  const closed = [
    opp({ id: 'x', stage: 'REJECTED', status: 'CLOSED' }),
    opp({ id: 'y', stage: 'WITHDRAWN', status: 'CLOSED' }),
  ];
  const shape = (groups: ReturnType<typeof boardGroups>) =>
    groups.map((g) => [g.key, g.label, ids(g.items)]);

  it('gives every open stage in display order, then Closed, including empty ones', () => {
    expect(shape(boardGroups(open, closed))).toEqual([
      ['CONSIDERING', 'Considering', ['b']],
      ['APPLIED', 'Applied', []],
      ['CONTACTED', 'Contacted', []],
      ['INTERVIEWING', 'Interviewing', []],
      ['OFFER', 'Offer', ['a', 'c']],
      ['CLOSED', 'Closed', ['x', 'y']],
    ]);
    expect(shape(boardGroups(open, closed, 'ALL'))).toEqual(shape(boardGroups(open, closed)));
  });

  it('gives only the open stage the filter picks', () => {
    expect(shape(boardGroups(open, closed, 'OFFER'))).toEqual([['OFFER', 'Offer', ['a', 'c']]]);
  });

  it('gives only Closed for the Closed filter', () => {
    expect(shape(boardGroups(open, closed, 'CLOSED'))).toEqual([['CLOSED', 'Closed', ['x', 'y']]]);
  });

  it('gives nothing for an outcome stage, which has no column of its own', () => {
    expect(boardGroups(open, closed, 'REJECTED')).toEqual([]);
  });
});

describe('sortBy', () => {
  const items = [
    opp({
      id: 'low',
      interest: 2,
      createdAt: '2026-10-03T00:00:00Z',
      lastStageChangeAt: '2026-10-09T00:00:00Z',
    }),
    opp({
      id: 'none',
      interest: null,
      createdAt: '2026-10-05T00:00:00Z',
      lastStageChangeAt: '2026-10-05T00:00:00Z',
    }),
    opp({
      id: 'high',
      interest: 5,
      createdAt: '2026-10-01T00:00:00Z',
      lastStageChangeAt: '2026-10-07T00:00:00Z',
    }),
    opp({
      id: 'unset',
      createdAt: '2026-10-02T00:00:00Z',
      lastStageChangeAt: '2026-10-08T00:00:00Z',
    }),
  ];

  it('offers seven sorts, closing soonest first', () => {
    expect(SORT_OPTIONS).toEqual([
      { value: 'closing', label: 'Closing soonest' },
      { value: 'recent', label: 'Recently changed' },
      { value: 'stale', label: 'Waiting longest' },
      { value: 'interest', label: 'Interest' },
      { value: 'added', label: 'Date added' },
      { value: 'salary-min', label: 'Salary (minimum)' },
      { value: 'salary-max', label: 'Salary (maximum)' },
    ]);
  });

  describe('by salary', () => {
    const paid = [
      opp({ id: 'none', lastStageChangeAt: '2026-10-09T00:00:00Z' }),
      opp({ id: 'low', salaryMin: 0, salaryMax: 300_000 }),
      opp({ id: 'high', salaryMin: 200_000, salaryMax: 210_000 }),
      opp({ id: 'mid-old', salaryMin: 150_000, lastStageChangeAt: '2026-10-02T00:00:00Z' }),
      opp({ id: 'mid-new', salaryMin: 150_000, lastStageChangeAt: '2026-10-05T00:00:00Z' }),
    ];

    it('sorts by the minimum, high to low, with none last and ties by newest change', () => {
      expect(ids(sortBy(paid, 'salary-min'))).toEqual([
        'high',
        'mid-new',
        'mid-old',
        'low',
        'none',
      ]);
    });

    it('sorts by the maximum, high to low, with none last and ties by newest change', () => {
      expect(ids(sortBy(paid, 'salary-max'))).toEqual([
        'low',
        'high',
        'none',
        'mid-new',
        'mid-old',
      ]);
    });
  });

  it('sorts by the most recent stage change first', () => {
    expect(ids(sortBy(items, 'recent'))).toEqual(['low', 'unset', 'high', 'none']);
  });

  it('sorts by the longest wait since the last change first', () => {
    expect(ids(sortBy(items, 'stale'))).toEqual(['none', 'high', 'unset', 'low']);
  });

  it('sorts by interest, high to low, with unrated last', () => {
    // Both unrated ones tie; the more recently changed comes first.
    expect(ids(sortBy(items, 'interest'))).toEqual(['high', 'low', 'unset', 'none']);
  });

  it('keeps the recent-change order among equal interest', () => {
    const tied = [
      opp({ id: 'older', interest: 3, lastStageChangeAt: '2026-10-01T00:00:00Z' }),
      opp({ id: 'newer', interest: 3, lastStageChangeAt: '2026-10-02T00:00:00Z' }),
    ];

    expect(ids(sortBy(tied, 'interest'))).toEqual(['newer', 'older']);
  });

  it('sorts by date added, newest first', () => {
    expect(ids(sortBy(items, 'added'))).toEqual(['none', 'low', 'unset', 'high']);
  });

  it('does not change the original list', () => {
    const before = ids(items);

    sortBy(items, 'interest');

    expect(ids(items)).toEqual(before);
  });
});

describe('filterBySalary', () => {
  const items = [
    opp({ id: 'range', salaryMin: 140_000, salaryMax: 190_000 }),
    opp({ id: 'min-only', salaryMin: 150_000 }),
    opp({ id: 'max-only', salaryMax: 149_999 }),
    opp({ id: 'below', salaryMin: 100_000, salaryMax: 120_000 }),
    opp({ id: 'none-1' }),
    opp({ id: 'none-2' }),
  ];

  it('keeps ranges that reach the amount: the maximum, or else the minimum', () => {
    const result = filterBySalary(items, 150_000);

    expect(ids(result.items)).toEqual(['range', 'min-only']);
    expect(result.hiddenWithoutSalary).toBe(2);
  });

  it('keeps everything when no amount is chosen', () => {
    expect(filterBySalary(items, null)).toEqual({ items, hiddenWithoutSalary: 0 });
  });

  it('offers amounts from $50k to $300k', () => {
    expect(SALARY_FILTERS).toEqual([
      50_000, 75_000, 100_000, 125_000, 150_000, 175_000, 200_000, 250_000, 300_000,
    ]);
  });
});

describe('search', () => {
  const items = [
    opp({ id: 'acme', company: 'Acme Corp', title: 'Senior Engineer' }),
    opp({ id: 'globex', company: 'Globex', title: 'Staff Developer' }),
  ];

  it('matches the company, ignoring case', () => {
    expect(ids(search(items, 'acme'))).toEqual(['acme']);
    expect(ids(search(items, 'GLOBEX'))).toEqual(['globex']);
  });

  it('matches the job title', () => {
    expect(ids(search(items, 'developer'))).toEqual(['globex']);
  });

  it('matches part of a word and ignores surrounding spaces', () => {
    expect(ids(search(items, '  corp '))).toEqual(['acme']);
  });

  it('keeps everything for an empty query', () => {
    expect(ids(search(items, '   '))).toEqual(['acme', 'globex']);
  });

  it('returns nothing when nothing matches', () => {
    expect(search(items, 'initech')).toEqual([]);
  });
});

describe('sinceLabel', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  it.each([
    [0, 'today'],
    [DAY - 1, 'today'],
    [DAY, 'yesterday'],
    [3 * DAY, '3 days ago'],
    [13 * DAY, '13 days ago'],
    [14 * DAY, '2 weeks ago'],
    [59 * DAY, '8 weeks ago'],
    [60 * DAY, '2 months ago'],
    [400 * DAY, '13 months ago'],
  ])('labels %i ms ago as "%s"', (ms, label) => {
    expect(sinceLabel(ago(ms), now, 'en-US')).toBe(label);
  });

  it('treats a time slightly in the future (clock skew) as today', () => {
    expect(sinceLabel(new Date(now.getTime() + 30_000).toISOString(), now, 'en-US')).toBe('today');
  });

  it("uses the viewer's locale and the real clock by default", () => {
    expect(sinceLabel(new Date().toISOString())).toBe(
      new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(0, 'day'),
    );
  });
});

describe('performance (SC-004)', () => {
  it('filters, searches, sorts, and groups 200 opportunities in under 50 ms', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      opp({
        id: String(i),
        company: `Company ${i}`,
        stage: (['CONSIDERING', 'APPLIED', 'CONTACTED', 'INTERVIEWING', 'OFFER'] as const)[i % 5],
        interest: i % 6 || null,
        lastStageChangeAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
      }),
    );

    const start = performance.now();
    const groups = boardGroups(sortBy(search(many, 'company'), 'interest'), []);
    const elapsed = performance.now() - start;

    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(200);
    expect(elapsed).toBeLessThan(50);
  });
});
