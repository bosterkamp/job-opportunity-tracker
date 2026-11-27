import type { Offer, OfferChange, OfferField } from './schemas.js';

// Offers (feature 013): the details of an offer an opportunity received, the owner's 0–5
// score for each, an overall score, and the custom fields every offer shares.

// The details in the order the form, the Offer section and the comparison show them.
export const OFFER_DETAILS = [
  'baseSalary',
  'bonusPercent',
  'signOnBonus',
  'equity',
  'retirement',
  'insurance',
  'location',
  'workArrangement',
  'title',
  'role',
  'pto',
  'leadership',
  'culture',
  'startDate',
  'respondBy',
] as const;
export type OfferDetail = (typeof OFFER_DETAILS)[number];

const LABELS: Record<OfferDetail, string> = {
  baseSalary: 'Base salary',
  bonusPercent: 'Bonus',
  signOnBonus: 'Sign-on bonus',
  equity: 'Equity',
  retirement: '401k',
  insurance: 'Insurance',
  location: 'Location',
  workArrangement: 'Work arrangement',
  title: 'Title',
  role: 'Role',
  pto: 'PTO',
  leadership: 'Leadership',
  culture: 'Culture',
  startDate: 'Start date',
  respondBy: 'Respond by',
};

export const offerDetailLabel = (detail: OfferDetail): string => LABELS[detail];

export const isOfferDetail = (key: string): key is OfferDetail =>
  (OFFER_DETAILS as readonly string[]).includes(key);

export const MAX_OFFER_TEXT = 500;
export const MAX_OFFER_TITLE = 200;
export const MAX_BONUS_PERCENT = 100;
export const MAX_OFFER_FIELDS = 20;
export const MAX_OFFER_FIELD_NAME = 60;
export const MAX_COMPARE = 3;

export const OFFER_MESSAGES = {
  BONUS: 'Enter a percentage from 0 to 100, like 12.5',
  SCORE: 'Score with a whole number from 0 to 5',
  UNKNOWN_FIELD: 'Unknown custom field',
  SCORE_KEY: 'Unknown detail to score',
  NO_OFFER: 'Add the offer before scoring it',
  NOTHING_TO_REMOVE: 'No offer to remove',
  TOO_MANY_FIELDS: `You can have at most ${MAX_OFFER_FIELDS} custom fields`,
  FIELD_NAME: 'Name the field',
  duplicateField: (name: string) => `There's already a field called ${name}`,
  IMPORTANCE: 'Choose an importance from 0 to 3',
  WEIGHT_KEY: 'Unknown detail to weigh',
  NO_WEIGHTS: 'Choose a detail to weigh',
  SETTINGS_CONFLICT: 'Settings changed since you loaded them. Reload and try again.',
} as const;

// A custom field's value and score are kept under `custom:<fieldId>`.
const CUSTOM_PREFIX = 'custom:';
export const customKey = (fieldId: string): string => `${CUSTOM_PREFIX}${fieldId}`;
export const customFieldId = (key: string): string | undefined =>
  key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : undefined;

const FIELD_ID = /^[A-Za-z0-9_-]{1,100}$/;
export const isFieldId = (id: string): boolean => FIELD_ID.test(id);

// What can be scored: a detail, or a custom field.
export function isScoreKey(key: string): boolean {
  const fieldId = customFieldId(key);
  return fieldId === undefined ? isOfferDetail(key) : isFieldId(fieldId);
}

// Scores (FR-009, FR-010): 0 means not offered, 1 worst to 5 best.
export const MAX_SCORE = 5;
const SCORE_WORDS = ['Not offered', 'Worst', 'Poor', 'Okay', 'Good', 'Best'] as const;
export const SCORE_VALUES = [0, 1, 2, 3, 4, 5] as const;

export const scoreWord = (score: number): string => SCORE_WORDS[score] ?? '';
// "0 · Not offered", "5 · Best": the number and its meaning, so color is never the only cue.
export const scoreText = (score: number): string => `${score} · ${scoreWord(score)}`;
// The overall takes the color of its nearest whole score.
export const scoreTone = (overall: number): number =>
  Math.min(MAX_SCORE, Math.max(0, Math.round(overall)));

// How much each detail counts toward the overall score (feature 014): 0 Ignore, 1 Normal (the
// default, never stored), 2 Important, 3 Critical. One set, shared by every offer, keyed as
// scores are: the detail, or `custom:<fieldId>`.
export const IMPORTANCE_VALUES = [0, 1, 2, 3] as const;
export const MAX_IMPORTANCE = 3;
export const NORMAL_IMPORTANCE = 1;
const IMPORTANCE_WORDS = ['Ignore', 'Normal', 'Important', 'Critical'] as const;

export const importanceWord = (importance: number): string => IMPORTANCE_WORDS[importance] ?? '';
// "3 · Critical": the number and its meaning, as scores show theirs.
export const importanceText = (importance: number): string =>
  `${importance} · ${importanceWord(importance)}`;

export type OfferWeights = Readonly<Record<string, number>>;

export const weightOf = (key: string, weights: OfferWeights): number =>
  weights[key] ?? NORMAL_IMPORTANCE;

// The overall score (feature 013 FR-011, feature 014 FR-003): each score for a detail or a
// current custom field, times how much that detail counts, over the total weight of those
// scored, to one decimal place; 0 scores count, Ignored details don't. Undefined when nothing
// counts. With every detail Normal it's the plain average. Scores for a removed custom field
// are left out.
export function offerOverall(
  scores: Record<string, number> | undefined,
  fields: readonly Pick<OfferField, 'id'>[],
  weights: OfferWeights,
): number | undefined {
  const current = new Set(fields.map((f) => customKey(f.id)));
  let total = 0;
  let weight = 0;
  for (const [key, score] of Object.entries(scores ?? {})) {
    // An Ignored detail adds 0 to both sums.
    if (isOfferDetail(key) || current.has(key)) {
      const counts = weightOf(key, weights);
      total += score * counts;
      weight += counts;
    }
  }
  if (weight === 0) {
    return undefined;
  }
  return Math.round((total / weight) * 10) / 10;
}

export type OfferValue = string | number;
type Values = Partial<Record<string, OfferValue>>;

// The offer as a flat map of detail or `custom:<id>` to value, for comparing two versions.
export function offerValues(offer: Partial<Offer> | undefined): Values {
  const values: Values = {};
  // A detail that isn't there reads as undefined either way.
  for (const detail of OFFER_DETAILS) {
    values[detail] = offer?.[detail];
  }
  for (const [id, value] of Object.entries(offer?.custom ?? {})) {
    values[customKey(id)] = value;
  }
  return values;
}

// What a save changed, in display order: the details first, then the custom fields in the
// order of the newer version. An added value has `from: null`, a cleared one `to: null`.
export function offerChanges(
  before: Partial<Offer> | undefined,
  after: Partial<Offer>,
): OfferChange['changes'] {
  const from = offerValues(before);
  const to = offerValues(after);
  const keys = [...new Set([...Object.keys(to), ...Object.keys(from)])].sort(byDisplayOrder);
  return keys
    .filter((key) => from[key] !== to[key])
    .map((key) => ({ field: key, from: from[key] ?? null, to: to[key] ?? null }));
}

function displayRank(key: string): number {
  const index = (OFFER_DETAILS as readonly string[]).indexOf(key);
  return index === -1 ? OFFER_DETAILS.length : index;
}

// Details by their place in the list; custom fields after them, in the order first seen.
const byDisplayOrder = (a: string, b: string): number => displayRank(a) - displayRank(b);

// The name a history entry shows for a field: a detail's label, a custom field's current
// name, or the last name a removed one had, marked "(removed)".
export function offerFieldName(
  key: string,
  fields: readonly OfferField[],
  removed: readonly OfferField[] = [],
): string {
  if (isOfferDetail(key)) {
    return offerDetailLabel(key);
  }
  const id = customFieldId(key);
  const current = fields.find((f) => f.id === id);
  if (current) {
    return current.name;
  }
  const gone = removed.find((f) => f.id === id);
  return gone ? `${gone.name} (removed)` : 'Removed field';
}

const DAY = 86_400_000;
const dayNumber = (ymd: string): number => Date.parse(`${ymd}T00:00:00Z`) / DAY;
export const RESPOND_BY_WARNING_DAYS = 3;

// "Respond by {date}" on the card and the Offers page (FR-013): a warning within 3 days for an
// open opportunity, and "Response was due {date}" once passed. `today` is the device's date.
export function respondByText(
  respondBy: string | undefined,
  today: string,
  status: 'OPEN' | 'CLOSED',
  format: (ymd: string) => string = (ymd) => ymd,
): { text: string; warning: boolean } | undefined {
  if (!respondBy) {
    return undefined;
  }
  const daysLeft = dayNumber(respondBy) - dayNumber(today);
  if (daysLeft < 0) {
    return { text: `Response was due ${format(respondBy)}`, warning: false };
  }
  return {
    text: `Respond by ${format(respondBy)}`,
    warning: status === 'OPEN' && daysLeft <= RESPOND_BY_WARNING_DAYS,
  };
}

// On the Offers page and in Claude's list: an opportunity with an offer, or in the Offer
// stage without one yet.
export const isOffer = (o: { offer?: unknown; stage: string }): boolean =>
  o.offer !== undefined || o.stage === 'OFFER';
