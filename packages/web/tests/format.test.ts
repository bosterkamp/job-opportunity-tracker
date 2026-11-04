// @module-tag core
import { describe, expect, it } from 'vitest';
import { WORK_ARRANGEMENT_LABELS, formatCalendarDate, formatDate } from '../src/format';

describe('formatDate', () => {
  it('formats a moment as a medium date', () => {
    expect(formatDate('2026-10-17T12:00:00.000Z', 'en-US')).toBe('Oct 17, 2026');
  });

  it("uses the viewer's locale by default", () => {
    expect(formatDate('2026-10-17T12:00:00.000Z')).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date('2026-10-17T12:00:00.000Z'),
      ),
    );
  });
});

describe('formatCalendarDate', () => {
  it('formats a YYYY-MM-DD date without shifting it by time zone', () => {
    expect(formatCalendarDate('2026-11-03', 'en-US')).toBe('Nov 3, 2026');
    expect(formatCalendarDate('2026-01-01', 'en-US')).toBe('Jan 1, 2026');
  });

  it("uses the viewer's locale by default", () => {
    expect(formatCalendarDate('2026-11-03')).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date('2026-11-03T00:00:00Z'),
      ),
    );
  });
});

describe('WORK_ARRANGEMENT_LABELS', () => {
  it('labels each work arrangement', () => {
    expect(WORK_ARRANGEMENT_LABELS).toEqual({
      ONSITE: 'On-site',
      HYBRID: 'Hybrid',
      REMOTE: 'Remote',
    });
  });
});
