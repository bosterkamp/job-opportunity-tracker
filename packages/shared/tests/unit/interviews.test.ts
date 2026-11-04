// @module-tag interview
import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_MESSAGES,
  interviewCountText,
  interviewDateProblem,
  MAX_INTERVIEWS,
  timeline,
} from '../../src/interviews.js';
import {
  InterviewInputSchema,
  InterviewPatchSchema,
  InterviewSchema,
  OpportunitySchema,
} from '../../src/schemas.js';

function issuesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('interview input', () => {
  it('needs nothing: the date defaults to now and the note is optional', () => {
    expect(InterviewInputSchema.parse({})).toEqual({});
  });

  it('accepts a date with a time zone and trims the note', () => {
    expect(
      InterviewInputSchema.parse({ heldAt: '2026-10-20T12:00:00-05:00', note: '  Panel ' }),
    ).toEqual({ heldAt: '2026-10-20T12:00:00-05:00', note: 'Panel' });
  });

  it('drops a blank note when adding, and clears it when editing', () => {
    expect(InterviewInputSchema.parse({ note: '   ' })).toEqual({});
    expect(InterviewPatchSchema.parse({ note: ' ' })).toEqual({ note: null });
    expect(InterviewPatchSchema.parse({ note: null })).toEqual({ note: null });
    expect(InterviewPatchSchema.parse({})).toEqual({});
  });

  it.each([
    ['create', InterviewInputSchema],
    ['edit', InterviewPatchSchema],
  ] as const)('limits the note to 200 characters (%s)', (_mode, schema) => {
    expect(schema.safeParse({ note: 'x'.repeat(200) }).success).toBe(true);
    expect(issuesFor(schema.safeParse({ note: 'x'.repeat(201) }))).toEqual([
      { path: 'note', message: 'Must be 200 characters or fewer' },
    ]);
  });

  it.each([
    ['create', InterviewInputSchema],
    ['edit', InterviewPatchSchema],
  ] as const)('needs a date and time with a time zone (%s)', (_mode, schema) => {
    for (const heldAt of ['2026-10-20', '2026-10-20T12:00:00', 'today', null]) {
      expect(issuesFor(schema.safeParse({ heldAt }))).toEqual([
        { path: 'heldAt', message: 'Use a date and time with a time zone' },
      ]);
    }
  });

  it('rejects unknown fields', () => {
    expect(issuesFor(InterviewInputSchema.safeParse({ kind: 'Panel' }))).toEqual([
      { path: '', message: 'Unknown field: kind' },
    ]);
    expect(issuesFor(InterviewPatchSchema.safeParse({ kind: 'Panel' }))).toEqual([
      { path: '', message: 'Unknown field: kind' },
    ]);
  });
});

describe('interview responses', () => {
  const interview = {
    id: 'i1',
    heldAt: '2026-10-20T12:00:00.000Z',
    note: null,
    recordedAt: '2026-10-20T12:00:00.000Z',
  };

  it('parses an interview, with or without the Claude mark', () => {
    expect(InterviewSchema.parse(interview)).toEqual(interview);
    expect(InterviewSchema.parse({ ...interview, via: 'CLAUDE' }).via).toBe('CLAUDE');
    expect(InterviewSchema.safeParse({ ...interview, via: 'WEB' }).success).toBe(false);
  });

  it('gives an opportunity an optional count from 0 to 6', () => {
    const opportunity = {
      id: 'o',
      company: 'Acme',
      title: 'Engineer',
      stage: 'INTERVIEWING',
      status: 'OPEN',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
      lastStageChangeAt: '2026-10-01T12:00:00.000Z',
      changeCount: 1,
    };
    expect(OpportunitySchema.parse(opportunity).interviewCount).toBeUndefined();
    for (const interviewCount of [0, 6]) {
      expect(OpportunitySchema.parse({ ...opportunity, interviewCount }).interviewCount).toBe(
        interviewCount,
      );
    }
    for (const interviewCount of [-1, 7, 1.5]) {
      expect(OpportunitySchema.safeParse({ ...opportunity, interviewCount }).success).toBe(false);
    }
  });
});

describe('the rules', () => {
  it('allows at most 6 interviews, with the messages from the data model', () => {
    expect(MAX_INTERVIEWS).toBe(6);
    expect(INTERVIEW_MESSAGES).toEqual({
      FUTURE: "The date can't be in the future",
      BEFORE_DATE_ADDED: "An interview can't be before the date added",
      LIMIT: 'This opportunity already has 6 interviews, the most it can have',
      NOT_FOUND: 'Interview not found',
    });
  });

  const now = new Date('2026-10-20T15:00:00.000Z');
  const createdAt = '2026-09-01T12:00:00.000Z';

  it('accepts now, up to a minute of clock skew, and the moment it was added', () => {
    expect(interviewDateProblem(now.toISOString(), now, createdAt)).toBeUndefined();
    expect(interviewDateProblem('2026-10-20T15:01:00.000Z', now, createdAt)).toBeUndefined();
    expect(interviewDateProblem(createdAt, now, createdAt)).toBeUndefined();
  });

  it('refuses the future, and a date before the date added', () => {
    expect(interviewDateProblem('2026-10-20T15:01:00.001Z', now, createdAt)).toBe(
      "The date can't be in the future",
    );
    expect(interviewDateProblem('2026-09-01T11:59:59.999Z', now, createdAt)).toBe(
      "An interview can't be before the date added",
    );
  });

  it('checks the future first', () => {
    expect(interviewDateProblem('2027-01-01T00:00:00.000Z', now, '2027-06-01T00:00:00.000Z')).toBe(
      INTERVIEW_MESSAGES.FUTURE,
    );
  });
});

describe('interviewCountText', () => {
  it.each([
    [undefined, undefined],
    [null, undefined],
    [0, undefined],
    [1, '1 interview'],
    [2, '2 interviews'],
    [6, '6 interviews'],
  ])('shows %s as %j', (count, text) => {
    expect(interviewCountText(count)).toBe(text);
  });
});

describe('timeline', () => {
  const change = (seq: number, changedAt: string, recordedAt = changedAt) => ({
    seq,
    fromStage: null,
    toStage: 'APPLIED' as const,
    changedAt,
    note: null,
    recordedAt,
  });
  const interview = (id: string, heldAt: string, recordedAt = heldAt) => ({
    id,
    heldAt,
    note: null,
    recordedAt,
  });

  it('merges stage changes and interviews, oldest first', () => {
    const entries = timeline({
      history: [change(1, '2026-10-01T12:00:00.000Z'), change(2, '2026-10-10T12:00:00.000Z')],
      interviews: [
        interview('b', '2026-10-12T12:00:00.000Z'),
        interview('a', '2026-10-05T12:00:00.000Z'),
      ],
    });

    expect(
      entries.map((e) => (e.kind === 'stage' ? `stage ${e.change.seq}` : e.interview.id)),
    ).toEqual(['stage 1', 'a', 'stage 2', 'b']);
    expect(entries.map((e) => e.at)).toEqual([
      '2026-10-01T12:00:00.000Z',
      '2026-10-05T12:00:00.000Z',
      '2026-10-10T12:00:00.000Z',
      '2026-10-12T12:00:00.000Z',
    ]);
  });

  it('orders entries on the same moment by when they were recorded', () => {
    const at = '2026-10-05T12:00:00.000Z';
    const entries = timeline({
      history: [change(2, at, '2026-10-06T00:00:00.000Z')],
      interviews: [interview('early', at, '2026-10-05T13:00:00.000Z')],
    });

    expect(entries.map((e) => e.kind)).toEqual(['interview', 'stage']);
  });

  it('keeps the history order for entries recorded at the same moment', () => {
    const at = '2026-10-05T12:00:00.000Z';
    const entries = timeline({
      history: [change(1, at), change(2, at)],
      interviews: [interview('i', at)],
    });

    expect(entries.map((e) => (e.kind === 'stage' ? e.change.seq : e.interview.id))).toEqual([
      1,
      2,
      'i',
    ]);
  });

  it('gives just the stage changes when there are no interviews', () => {
    expect(timeline({ history: [change(1, '2026-10-01T12:00:00.000Z')] })).toHaveLength(1);
  });
});
