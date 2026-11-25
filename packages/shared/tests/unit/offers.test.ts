// @module-tag offer
import { describe, expect, it } from 'vitest';
import {
  customKey,
  isOffer,
  isScoreKey,
  OFFER_DETAILS,
  offerChanges,
  offerDetailLabel,
  offerFieldName,
  offerOverall,
  respondByText,
  scoreText,
  scoreTone,
  scoreWord,
} from '../../src/offers.js';
import {
  OfferFieldsPatchSchema,
  OfferInputSchema,
  OfferScoresPatchSchema,
  OpportunitySchema,
  OpportunityWithHistorySchema,
} from '../../src/schemas.js';

// Feature 013: offers, their scores, history and custom fields.

describe('offer details', () => {
  it('each have a label, in the order they are shown', () => {
    expect(OFFER_DETAILS.map(offerDetailLabel)).toEqual([
      'Base salary',
      'Bonus',
      'Sign-on bonus',
      'Equity',
      '401k',
      'Insurance',
      'Location',
      'Work arrangement',
      'Title',
      'Role',
      'PTO',
      'Leadership',
      'Culture',
      'Start date',
      'Respond by',
    ]);
  });
});

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
  baseSalary: 165000,
  bonusPercent: 12.5,
  signOnBonus: 10000,
  equity: '0.1% over 4 years',
  retirement: '100% match up to 6%',
  insurance: 'Medical, dental, vision',
  location: 'Denver, CO',
  workArrangement: 'REMOTE',
  title: 'Staff Engineer',
  role: 'Leads the platform team',
  pto: '20 days',
  leadership: 'Supportive',
  culture: 'Collaborative',
  startDate: '2027-01-04',
  respondBy: '2026-11-28',
  custom: { f1: '20 minutes' },
};

describe('OfferInputSchema', () => {
  it('keeps every detail', () => {
    expect(OfferInputSchema.parse(full)).toEqual(full);
  });

  it('accepts an empty change', () => {
    expect(OfferInputSchema.parse({})).toEqual({});
  });

  it.each([
    ['baseSalary', 10_000_001, 'Enter a whole number, like 150000'],
    ['baseSalary', -1, 'Enter a whole number, like 150000'],
    ['baseSalary', 1.5, 'Enter a whole number, like 150000'],
    ['baseSalary', '165k', 'Enter a whole number, like 150000'],
    ['signOnBonus', 10_000_001, 'Enter a whole number, like 150000'],
    ['bonusPercent', 100.1, 'Enter a percentage from 0 to 100, like 12.5'],
    ['bonusPercent', -1, 'Enter a percentage from 0 to 100, like 12.5'],
    ['bonusPercent', 12.55, 'Enter a percentage from 0 to 100, like 12.5'],
    ['bonusPercent', 'ten', 'Enter a percentage from 0 to 100, like 12.5'],
    ['title', 'x'.repeat(201), 'Must be 200 characters or fewer'],
    ['equity', 'x'.repeat(501), 'Must be 500 characters or fewer'],
    ['culture', 'x'.repeat(501), 'Must be 500 characters or fewer'],
    ['startDate', '2026-13-01', 'Use a date like 2026-11-03'],
    ['respondBy', '11/03/2026', 'Use a date like 2026-11-03'],
    ['workArrangement', 'MARS', 'Choose on-site, hybrid, or remote'],
  ])('refuses %s of %j', (field, value, message) => {
    expect(issuesFor(OfferInputSchema.safeParse({ [field]: value }))).toEqual([
      { path: field, message },
    ]);
  });

  it('takes the limits themselves', () => {
    const edge = {
      baseSalary: 10_000_000,
      signOnBonus: 0,
      bonusPercent: 100,
      title: 'x'.repeat(200),
      pto: 'x'.repeat(500),
    };
    expect(OfferInputSchema.parse(edge)).toEqual(edge);
    expect(OfferInputSchema.parse({ bonusPercent: 0.3 })).toEqual({ bonusPercent: 0.3 });
    expect(OfferInputSchema.parse({ bonusPercent: 0 })).toEqual({ bonusPercent: 0 });
  });

  it('refuses a custom value over 500 characters, or a bad field id', () => {
    expect(issuesFor(OfferInputSchema.safeParse({ custom: { f1: 'x'.repeat(501) } }))).toEqual([
      { path: 'custom.f1', message: 'Must be 500 characters or fewer' },
    ]);
    expect(issuesFor(OfferInputSchema.safeParse({ custom: { 'no spaces': 'x' } }))).toEqual([
      { path: 'custom.no spaces', message: 'Unknown custom field' },
    ]);
  });

  it('refuses an unknown key', () => {
    expect(issuesFor(OfferInputSchema.safeParse({ salary: 1 }))).toEqual([
      { path: '', message: 'Unknown field: salary' },
    ]);
  });

  it('trims text, and turns blank or null into a clear', () => {
    expect(
      OfferInputSchema.parse({
        pto: '  20 days ',
        equity: '   ',
        baseSalary: null,
        respondBy: '',
        custom: { f1: ' ', f2: null, f3: ' x ' },
      }),
    ).toEqual({
      pto: '20 days',
      equity: null,
      baseSalary: null,
      respondBy: null,
      custom: { f1: null, f2: null, f3: 'x' },
    });
  });
});

describe('OfferScoresPatchSchema', () => {
  it('takes 0 to 5 and null for details and custom fields', () => {
    const body = { scores: { baseSalary: 5, equity: 0, pto: null, 'custom:f1': 3 } };
    expect(OfferScoresPatchSchema.parse(body)).toEqual(body);
  });

  it.each([6, -1, 2.5, '3'])('refuses a score of %j', (score) => {
    expect(issuesFor(OfferScoresPatchSchema.safeParse({ scores: { pto: score } }))).toEqual([
      { path: 'scores.pto', message: 'Score with a whole number from 0 to 5' },
    ]);
  });

  it.each(['custom', 'createdAt', 'updatedAt', 'salary', 'custom:', 'custom:a b'])(
    'refuses the key %j',
    (key) => {
      expect(issuesFor(OfferScoresPatchSchema.safeParse({ scores: { [key]: 1 } }))).toEqual([
        { path: `scores.${key}`, message: 'Unknown detail to score' },
      ]);
    },
  );

  it('knows which keys can be scored', () => {
    expect(isScoreKey('respondBy')).toBe(true);
    expect(isScoreKey('custom:abc-1_2')).toBe(true);
    expect(isScoreKey('custom')).toBe(false);
  });
});

describe('OfferFieldsPatchSchema', () => {
  it('trims names, keeps ids, and allows new fields without one', () => {
    expect(
      OfferFieldsPatchSchema.parse({
        fields: [{ id: 'f1', name: ' Commute ' }, { name: 'Tuition' }],
        expectedVersion: 0,
      }),
    ).toEqual({ fields: [{ id: 'f1', name: 'Commute' }, { name: 'Tuition' }], expectedVersion: 0 });
  });

  it('refuses a blank, long or repeated name', () => {
    const result = OfferFieldsPatchSchema.safeParse({
      fields: [{ name: ' ' }, { name: 'x'.repeat(61) }, { name: 'Commute' }, { name: 'commute' }],
      expectedVersion: 1,
    });
    expect(issuesFor(result)).toEqual([
      { path: 'fields.0.name', message: 'Name the field' },
      { path: 'fields.1.name', message: 'Must be 60 characters or fewer' },
      { path: 'fields.3.name', message: "There's already a field called commute" },
    ]);
  });

  it('refuses a 21st field', () => {
    const fields = Array.from({ length: 21 }, (_, i) => ({ name: `Field ${i}` }));
    expect(issuesFor(OfferFieldsPatchSchema.safeParse({ fields, expectedVersion: 0 }))).toEqual([
      { path: 'fields', message: 'You can have at most 20 custom fields' },
    ]);
    expect(
      OfferFieldsPatchSchema.safeParse({ fields: fields.slice(1), expectedVersion: 0 }).success,
    ).toBe(true);
  });

  it('needs a whole expected version', () => {
    expect(
      issuesFor(OfferFieldsPatchSchema.safeParse({ fields: [], expectedVersion: -1 })),
    ).toEqual([{ path: 'expectedVersion', message: 'Must be a whole number' }]);
    expect(issuesFor(OfferFieldsPatchSchema.safeParse({ fields: [] }))).toEqual([
      { path: 'expectedVersion', message: 'Must be a whole number' },
    ]);
  });
});

describe('offerChanges', () => {
  const at = { createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z' };

  it('is empty when nothing changed', () => {
    expect(offerChanges({ baseSalary: 1, ...at }, { baseSalary: 1, updatedAt: 'later' })).toEqual(
      [],
    );
  });

  it('lists changed, added and cleared values in display order', () => {
    expect(
      offerChanges(
        { baseSalary: 160000, equity: 'RSUs', custom: { f1: '10 min' } },
        { pto: '20 days', baseSalary: 170000, signOnBonus: 10000, custom: { f2: 'Yes' } },
      ),
    ).toEqual([
      { field: 'baseSalary', from: 160000, to: 170000 },
      { field: 'signOnBonus', from: null, to: 10000 },
      { field: 'equity', from: 'RSUs', to: null },
      { field: 'pto', from: null, to: '20 days' },
      { field: 'custom:f2', from: null, to: 'Yes' },
      { field: 'custom:f1', from: '10 min', to: null },
    ]);
  });

  it('lists every value of a new offer', () => {
    expect(offerChanges(undefined, { respondBy: '2026-11-28', bonusPercent: 10 })).toEqual([
      { field: 'bonusPercent', from: null, to: 10 },
      { field: 'respondBy', from: null, to: '2026-11-28' },
    ]);
  });
});

describe('offerOverall', () => {
  const fields = [{ id: 'f1' }];

  it('averages the scores, 0s included', () => {
    expect(offerOverall({ baseSalary: 5, pto: 4, equity: 0 }, fields)).toBe(3);
    expect(offerOverall({ baseSalary: 4, pto: 5 }, fields)).toBe(4.5);
  });

  it('rounds to one decimal place', () => {
    expect(offerOverall({ baseSalary: 1, pto: 2, equity: 2 }, fields)).toBe(1.7);
    expect(offerOverall({ baseSalary: 2, pto: 2, equity: 1 }, fields)).toBe(1.7);
  });

  it('counts current custom fields and leaves out removed ones', () => {
    expect(offerOverall({ baseSalary: 5, [customKey('f1')]: 1 }, fields)).toBe(3);
    expect(offerOverall({ baseSalary: 5, [customKey('gone')]: 1 }, fields)).toBe(5);
  });

  it('is undefined with nothing scored', () => {
    expect(offerOverall({}, fields)).toBeUndefined();
    expect(offerOverall(undefined, fields)).toBeUndefined();
    expect(offerOverall({ [customKey('gone')]: 3 }, fields)).toBeUndefined();
  });
});

describe('score words and tones', () => {
  it('names each score', () => {
    expect([0, 1, 2, 3, 4, 5].map(scoreWord)).toEqual([
      'Not offered',
      'Worst',
      'Poor',
      'Okay',
      'Good',
      'Best',
    ]);
    expect(scoreText(0)).toBe('0 · Not offered');
    expect(scoreText(5)).toBe('5 · Best');
    expect(scoreWord(6)).toBe('');
  });

  it('rounds the overall to its nearest whole score', () => {
    expect(scoreTone(3.5)).toBe(4);
    expect(scoreTone(3.4)).toBe(3);
    expect(scoreTone(0)).toBe(0);
    expect(scoreTone(5)).toBe(5);
    expect(scoreTone(9)).toBe(5);
    expect(scoreTone(-1)).toBe(0);
  });
});

describe('offerFieldName', () => {
  const fields = [{ id: 'f1', name: 'Commute time' }];
  const removed = [{ id: 'f2', name: 'Tuition' }];

  it('names details, current fields, and removed ones', () => {
    expect(offerFieldName('baseSalary', fields, removed)).toBe('Base salary');
    expect(offerFieldName('retirement', fields, removed)).toBe('401k');
    expect(offerFieldName('custom:f1', fields, removed)).toBe('Commute time');
    expect(offerFieldName('custom:f2', fields, removed)).toBe('Tuition (removed)');
    expect(offerFieldName('custom:f3', fields, removed)).toBe('Removed field');
    expect(offerFieldName('custom:f2', fields)).toBe('Removed field');
  });
});

describe('respondByText', () => {
  const today = '2026-11-21';

  it('is plain more than 3 days ahead', () => {
    expect(respondByText('2026-11-25', today, 'OPEN')).toEqual({
      text: 'Respond by 2026-11-25',
      warning: false,
    });
  });

  it.each(['2026-11-24', '2026-11-22', '2026-11-21'])('warns on %s', (date) => {
    expect(respondByText(date, today, 'OPEN')).toEqual({
      text: `Respond by ${date}`,
      warning: true,
    });
  });

  it('says when it has passed', () => {
    expect(respondByText('2026-11-20', today, 'OPEN')).toEqual({
      text: 'Response was due 2026-11-20',
      warning: false,
    });
  });

  it('never warns for a closed opportunity', () => {
    expect(respondByText('2026-11-22', today, 'CLOSED')?.warning).toBe(false);
  });

  it('formats the date and gives nothing without one', () => {
    expect(respondByText('2026-11-30', today, 'OPEN', () => 'Nov 30')?.text).toBe(
      'Respond by Nov 30',
    );
    expect(respondByText(undefined, today, 'OPEN')).toBeUndefined();
  });
});

describe('isOffer', () => {
  it('is an opportunity with an offer or in the Offer stage', () => {
    expect(isOffer({ stage: 'ACCEPTED', offer: {} })).toBe(true);
    expect(isOffer({ stage: 'OFFER' })).toBe(true);
    expect(isOffer({ stage: 'INTERVIEWING' })).toBe(false);
  });
});

describe('the opportunity with its offer', () => {
  const opportunity = {
    id: 'o1',
    company: 'Acme',
    title: 'Engineer',
    stage: 'OFFER',
    status: 'OPEN',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    lastStageChangeAt: '2026-11-01T10:00:00.000Z',
    changeCount: 1,
  };

  it('reads one without an offer, as before', () => {
    expect(OpportunitySchema.parse(opportunity).offer).toBeUndefined();
  });

  it('reads the offer, its scores and its history', () => {
    const parsed = OpportunityWithHistorySchema.parse({
      ...opportunity,
      history: [],
      offer: {
        baseSalary: 165000,
        custom: { f1: 'x' },
        createdAt: '2026-11-20T10:00:00.000Z',
        updatedAt: '2026-11-20T10:00:00.000Z',
      },
      offerScores: { baseSalary: 5 },
      offerHistory: [
        {
          seq: 1,
          at: '2026-11-20T10:00:00.000Z',
          kind: 'RECORDED',
          changes: [{ field: 'baseSalary', from: null, to: 165000 }],
          via: 'CLAUDE',
        },
      ],
    });
    expect(parsed.offer?.baseSalary).toBe(165000);
    expect(parsed.offerScores).toEqual({ baseSalary: 5 });
    expect(parsed.offerHistory?.[0]?.kind).toBe('RECORDED');
  });
});
