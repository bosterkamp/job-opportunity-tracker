import type { OpportunityWithHistory } from '@jot/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { useOpportunity } from '../api/hooks';
import { QueryState } from './QueryState';

// Loads one opportunity for a page under /opportunities/:id: its own page and its interviews'
// pages (feature 012). Until it's loaded, or when it can't be, this shows why.
export function OpportunityLoader({
  id,
  children,
}: {
  id: string;
  children: (opportunity: OpportunityWithHistory) => ReactNode;
}) {
  const { data, error, isPending, isFetching, refetch } = useOpportunity(id);

  if (data) {
    return children(data);
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <h2>Opportunity not found</h2>
        <Link to="/">Back to the overview</Link>
      </>
    );
  }
  return (
    <>
      {error && <h2>Couldn't load this opportunity</h2>}
      <QueryState
        what="this opportunity"
        isPending={isPending}
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
        skeleton="detail"
      />
      {error && <Link to="/">Back to the overview</Link>}
    </>
  );
}
