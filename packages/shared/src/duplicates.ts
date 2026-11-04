import type { Opportunity } from './schemas.js';

// Same text ignoring case, with runs of whitespace collapsed (data-model.md, duplicate
// detection). The collator compares letters without case, so "ACME" matches "Acme".
const collator = new Intl.Collator(undefined, { sensitivity: 'accent' });
const squash = (value: string) => value.trim().replace(/\s+/g, ' ');
const same = (a: string, b: string) => collator.compare(squash(a), squash(b)) === 0;

// An open opportunity that looks like the one being added (spec FR-006). Only a warning:
// the user can add it anyway.
export function findPossibleDuplicate(
  candidate: { company: string; title: string },
  existing: Opportunity[],
): Opportunity | undefined {
  return existing.find(
    (o) =>
      o.status === 'OPEN' && same(o.company, candidate.company) && same(o.title, candidate.title),
  );
}

// A follow-up is due on its date and every day after (spec FR-020). Both are YYYY-MM-DD,
// which compare correctly as strings.
export function isFollowUpDue(followUpDate: string | null | undefined, today: string): boolean {
  return followUpDate != null && followUpDate <= today;
}

// Today as YYYY-MM-DD in the device's own time zone, which is what "today" means to the user.
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
