import type { Interview, StageChange } from './schemas.js';
import { CLOCK_SKEW_MS } from './transitions.js';

// Interviews the owner has had for an opportunity (feature 005). Each is logged after it
// happens, so every one counts as completed.

export const MAX_INTERVIEWS = 6;

export const INTERVIEW_MESSAGES = {
  FUTURE: "The date can't be in the future",
  BEFORE_DATE_ADDED: "An interview can't be before the date added",
  LIMIT: `This opportunity already has ${MAX_INTERVIEWS} interviews, the most it can have`,
  NOT_FOUND: 'Interview not found',
} as const;

// What's wrong with an interview's date, or undefined: not in the future (allowing the same
// clock skew as a stage change), and not before the opportunity was added.
export function interviewDateProblem(
  heldAt: string,
  now: Date,
  createdAt: string,
): string | undefined {
  const at = Date.parse(heldAt);
  if (at > now.getTime() + CLOCK_SKEW_MS) {
    return INTERVIEW_MESSAGES.FUTURE;
  }
  return at < Date.parse(createdAt) ? INTERVIEW_MESSAGES.BEFORE_DATE_ADDED : undefined;
}

// The card's badge: "1 interview", "3 interviews", or nothing when there are none.
export function interviewCountText(count: number | null | undefined): string | undefined {
  if (!count) {
    return undefined;
  }
  return count === 1 ? '1 interview' : `${count} interviews`;
}

export type TimelineEntry =
  | { kind: 'stage'; at: string; recordedAt: string; change: StageChange }
  | { kind: 'interview'; at: string; recordedAt: string; interview: Interview };

// The history as the owner reads it: stage changes and interviews together, oldest first by
// date, then by when they were recorded. Entries that tie keep the history's own order.
export function timeline(o: {
  history: readonly StageChange[];
  interviews?: readonly Interview[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...o.history.map((change) => ({
      kind: 'stage' as const,
      at: change.changedAt,
      recordedAt: change.recordedAt,
      change,
    })),
    ...(o.interviews ?? []).map((interview) => ({
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
