// @module-tag deadline
import type { Opportunity } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_DEFAULTS,
  OVERVIEW_DEFAULTS,
  readListParams,
  writeListParams,
} from '../src/features/overview/listParams';
import { SORT_OPTIONS, postingDeadline, sortBy } from '../src/features/overview/overviewModel';
import { formatShortCalendarDate } from '../src/format';

const today = '2026-11-10';
const deadline = (date: string | null | undefined) => postingDeadline(date, today, 'en-US');

describe('formatShortCalendarDate', () => {
  it('leaves out the year when it is this year, and shows it otherwise', () => {
    expect(formatShortCalendarDate('2026-11-14', today, 'en-US')).toBe('Nov 14');
    expect(formatShortCalendarDate('2027-01-05', today, 'en-US')).toBe('Jan 5, 2027');
    expect(formatShortCalendarDate('2025-12-31', today, 'en-US')).toBe('Dec 31, 2025');
  });

  it('never shifts the day, whatever the time zone', () => {
    expect(formatShortCalendarDate('2026-01-01', today, 'en-US')).toBe('Jan 1');
    expect(formatShortCalendarDate('2026-12-31', today, 'en-US')).toBe('Dec 31');
  });
});

describe('postingDeadline', () => {
  it('is nothing without a date', () => {
    expect(deadline(undefined)).toBeUndefined();
    expect(deadline(null)).toBeUndefined();
  });

  it('says until when more than a week away', () => {
    expect(deadline('2026-11-19')).toEqual({ kind: 'open', text: 'Open until Nov 19' });
    expect(deadline('2026-11-18')).toEqual({ kind: 'open', text: 'Open until Nov 18' });
    expect(deadline('2027-01-05')).toEqual({ kind: 'open', text: 'Open until Jan 5, 2027' });
  });

  it('counts the days from a week away to today', () => {
    expect(deadline('2026-11-17')).toEqual({ kind: 'soon', text: 'Closes in 7 days' });
    expect(deadline('2026-11-12')).toEqual({ kind: 'soon', text: 'Closes in 2 days' });
    expect(deadline('2026-11-11')).toEqual({ kind: 'soon', text: 'Closes tomorrow' });
    expect(deadline('2026-11-10')).toEqual({ kind: 'soon', text: 'Closes today' });
  });

  it('says ended once the date has passed', () => {
    expect(deadline('2026-11-09')).toEqual({ kind: 'ended', text: 'Posting ended Nov 9' });
    expect(deadline('2025-10-01')).toEqual({
      kind: 'ended',
      text: 'Posting ended Oct 1, 2025',
    });
  });

  it('counts whole days across a daylight-saving change', () => {
    // US clocks go back on 2026-11-01; Europe's on 2026-10-25.
    expect(postingDeadline('2026-11-03', '2026-10-27', 'en-US')).toEqual({
      kind: 'soon',
      text: 'Closes in 7 days',
    });
    expect(postingDeadline('2026-03-30', '2026-03-28', 'en-US')).toEqual({
      kind: 'soon',
      text: 'Closes in 2 days',
    });
  });
});

function opp(id: string, postedUntil?: string, lastStageChangeAt = '2026-10-01T12:00:00.000Z') {
  return {
    id,
    company: id,
    title: 'Engineer',
    stage: 'CONSIDERING',
    status: 'OPEN',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    lastStageChangeAt,
    changeCount: 1,
    ...(postedUntil ? { postedUntil } : {}),
  } satisfies Opportunity;
}

describe('the Closing soonest sort', () => {
  const ids = (items: Opportunity[]) => items.map((o) => o.id);

  it('puts upcoming dates first, then undated ones, then ended ones', () => {
    const items = [
      opp('ended-last-month', '2026-10-10'),
      opp('undated-old', undefined, '2026-10-01T12:00:00.000Z'),
      opp('in-20-days', '2026-11-30'),
      opp('ended-last-week', '2026-11-03'),
      opp('undated-new', undefined, '2026-10-20T12:00:00.000Z'),
      opp('in-2-days', '2026-11-12'),
      opp('today', '2026-11-10'),
    ];

    expect(ids(sortBy(items, 'closing', today))).toEqual([
      'today',
      'in-2-days',
      'in-20-days',
      'undated-new',
      'undated-old',
      'ended-last-week',
      'ended-last-month',
    ]);
  });

  it('breaks ties by the most recent change', () => {
    const items = [
      opp('older', '2026-11-12', '2026-10-01T12:00:00.000Z'),
      opp('newer', '2026-11-12', '2026-10-05T12:00:00.000Z'),
      opp('ended-older', '2026-11-01', '2026-10-01T12:00:00.000Z'),
      opp('ended-newer', '2026-11-01', '2026-10-05T12:00:00.000Z'),
    ];

    expect(ids(sortBy(items, 'closing', today))).toEqual([
      'newer',
      'older',
      'ended-newer',
      'ended-older',
    ]);
  });

  it('is offered first in "Sort by"', () => {
    expect(SORT_OPTIONS[0]).toEqual({ value: 'closing', label: 'Closing soonest' });
  });
});

describe('each page keeps its own default sort', () => {
  it('opens the overview on Closing soonest, and the archive on Recently changed', () => {
    expect(readListParams(new URLSearchParams(), OVERVIEW_DEFAULTS).sort).toBe('closing');
    expect(readListParams(new URLSearchParams(), ARCHIVE_DEFAULTS).sort).toBe('recent');
  });

  it("writes a sort only when it isn't the page's default", () => {
    expect(writeListParams(OVERVIEW_DEFAULTS, OVERVIEW_DEFAULTS).toString()).toBe('');
    expect(
      writeListParams({ ...OVERVIEW_DEFAULTS, sort: 'recent' }, OVERVIEW_DEFAULTS).toString(),
    ).toBe('sort=recent');
    expect(writeListParams(ARCHIVE_DEFAULTS, ARCHIVE_DEFAULTS).toString()).toBe('');
    expect(
      writeListParams({ ...ARCHIVE_DEFAULTS, sort: 'closing' }, ARCHIVE_DEFAULTS).toString(),
    ).toBe('sort=closing');
  });

  it('reads ?sort=closing on both pages', () => {
    const query = new URLSearchParams('sort=closing');
    expect(readListParams(query, OVERVIEW_DEFAULTS).sort).toBe('closing');
    expect(readListParams(query, ARCHIVE_DEFAULTS).sort).toBe('closing');
  });
});
