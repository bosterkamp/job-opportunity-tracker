import { formatSalaryRange, OPEN_STAGES, stageLabel } from '@jot/shared';
import { useId, type CSSProperties } from 'react';
import type { ListParams } from '../features/overview/listParams';
import {
  SALARY_FILTERS,
  SORT_OPTIONS,
  type SortKey,
  type StageFilter,
} from '../features/overview/overviewModel';
import styles from './ListToolbar.module.css';

interface ListToolbarProps {
  value: ListParams;
  onChange: (next: ListParams) => void;
  // The overview filters by stage (or Closed) and by salary; the archive doesn't need them.
  showStageFilter?: boolean;
  showSalaryFilter?: boolean;
}

// Filter by stage, sort, filter by salary, and search (spec FR-018, FR-019; feature 004).
export function ListToolbar({
  value,
  onChange,
  showStageFilter = false,
  showSalaryFilter = false,
}: ListToolbarProps) {
  const id = useId();
  const controls = 1 + Number(showStageFilter) + Number(showSalaryFilter);

  return (
    <div
      className={styles.toolbar}
      role="search"
      aria-label="Filter and sort"
      style={{ '--controls': controls } as CSSProperties}
    >
      {showStageFilter && (
        <div className={styles.field}>
          <label htmlFor={`${id}-stage`}>Stage</label>
          <select
            id={`${id}-stage`}
            className={styles.input}
            value={value.stage}
            onChange={(event) => onChange({ ...value, stage: event.target.value as StageFilter })}
          >
            <option value="ALL">All stages</option>
            {OPEN_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-sort`}>Sort by</label>
        <select
          id={`${id}-sort`}
          className={styles.input}
          value={value.sort}
          onChange={(event) => onChange({ ...value, sort: event.target.value as SortKey })}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {showSalaryFilter && (
        <div className={styles.field}>
          <label htmlFor={`${id}-salary`}>Salary at least</label>
          <select
            id={`${id}-salary`}
            className={styles.input}
            // Stryker disable next-line StringLiteral: a single select with no matching option chooses its first option, "Any", which is what '' means
            value={value.salary ?? ''}
            onChange={(event) =>
              onChange({ ...value, salary: event.target.value ? Number(event.target.value) : null })
            }
          >
            <option value="">Any</option>
            {SALARY_FILTERS.map((amount) => (
              <option key={amount} value={amount}>
                {formatSalaryRange(amount, amount)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.searchField}>
        <label htmlFor={`${id}-q`}>Search</label>
        <input
          id={`${id}-q`}
          type="search"
          className={styles.input}
          placeholder="Company or job title"
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
        />
      </div>
    </div>
  );
}
