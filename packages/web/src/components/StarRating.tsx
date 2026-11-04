import styles from './StarRating.module.css';

const LEVELS = [1, 2, 3, 4, 5];

export const ratingText = (value: number | null) =>
  value === null ? 'Not rated' : `Interest: ${value} of 5`;

interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
  // Shared by the radio buttons; must be unique on the page.
  name?: string;
}

// Interest level, 1–5 stars, or not rated. Built from real radio buttons, so arrow keys,
// screen readers, and touch all work without extra code.
export function StarRating({ value, onChange, name = 'interest' }: StarRatingProps) {
  return (
    <fieldset className={styles.rating}>
      <legend className={styles.legend}>Interest</legend>
      <div className={styles.stars}>
        {LEVELS.map((level) => (
          <label key={level} className={styles.star}>
            <input
              type="radio"
              name={name}
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              className={styles.radio}
            />
            <span aria-hidden="true">{level <= (value ?? 0) ? '★' : '☆'}</span>
            <span className={styles.visuallyHidden}>{level} of 5</span>
          </label>
        ))}
      </div>
      <p className={styles.status} aria-live="polite">
        {ratingText(value)}
      </p>
      {value !== null && (
        <button type="button" className={styles.clear} onClick={() => onChange(null)}>
          Clear rating
        </button>
      )}
    </fieldset>
  );
}

// Read-only stars for cards and the detail page.
export function StarDisplay({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className={styles.notRated}>Not rated</span>;
  }
  return (
    <span role="img" aria-label={ratingText(value)} className={styles.display}>
      {'★'.repeat(value)}
      {'☆'.repeat(5 - value)}
    </span>
  );
}
