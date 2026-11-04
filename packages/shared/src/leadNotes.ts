import type { LeadNote } from './schemas.js';
import { CLOCK_SKEW_MS } from './transitions.js';

// Notes on networking leads (feature 011): one dated note for each conversation with a lead.
export const MAX_LEAD_NOTES = 200;
export const MAX_NOTE_LENGTH = 5000;

export const LEAD_NOTE_MESSAGES = {
  TEXT_REQUIRED: 'Write a note',
  FUTURE: "A note can't be dated in the future",
  LIMIT: `This lead already has ${MAX_LEAD_NOTES} notes, the most it can have`,
  NOT_FOUND: 'Note not found',
} as const;

// What's wrong with a note's date, or undefined: not in the future (allowing the same clock
// skew as a stage change). There's no earliest date: conversations often came before the lead
// was entered.
export function noteDateProblem(heldAt: string, now: Date): string | undefined {
  return Date.parse(heldAt) > now.getTime() + CLOCK_SKEW_MS ? LEAD_NOTE_MESSAGES.FUTURE : undefined;
}

// Newest conversation first; on the same moment, the most recently added first. ISO
// timestamps in UTC compare correctly as strings.
export function byNewestNote(
  a: Pick<LeadNote, 'heldAt' | 'createdAt'>,
  b: Pick<LeadNote, 'heldAt' | 'createdAt'>,
): number {
  return b.heldAt.localeCompare(a.heldAt) || b.createdAt.localeCompare(a.createdAt);
}
