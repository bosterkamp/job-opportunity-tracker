import type { WorkArrangement } from '@jot/shared';

// A moment in time (createdAt, changedAt) as a date in the viewer's time zone.
export function formatDate(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

// A calendar date with no time (YYYY-MM-DD, like followUpDate). Formatted in UTC so it never
// shifts by a day in time zones behind UTC.
export function formatCalendarDate(ymd: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${ymd}T00:00:00Z`),
  );
}

// A calendar date in short form, "Nov 14", with the year only when it isn't today's year
// (feature 009's card text). In UTC, like formatCalendarDate.
export function formatShortCalendarDate(ymd: string, today: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: ymd.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${ymd}T00:00:00Z`));
}

export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  ONSITE: 'On-site',
  HYBRID: 'Hybrid',
  REMOTE: 'Remote',
};
