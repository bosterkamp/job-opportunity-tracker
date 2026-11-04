import type { Opportunity } from '@jot/shared';
import { Link, useSearchParams } from 'react-router';
import { useOpportunities } from '../api/hooks';
import { ListToolbar } from '../components/ListToolbar';
import { OpportunityCard } from '../components/OpportunityCard';
import { QueryState } from '../components/QueryState';
import { StageBoard } from '../components/StageBoard';
import {
  OVERVIEW_DEFAULTS,
  readListParams,
  writeListParams,
  type ListParams,
} from '../features/overview/listParams';
import { boardGroups, filterBySalary, search, sortBy } from '../features/overview/overviewModel';
import styles from './Page.module.css';

// Every opportunity, open ones by stage and closed ones together at the end (spec US3;
// feature 004). Filter, sort, and search live in the URL, so a refresh or the back button
// keeps the view.
export function OverviewPage() {
  const open = useOpportunities('OPEN');
  // The archive's list, so the two pages share what's already loaded.
  const closed = useOpportunities('CLOSED');
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readListParams(searchParams, OVERVIEW_DEFAULTS);
  const update = (next: ListParams) =>
    setSearchParams(writeListParams(next, OVERVIEW_DEFAULTS), { replace: true });
  const loaded = open.data && closed.data ? { open: open.data, closed: closed.data } : undefined;

  return (
    <>
      <h2>Overview</h2>
      <QueryState
        what="your opportunities"
        // One skeleton while either list loads; the board needs both.
        isPending={open.isPending || closed.isPending}
        error={open.error}
        onRetry={() => void open.refetch()}
        retrying={open.isFetching}
      />
      <QueryState
        what="your closed opportunities"
        isPending={false}
        // When both fail (offline, say), one message is enough.
        error={open.error ? null : closed.error}
        onRetry={() => void closed.refetch()}
        retrying={closed.isFetching}
      />
      {loaded?.open.length === 0 && loaded.closed.length === 0 && (
        <div className={styles.empty}>
          <p>No opportunities yet.</p>
          <Link to="/opportunities/new" className={styles.primaryLink}>
            Add your first opportunity
          </Link>
        </div>
      )}
      {loaded && loaded.open.length + loaded.closed.length > 0 && (
        <Board open={loaded.open} closed={loaded.closed} params={params} onChange={update} />
      )}
    </>
  );
}

// The toolbar and the board, once there are opportunities to show.
function Board({
  open,
  closed,
  params,
  onChange,
}: {
  open: Opportunity[];
  closed: Opportunity[];
  params: ListParams;
  onChange: (next: ListParams) => void;
}) {
  const filtered = boardGroups(search(open, params.q), search(closed, params.q), params.stage).map(
    (group) => ({ group, paid: filterBySalary(group.items, params.salary) }),
  );
  const groups = filtered.map(({ group, paid }) => ({
    ...group,
    items: sortBy(paid.items, params.sort),
  }));
  // Counted only in the groups shown.
  const hiddenWithoutSalary = filtered.reduce((n, { paid }) => n + paid.hiddenWithoutSalary, 0);
  const nothingShown = groups.every((group) => group.items.length === 0);

  return (
    <>
      <ListToolbar value={params} onChange={onChange} showStageFilter showSalaryFilter />
      {hiddenWithoutSalary > 0 && (
        <p role="status" className={styles.muted}>
          {hiddenWithoutSalary === 1
            ? '1 hidden because it has no salary'
            : `${hiddenWithoutSalary} hidden because they have no salary`}
        </p>
      )}
      {nothingShown ? (
        <div className={styles.empty}>
          <p>No opportunities match these filters.</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onChange(OVERVIEW_DEFAULTS)}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <StageBoard
          groups={groups}
          renderCard={(o) =>
            // Closed cards show how they ended; reopening is on the detail page.
            o.status === 'CLOSED' ? (
              <OpportunityCard opportunity={o} showStage />
            ) : (
              <OpportunityCard opportunity={o} showMove />
            )
          }
        />
      )}
    </>
  );
}
