import {
  OFFER_DETAILS,
  OfferInputSchema,
  WORK_ARRANGEMENTS,
  offerDetailLabel,
  parseAmount,
  type OfferDetail,
  type OfferField,
  type OfferInput,
  type OpportunityWithHistory,
} from '@jot/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { WORK_ARRANGEMENT_LABELS } from '../format';
import own from './InterviewForm.module.css';
import styles from './OpportunityForm.module.css';

// Recording an offer, or changing it (feature 013): every detail optional, and a value for
// each custom field. The rules are the API's own, checked here first so a problem shows on
// its field. A change sends only what changed.

type Kind = 'amount' | 'percent' | 'line' | 'text' | 'date' | 'arrangement';

const KINDS: Record<OfferDetail, Kind> = {
  baseSalary: 'amount',
  bonusPercent: 'percent',
  signOnBonus: 'amount',
  equity: 'text',
  retirement: 'text',
  insurance: 'text',
  location: 'line',
  workArrangement: 'arrangement',
  title: 'line',
  role: 'text',
  pto: 'line',
  leadership: 'text',
  culture: 'text',
  startDate: 'date',
  respondBy: 'date',
};

const PLACEHOLDERS: Partial<Record<OfferDetail, string>> = {
  baseSalary: '165,000 or 165k',
  bonusPercent: '10',
  signOnBonus: '10,000',
  retirement: '100% match up to 6%',
  pto: '20 days',
};

const FORM_LABELS: Partial<Record<OfferDetail, string>> = {
  bonusPercent: 'Bonus (%)',
  retirement: '401k contribution',
  insurance: 'Insurance benefits',
};

interface OfferFormProps {
  opportunity: OpportunityWithHistory;
  fields: readonly OfferField[];
  submitLabel: string;
  submitting: boolean;
  serverError?: string;
  serverFields: readonly string[];
  onSubmit: (input: OfferInput) => void;
  onCancel: () => void;
}

const customPath = (fieldId: string) => `custom.${fieldId}`;

// The form's starting text: the offer's values, or for a new offer the opportunity's own
// title, location and work arrangement (FR-003).
function startValues(o: OpportunityWithHistory, fields: readonly OfferField[]) {
  const offer = o.offer ?? {
    title: o.title,
    location: o.location,
    workArrangement: o.workArrangement,
  };
  const values: Record<string, string> = {};
  for (const detail of OFFER_DETAILS) {
    const value = (offer as Partial<Record<OfferDetail, string | number>>)[detail];
    values[detail] = value === undefined ? '' : String(value);
  }
  for (const field of fields) {
    values[customPath(field.id)] = o.offer?.custom?.[field.id] ?? '';
  }
  return values;
}

// What the text becomes in the request: amounts through the salary range's parser ("165k"),
// the bonus as a number, the rest as text. A value that isn't a number is sent as typed, so
// the schema refuses it with its own message.
function toValue(kind: Kind, text: string): unknown {
  if (text.trim() === '') {
    return null;
  }
  if (kind === 'amount') {
    return parseAmount(text);
  }
  if (kind === 'percent') {
    const number = Number(text);
    return Number.isFinite(number) ? number : text;
  }
  return text;
}

export function OfferForm({
  opportunity,
  fields,
  submitLabel,
  submitting,
  serverError,
  serverFields,
  onSubmit,
  onCancel,
}: OfferFormProps) {
  const id = useId();
  const adding = !opportunity.offer;
  const [start] = useState(() => startValues(opportunity, fields));
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusRequest, setFocusRequest] = useState({});
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed save, focus the first field with a problem (it's rendered by then).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  // Every path has a value from the start.
  const text = (path: string) => values[path] ?? '';

  // Only changes are sent; when adding, an empty field is simply left out.
  const changed = (path: string) => (adding ? text(path) !== '' : text(path) !== start[path]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = {};
    for (const detail of OFFER_DETAILS) {
      if (changed(detail)) {
        body[detail] = toValue(KINDS[detail], text(detail));
      }
    }
    const custom: Record<string, unknown> = {};
    for (const field of fields) {
      const path = customPath(field.id);
      if (changed(path)) {
        custom[field.id] = toValue('text', text(path));
      }
    }
    if (Object.keys(custom).length > 0) {
      body.custom = custom;
    }
    const parsed = OfferInputSchema.safeParse(body);
    const found: Record<string, string> = {};
    for (const issue of parsed.error?.issues ?? []) {
      found[issue.path.join('.')] ??= issue.message;
    }
    setErrors(found);
    if (parsed.success) {
      onSubmit(parsed.data);
      return;
    }
    setFocusRequest({});
  }

  const set = (path: string, value: string) =>
    setValues((current) => ({ ...current, [path]: value }));

  // The API's refusal names its field; show it there too.
  const problemFor = (path: string) =>
    errors[path] ?? (serverFields.includes(path) ? serverError : undefined);

  function control(path: string, label: string, kind: Kind, placeholder?: string) {
    const problem = problemFor(path);
    const common = {
      id: `${id}-${path}`,
      className: styles.input,
      value: text(path),
      'aria-invalid': problem ? true : undefined,
      'aria-describedby': problem ? `${id}-${path}-error` : undefined,
    };
    let input;
    if (kind === 'arrangement') {
      input = (
        <select {...common} onChange={(event) => set(path, event.target.value)}>
          <option value="">Not set</option>
          {WORK_ARRANGEMENTS.map((value) => (
            <option key={value} value={value}>
              {WORK_ARRANGEMENT_LABELS[value]}
            </option>
          ))}
        </select>
      );
    } else if (kind === 'text') {
      input = (
        <textarea
          {...common}
          rows={2}
          placeholder={placeholder}
          onChange={(event) => set(path, event.target.value)}
        />
      );
    } else {
      input = (
        <input
          {...common}
          type={kind === 'date' ? 'date' : 'text'}
          inputMode={kind === 'amount' ? 'numeric' : kind === 'percent' ? 'decimal' : undefined}
          placeholder={placeholder}
          onChange={(event) => set(path, event.target.value)}
        />
      );
    }
    return (
      <div key={path} className={styles.field}>
        <label htmlFor={`${id}-${path}`} className={styles.label}>
          {label}
        </label>
        {input}
        {problem && (
          <p id={`${id}-${path}-error`} className={styles.error}>
            {problem}
          </p>
        )}
      </div>
    );
  }

  const unplaced = serverError && !serverFields.some((path) => path in values);

  return (
    <form
      ref={formRef}
      className={`${styles.form} ${own.panel}`}
      onSubmit={handleSubmit}
      aria-label={adding ? 'Add offer' : 'Change offer'}
      noValidate
    >
      {OFFER_DETAILS.map((detail) =>
        control(
          detail,
          FORM_LABELS[detail] ?? offerDetailLabel(detail),
          KINDS[detail],
          PLACEHOLDERS[detail],
        ),
      )}
      {fields.length > 0 && (
        <fieldset className={styles.group}>
          <legend>Your fields</legend>
          {fields.map((field) => control(customPath(field.id), field.name, 'text'))}
        </fieldset>
      )}
      {unplaced && (
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
