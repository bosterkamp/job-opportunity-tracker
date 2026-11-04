import {
  OPEN_STAGES,
  localDate,
  salaryReach,
  stageLabel,
  type Opportunity,
  type Stage,
} from '@jot/shared';
import { formatShortCalendarDate } from '../../format';

// Pure helpers behind the overview and archive (spec FR-017–FR-019). Everything happens in
// the browser on the already-loaded list, which stays fast at this scale (SC-004).

// A column on the board (a tab on phones): an open stage, or every closed opportunity
// together (feature 004).
export type BoardKey = Stage | 'CLOSED';

export interface BoardGroup {
  key: BoardKey;
  label: string;
  items: Opportunity[];
}

export type StageFilter = BoardKey | 'ALL';

// The board's groups, in display order, including empty ones (they still get a column): every
// open stage then Closed, or just the one the stage filter picks.
export function boardGroups(
  open: Opportunity[],
  closed: Opportunity[],
  filter: StageFilter = 'ALL',
): BoardGroup[] {
  const stages = filter === 'ALL' ? OPEN_STAGES : OPEN_STAGES.filter((s) => s === filter);
  const groups: BoardGroup[] = stages.map((stage) => ({
    key: stage,
    label: stageLabel(stage),
    items: open.filter((o) => o.stage === stage),
  }));
  return filter === 'ALL' || filter === 'CLOSED'
    ? [...groups, { key: 'CLOSED', label: 'Closed', items: closed }]
    : groups;
}

export type SortKey =
  'closing' | 'recent' | 'stale' | 'interest' | 'added' | 'salary-min' | 'salary-max';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'closing', label: 'Closing soonest' },
  { value: 'recent', label: 'Recently changed' },
  { value: 'stale', label: 'Waiting longest' },
  { value: 'interest', label: 'Interest' },
  { value: 'added', label: 'Date added' },
  { value: 'salary-min', label: 'Salary (minimum)' },
  { value: 'salary-max', label: 'Salary (maximum)' },
];

// ISO timestamps in UTC compare correctly as strings.
const newestChangeFirst = (a: Opportunity, b: Opportunity) =>
  b.lastStageChangeAt.localeCompare(a.lastStageChangeAt);

// High to low; no value sorts last (0 is a real value, so missing counts as -1). Ties: newest
// change.
const bySalary =
  (end: 'salaryMin' | 'salaryMax') =>
  (a: Opportunity, b: Opportunity): number =>
    (b[end] ?? -1) - (a[end] ?? -1) || newestChangeFirst(a, b);

// Closing soonest (feature 009, data-model.md): postings still up, soonest first; then those
// without a date; then those that have ended, most recently first. Ties: newest change.
const closingSoonest = (today: string) => {
  // [group, date]: 0 still up, 1 no date, 2 ended.
  const rank = (o: Opportunity): [number, string] =>
    // Stryker disable next-line StringLiteral: undated ones are only compared with each other
    !o.postedUntil ? [1, ''] : [o.postedUntil >= today ? 0 : 2, o.postedUntil];
  return (a: Opportunity, b: Opportunity): number => {
    const [ga, da] = rank(a);
    const [gb, db] = rank(b);
    const dates = ga === 2 ? db.localeCompare(da) : da.localeCompare(db);
    return ga - gb || dates || newestChangeFirst(a, b);
  };
};

type Comparator = (a: Opportunity, b: Opportunity) => number;

const COMPARATORS: Record<Exclude<SortKey, 'closing'>, Comparator> = {
  recent: newestChangeFirst,
  stale: (a, b) => a.lastStageChangeAt.localeCompare(b.lastStageChangeAt),
  // High to low; unrated (null or missing) counts as 0, so it sorts last. Ties: newest change.
  interest: (a, b) => (b.interest ?? 0) - (a.interest ?? 0) || newestChangeFirst(a, b),
  added: (a, b) => b.createdAt.localeCompare(a.createdAt),
  'salary-min': bySalary('salaryMin'),
  'salary-max': bySalary('salaryMax'),
};

// "Today" is the device's date; Closing soonest needs it to tell ended postings apart.
export function sortBy(
  items: Opportunity[],
  key: SortKey,
  today: string = localDate(),
): Opportunity[] {
  return [...items].sort(key === 'closing' ? closingSoonest(today) : COMPARATORS[key]);
}

// The "Salary at least" choices (research.md §4).
export const SALARY_FILTERS: readonly number[] = [
  50_000, 75_000, 100_000, 125_000, 150_000, 175_000, 200_000, 250_000, 300_000,
];

// Opportunities whose range reaches the amount: the maximum, or the minimum when there's no
// maximum. Those without a salary are hidden while the filter is on, and counted, so the board
// can say so. No amount keeps everything.
export function filterBySalary(
  items: Opportunity[],
  atLeast: number | null,
): { items: Opportunity[]; hiddenWithoutSalary: number } {
  if (atLeast === null) {
    return { items, hiddenWithoutSalary: 0 };
  }
  const reaches = items.map((o) => [o, salaryReach(o)] as const);
  return {
    items: reaches.filter(([, reach]) => reach !== undefined && reach >= atLeast).map(([o]) => o),
    hiddenWithoutSalary: reaches.filter(([, reach]) => reach === undefined).length,
  };
}

// Case-insensitive match on company or job title (FR-019). An empty query matches everything,
// because every string includes ''.
export function search(items: Opportunity[], query: string): Opportunity[] {
  const needle = query.trim().toLowerCase();
  return items.filter(
    (o) => o.company.toLowerCase().includes(needle) || o.title.toLowerCase().includes(needle),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

// "today", "yesterday", "3 days ago", "2 weeks ago", "2 months ago": how long since the last
// stage change, in the viewer's language.
export function sinceLabel(iso: string, now: Date = new Date(), locale?: string): string {
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (days < 14) {
    return format.format(-days, 'day');
  }
  if (days < 60) {
    return format.format(-Math.floor(days / 7), 'week');
  }
  return format.format(-Math.floor(days / 30), 'month');
}

// Whole days from one calendar date to another (YYYY-MM-DD). Both are read as UTC midnight, so
// daylight-saving changes never make a day longer or shorter.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// How many days ahead "closes soon" starts (feature 009): today and the next 7 days.
export const CLOSING_SOON_DAYS = 7;

export interface PostingDeadline {
  kind: 'open' | 'soon' | 'ended';
  text: string;
}

// What a card says about the date the posting is up until (feature 009, data-model.md), or
// undefined when there's none. "Today" is the device's date.
export function postingDeadline(
  postedUntil: string | null | undefined,
  today: string,
  locale?: string,
): PostingDeadline | undefined {
  if (!postedUntil) {
    return undefined;
  }
  const days = daysBetween(today, postedUntil);
  const date = formatShortCalendarDate(postedUntil, today, locale);
  if (days < 0) {
    return { kind: 'ended', text: `Posting ended ${date}` };
  }
  if (days > CLOSING_SOON_DAYS) {
    return { kind: 'open', text: `Open until ${date}` };
  }
  const text =
    days === 0 ? 'Closes today' : days === 1 ? 'Closes tomorrow' : `Closes in ${days} days`;
  return { kind: 'soon', text };
}
