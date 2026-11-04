// @module-tag leads
import { describe, expect, it } from 'vitest';
import {
  LEAD_NOTE_MESSAGES,
  MAX_LEAD_NOTES,
  byNewestNote,
  noteDateProblem,
} from '../../src/leadNotes.js';
import {
  LeadNoteInputSchema,
  LeadNotePatchSchema,
  LeadNoteSchema,
  LeadWithOpportunitiesSchema,
} from '../../src/schemas.js';
import { CLOCK_SKEW_MS } from '../../src/transitions.js';

// Notes on networking leads (feature 011): a dated note for each conversation.

function issuesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

const note = {
  id: '01JNOTE',
  leadId: '01JLEAD',
  heldAt: '2026-10-30T17:00:00.000Z',
  text: 'Coffee chat.\nShe will intro me to Acme.',
  createdAt: '2026-10-30T18:00:00.000Z',
  updatedAt: '2026-10-30T18:00:00.000Z',
};

describe('the limits and messages', () => {
  it('allows 200 notes a lead, and says so when full', () => {
    expect(MAX_LEAD_NOTES).toBe(200);
    expect(LEAD_NOTE_MESSAGES).toEqual({
      TEXT_REQUIRED: 'Write a note',
      FUTURE: "A note can't be dated in the future",
      LIMIT: 'This lead already has 200 notes, the most it can have',
      NOT_FOUND: 'Note not found',
    });
  });
});

describe('LeadNoteInputSchema', () => {
  it('keeps the text with its line breaks, trimmed at the ends, and an optional date', () => {
    expect(
      LeadNoteInputSchema.parse({ text: '  Line one\n\nLine two \n', heldAt: note.heldAt }),
    ).toEqual({ text: 'Line one\n\nLine two', heldAt: note.heldAt });
    expect(LeadNoteInputSchema.parse({ text: 'Call' })).toEqual({ text: 'Call' });
  });

  it.each([undefined, '', '   \n '])('refuses a missing or blank text (%j)', (text) => {
    expect(issuesFor(LeadNoteInputSchema.safeParse({ text }))).toEqual([
      { path: 'text', message: 'Write a note' },
    ]);
  });

  it('allows 5,000 characters, and refuses more', () => {
    expect(LeadNoteInputSchema.safeParse({ text: 'x'.repeat(5000) }).success).toBe(true);
    expect(issuesFor(LeadNoteInputSchema.safeParse({ text: 'x'.repeat(5001) }))).toEqual([
      { path: 'text', message: 'Must be 5000 characters or fewer' },
    ]);
  });

  it('refuses a date that is not a timestamp, and any other field', () => {
    expect(issuesFor(LeadNoteInputSchema.safeParse({ text: 'x', heldAt: '2026-10-30' }))).toEqual([
      { path: 'heldAt', message: 'Use a date and time with a time zone' },
    ]);
    expect(issuesFor(LeadNoteInputSchema.safeParse({ text: 'x', title: 'Call' }))).toEqual([
      { path: '', message: 'Unknown field: title' },
    ]);
  });
});

describe('LeadNotePatchSchema', () => {
  it('takes only what changes', () => {
    expect(LeadNotePatchSchema.parse({})).toEqual({});
    expect(LeadNotePatchSchema.parse({ text: ' New ' })).toEqual({ text: 'New' });
    expect(LeadNotePatchSchema.parse({ heldAt: note.heldAt })).toEqual({ heldAt: note.heldAt });
  });

  it("can't clear the text, and refuses any other field", () => {
    expect(issuesFor(LeadNotePatchSchema.safeParse({ text: ' ' }))).toEqual([
      { path: 'text', message: 'Write a note' },
    ]);
    expect(issuesFor(LeadNotePatchSchema.safeParse({ text: null }))).toEqual([
      { path: 'text', message: 'Write a note' },
    ]);
    expect(issuesFor(LeadNotePatchSchema.safeParse({ leadId: 'other' }))).toEqual([
      { path: '', message: 'Unknown field: leadId' },
    ]);
  });
});

describe('noteDateProblem', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');

  it('allows now and the past, however long ago', () => {
    expect(noteDateProblem(now.toISOString(), now)).toBeUndefined();
    expect(noteDateProblem('2019-01-01T12:00:00.000Z', now)).toBeUndefined();
  });

  it('allows the clock skew a stage change allows, and refuses later', () => {
    const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

    expect(noteDateProblem(at(CLOCK_SKEW_MS), now)).toBeUndefined();
    expect(noteDateProblem(at(CLOCK_SKEW_MS + 1), now)).toBe("A note can't be dated in the future");
  });
});

describe('byNewestNote', () => {
  it('puts the newest date first, and the newest added first on the same date', () => {
    const older = { ...note, id: 'a', heldAt: '2026-10-01T17:00:00.000Z' };
    const first = { ...note, id: 'b', createdAt: '2026-10-30T18:00:00.000Z' };
    const second = { ...note, id: 'c', createdAt: '2026-10-30T19:00:00.000Z' };

    expect([older, first, second].sort(byNewestNote).map((n) => n.id)).toEqual(['c', 'b', 'a']);
    expect(byNewestNote(first, first)).toBe(0);
  });
});

describe('the note as the API answers it', () => {
  it('parses a note', () => {
    expect(LeadNoteSchema.parse(note)).toEqual(note);
  });

  it('comes with each lead in the list', () => {
    const lead = {
      id: '01JLEAD',
      name: 'Dana Ruiz',
      createdAt: '2026-10-31T15:00:00.000Z',
      updatedAt: '2026-10-31T15:00:00.000Z',
      opportunities: [],
      notes: [note],
    };

    expect(LeadWithOpportunitiesSchema.parse(lead)).toEqual(lead);
    expect(LeadWithOpportunitiesSchema.safeParse({ ...lead, notes: undefined }).success).toBe(
      false,
    );
  });
});
