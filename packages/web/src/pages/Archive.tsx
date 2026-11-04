import type { Opportunity } from '@jot/shared';
import { useSearchParams } from 'react-router';
import { useOpportunities } from '../api/hooks';
import { ListToolbar } from '../components/ListToolbar';
import { OpportunityCard } from '../components/OpportunityCard';
import { QueryState } from '../components/QueryState';
import {
  ARCHIVE_DEFAULTS,
  readListParams,
  writeListParams,
  type ListParams,
} from '../features/overview/listParams';
import { search, sortBy } from '../features/overview/overviewModel';
import styles from './Page.module.css';

// Closed opportunities with their outcome (spec FR-021). Opening one shows "Move to…", which
// can reopen it.
export function ArchivePage() {
  const { data, error, isPending, isFetching, refetch } = useOpportunities('CLOSED');
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readListParams(searchParams, ARCHIVE_DEFAULTS);
  const update = (next: ListParams) =>
    setSearchParams(writeListParams(next, ARCHIVE_DEFAULTS), { replace: true });

  return (
    <>
      <h2>Archive</h2>
      <QueryState
        what="the archive"
        isPending={isPending}
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
      {data?.length === 0 && (
        <div className={styles.empty}>
          <p>Nothing in the archive yet.</p>
          <p className={styles.muted}>
            Opportunities move here when you close them as Accepted, Declined, Rejected, Withdrawn,
            or No Response, or when the job is no longer available.
          </p>
        </div>
      )}
      {data && data.length > 0 && (
        <ClosedList opportunities={data} params={params} onChange={update} />
      )}
    </>
  );
}

// The toolbar and the closed opportunities, once there are any.
function ClosedList({
  opportunities,
  params,
  onChange,
}: {
  opportunities: Opportunity[];
  params: ListParams;
  onChange: (next: ListParams) => void;
}) {
  const visible = sortBy(search(opportunities, params.q), params.sort);

  return (
    <>
      <ListToolbar value={params} onChange={onChange} />
      {visible.length === 0 ? (
        <p className={styles.muted}>No closed opportunities match “{params.q}”.</p>
      ) : (
        <ul className={styles.cardGrid} aria-label="Closed opportunities">
          {visible.map((o) => (
            <li key={o.id}>
              <OpportunityCard opportunity={o} showStage />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
