import { MAX_SALARY, type PostingDetails } from '@jot/shared';

// Turns posting data into the form's text values (research.md §2).

export interface Pay {
  // ISO 4217, for example USD.
  currency?: string;
  min?: number;
  max?: number;
  // YEAR, MONTH, WEEK, DAY, or HOUR (schema.org unitText), in any case.
  unit?: string;
}

const UNITS: Record<string, string> = {
  YEAR: 'a year',
  MONTH: 'a month',
  WEEK: 'a week',
  DAY: 'a day',
  HOUR: 'an hour',
};

const isAmount = (n: number | undefined): n is number => typeof n === 'number' && n > 0;

// The posting's pay as whole numbers for the salary fields, low to high (feature 004). A
// single amount is both ends. The currency and period stay in the pay text.
export function payAmounts({ min, max }: Pay): { salaryMin?: number; salaryMax?: number } {
  const amounts = [min, max]
    .filter(isAmount)
    .map(Math.round)
    .filter((n) => n <= MAX_SALARY);
  if (amounts.length === 0) {
    return {};
  }
  return { salaryMin: Math.min(...amounts), salaryMax: Math.max(...amounts) };
}

function money(amount: number, currency: string | undefined): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    ...(currency && /^[A-Z]{3}$/i.test(currency) ? { style: 'currency', currency } : {}),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

// "$150,000–$180,000 a year", "$45 an hour", or undefined when there's no amount.
export function formatPay({ currency, min, max, unit }: Pay): string | undefined {
  const amounts = [min, max].filter(isAmount);
  if (amounts.length === 0) {
    return undefined;
  }
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const range =
    low === high ? money(low, currency) : `${money(low, currency)}–${money(high, currency)}`;
  const per = unit ? UNITS[unit.toUpperCase()] : undefined;
  return per ? `${range} ${per}` : range;
}

export interface Place {
  locality?: string;
  region?: string;
  country?: string;
}

export const MAX_SHORT_TEXT = 200;

// "Austin, TX; Remote": each place's parts joined with commas, distinct places with semicolons.
export function formatLocation(places: Place[]): string | undefined {
  const names = places
    .map((p) =>
      [p.locality, p.region, p.country]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(', '),
    )
    .filter(Boolean);
  const joined = [...new Set(names)].join('; ');
  return joined ? joined.slice(0, MAX_SHORT_TEXT) : undefined;
}

// Only when the posting clearly says so (spec Edge Cases).
export function workArrangementFrom({
  telecommute = false,
  text,
}: {
  telecommute?: boolean;
  text?: string;
}): PostingDetails['workArrangement'] {
  // No text reads as "undefined", which none of the patterns match.
  const words = String(text);
  if (/\bhybrid\b/i.test(words)) {
    return 'HYBRID';
  }
  if (telecommute || /\bremote\b/i.test(words)) {
    return 'REMOTE';
  }
  if (/\b(on-?site|in[- ]office)\b/i.test(words)) {
    return 'ONSITE';
  }
  return undefined;
}

// Hiring sites by their domain. A posting elsewhere is named by its host.
const SITES: [domain: string, name: string][] = [
  ['greenhouse.io', 'Greenhouse'],
  ['lever.co', 'Lever'],
  ['ashbyhq.com', 'Ashby'],
  ['myworkdayjobs.com', 'Workday'],
  ['smartrecruiters.com', 'SmartRecruiters'],
  ['indeed.com', 'Indeed'],
  ['linkedin.com', 'LinkedIn'],
];

export function siteName(link: string): string {
  const host = new URL(link).hostname.toLowerCase();
  const known = SITES.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return known ? known[1] : host.replace(/^www\./, '');
}
