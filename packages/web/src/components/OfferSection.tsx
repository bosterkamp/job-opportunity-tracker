import {
  OFFER_DETAILS,
  customKey,
  offerDetailLabel,
  offerOverall,
  type OfferField,
  type OpportunityWithHistory,
} from '@jot/shared';
import { Link } from 'react-router';
import { useOfferFields, useRemoveOffer } from '../api/hooks';
import { formatDate } from '../format';
import { formatOfferValue, offerChangeLine } from '../offerFormat';
import page from '../pages/Page.module.css';
import styles from './OfferSection.module.css';
import { RemoveInterview } from './RemoveInterview';
import { ScoreBadge } from './ScoreCell';

const NO_FIELDS: OfferField[] = [];

// The Offer section on an opportunity's page (feature 013): the offer's details with their
// scores, its overall score, and its history, newest first. Recording and changing it happen
// on its own page.
export function OfferSection({ opportunity: o }: { opportunity: OpportunityWithHistory }) {
  const { data } = useOfferFields();
  const remove = useRemoveOffer(o.id);
  const fields = data?.fields ?? NO_FIELDS;
  const removed = data?.removed ?? NO_FIELDS;
  const editPath = `/opportunities/${o.id}/offer`;
  const offer = o.offer;
  const scores = o.offerScores ?? {};

  if (!offer) {
    return (
      <section aria-labelledby="offer-heading" className={styles.section}>
        <h3 id="offer-heading">Offer</h3>
        <p className={page.muted}>No offer recorded yet.</p>
        <Link to={editPath} className={page.secondaryLink}>
          Add offer
        </Link>
      </section>
    );
  }

  const rows = [
    ...OFFER_DETAILS.map((detail) => ({
      key: detail,
      label: offerDetailLabel(detail),
      value: offer[detail] === undefined ? undefined : formatOfferValue(detail, offer[detail]),
    })),
    ...fields.map((field) => ({
      key: customKey(field.id),
      label: field.name,
      value: offer.custom?.[field.id],
    })),
    // A scored detail with nothing entered still shows, with its score.
  ].filter((row) => row.value !== undefined || scores[row.key] !== undefined);
  // Weighted by how much each detail counts (feature 014), so it waits for the settings.
  const overall = data && offerOverall(scores, fields, data.weights);
  const history = [...(o.offerHistory ?? [])].reverse();

  return (
    <section aria-labelledby="offer-heading" className={styles.section}>
      <h3 id="offer-heading">Offer</h3>
      <div className={page.actions}>
        <Link to={editPath} className={page.secondaryLink}>
          Edit offer
        </Link>
        <RemoveInterview
          label="Remove offer"
          triggerText="Remove offer"
          title="Remove this offer? Its scores and its history go too. This can't be undone."
          onRemove={() => remove.mutateAsync(undefined)}
        />
      </div>
      {data && (
        <p>
          Overall score:{' '}
          {overall === undefined ? 'Not scored' : <ScoreBadge score={overall} overall />}
        </p>
      )}
      {rows.length > 0 ? (
        <dl className={page.facts}>
          {rows.map((row) => (
            <div key={row.key} className={styles.row}>
              <dt>{row.label}</dt>
              <dd className={styles.value}>
                {row.value ?? <span className={page.muted}>Not entered</span>}
                {scores[row.key] !== undefined && <ScoreBadge score={scores[row.key] as number} />}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={page.muted}>No details yet.</p>
      )}
      {history.length > 0 && (
        <>
          <h4 className={styles.group}>Offer history</h4>
          <ol className={styles.history} aria-label="Offer history">
            {history.map((entry) => (
              <li key={entry.seq}>
                <span className={styles.entryTitle}>
                  {entry.kind === 'RECORDED' ? 'Offer recorded' : 'Offer changed'} ·{' '}
                  {formatDate(entry.at)}
                </span>
                {entry.via === 'CLAUDE' && <span className={page.muted}> · via Claude</span>}
                {entry.changes.length > 0 && (
                  <ul className={styles.changes}>
                    {entry.changes.map((change) => (
                      <li key={change.field}>
                        {offerChangeLine(change, entry.kind, fields, removed)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
