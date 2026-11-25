import type { OpportunityWithHistory } from '@jot/shared';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { useOfferFields, useSaveOffer } from '../api/hooks';
import { OfferForm } from '../components/OfferForm';
import { OpportunityLoader } from '../components/OpportunityLoader';
import { QueryState } from '../components/QueryState';
import styles from './Page.module.css';

// Recording or changing an opportunity's offer (feature 013), on its own page as interviews
// are. Saving, or cancelling, goes back to the opportunity.
export function EditOfferPage() {
  // The route is /opportunities/:id/offer, so the id is always there.
  const id = useParams().id as string;
  return (
    <OpportunityLoader id={id}>
      {(opportunity) => <EditOffer opportunity={opportunity} />}
    </OpportunityLoader>
  );
}

function EditOffer({ opportunity: o }: { opportunity: OpportunityWithHistory }) {
  const navigate = useNavigate();
  const save = useSaveOffer(o.id);
  const fields = useOfferFields();
  const back = `/opportunities/${o.id}`;
  const error = save.error;

  return (
    <>
      <h2>{o.offer ? `Edit the offer from ${o.company}` : `Add an offer from ${o.company}`}</h2>
      <p className={styles.subtitle}>{o.title}</p>
      {fields.data ? (
        <OfferForm
          opportunity={o}
          fields={fields.data.fields}
          submitLabel="Save offer"
          submitting={save.isPending}
          serverError={error?.message}
          serverFields={error instanceof ApiError ? error.fields : []}
          onSubmit={(input) => save.mutate(input, { onSuccess: () => void navigate(back) })}
          onCancel={() => void navigate(back)}
        />
      ) : (
        <QueryState
          what="your custom fields"
          isPending={fields.isPending}
          error={fields.error}
          onRetry={() => void fields.refetch()}
          retrying={fields.isFetching}
          skeleton="detail"
        />
      )}
    </>
  );
}
