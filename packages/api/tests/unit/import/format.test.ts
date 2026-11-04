// @module-tag import
import { describe, expect, it } from 'vitest';
import {
  formatLocation,
  formatPay,
  MAX_SHORT_TEXT,
  payAmounts,
  siteName,
  workArrangementFrom,
} from '../../../src/import/format.js';

describe('formatPay', () => {
  it.each([
    [{ currency: 'USD', min: 150_000, max: 180_000, unit: 'YEAR' }, '$150,000–$180,000 a year'],
    [{ currency: 'EUR', min: 110_000, max: 185_000, unit: 'YEAR' }, '€110,000–€185,000 a year'],
    [{ currency: 'USD', min: 45, unit: 'HOUR' }, '$45 an hour'],
    [{ currency: 'USD', max: 9000, unit: 'month' }, '$9,000 a month'],
    [{ currency: 'GBP', min: 1500, max: 1500, unit: 'Week' }, '£1,500 a week'],
    [{ currency: 'USD', min: 400, max: 600, unit: 'DAY' }, '$400–$600 a day'],
    [{ currency: 'usd', min: 52.5, unit: 'HOUR' }, '$52.50 an hour'],
    [{ currency: 'USD', min: 180_000, max: 150_000 }, '$150,000–$180,000'],
    [{ min: 100_000, max: 120_000, unit: 'YEAR' }, '100,000–120,000 a year'],
    [{ currency: 'dollars', min: 100_000 }, '100,000'],
    [{ currency: 'USD', min: 100_000, unit: 'FORTNIGHT' }, '$100,000'],
    [{ currency: 'USD', min: 0, max: 90_000 }, '$90,000'],
  ])('formats %j as %j', (pay, expected) => {
    expect(formatPay(pay)).toBe(expected);
  });

  it.each([{}, { currency: 'USD' }, { currency: 'USD', min: 0 }, { currency: 'USD', min: -5 }])(
    'gives nothing without a positive amount: %j',
    (pay) => {
      expect(formatPay(pay)).toBeUndefined();
    },
  );
});

describe('payAmounts', () => {
  it.each([
    [{ currency: 'USD', min: 150_000, max: 180_000, unit: 'YEAR' }, 150_000, 180_000],
    [{ min: 180_000, max: 150_000 }, 150_000, 180_000],
    [{ min: 45, unit: 'HOUR' }, 45, 45],
    [{ max: 9000 }, 9000, 9000],
    [{ min: 52.5, max: 60.49 }, 53, 60],
    [{ min: 0, max: 90_000 }, 90_000, 90_000],
    [{ min: 100, max: 10_000_000 }, 100, 10_000_000],
    [{ min: 100, max: 10_000_001 }, 100, 100],
  ])('reads %j as %i to %i', (pay, salaryMin, salaryMax) => {
    expect(payAmounts(pay)).toEqual({ salaryMin, salaryMax });
  });

  it.each([{}, { min: 0 }, { min: -5, max: -1 }, { min: 20_000_000 }])(
    'gives nothing without a usable amount: %j',
    (pay) => {
      expect(payAmounts(pay)).toEqual({});
    },
  );
});

describe('formatLocation', () => {
  it('joins the parts of a place with commas, skipping empty ones', () => {
    expect(formatLocation([{ locality: 'Austin', region: 'TX', country: 'US' }])).toBe(
      'Austin, TX, US',
    );
    expect(formatLocation([{ locality: ' ', region: '', country: 'European Union' }])).toBe(
      'European Union',
    );
    expect(formatLocation([{ locality: '  Boston ', region: 'MA' }])).toBe('Boston, MA');
  });

  it('joins distinct places with semicolons, once each', () => {
    expect(
      formatLocation([
        { locality: 'Boston', region: 'MA' },
        { locality: 'Boston', region: 'MA' },
        { locality: 'Remote' },
      ]),
    ).toBe('Boston, MA; Remote');
  });

  it('skips places without a name', () => {
    expect(formatLocation([{ locality: 'Boston' }, {}, { region: '' }])).toBe('Boston');
  });

  it('gives nothing when no place has a name', () => {
    expect(formatLocation([])).toBeUndefined();
    expect(formatLocation([{}, { locality: '' }])).toBeUndefined();
  });

  it(`caps the result at ${MAX_SHORT_TEXT} characters`, () => {
    expect(MAX_SHORT_TEXT).toBe(200);
    expect(formatLocation([{ locality: 'x'.repeat(250) }])).toBe('x'.repeat(200));
  });
});

describe('workArrangementFrom', () => {
  it.each([
    [{ telecommute: true }, 'REMOTE'],
    [{ text: 'Remote - US' }, 'REMOTE'],
    [{ text: 'Hybrid: three days in the office' }, 'HYBRID'],
    [{ telecommute: true, text: 'Hybrid, remote 2 days' }, 'HYBRID'],
    [{ text: 'On-site in Austin' }, 'ONSITE'],
    [{ text: 'onsite' }, 'ONSITE'],
    [{ text: 'Work in office 5 days' }, 'ONSITE'],
    [{ text: 'in-office' }, 'ONSITE'],
    [{ text: 'Remote or on-site' }, 'REMOTE'],
  ] as const)('reads %j as %s', (input, expected) => {
    expect(workArrangementFrom(input)).toBe(expected);
  });

  it.each([
    {},
    { text: 'Austin, TX' },
    { text: 'remoteness' },
    { text: 'hybrids' },
    { text: 'onsiter' },
  ])('gives nothing when the posting does not say: %j', (input) => {
    expect(workArrangementFrom(input)).toBeUndefined();
  });
});

describe('siteName', () => {
  it.each([
    ['https://job-boards.greenhouse.io/acme/jobs/1', 'Greenhouse'],
    ['https://boards.greenhouse.io/acme/jobs/1', 'Greenhouse'],
    ['https://jobs.lever.co/acme/123', 'Lever'],
    ['https://jobs.ashbyhq.com/acme/123', 'Ashby'],
    ['https://nvidia.wd5.myworkdayjobs.com/en-US/Site/job/1', 'Workday'],
    ['https://jobs.smartrecruiters.com/Acme/1', 'SmartRecruiters'],
    ['https://www.indeed.com/viewjob?jk=1', 'Indeed'],
    ['https://www.linkedin.com/jobs/view/1', 'LinkedIn'],
    ['https://LINKEDIN.COM/jobs/view/1', 'LinkedIn'],
    ['https://www.acme.com/careers/1', 'acme.com'],
    ['https://careers.acme.com/job/1', 'careers.acme.com'],
    ['https://notlever.co/job', 'notlever.co'],
    ['https://jobs.www.acme.com/1', 'jobs.www.acme.com'],
  ])('names %s as %s', (link, name) => {
    expect(siteName(link)).toBe(name);
  });
});
