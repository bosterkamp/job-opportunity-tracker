import type { Interview, StageChange } from './schemas.js';

// Interviews for an opportunity (feature 005). Since feature 012 each can have details and
// interviewers, and can be added ahead of time: an interview whose time hasn't come is
// upcoming, and only past ones count.

export const MAX_INTERVIEWS = 6;
export const MAX_INTERVIEWERS = 10;

export const INTERVIEW_MESSAGES = {
  TOO_FAR_AHEAD: "An interview can't be more than a year ahead",
  BEFORE_DATE_ADDED: "An interview can't be before the date added",
  LIMIT: `This opportunity already has ${MAX_INTERVIEWS} interviews, the most it can have`,
  NOT_FOUND: 'Interview not found',
  TOO_MANY_INTERVIEWERS: `An interview can have at most ${MAX_INTERVIEWERS} interviewers`,
  LINKEDIN: 'Enter a LinkedIn profile address',
} as const;

// The choices on an interview (feature 012), in the order the form offers them.
const KINDS = {
  HR: 'HR / talent advisor',
  HIRING_MANAGER: 'Hiring manager',
  BUSINESS: 'Business',
  ENGINEERING: 'Engineering',
  OTHER: 'Other',
} as const;
const FORMATS = { PHONE: 'Phone', VIDEO: 'Video', IN_PERSON: 'In person' } as const;
const OUTCOMES = {
  WENT_WELL: 'Went well',
  NOT_SURE: 'Not sure',
  WENT_BADLY: 'Went badly',
} as const;

export type InterviewKind = keyof typeof KINDS;
export type InterviewFormat = keyof typeof FORMATS;
export type InterviewOutcome = keyof typeof OUTCOMES;

const keysOf = <T extends object>(labels: T) =>
  Object.keys(labels) as unknown as readonly [keyof T & string, ...(keyof T & string)[]];

export const INTERVIEW_KINDS = keysOf(KINDS);
export const INTERVIEW_FORMATS = keysOf(FORMATS);
export const INTERVIEW_OUTCOMES = keysOf(OUTCOMES);

export const interviewKindLabel = (kind: InterviewKind): string => KINDS[kind];
export const interviewFormatLabel = (format: InterviewFormat): string => FORMATS[format];
export const interviewOutcomeLabel = (outcome: InterviewOutcome): string => OUTCOMES[outcome];

// A LinkedIn profile: https, on linkedin.com or one of its subdomains, under /in/, with no
// spaces. The host must be followed straight by the path, so a user name, a port, or a host
// such as linkedin.com.example.org doesn't pass. The value is checked once `https://` has
// been added to an address typed without it.
const LINKEDIN_PROFILE = /^https:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#\s]\S*$/i;

export const isLinkedInProfile = (value: string): boolean => LINKEDIN_PROFILE.test(value);

// An address typed without a scheme ("linkedin.com/in/someone") gets https.
export const withHttps = (value: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;

// Past once its time has come: an interview at exactly now has happened.
export const isPastInterview = (heldAt: string, now: Date): boolean =>
  Date.parse(heldAt) <= now.getTime();

// The same moment a calendar year later.
function aYearAfter(now: Date): number {
  const later = new Date(now.getTime());
  later.setUTCFullYear(later.getUTCFullYear() + 1);
  return later.getTime();
}

// What's wrong with an interview's date, or undefined: at most a year ahead (feature 012),
// and not before the opportunity was added.
export function interviewDateProblem(
  heldAt: string,
  now: Date,
  createdAt: string,
): string | undefined {
  const at = Date.parse(heldAt);
  if (at > aYearAfter(now)) {
    return INTERVIEW_MESSAGES.TOO_FAR_AHEAD;
  }
  return at < Date.parse(createdAt) ? INTERVIEW_MESSAGES.BEFORE_DATE_ADDED : undefined;
}

// The card's badge: "1 completed interview", "3 completed interviews", or nothing when there are
// none. "Completed" sets it apart from the upcoming one the card also shows (feature 012).
export function interviewCountText(count: number | null | undefined): string | undefined {
  if (!count) {
    return undefined;
  }
  return count === 1 ? '1 completed interview' : `${count} completed interviews`;
}

// How many interviews have happened and when the next one is, from the times an opportunity
// keeps (feature 012). Interviews stored before the times were kept have no entry, and were
// all in the past (future dates weren't allowed), so the count's remainder is held.
export function interviewSummary(
  o: { interviewCount?: number | null; interviewTimes?: readonly string[] },
  now: Date,
): { held: number; nextAt: string | undefined } {
  const times = o.interviewTimes ?? [];
  const upcoming = times.filter((at) => !isPastInterview(at, now));
  const nextAt = [...upcoming].sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return { held: (o.interviewCount ?? 0) - upcoming.length, nextAt };
}

const byTimeThenRecorded = (a: Interview, b: Interview) =>
  Date.parse(a.heldAt) - Date.parse(b.heldAt) || a.recordedAt.localeCompare(b.recordedAt);

// The Interviews section (feature 012): upcoming soonest first, then past newest first.
export function interviewSections(
  interviews: readonly Interview[] | undefined,
  now: Date,
): { upcoming: Interview[]; past: Interview[] } {
  const all = [...(interviews ?? [])].sort(byTimeThenRecorded);
  return {
    upcoming: all.filter((i) => !isPastInterview(i.heldAt, now)),
    past: all.filter((i) => isPastInterview(i.heldAt, now)).reverse(),
  };
}

export type TimelineEntry =
  | { kind: 'stage'; at: string; recordedAt: string; change: StageChange }
  | { kind: 'interview'; at: string; recordedAt: string; interview: Interview };

// The history as the owner reads it: stage changes and past interviews together, oldest first
// by date, then by when they were recorded. Entries that tie keep the history's own order.
// Upcoming interviews aren't history yet (feature 012).
export function timeline(
  o: { history: readonly StageChange[]; interviews?: readonly Interview[] },
  now: Date,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...o.history.map((change) => ({
      kind: 'stage' as const,
      at: change.changedAt,
      recordedAt: change.recordedAt,
      change,
    })),
    ...(o.interviews ?? [])
      .filter((interview) => isPastInterview(interview.heldAt, now))
      .map((interview) => ({
        kind: 'interview' as const,
        at: interview.heldAt,
        recordedAt: interview.recordedAt,
        interview,
      })),
  ];
  return entries.sort(
    (a, b) => a.at.localeCompare(b.at) || a.recordedAt.localeCompare(b.recordedAt),
  );
}
