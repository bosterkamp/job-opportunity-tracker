import { combineQueries } from '../api/combineQueries';
import { useOfferFields, useOpportunities } from '../api/hooks';
import { OfferFields } from '../components/OfferFields';
import { OfferWeights } from '../components/OfferWeights';
import { QueryState } from '../components/QueryState';
import styles from './Settings.module.css';

// The owner's configuration (feature 014). One section today, the offer comparison: the custom
// fields every offer shares, and how much each detail counts toward the overall score. Each kind
// of setting is a section of its own. The opportunities are loaded to say how many offers have a
// value for a field before it's removed (only an opportunity with an offer can have one).
export function SettingsPage() {
  const settings = useOfferFields();
  const open = useOpportunities('OPEN');
  const closed = useOpportunities('CLOSED');
  const opportunities = open.data && closed.data ? [...open.data, ...closed.data] : undefined;

  return (
    <>
      <h2>Settings</h2>
      <QueryState what="your settings" {...combineQueries([settings, open, closed])} />
      {settings.data && opportunities && (
        <section aria-labelledby="offer-comparison-heading" className={styles.section}>
          <h3 id="offer-comparison-heading">Offer comparison</h3>
          <OfferFields offers={opportunities} />
          <OfferWeights settings={settings.data} />
        </section>
      )}
    </>
  );
}
