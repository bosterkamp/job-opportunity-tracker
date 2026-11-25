// @module-tag interview
import { describe, expect, it } from 'vitest';
import {
  interviewFormatLabel,
  interviewKindLabel,
  interviewOutcomeLabel,
  interviewSections,
  interviewSummary,
  MAX_INTERVIEWERS,
} from '../../src/interviews.js';
import {
  InterviewInputSchema,
  InterviewPatchSchema,
  InterviewSchema,
  OpportunitySchema,
} from '../../src/schemas.js';

// Feature 012: an interview's details and interviewers, and upcoming interviews.

function issuesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

const full = {
  heldAt: '2026-11-12T19:00:00.000Z',
  note: 'Bring the portfolio',
  kind: 'HIRING_MANAGER',
  panel: true,
  format: 'VIDEO',
  outcome: 'WENT_WELL',
  nextSteps: 'Decision by Friday',
  interviewers: [
    {
      name: 'Priya Shah',
      title: 'Engineering Manager',
      email: 'priya@acme.example',
      phone: '+1 555 0100',
      linkedin: 'https://www.linkedin.com/in/priya-shah',
    },
    { name: 'Tom Lee' },
  ],
};

describe('interview details', () => {
  it('keeps every new field when adding', () => {
    expect(InterviewInputSchema.parse(full)).toEqual(full);
  });

  it('trims text, and drops blank optional text when adding', () => {
    expect(
      InterviewInputSchema.parse({
        nextSteps: '  Call back  ',
        interviewers: [{ name: ' Dana ', title: ' ', email: '', phone: ' ', linkedin: '' }],
      }),
    ).toEqual({ nextSteps: 'Call back', interviewers: [{ name: 'Dana' }] });
    expect(InterviewInputSchema.parse({ nextSteps: '   ' })).toEqual({});
  });

  it('drops an empty list of interviewers, and null values, when adding', () => {
    expect(InterviewInputSchema.parse({ interviewers: null })).toEqual({});
    expect(
      InterviewInputSchema.parse({
        interviewers: [],
        kind: null,
        panel: null,
        format: null,
        outcome: null,
      }),
    ).toEqual({});
  });

  it.each([
    [
      'kind',
      'RECRUITER',
      'Choose HR / talent advisor, hiring manager, business, engineering, or other',
    ],
    ['format', 'EMAIL', 'Choose phone, video, or in person'],
    ['outcome', 'GREAT', 'Choose went well, not sure, or went badly'],
    ['panel', 'yes', 'Choose yes or no'],
  ])('refuses an unknown %s', (field, value, message) => {
    for (const schema of [InterviewInputSchema, InterviewPatchSchema]) {
      expect(issuesFor(schema.safeParse({ [field]: value }))).toEqual([{ path: field, message }]);
    }
  });

  it('limits next steps to 500 characters', () => {
    expect(InterviewInputSchema.safeParse({ nextSteps: 'x'.repeat(500) }).success).toBe(true);
    expect(issuesFor(InterviewPatchSchema.safeParse({ nextSteps: 'x'.repeat(501) }))).toEqual([
      { path: 'nextSteps', message: 'Must be 500 characters or fewer' },
    ]);
  });

  it('allows at most 10 interviewers', () => {
    expect(MAX_INTERVIEWERS).toBe(10);
    const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
    expect(InterviewInputSchema.safeParse({ interviewers: people(10) }).success).toBe(true);
    for (const schema of [InterviewInputSchema, InterviewPatchSchema]) {
      expect(issuesFor(schema.safeParse({ interviewers: people(11) }))).toEqual([
        { path: 'interviewers', message: 'An interview can have at most 10 interviewers' },
      ]);
    }
  });

  it('needs a name for each interviewer, and checks their details', () => {
    expect(
      issuesFor(
        InterviewInputSchema.safeParse({
          interviewers: [
            { name: '  ', title: 'x'.repeat(101) },
            { name: 'x'.repeat(101), email: 'not an email', phone: '1'.repeat(51) },
            { email: `${'x'.repeat(250)}@a.co` },
          ],
        }),
      ),
    ).toEqual([
      { path: 'interviewers.0.name', message: 'Name is required' },
      { path: 'interviewers.0.title', message: 'Must be 100 characters or fewer' },
      { path: 'interviewers.1.name', message: 'Must be 100 characters or fewer' },
      { path: 'interviewers.1.email', message: 'Enter a valid email address' },
      { path: 'interviewers.1.phone', message: 'Must be 50 characters or fewer' },
      { path: 'interviewers.2.name', message: 'Name is required' },
      { path: 'interviewers.2.email', message: 'Must be 254 characters or fewer' },
    ]);
  });

  it('keeps the longest details allowed', () => {
    const longest = {
      name: 'n'.repeat(100),
      title: 't'.repeat(100),
      email: `${'x'.repeat(249)}@a.co`,
      phone: '1'.repeat(50),
    };
    expect(InterviewInputSchema.parse({ interviewers: [longest] })).toEqual({
      interviewers: [longest],
    });
  });

  it('refuses unknown interviewer fields', () => {
    expect(
      issuesFor(InterviewInputSchema.safeParse({ interviewers: [{ name: 'A', role: 'x' }] })),
    ).toEqual([{ path: 'interviewers.0', message: 'Unknown field: role' }]);
  });

  it('refuses unknown fields on the interview, as before', () => {
    expect(issuesFor(InterviewPatchSchema.safeParse({ type: 'HR' }))).toEqual([
      { path: '', message: 'Unknown field: type' },
    ]);
  });

  it('changes or clears each new field when editing', () => {
    expect(
      InterviewPatchSchema.parse({
        kind: 'BUSINESS',
        panel: false,
        format: 'IN_PERSON',
        outcome: 'NOT_SURE',
        nextSteps: ' Wait ',
        interviewers: [{ name: 'A', title: ' ' }],
      }),
    ).toEqual({
      kind: 'BUSINESS',
      panel: false,
      format: 'IN_PERSON',
      outcome: 'NOT_SURE',
      nextSteps: 'Wait',
      interviewers: [{ name: 'A' }],
    });
    expect(
      InterviewPatchSchema.parse({
        kind: null,
        panel: null,
        format: null,
        outcome: null,
        nextSteps: ' ',
        interviewers: null,
      }),
    ).toEqual({
      kind: null,
      panel: null,
      format: null,
      outcome: null,
      nextSteps: null,
      interviewers: null,
    });
    expect(InterviewPatchSchema.parse({ interviewers: [] })).toEqual({ interviewers: null });
    expect(InterviewPatchSchema.parse({})).toEqual({});
  });

  it('checks each interviewer when editing too', () => {
    expect(issuesFor(InterviewPatchSchema.safeParse({ interviewers: [{ name: '' }] }))).toEqual([
      { path: 'interviewers.0.name', message: 'Name is required' },
    ]);
  });

  it('parses a stored interview with its details', () => {
    const stored = { id: 'i1', recordedAt: '2026-11-01T00:00:00.000Z', ...full };
    expect(InterviewSchema.parse(stored)).toEqual(stored);
  });

  it('gives an opportunity its interview times', () => {
    const opportunity = OpportunitySchema.parse({
      id: 'o1',
      company: 'Acme',
      title: 'Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      lastStageChangeAt: '2026-10-01T00:00:00.000Z',
      changeCount: 1,
      interviewCount: 2,
      interviewTimes: ['2026-10-20T15:00:00.000Z', '2026-11-12T19:00:00.000Z'],
    });
    expect(opportunity.interviewTimes).toEqual([
      '2026-10-20T15:00:00.000Z',
      '2026-11-12T19:00:00.000Z',
    ]);
  });

  it('labels the values as the data model does', () => {
    expect(
      (['HR', 'HIRING_MANAGER', 'BUSINESS', 'ENGINEERING', 'OTHER'] as const).map((kind) =>
        interviewKindLabel(kind),
      ),
    ).toEqual(['HR / talent advisor', 'Hiring manager', 'Business', 'Engineering', 'Other']);
    expect(
      (['PHONE', 'VIDEO', 'IN_PERSON'] as const).map((format) => interviewFormatLabel(format)),
    ).toEqual(['Phone', 'Video', 'In person']);
    expect(
      (['WENT_WELL', 'NOT_SURE', 'WENT_BADLY'] as const).map((outcome) =>
        interviewOutcomeLabel(outcome),
      ),
    ).toEqual(['Went well', 'Not sure', 'Went badly']);
  });
});

describe('LinkedIn profile addresses', () => {
  const linkedin = (value: string) =>
    InterviewInputSchema.safeParse({ interviewers: [{ name: 'A', linkedin: value }] });

  it.each([
    ['https://www.linkedin.com/in/someone', 'https://www.linkedin.com/in/someone'],
    ['https://linkedin.com/in/someone/', 'https://linkedin.com/in/someone/'],
    ['https://uk.linkedin.com/in/x', 'https://uk.linkedin.com/in/x'],
    ['  linkedin.com/in/someone ', 'https://linkedin.com/in/someone'],
    ['www.linkedin.com/in/someone?trk=x', 'https://www.linkedin.com/in/someone?trk=x'],
    ['HTTPS://LinkedIn.com/in/Someone', 'HTTPS://LinkedIn.com/in/Someone'],
    ['https://a.b.linkedin.com/in/x', 'https://a.b.linkedin.com/in/x'],
    ['linkedin.com/in/a:b', 'https://linkedin.com/in/a:b'],
  ])('keeps %j', (value, kept) => {
    const result = linkedin(value);
    expect(result.success && result.data.interviewers?.[0]?.linkedin).toBe(kept);
  });

  it.each([
    'http://linkedin.com/in/x',
    'https://linkedin.com/company/x',
    'https://linkedin.com/in/',
    'https://linkedin.com/inbox/x',
    'https://notlinkedin.com/in/x',
    'https://linkedin.com.evil.example/in/x',
    'https://user@linkedin.com/in/x',
    'https://linkedin.com:8443/in/x',
    'https://linkedin.com/in/a b',
    'https://evil.example/https://linkedin.com/in/x',
    'evil.example/https://linkedin.com/in/x',
    'https://linkedin.com/in//x',
    'https://linkedin.com/in/?x',
    'https://linkedin.com/in/#x',
    'linkedin',
    'javascript:alert(1)',
  ])('refuses %j', (value) => {
    expect(issuesFor(linkedin(value))).toEqual([
      { path: 'interviewers.0.linkedin', message: 'Enter a LinkedIn profile address' },
    ]);
  });

  it('limits the address to 300 characters', () => {
    const ofLength = (n: number) => `https://linkedin.com/in/${'x'.repeat(n - 24)}`;
    expect(linkedin(ofLength(300)).success).toBe(true);
    expect(issuesFor(linkedin(ofLength(301)))).toEqual([
      { path: 'interviewers.0.linkedin', message: 'Must be 300 characters or fewer' },
    ]);
  });

  it('checks it when editing too', () => {
    expect(
      issuesFor(
        InterviewPatchSchema.safeParse({ interviewers: [{ name: 'A', linkedin: 'x.com/in/a' }] }),
      ),
    ).toEqual([{ path: 'interviewers.0.linkedin', message: 'Enter a LinkedIn profile address' }]);
  });
});

describe('interviewSummary', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');

  it('counts times at or before now as held, and finds the soonest later one', () => {
    expect(
      interviewSummary(
        {
          interviewCount: 4,
          interviewTimes: [
            '2026-10-01T12:00:00.000Z',
            '2026-11-10T12:00:00.000Z',
            '2026-11-20T12:00:00.000Z',
            '2026-11-12T12:00:00.000Z',
          ],
        },
        now,
      ),
    ).toEqual({ held: 2, nextAt: '2026-11-12T12:00:00.000Z' });
  });

  it('has no next interview when every one is past', () => {
    expect(
      interviewSummary({ interviewCount: 1, interviewTimes: ['2026-10-01T12:00:00.000Z'] }, now),
    ).toEqual({ held: 1, nextAt: undefined });
  });

  it('counts interviews stored before the times were kept as held', () => {
    expect(interviewSummary({ interviewCount: 3 }, now)).toEqual({ held: 3, nextAt: undefined });
    expect(
      interviewSummary({ interviewCount: 3, interviewTimes: ['2026-12-01T12:00:00.000Z'] }, now),
    ).toEqual({ held: 2, nextAt: '2026-12-01T12:00:00.000Z' });
  });

  it('is nothing for an opportunity without interviews', () => {
    expect(interviewSummary({}, now)).toEqual({ held: 0, nextAt: undefined });
    expect(interviewSummary({ interviewCount: 0, interviewTimes: [] }, now)).toEqual({
      held: 0,
      nextAt: undefined,
    });
  });
});

describe('interviewSections', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  const at = (id: string, heldAt: string, recordedAt = '2026-10-01T00:00:00.000Z') => ({
    id,
    heldAt,
    note: null,
    recordedAt,
  });

  it('puts upcoming first, soonest first, then past, newest first', () => {
    const { upcoming, past } = interviewSections(
      [
        at('old', '2026-10-01T12:00:00.000Z'),
        at('later', '2026-12-01T12:00:00.000Z'),
        at('now', '2026-11-10T12:00:00.000Z'),
        at('soon', '2026-11-11T12:00:00.000Z'),
        at('mid', '2026-10-15T12:00:00.000Z'),
      ],
      now,
    );

    expect(upcoming.map((i) => i.id)).toEqual(['soon', 'later']);
    expect(past.map((i) => i.id)).toEqual(['now', 'mid', 'old']);
  });

  it('orders interviews at the same time by when they were recorded', () => {
    const p = '2026-10-01T12:00:00.000Z';
    const u = '2026-12-01T12:00:00.000Z';
    const { upcoming, past } = interviewSections(
      [
        at('p2', p, '2026-10-02T00:00:00.000Z'),
        at('p1', p, '2026-10-01T00:00:00.000Z'),
        at('u2', u, '2026-10-02T00:00:00.000Z'),
        at('u1', u, '2026-10-01T00:00:00.000Z'),
      ],
      now,
    );

    expect(upcoming.map((i) => i.id)).toEqual(['u1', 'u2']);
    expect(past.map((i) => i.id)).toEqual(['p2', 'p1']);
  });

  it('gives two empty lists when there are no interviews', () => {
    expect(interviewSections(undefined, now)).toEqual({ upcoming: [], past: [] });
  });
});
