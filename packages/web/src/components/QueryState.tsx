import { useOnline } from '../useOnline';
import styles from './QueryState.module.css';

interface QueryStateProps {
  // What is loading, as in "Couldn't load your opportunities."
  what: string;
  isPending: boolean;
  error: Error | null;
  onRetry: () => void;
  // A retry (or another fetch) is in flight.
  retrying: boolean;
  // The shape of the placeholder: a grid of cards, or one opportunity's details.
  skeleton?: 'cards' | 'detail';
}

const SKELETON_BLOCKS = { cards: 3, detail: 5 };

// The loading and failure states every page shares: a skeleton while loading,
// then an error banner with "Try again". Offline, it says so; TanStack Query refetches by
// itself when the connection comes back. Renders nothing once the data has loaded.
export function QueryState({
  what,
  isPending,
  error,
  onRetry,
  retrying,
  skeleton = 'cards',
}: QueryStateProps) {
  const online = useOnline();

  if (isPending) {
    return (
      <div role="status" className={styles[skeleton]}>
        <span className={styles.visuallyHidden}>Loading…</span>
        {Array.from({ length: SKELETON_BLOCKS[skeleton] }, (_, i) => (
          <div key={i} aria-hidden="true" className={styles.block} />
        ))}
      </div>
    );
  }
  if (!error) {
    return null;
  }
  return (
    <div role="alert" className={styles.alert}>
      <p>
        {online
          ? `Couldn't load ${what}. ${error.message}`
          : `You're offline, so ${what} couldn't load. They'll load again when you reconnect.`}
      </p>
      <button type="button" className={styles.retry} onClick={onRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}
