import {
  MAX_COMPARE,
  OFFER_DETAILS,
  customKey,
  importanceWord,
  NORMAL_IMPORTANCE,
  offerDetailLabel,
  offerOverall,
  weightOf,
  type OfferFields as Settings,
  type OpportunityWithHistory,
} from '@jot/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import { combineQueries } from '../api/combineQueries';
import { useOfferFields, useOpportunitiesById, useSetOfferScores } from '../api/hooks';
import { QueryState } from '../components/QueryState';
import { ScoreBadge, ScoreLegend, ScoreSelect } from '../components/ScoreCell';
import { formatOfferValue } from '../offerFormat';
import styles from './CompareOffers.module.css';
import page from './Page.module.css';

const NO_SETTINGS: Settings = { fields: [], removed: [], weights: {}, version: 0 };

// The ids in the address, at most three, each once.
export function compareIds(param: string | null): string[] {
  const ids = (param ?? '').split(',').filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

interface Row {
  key: string;
  label: string;
  value: (o: OpportunityWithHistory) => string | undefined;
}

// Offers side by side (feature 013): each offer a column, each detail and custom field a row,
// with a score in every cell and the overall at the bottom. The address names the offers, so
// the comparison can be reloaded or opened again.
export function CompareOffersPage() {
  const [searchParams] = useSearchParams();
  const ids = compareIds(searchParams.get('ids'));
  const results = useOpportunitiesById(ids);
  const fields = useOfferFields();

  const state = combineQueries([...results, fields], { ignore: isGone });
  const loaded = results.flatMap((r) => (r.data ? [r.data] : []));
  const gone = results.filter((r) => isGone(r.error)).length;

  return (
    <>
      <h2>Compare offers</h2>
      <QueryState what="these offers" {...state} skeleton="detail" />
      {!state.isPending && !state.error && (
        <>
          {gone > 0 && (
            <p role="status" className={page.muted}>
              {gone === 1
                ? '1 offer is no longer available.'
                : `${gone} offers are no longer available.`}
            </p>
          )}
          {loaded.length < 2 ? (
            <div className={page.empty}>
              <p>Pick at least 2 offers to compare.</p>
              <Link to="/offers" className={page.secondaryLink}>
                Go to Offers
              </Link>
            </div>
          ) : (
            <Comparison offers={loaded} settings={fields.data ?? NO_SETTINGS} />
          )}
        </>
      )}
    </>
  );
}

const isGone = (error: unknown) => error instanceof ApiError && error.status === 404;

function Comparison({
  offers,
  settings,
}: {
  offers: OpportunityWithHistory[];
  settings: Settings;
}) {
  const { fields, weights } = settings;
  const rows: Row[] = [
    ...OFFER_DETAILS.map((detail) => ({
      key: detail,
      label: offerDetailLabel(detail),
      value: (o: OpportunityWithHistory) => {
        const value = o.offer?.[detail];
        return value === undefined ? undefined : formatOfferValue(detail, value);
      },
    })),
    ...fields.map((field) => ({
      key: customKey(field.id),
      label: field.name,
      value: (o: OpportunityWithHistory) => o.offer?.custom?.[field.id],
    })),
  ];

  return (
    <>
      <div className={styles.frame} tabIndex={0} role="region" aria-label="Offers side by side">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                Detail
              </th>
              {offers.map((o) => (
                <th key={o.id} scope="col" className={styles.offer}>
                  <Link to={`/opportunities/${o.id}`}>{o.company}</Link>
                  <span className={styles.offerTitle}>{o.title}</span>
                  {!o.offer && (
                    <Link to={`/opportunities/${o.id}/offer`} className={page.secondaryLink}>
                      Add offer
                    </Link>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className={styles.detail}>
                  {row.label}
                  <Importance weight={weightOf(row.key, weights)} />
                </th>
                {offers.map((o) => (
                  <td key={o.id}>
                    <span className={styles.value}>{row.value(o) ?? '—'}</span>
                    {o.offer && <ScoreControl opportunity={o} row={row} />}
                  </td>
                ))}
              </tr>
            ))}
            <tr className={styles.overallRow}>
              <th scope="row" className={styles.detail}>
                Overall
              </th>
              {offers.map((o) => {
                const overall = offerOverall(o.offerScores, fields, weights);
                return (
                  <td key={o.id}>
                    {overall === undefined ? 'Not scored' : <ScoreBadge score={overall} overall />}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <h3 className={styles.legendTitle}>What the scores mean</h3>
      <ScoreLegend />
      <p>
        <Link to="/settings" className={page.secondaryLink}>
          Change what each detail counts
        </Link>
      </p>
    </>
  );
}

// How much a row counts toward the overall (feature 014), beside its name unless it's Normal.
function Importance({ weight }: { weight: number }) {
  if (weight === NORMAL_IMPORTANCE) {
    return null;
  }
  // The separator is the header's own text, so its accessible name keeps the spaces.
  return (
    <>
      {' · '}
      {weight === 0 ? (
        <span className={styles.ignored}>Ignored, doesn&apos;t count</span>
      ) : (
        <span className={styles.importance}>{importanceWord(weight)}</span>
      )}
    </>
  );
}

// One cell's score. It shows the new score while it saves, and the old one again, with the
// reason, if it can't be saved.
function ScoreControl({ opportunity: o, row }: { opportunity: OpportunityWithHistory; row: Row }) {
  const save = useSetOfferScores(o.id);
  const [pending, setPending] = useState<{ score: number | null } | null>(null);
  const stored = o.offerScores?.[row.key];
  const shown = pending ? (pending.score ?? undefined) : stored;

  return (
    <>
      <ScoreSelect
        label={`Score ${row.label} for ${o.company}`}
        score={shown}
        onChange={(score) => {
          setPending({ score });
          save.mutate({ [row.key]: score }, { onSettled: () => setPending(null) });
        }}
      />
      {save.error && !pending && (
        <p role="alert" className={styles.error}>
          Couldn't save the score. {save.error.message}
        </p>
      )}
    </>
  );
}
