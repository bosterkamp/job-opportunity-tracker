import {
  INTERVIEW_FORMATS,
  INTERVIEW_KINDS,
  INTERVIEW_MESSAGES,
  INTERVIEW_OUTCOMES,
  InterviewInputSchema,
  InterviewPatchSchema,
  interviewDateProblem,
  interviewFormatLabel,
  interviewKindLabel,
  interviewOutcomeLabel,
  isPastInterview,
  MAX_INTERVIEWERS,
  type Interview,
  type InterviewInput,
  type InterviewPatch,
} from '@jot/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toLocalInputValue } from './MoveStageMenu';
import own from './InterviewForm.module.css';
import styles from './OpportunityForm.module.css';

// Adding an interview, or changing one (features 005 and 012): when it is, its details, a
// note, and who was in it. The rules are the API's own, checked here first so a problem shows
// on its field.

interface CommonProps {
  // The opportunity's date added: an interview can't be before it.
  createdAt: string;
  submitLabel: string;
  submitting?: boolean;
  serverError?: string;
  onCancel: () => void;
}

// Adding starts now with nothing filled in, and sends an input; changing one starts from the
// interview, and sends only what changed.
type InterviewFormProps = CommonProps &
  (
    | { initial?: undefined; onSubmit: (input: InterviewInput) => void }
    | { initial: Interview; onSubmit: (patch: InterviewPatch) => void }
  );

const PERSON_FIELDS = [
  ['name', 'Name', 'text'],
  ['title', 'Title', 'text'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone', 'tel'],
  ['linkedin', 'LinkedIn', 'url'],
] as const;
type PersonField = (typeof PERSON_FIELDS)[number][0];
type Row = Record<PersonField, string> & { key: number };

let nextRowKey = 0;
const toRow = (person: Partial<Record<PersonField, string>> = {}): Row => ({
  // Stryker disable next-line UpdateOperator: counting down keeps the keys unique too
  key: nextRowKey++,
  name: person.name ?? '',
  title: person.title ?? '',
  email: person.email ?? '',
  phone: person.phone ?? '',
  linkedin: person.linkedin ?? '',
});
// The rows' details, to tell whether the list changed.
const comparable = (rows: readonly Record<PersonField, string>[]) =>
  JSON.stringify(rows.map((row) => PERSON_FIELDS.map(([field]) => row[field])));

function aYearFromNow(): Date {
  const later = new Date();
  later.setFullYear(later.getFullYear() + 1);
  return later;
}

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
  const [start] = useState(() => ({
    when: toLocalInputValue(initial ? new Date(initial.heldAt) : new Date()),
    kind: initial?.kind ?? '',
    panel: initial?.panel ?? false,
    format: initial?.format ?? '',
    outcome: initial?.outcome ?? '',
    nextSteps: initial?.nextSteps ?? '',
    note: initial?.note ?? '',
    rows: (initial?.interviewers ?? []).map((person) => toRow(person)),
  }));
  const [when, setWhen] = useState(start.when);
  const [kind, setKind] = useState<string>(start.kind);
  const [panel, setPanel] = useState(start.panel);
  const [format, setFormat] = useState<string>(start.format);
  const [outcome, setOutcome] = useState<string>(start.outcome);
  const [nextSteps, setNextSteps] = useState(start.nextSteps);
  const [note, setNote] = useState(start.note);
  const [rows, setRows] = useState(start.rows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusRequest, setFocusRequest] = useState({});
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed save, focus the first field with a problem (it's rendered by then).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  // A new interviewer's name gets focus. Before any is added, no element has the id.
  useEffect(() => {
    document.getElementById(`${id}-person-${focusRow}-name`)?.focus();
  }, [focusRow, id]);

  // A changed, non-empty time is sent; otherwise the interview keeps its time (or, when
  // adding, the API dates it now).
  const heldAt = when !== start.when && when !== '' ? new Date(when).toISOString() : undefined;
  const past = isPastInterview(heldAt ?? initial?.heldAt ?? new Date().toISOString(), new Date());

  function changed<T>(value: T, from: T): T | undefined {
    return !initial || value !== from ? value : undefined;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const people = rows.map(({ key: _key, ...person }) => person);
    const peopleChanged = comparable(people) !== comparable(start.rows);
    const body = {
      heldAt,
      kind: changed(kind, start.kind),
      // A new interview is a panel only when ticked; a change sends the new answer.
      panel: initial ? changed(panel, start.panel) : panel || undefined,
      format: changed(format, start.format),
      // Only once it's happened (feature 012); a stored answer stays while it's upcoming.
      outcome: past ? changed(outcome, start.outcome) : undefined,
      nextSteps: changed(nextSteps, start.nextSteps),
      note: changed(note, start.note),
      // A new interview's empty list is dropped by the schema; a change sends the whole list.
      interviewers: !initial || peopleChanged ? people : undefined,
    };
    const parsed = (initial ? InterviewPatchSchema : InterviewInputSchema).safeParse(body);
    const found: Record<string, string> = {};
    const dateProblem = heldAt && interviewDateProblem(heldAt, new Date(), createdAt);
    // Stryker disable next-line ConditionalExpression: setting an undefined problem shows nothing either
    if (dateProblem) {
      found.heldAt = dateProblem;
    }
    for (const issue of parsed.error?.issues ?? []) {
      found[issue.path.join('.')] ??= issue.message;
    }
    setErrors(found);
    if (parsed.success && !dateProblem) {
      // The schema matches the variant, so the data has the shape onSubmit expects.
      (onSubmit as (data: InterviewInput | InterviewPatch) => void)(parsed.data);
      return;
    }
    setFocusRequest({});
  }

  // The props that tie a control to its problem, if it has one.
  const problemProps = (path: string) => ({
    'aria-invalid': errors[path] ? true : undefined,
    'aria-describedby': errors[path] ? `${id}-${path}-error` : undefined,
  });
  const problem = (path: string) =>
    errors[path] && (
      <p id={`${id}-${path}-error`} className={styles.error}>
        {errors[path]}
      </p>
    );

  // A drop-down. Its choices are the schema's own, so it never has a problem to show.
  function choice(
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: readonly string[],
    optionLabel: (value: never) => string,
  ): ReactNode {
    return (
      <label className={styles.field}>
        <span className={styles.label}>{label}</span>
        <select
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Not set</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option as never)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function setPerson(key: number, field: PersonField, value: string) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  function addPerson() {
    const row = toRow();
    setRows((current) => [...current, row]);
    setFocusRow(row.key);
  }

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
          <label htmlFor={`${id}-heldAt`} className={styles.label}>
            Date and time
          </label>
          <input
            id={`${id}-heldAt`}
            type="datetime-local"
            className={styles.input}
            value={when}
            max={toLocalInputValue(aYearFromNow())}
            onChange={(event) => setWhen(event.target.value)}
            {...problemProps('heldAt')}
          />
          {problem('heldAt')}
        </div>
        {choice('Type', kind, setKind, INTERVIEW_KINDS, interviewKindLabel)}
      </div>
      <div className={styles.pair}>
        {choice('Format', format, setFormat, INTERVIEW_FORMATS, interviewFormatLabel)}
        {/* The whole label is the tap target, so it's full size on phones. */}
        <label className={own.check}>
          <input
            type="checkbox"
            checked={panel}
            onChange={(event) => setPanel(event.target.checked)}
          />
          Panel interview
        </label>
      </div>
      {past ? (
        choice('How it went', outcome, setOutcome, INTERVIEW_OUTCOMES, interviewOutcomeLabel)
      ) : (
        <p className={own.hint}>You can say how it went once it's happened.</p>
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-nextSteps`} className={styles.label}>
          Next steps
        </label>
        <textarea
          id={`${id}-nextSteps`}
          className={styles.input}
          rows={2}
          value={nextSteps}
          placeholder="They'll decide by Friday…"
          onChange={(event) => setNextSteps(event.target.value)}
          {...problemProps('nextSteps')}
        />
        {problem('nextSteps')}
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
          onChange={(event) => setNote(event.target.value)}
          {...problemProps('note')}
        />
        {problem('note')}
      </div>

      <div className={own.people}>
        <h3 className={own.peopleHeading}>Interviewers</h3>
        {rows.map((row, index) => {
          const place = index + 1;
          return (
            <fieldset key={row.key} className={own.person}>
              <legend className={own.legend}>Interviewer {place}</legend>
              <div className={own.personFields}>
                {PERSON_FIELDS.map(([field, label, type]) => {
                  const path = `interviewers.${index}.${field}`;
                  return (
                    <div key={field} className={styles.field}>
                      <label htmlFor={`${id}-person-${row.key}-${field}`} className={styles.label}>
                        {label}
                      </label>
                      <input
                        id={`${id}-person-${row.key}-${field}`}
                        type={type}
                        className={styles.input}
                        value={row[field]}
                        placeholder={field === 'linkedin' ? 'linkedin.com/in/…' : undefined}
                        onChange={(event) => setPerson(row.key, field, event.target.value)}
                        {...problemProps(path)}
                      />
                      {problem(path)}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className={own.cancel}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              >
                {row.name.trim() ? `Remove ${row.name.trim()}` : `Remove interviewer ${place}`}
              </button>
            </fieldset>
          );
        })}
        <button
          type="button"
          className={own.cancel}
          onClick={addPerson}
          disabled={rows.length >= MAX_INTERVIEWERS}
        >
          Add interviewer
        </button>
        {rows.length >= MAX_INTERVIEWERS && (
          <p className={own.hint}>{INTERVIEW_MESSAGES.TOO_MANY_INTERVIEWERS}</p>
        )}
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
