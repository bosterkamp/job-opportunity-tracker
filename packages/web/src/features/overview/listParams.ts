import { OPEN_STAGES } from '@jot/shared';
import { SALARY_FILTERS, SORT_OPTIONS, type SortKey, type StageFilter } from './overviewModel';

export interface ListParams {
  stage: StageFilter;
  sort: SortKey;
  // "Salary at least": one of SALARY_FILTERS, or null for any salary.
  salary: number | null;
  q: string;
}

// Each page's defaults: the overview opens with the postings that close soonest first (feature
// 009), and the archive, where nothing is urgent, with the most recently changed.
export const OVERVIEW_DEFAULTS: ListParams = {
  stage: 'ALL',
  sort: 'closing',
  salary: null,
  q: '',
};
export const ARCHIVE_DEFAULTS: ListParams = { ...OVERVIEW_DEFAULTS, sort: 'recent' };

// An open stage, or Closed for every closed opportunity.
const isStage = (value: string | null): value is StageFilter =>
  value === 'CLOSED' || (OPEN_STAGES as readonly (string | null)[]).includes(value);
const isSort = (value: string | null): value is SortKey =>
  SORT_OPTIONS.some((option) => option.value === value);

// Only the offered amounts; a missing or empty value is 0, which isn't one of them.
const asSalary = (value: string | null): number | null =>
  SALARY_FILTERS.includes(Number(value)) ? Number(value) : null;

// Reads the toolbar state from the URL query (?stage=&sort=&salary=&q=), ignoring unknown values,
// so a shared or bookmarked link always opens a valid view.
export function readListParams(params: URLSearchParams, defaults: ListParams): ListParams {
  const stage = params.get('stage');
  const sort = params.get('sort');
  return {
    stage: isStage(stage) ? stage : defaults.stage,
    sort: isSort(sort) ? sort : defaults.sort,
    salary: asSalary(params.get('salary')),
    q: params.get('q') ?? defaults.q,
  };
}

// The URL query for a toolbar state, leaving out defaults to keep links short.
export function writeListParams(state: ListParams, defaults: ListParams): URLSearchParams {
  const params = new URLSearchParams();
  if (state.stage !== defaults.stage) params.set('stage', state.stage);
  if (state.sort !== defaults.sort) params.set('sort', state.sort);
  if (state.salary !== null) params.set('salary', String(state.salary));
  if (state.q !== defaults.q) params.set('q', state.q);
  return params;
}
