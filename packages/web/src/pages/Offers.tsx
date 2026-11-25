import {
  isOffer,
  localDate,
  offerOverall,
  respondByText,
  stageLabel,
  type OfferField,
  type Opportunity,
} from '@jot/shared';
import { Link } from 'react-router';
import { combineQueries } from '../api/combineQueries';
import { useOfferFields, useOpportunities } from '../api/hooks';
import { OfferFields } from '../components/OfferFields';
import { QueryState } from '../components/QueryState';
import { ScoreBadge } from '../components/ScoreCell';
import {
  CompareBar,
  CompareCheckbox,
  useCompareSelection,
} from '../features/offers/compareSelection';
import { formatCalendarDate } from '../format';
import { formatOfferValue } from '../offerFormat';
import styles from './Offers.module.css';
import page from './Page.module.css';

const NO_FIELDS: OfferField[] = [];

// Every opportunity with an offer, or in the Offer stage, open ones first (feature 013). Tick
// two or three to compare them.
export function OffersPage() {
  const open = useOpportunities('OPEN');
  const closed = useOpportunities('CLOSED');
  const fields = useOfferFields();
  const offers =
    open.data && closed.data ? [...open.data, ...closed.data].filter(isOffer) : undefined;

  return (
    <>
      <h2>Offers</h2>
      <QueryState what="your offers" {...combineQueries([open, closed])} />
      {offers?.length === 0 && (
        <div className={page.empty}>
          <p>No offers yet. Add one from an opportunity's page, or move one to the Offer stage.</p>
        </div>
      )}
      {offers && offers.length > 0 && (
        <OfferList offers={offers} fields={fields.data?.fields ?? NO_FIELDS} />
      )}
      {offers && <OfferFields manage offers={offers} />}
    </>
  );
}

function OfferList({ offers, fields }: { offers: Opportunity[]; fields: readonly OfferField[] }) {
  const selection = useCompareSelection();
  const today = localDate();

  return (
    <>
      <CompareBar selection={selection} />
      <ul className={styles.list} aria-label="Offers">
        {offers.map((o) => {
          const respondBy = respondByText(o.offer?.respondBy, today, o.status, (ymd) =>
            formatCalendarDate(ymd),
          );
          const overall = offerOverall(o.offerScores, fields);
          return (
            <li key={o.id} className={styles.row}>
              <CompareCheckbox selection={selection} id={o.id} name={`${o.company}, ${o.title}`} />
              <div className={styles.who}>
                <Link to={`/opportunities/${o.id}`} className={styles.company}>
                  {o.company}
                </Link>
                <span>{o.title}</span>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>Stage</dt>
                  <dd>{stageLabel(o.stage)}</dd>
                </div>
                {o.offer ? (
                  <>
                    <div>
                      <dt>Base salary</dt>
                      <dd>
                        {o.offer.baseSalary === undefined
                          ? 'Not entered'
                          : formatOfferValue('baseSalary', o.offer.baseSalary)}
                      </dd>
                    </div>
                    <div>
                      <dt>Overall</dt>
                      <dd>
                        {overall === undefined ? (
                          'Not scored'
                        ) : (
                          <ScoreBadge score={overall} overall />
                        )}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Offer</dt>
                    <dd>
                      No details yet ·{' '}
                      <Link to={`/opportunities/${o.id}/offer`} className={styles.inlineLink}>
                        Add offer
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
              {respondBy && (
                <p className={respondBy.warning ? page.due : page.muted}>{respondBy.text}</p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
