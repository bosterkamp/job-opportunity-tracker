import { localDate } from './duplicates.js';
import { CLOCK_SKEW_MS } from './transitions.js';

// The date an opportunity was added (feature 004). It can be set to an earlier day, for
// opportunities found before they were entered, and it dates the first history entry.

export const DATE_ADDED_MESSAGES = {
  FUTURE: "The date can't be in the future",
  AFTER_FIRST_CHANGE: "The date added can't be after the first stage change",
  AFTER_FIRST_INTERVIEW: "The date added can't be after the first interview",
} as const;

interface Change {
  seq: number;
  changedAt: string;
}

interface HeldInterview {
  heldAt: string;
}

// When the opportunity first moved: the earliest change after the one that added it.
// ISO timestamps in UTC compare correctly as strings.
export function firstMoveAt(history: readonly Change[]): string | undefined {
  return history
    .filter((change) => change.seq > 1)
    .map((change) => change.changedAt)
    .sort()[0];
}

// The earliest interview (feature 005).
export function firstInterviewAt(interviews: readonly HeldInterview[]): string | undefined {
  return interviews.map((interview) => interview.heldAt).sort()[0];
}

// What's wrong with a date added, or undefined. It can't be in the future (allowing the same
// clock skew as a stage change), and can't be after the first move or the first interview, so
// the history stays in order.
export function dateAddedProblem(
  createdAt: string,
  now: Date,
  history: readonly Change[] = [],
  interviews: readonly HeldInterview[] = [],
): string | undefined {
  const at = Date.parse(createdAt);
  if (at > now.getTime() + CLOCK_SKEW_MS) {
    return DATE_ADDED_MESSAGES.FUTURE;
  }
  const after = (limit: string | undefined) => limit !== undefined && at > Date.parse(limit);
  if (after(firstMoveAt(history))) {
    return DATE_ADDED_MESSAGES.AFTER_FIRST_CHANGE;
  }
  return after(firstInterviewAt(interviews))
    ? DATE_ADDED_MESSAGES.AFTER_FIRST_INTERVIEW
    : undefined;
}

// The moment to store for a day chosen in a form (YYYY-MM-DD, in the device's time zone): now
// for today, so today's entries keep their order; noon on any other day, so the day shows the
// same wherever it's read nearby. On the day of a bound, it's kept within that bound, so the
// bound's own day is always allowed.
export function dayToTimestamp(
  day: string,
  { notBefore, notAfter }: { notBefore?: string; notAfter?: string },
  now: Date = new Date(),
): string {
  const chosen = day === localDate(now) ? now.getTime() : Date.parse(`${day}T12:00:00`);
  const onDay = (bound: string | undefined, otherwise: number) =>
    bound !== undefined && localDate(new Date(bound)) === day ? Date.parse(bound) : otherwise;
  return new Date(
    Math.min(Math.max(chosen, onDay(notBefore, -Infinity)), onDay(notAfter, Infinity)),
  ).toISOString();
}

// The date added for a chosen day: never later than the first move or the first interview on
// that day.
export function dateAddedTimestamp(
  day: string,
  history: readonly Change[] = [],
  now: Date = new Date(),
  interviews: readonly HeldInterview[] = [],
): string {
  // The earlier of the two. Sorting puts a missing one (undefined) last.
  const [earliest] = [firstMoveAt(history), firstInterviewAt(interviews)].sort();
  return dayToTimestamp(day, { notAfter: earliest }, now);
}
