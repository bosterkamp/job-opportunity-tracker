import {
  dayToTimestamp,
  InterviewInputSchema,
  InterviewPatchSchema,
  interviewDateProblem,
  localDate,
  type InterviewInput,
  type InterviewPatch,
} from '@jot/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import own from './InterviewForm.module.css';
import styles from './OpportunityForm.module.css';

// Logging an interview, or changing one (feature 005): the day it happened and an optional
// note. The rules are the API's own, checked here first so a problem shows on its field.

interface CommonProps {
  // The opportunity's date added: an interview can't be before it.
  createdAt: string;
  submitLabel: string;
  submitting?: boolean;
  serverError?: string;
  onCancel: () => void;
}

// Adding starts on today with no note, and sends an input; changing one starts from its
// current moment and note, and sends only what changed.
type InterviewFormProps = CommonProps &
  (
    | { initial?: undefined; onSubmit: (input: InterviewInput) => void }
    | {
        initial: { heldAt: string; note: string | null };
        onSubmit: (patch: InterviewPatch) => void;
      }
  );

type Field = 'heldAt' | 'note';

export function InterviewForm({
  createdAt,
  initial,
  submitLabel,
  submitting = false,
  serverError,
  onSubmit,
  onCancel,
}: InterviewFormProps) {
  const id = useId();
  const startDay = initial ? localDate(new Date(initial.heldAt)) : localDate();
  const startNote = initial?.note ?? '';
  const [day, setDay] = useState(startDay);
  const [note, setNote] = useState(startNote);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [focusRequest, setFocusRequest] = useState({});
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed save, focus the first field with a problem (it's rendered by then).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Only what changed is sent. An unchanged day on a new interview means now.
    const heldAt =
      day !== startDay && day !== '' ? dayToTimestamp(day, { notBefore: createdAt }) : undefined;
    const body = {
      ...(heldAt && { heldAt }),
      ...(initial ? note !== startNote && { note } : { note }),
    };
    const parsed = (initial ? InterviewPatchSchema : InterviewInputSchema).safeParse(body);
    const found: Partial<Record<Field, string>> = {};
    const dateProblem = heldAt && interviewDateProblem(heldAt, new Date(), createdAt);
    // Stryker disable next-line ConditionalExpression: setting an undefined problem shows nothing either
    if (dateProblem) {
      found.heldAt = dateProblem;
    }
    for (const issue of parsed.error?.issues ?? []) {
      found[issue.path[0] as Field] ??= issue.message;
    }
    setErrors(found);
    if (parsed.success && !dateProblem) {
      // The schema matches the variant, so the data has the shape onSubmit expects.
      (onSubmit as (data: InterviewInput | InterviewPatch) => void)(parsed.data);
      return;
    }
    setFocusRequest({});
  }

  const describedBy = (field: Field) => (errors[field] ? `${id}-${field}-error` : undefined);

  return (
    <form
      ref={formRef}
      className={`${styles.form} ${own.panel}`}
      onSubmit={handleSubmit}
      aria-label={initial ? 'Change interview' : 'Add interview'}
      noValidate
    >
      <div className={styles.pair}>
        <div className={styles.field}>
          <label htmlFor={`${id}-date`} className={styles.label}>
            Date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            className={styles.input}
            value={day}
            max={localDate()}
            onChange={(event) => setDay(event.target.value)}
            aria-invalid={errors.heldAt ? true : undefined}
            aria-describedby={describedBy('heldAt')}
          />
          {errors.heldAt && (
            <p id={`${id}-heldAt-error`} className={styles.error}>
              {errors.heldAt}
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-note`} className={styles.label}>
            Note
          </label>
          <input
            id={`${id}-note`}
            type="text"
            className={styles.input}
            value={note}
            placeholder="Hiring manager, panel…"
            onChange={(event) => setNote(event.target.value)}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={describedBy('note')}
          />
          {errors.note && (
            <p id={`${id}-note-error`} className={styles.error}>
              {errors.note}
            </p>
          )}
        </div>
      </div>
      {serverError && (
        <p role="alert" className={styles.alert}>
          {serverError}
        </p>
      )}
      <div className={own.buttons}>
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className={own.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
