import { SCORE_VALUES, scoreText, scoreTone, scoreWord } from '@jot/shared';
import styles from './ScoreCell.module.css';

// Offer scores (feature 013): 0 "Not offered", then 1 worst to 5 best. Each shows its number
// and word on a tinted background, so the color is never the only cue (WCAG 1.4.1), and every
// tint keeps the text at 4.5:1 or more (1.4.3; tests/score-colors.test.ts).

export const scoreClass = (score: number): string => styles[`score${score}`] ?? '';

// A score, or an overall average shown to one decimal place in the tone of its nearest score.
export function ScoreBadge({ score, overall = false }: { score: number; overall?: boolean }) {
  const tone = scoreTone(score);
  return (
    <span className={`${styles.badge} ${scoreClass(tone)}`}>
      {overall ? `${score.toFixed(1)} · ${scoreWord(tone)}` : scoreText(score)}
    </span>
  );
}

// Choosing a score: "Not scored", then each score with its word. The cell takes its color.
export function ScoreSelect({
  label,
  score,
  disabled = false,
  onChange,
}: {
  label: string;
  score: number | undefined;
  disabled?: boolean;
  onChange: (score: number | null) => void;
}) {
  return (
    <select
      aria-label={label}
      className={`${styles.select} ${score === undefined ? '' : scoreClass(score)}`}
      value={score ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      <option value="">Not scored</option>
      {SCORE_VALUES.map((value) => (
        <option key={value} value={value}>
          {scoreText(value)}
        </option>
      ))}
    </select>
  );
}

// The scale, explained in words beside its colors.
export function ScoreLegend() {
  return (
    <ul className={styles.legend} aria-label="Score scale">
      {SCORE_VALUES.map((value) => (
        <li key={value}>
          <ScoreBadge score={value} />
        </li>
      ))}
    </ul>
  );
}
