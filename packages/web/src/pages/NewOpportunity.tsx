import { findPossibleDuplicate, type Opportunity, type OpportunityInput } from '@jot/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCreateOpportunity, useImportPosting, useLeads, useOpportunities } from '../api/hooks';
import { OpportunityForm } from '../components/OpportunityForm';
import styles from './Page.module.css';

export function NewOpportunityPage() {
  const navigate = useNavigate();
  const create = useCreateOpportunity();
  const importPosting = useImportPosting();
  // The open list, to warn about duplicates (spec FR-006). Usually already cached.
  const { data: open } = useOpportunities('OPEN');
  const { data: leads } = useLeads();
  const [possibleDuplicate, setPossibleDuplicate] = useState<{
    input: OpportunityInput;
    existing: Opportunity;
  } | null>(null);

  function save(input: OpportunityInput) {
    create.mutate(input, {
      onSuccess: (created) => void navigate(`/opportunities/${created.id}`),
    });
  }

  function handleSubmit(input: OpportunityInput) {
    const existing = findPossibleDuplicate(input, open ?? []);
    if (existing) {
      setPossibleDuplicate({ input, existing });
      return;
    }
    save(input);
  }

  return (
    <>
      <h2>Add opportunity</h2>
      {possibleDuplicate && (
        <div role="alert" className={styles.warning}>
          <p>
            You already have an open opportunity for {possibleDuplicate.existing.title} at{' '}
            {possibleDuplicate.existing.company}.
          </p>
          <div className={styles.actions}>
            <Link
              to={`/opportunities/${possibleDuplicate.existing.id}`}
              className={styles.primaryLink}
            >
              Open existing
            </Link>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => save(possibleDuplicate.input)}
            >
              Add anyway
            </button>
          </div>
        </div>
      )}
      <OpportunityForm
        submitLabel="Save opportunity"
        submitting={create.isPending}
        serverError={create.error?.message}
        leads={leads}
        onSubmit={handleSubmit}
        onImport={(url) => importPosting.mutateAsync(url)}
      />
    </>
  );
}
