import {
  IMPORTANCE_VALUES,
  OFFER_DETAILS,
  customKey,
  importanceText,
  offerDetailLabel,
  weightOf,
  type OfferFields as Settings,
} from '@jot/shared';
import { useId, useState } from 'react';
import { useSaveOfferWeight } from '../api/hooks';
import styles from './OfferWeights.module.css';

// How much each offer detail counts toward the overall score (feature 014): every built-in
// detail, then each custom field, each with its importance. A change is saved on its own.

interface Row {
  key: string;
  label: string;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...map };
  delete rest[key];
  return rest;
}

export function OfferWeights({ settings }: { settings: Settings }) {
  const id = useId();
  const save = useSaveOfferWeight();
  // The value shown while a change saves, by key.
  const [pending, setPending] = useState<Record<string, number>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const rows: Row[] = [
    ...OFFER_DETAILS.map((detail) => ({ key: detail, label: offerDetailLabel(detail) })),
    ...settings.fields.map((field) => ({ key: customKey(field.id), label: field.name })),
  ];
  const nothingCounts = rows.every((row) => weightOf(row.key, settings.weights) === 0);

  function change(row: Row, importance: number) {
    setPending((now) => ({ ...now, [row.key]: importance }));
    setProblems((now) => without(now, row.key));
    setSaved(false);
    save(row.key, importance)
      .then(
        () => setSaved(true),
        (error: Error) =>
          setProblems((now) => ({
            ...now,
            [row.key]: `Couldn't save how much ${row.label} counts. ${error.message}`,
          })),
      )
      .finally(() => setPending((now) => without(now, row.key)));
  }

  return (
    <section aria-labelledby={`${id}-heading`} className={styles.section}>
      <h4 id={`${id}-heading`}>How much each detail counts</h4>
      <p className={styles.hint}>
        Each offer's overall score weighs its scores by these. A Critical detail counts three times
        a Normal one, an Important one twice, and an Ignored one not at all.
      </p>
      {nothingCounts && (
        <p className={styles.warning}>
          Nothing counts toward the overall score while every detail is Ignored.
        </p>
      )}
      <ul className={styles.list} aria-label="How much each detail counts">
        {rows.map((row) => {
          const selectId = `${id}-${row.key}`;
          const problem = problems[row.key];
          return (
            <li key={row.key} className={styles.row}>
              <label htmlFor={selectId} className={styles.name}>
                {row.label}
              </label>
              <select
                id={selectId}
                aria-label={`How much ${row.label} counts`}
                className={styles.select}
                value={pending[row.key] ?? weightOf(row.key, settings.weights)}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${selectId}-problem` : undefined}
                onChange={(event) => change(row, Number(event.target.value))}
              >
                {IMPORTANCE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {importanceText(value)}
                  </option>
                ))}
              </select>
              {problem && (
                <p id={`${selectId}-problem`} role="alert" className={styles.problem}>
                  {problem}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p role="status" className={styles.status}>
        {saved ? 'Saved' : ''}
      </p>
    </section>
  );
}
