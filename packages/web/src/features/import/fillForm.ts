import { parseAmount, type PostingDetails } from '@jot/shared';
import type { FormValues } from '../../components/OpportunityForm';

// Filling the add form from a posting (data-model.md, Fill rules): only empty fields change,
// and the owner is told what was filled and what was kept.

type FillableField =
  | 'company'
  | 'title'
  | 'description'
  | 'location'
  | 'workArrangement'
  | 'salaryMin'
  | 'salaryMax'
  | 'compensation'
  | 'source'
  | 'postedUntil';

export const FILLABLE: Record<FillableField, string> = {
  company: 'Company',
  title: 'Job title',
  description: 'Job description',
  location: 'Location',
  workArrangement: 'Work arrangement',
  salaryMin: 'Salary minimum',
  salaryMax: 'Salary maximum',
  compensation: 'Pay notes',
  source: 'Where you found it',
  postedUntil: 'Posted until',
};

export interface FillResult {
  values: FormValues;
  filled: FillableField[];
  // Fields where the owner had typed something different from the posting.
  kept: FillableField[];
}

// A salary typed as "150k" is the same as the posting's 150000.
function same(field: FillableField, typed: string, posting: string | number): boolean {
  return typeof posting === 'number' ? parseAmount(typed) === posting : typed === posting;
}

export function fillForm(values: FormValues, details: PostingDetails): FillResult {
  const next = { ...values };
  const filled: FillableField[] = [];
  const kept: FillableField[] = [];
  for (const field of Object.keys(FILLABLE) as FillableField[]) {
    const posting = details[field];
    if (posting === undefined) {
      continue;
    }
    const current = values[field].trim();
    if (current === '') {
      next[field] = String(posting);
      filled.push(field);
    } else if (!same(field, current, posting)) {
      kept.push(field);
    }
  }
  return { values: next, filled, kept };
}

const names = (fields: FillableField[]) => fields.map((f) => FILLABLE[f]).join(', ');

// What the owner is told after a fill, for example "Filled in: Company, Job title. Kept what you
// typed for: Location."
export function fillMessage({ filled, kept }: FillResult, descriptionTruncated = false): string {
  const parts = [filled.length > 0 ? `Filled in: ${names(filled)}.` : 'Nothing new to fill in.'];
  if (kept.length > 0) {
    parts.push(`Kept what you typed for: ${names(kept)}.`);
  }
  if (descriptionTruncated && filled.includes('description')) {
    parts.push('The description was shortened to fit.');
  }
  return parts.join(' ');
}
