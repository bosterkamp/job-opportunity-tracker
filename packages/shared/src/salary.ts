// Salary ranges (feature 004): two whole numbers with no currency or pay period, so they can
// be compared, sorted, and filtered. Anything else about pay goes in "Pay notes".

export const MAX_SALARY = 10_000_000;
export const SALARY_MESSAGE = 'Enter a whole number, like 150000';
export const SALARY_RANGE_MESSAGE = "The minimum can't be more than the maximum";

type Amount = number | null | undefined;

// What the owner typed in a salary field: "150000", "150,000", "$150,000", "150k", or
// "152.5k". Blank is not given. Anything else comes back as text, for the schema to reject
// with its own message.
export function parseAmount(text: string): number | string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  const match = /^(\d+)(?:\.(\d{1,3}))?(k?)$/i.exec(trimmed.replace(/[$,\s]/g, ''));
  if (!match) {
    return trimmed;
  }
  const [, whole, fraction = '', thousands] = match as unknown as [string, string, string, string];
  if (thousands === '') {
    return fraction === '' ? Number(whole) : trimmed;
  }
  // In thousands, up to three decimals stay whole: 152.5k is 152500.
  return Number(whole + fraction.padEnd(3, '0'));
}

// 1,000 and more in thousands with at most one decimal ("$152.5k"); less in full ("$45").
function money(amount: number): string {
  return amount >= 1_000 ? `$${Math.round(amount / 100) / 10}k` : `$${amount}`;
}

// "$150k–$180k", "$150k+", "Up to $180k", or undefined when neither end is set.
export function formatSalaryRange(min: Amount, max: Amount): string | undefined {
  if (min != null && max != null) {
    return min === max ? money(min) : `${money(min)}–${money(max)}`;
  }
  if (min != null) {
    return `${money(min)}+`;
  }
  return max != null ? `Up to ${money(max)}` : undefined;
}

// How high the range goes: the maximum, or the minimum when there's no maximum. The "Salary
// at least" filter compares against it.
export function salaryReach(o: { salaryMin?: Amount; salaryMax?: Amount }): number | undefined {
  return o.salaryMax ?? o.salaryMin ?? undefined;
}

// Only two values given can be out of order.
export function salaryRangeIsValid(min: Amount, max: Amount): boolean {
  return min == null || max == null || min <= max;
}
