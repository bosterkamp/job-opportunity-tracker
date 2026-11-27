// @module-tag offer
import { describe, expect, it } from 'vitest';
import {
  customKey,
  IMPORTANCE_VALUES,
  importanceText,
  importanceWord,
  OFFER_DETAILS,
  offerOverall,
  weightOf,
} from '../../src/offers.js';
import { OfferFieldsSchema, OfferWeightsPatchSchema } from '../../src/schemas.js';

// Feature 014: how much each offer detail counts toward the overall score.

function issuesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('importances', () => {
  it('run from 0 to 3, each with its word', () => {
    expect(IMPORTANCE_VALUES).toEqual([0, 1, 2, 3]);
    expect(IMPORTANCE_VALUES.map(importanceWord)).toEqual([
      'Ignore',
      'Normal',
      'Important',
      'Critical',
    ]);
    expect(IMPORTANCE_VALUES.map(importanceText)).toEqual([
      '0 · Ignore',
      '1 · Normal',
      '2 · Important',
      '3 · Critical',
    ]);
  });

  it('are Normal unless set', () => {
    const weights = { baseSalary: 3, title: 0, [customKey('f1')]: 2 };
    expect(weightOf('baseSalary', weights)).toBe(3);
    expect(weightOf('title', weights)).toBe(0);
    expect(weightOf(customKey('f1'), weights)).toBe(2);
    expect(weightOf('pto', weights)).toBe(1);
    expect(weightOf('pto', {})).toBe(1);
  });
});

describe('the stored settings', () => {
  it('read a missing weights map as everything Normal', () => {
    expect(OfferFieldsSchema.parse({ fields: [], removed: [], version: 2 })).toEqual({
      fields: [],
      removed: [],
      weights: {},
      version: 2,
    });
  });

  it('keep the weights stored', () => {
    expect(
      OfferFieldsSchema.parse({
        fields: [],
        removed: [],
        weights: { pto: 0, title: 3 },
        version: 1,
      }).weights,
    ).toEqual({ pto: 0, title: 3 });
  });
});

describe('OfferWeightsPatchSchema', () => {
  it('takes details and custom fields, each 0 to 3', () => {
    const patch = {
      weights: { baseSalary: 3, title: 0, pto: 1, [customKey('f1')]: 2 },
      expectedVersion: 4,
    };
    expect(OfferWeightsPatchSchema.parse(patch)).toEqual(patch);
  });

  it('refuses an importance that is not a whole number from 0 to 3', () => {
    for (const value of [-1, 4, 1.5, '3', null]) {
      expect(
        issuesFor(
          OfferWeightsPatchSchema.safeParse({ weights: { pto: value }, expectedVersion: 0 }),
        ),
      ).toEqual([{ path: 'weights.pto', message: 'Choose an importance from 0 to 3' }]);
    }
  });

  it('refuses a key that is neither a detail nor a custom field', () => {
    for (const key of ['salary', 'custom:', 'custom:has space', 'Custom:f1']) {
      expect(
        issuesFor(OfferWeightsPatchSchema.safeParse({ weights: { [key]: 2 }, expectedVersion: 0 })),
      ).toEqual([{ path: `weights.${key}`, message: 'Unknown detail to weigh' }]);
    }
  });

  it('needs at least one detail, a whole expected version, and nothing else', () => {
    expect(
      issuesFor(OfferWeightsPatchSchema.safeParse({ weights: {}, expectedVersion: 0 })),
    ).toEqual([{ path: 'weights', message: 'Choose a detail to weigh' }]);
    expect(
      issuesFor(OfferWeightsPatchSchema.safeParse({ weights: { pto: 2 }, expectedVersion: -1 })),
    ).toEqual([{ path: 'expectedVersion', message: 'Must be a whole number' }]);
    expect(issuesFor(OfferWeightsPatchSchema.safeParse({ weights: { pto: 2 } }))).toEqual([
      { path: 'expectedVersion', message: 'Must be a whole number' },
    ]);
    expect(
      issuesFor(
        OfferWeightsPatchSchema.safeParse({ weights: { pto: 2 }, expectedVersion: 0, x: 1 }),
      ),
    ).toEqual([{ path: '', message: 'Unknown field: x' }]);
  });
});

describe('the weighted overall score', () => {
  const fields = [{ id: 'f1' }];
  const commute = customKey('f1');

  it('weighs each score by how much its detail counts', () => {
    // The spec's example: (3×5 + 1×2) ÷ 4 = 4.25, shown as 4.3; the title doesn't count.
    expect(
      offerOverall({ baseSalary: 5, [commute]: 2, title: 1 }, fields, { baseSalary: 3, title: 0 }),
    ).toBe(4.3);
    expect(offerOverall({ baseSalary: 4, pto: 1 }, fields, { baseSalary: 2 })).toBe(3);
  });

  it('counts a 0 score with its weight', () => {
    expect(offerOverall({ baseSalary: 0, pto: 3 }, fields, { baseSalary: 2 })).toBe(1);
  });

  it('leaves out Ignored details, whatever their score', () => {
    expect(offerOverall({ baseSalary: 5, title: 0 }, fields, { title: 0 })).toBe(5);
    expect(offerOverall({ title: 1, pto: 1 }, fields, { title: 0 })).toBe(1);
  });

  it('is undefined when only Ignored details are scored', () => {
    expect(offerOverall({ title: 4 }, fields, { title: 0 })).toBeUndefined();
    expect(offerOverall({}, fields, { title: 0 })).toBeUndefined();
  });

  it("leaves out a removed field's score and weight", () => {
    const gone = customKey('gone');
    expect(offerOverall({ baseSalary: 4, [gone]: 1 }, fields, { [gone]: 3 })).toBe(4);
  });

  it("doesn't count a weight with no score", () => {
    expect(offerOverall({ pto: 2 }, fields, { baseSalary: 3, [commute]: 3 })).toBe(2);
  });

  it('rounds half up to one decimal place after weighing', () => {
    // (2×2 + 3) ÷ 3 = 2.333…; (3×4 + 3×3 + 2) ÷ 7 = 3.2857…
    expect(offerOverall({ pto: 2, title: 3 }, fields, { pto: 2 })).toBe(2.3);
    expect(offerOverall({ pto: 4, title: 3, role: 2 }, fields, { pto: 3, title: 3 })).toBe(3.3);
  });

  it('is exactly the plain average when every detail is Normal', () => {
    // Feature 013's formula, before weights.
    const average = (scores: Record<string, number>) => {
      const counted = Object.values(scores);
      return Math.round((counted.reduce((sum, s) => sum + s, 0) / counted.length) * 10) / 10;
    };
    // A fixed pseudo-random sequence, so a failure can be reproduced.
    let seed = 7;
    const next = () => {
      seed = (seed * 48271) % 2147483647;
      return seed;
    };
    const keys = [...OFFER_DETAILS, commute];
    for (let run = 0; run < 500; run++) {
      const scores: Record<string, number> = {};
      for (const key of keys) {
        if (next() % 3 !== 0) {
          scores[key] = next() % 6;
        }
      }
      if (Object.keys(scores).length === 0) {
        continue;
      }
      const normal = Object.fromEntries(keys.map((key) => [key, 1]));
      expect(offerOverall(scores, fields, {})).toBe(average(scores));
      expect(offerOverall(scores, fields, normal)).toBe(average(scores));
    }
  });
});
