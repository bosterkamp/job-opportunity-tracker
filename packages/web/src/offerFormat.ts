import {
  offerFieldName,
  type OfferChange,
  type OfferField,
  type OfferValue,
  type WorkArrangement,
} from '@jot/shared';
import { WORK_ARRANGEMENT_LABELS, formatCalendarDate } from './format';

// How offer values read on screen (feature 013): amounts with separators, the bonus as a
// percentage, the arrangement's label, and dates in the viewer's style. Text is as entered.

// Amounts are whole numbers.
const amount = new Intl.NumberFormat('en-US');

export function formatOfferValue(field: string, value: OfferValue): string {
  // A custom field's key matches no detail, so it reads as entered.
  switch (field) {
    case 'baseSalary':
    case 'signOnBonus':
      return amount.format(value as number);
    case 'bonusPercent':
      return `${value}%`;
    case 'workArrangement':
      return WORK_ARRANGEMENT_LABELS[value as WorkArrangement];
    case 'startDate':
    case 'respondBy':
      return formatCalendarDate(value as string);
    default:
      return String(value);
  }
}

// One line of a history entry: "Base salary: 160,000 → 170,000", "Sign-on bonus added:
// 10,000", "Equity cleared (was RSUs)". The first entry lists each value as it was offered.
export function offerChangeLine(
  change: OfferChange['changes'][number],
  kind: OfferChange['kind'],
  fields: readonly OfferField[],
  removed: readonly OfferField[],
): string {
  const name = offerFieldName(change.field, fields, removed);
  const from = change.from === null ? null : formatOfferValue(change.field, change.from);
  const to = change.to === null ? null : formatOfferValue(change.field, change.to);
  if (from === null) {
    return kind === 'RECORDED' ? `${name}: ${to}` : `${name} added: ${to}`;
  }
  if (to === null) {
    return `${name} cleared (was ${from})`;
  }
  return `${name}: ${from} → ${to}`;
}
