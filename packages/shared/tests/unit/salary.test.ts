// @module-tag overview
// @module-tag capture
// @module-tag edit
import { describe, expect, it } from 'vitest';
import {
  formatSalaryRange,
  MAX_SALARY,
  parseAmount,
  SALARY_MESSAGE,
  SALARY_RANGE_MESSAGE,
  salaryRangeIsValid,
  salaryReach,
} from '../../src/salary.js';

describe('parseAmount', () => {
  it.each([
    ['150000', 150_000],
    ['150,000', 150_000],
    ['$150,000', 150_000],
    [' 150k ', 150_000],
    ['150K', 150_000],
    ['$ 150 k', 150_000],
    ['152.5k', 152_500],
    ['1.001k', 1_001],
    ['0', 0],
    ['45', 45],
  ])('reads %j as %i', (text, amount) => {
    expect(parseAmount(text)).toBe(amount);
  });

  it.each(['', '   '])('reads %j as not given', (text) => {
    expect(parseAmount(text)).toBeUndefined();
  });

  // The text is kept, so the schema reports it with its own message.
  it.each(['abc', '150.5', '-5', '1.2.3k', '1.0001k', '150kk', 'k', '$', '150 000x'])(
    'keeps %j as text',
    (text) => {
      expect(parseAmount(text)).toBe(text.trim());
    },
  );
});

describe('formatSalaryRange', () => {
  it.each([
    [150_000, 180_000, '$150k–$180k'],
    [150_000, undefined, '$150k+'],
    [150_000, null, '$150k+'],
    [undefined, 180_000, 'Up to $180k'],
    [null, 180_000, 'Up to $180k'],
    [152_500, 152_500, '$152.5k'],
    [152_540, 199_960, '$152.5k–$200k'],
    [45, 60, '$45–$60'],
    [999, 1_000, '$999–$1k'],
    [0, 50, '$0–$50'],
  ])('shows %s to %s as %j', (min, max, text) => {
    expect(formatSalaryRange(min, max)).toBe(text);
  });

  it.each([
    [undefined, undefined],
    [null, null],
  ])('shows nothing for %s to %s', (min, max) => {
    expect(formatSalaryRange(min, max)).toBeUndefined();
  });
});

describe('salaryReach', () => {
  it('is the maximum, or else the minimum', () => {
    expect(salaryReach({ salaryMin: 100, salaryMax: 200 })).toBe(200);
    expect(salaryReach({ salaryMin: 100 })).toBe(100);
    expect(salaryReach({ salaryMin: 100, salaryMax: null })).toBe(100);
    expect(salaryReach({ salaryMax: 0 })).toBe(0);
  });

  it('is undefined without a salary', () => {
    expect(salaryReach({})).toBeUndefined();
    expect(salaryReach({ salaryMin: null, salaryMax: null })).toBeUndefined();
  });
});

describe('salaryRangeIsValid', () => {
  it.each([
    [100, 200, true],
    [200, 200, true],
    [201, 200, false],
    [201, undefined, true],
    [undefined, 5, true],
    [null, 5, true],
    [5, null, true],
  ])('%s to %s is %s', (min, max, valid) => {
    expect(salaryRangeIsValid(min, max)).toBe(valid);
  });
});

it('has the messages and the limit from the data model', () => {
  expect(MAX_SALARY).toBe(10_000_000);
  expect(SALARY_MESSAGE).toBe('Enter a whole number, like 150000');
  expect(SALARY_RANGE_MESSAGE).toBe("The minimum can't be more than the maximum");
});
