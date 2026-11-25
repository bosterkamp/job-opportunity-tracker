import { MAX_COMPARE } from '@jot/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import styles from './compareSelection.module.css';

// Picking offers to compare (feature 013), on the Offers page and the board's Offer column.
// Each page keeps its own ticks, in the order ticked, and leaving the page clears them.

export interface CompareSelection {
  ids: readonly string[];
  isTicked: (id: string) => boolean;
  // Three are ticked, so no more can be.
  full: boolean;
  toggle: (id: string) => void;
}

export function useCompareSelection(): CompareSelection {
  const [ids, setIds] = useState<readonly string[]>([]);
  return {
    ids,
    isTicked: (id) => ids.includes(id),
    full: ids.length >= MAX_COMPARE,
    toggle: (id) =>
      setIds((current) =>
        // A full selection's other boxes are disabled, so a tick never makes four.
        current.includes(id) ? current.filter((ticked) => ticked !== id) : [...current, id],
      ),
  };
}

export const comparePath = (ids: readonly string[]) =>
  `/offers/compare?ids=${ids.map(encodeURIComponent).join(',')}`;

export const COMPARE_LIMIT_MESSAGE = `You can compare up to ${MAX_COMPARE} offers`;

// The tick box for one offer. Its whole label is the tap target, so it's full size on phones.
export function CompareCheckbox({
  selection,
  id,
  name,
}: {
  selection: CompareSelection;
  id: string;
  // Who it is, for screen readers: "Compare Acme, Staff Engineer".
  name: string;
}) {
  const ticked = selection.isTicked(id);
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={ticked}
        disabled={!ticked && selection.full}
        aria-label={`Compare ${name}`}
        onChange={() => selection.toggle(id)}
      />
      <span aria-hidden="true">Compare</span>
    </label>
  );
}

// "Compare 2" once two or three are ticked, and the limit once three are. Nothing until one is.
export function CompareBar({ selection }: { selection: CompareSelection }) {
  const count = selection.ids.length;
  if (count === 0) {
    return null;
  }
  return (
    <div className={styles.bar}>
      {count >= 2 && (
        <Link to={comparePath(selection.ids)} className={styles.compare}>
          Compare {count}
        </Link>
      )}
      <p role="status" className={styles.limit}>
        {selection.full ? COMPARE_LIMIT_MESSAGE : ''}
      </p>
    </div>
  );
}
