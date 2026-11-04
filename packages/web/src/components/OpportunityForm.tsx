import {
  dateAddedProblem,
  dateAddedTimestamp,
  localDate,
  OpportunityInputSchema,
  OpportunityPatchSchema,
  parseAmount,
  PostingUrlSchema,
  WORK_ARRANGEMENTS,
  type Lead,
  type Opportunity,
  type OpportunityInput,
  type OpportunityPatch,
  type PostingDetails,
  type StageChange,
} from '@jot/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { fillForm, fillMessage } from '../features/import/fillForm';
import { WORK_ARRANGEMENT_LABELS } from '../format';
import styles from './OpportunityForm.module.css';
import { StarRating } from './StarRating';

export interface FormValues {
  company: string;
  title: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  interest: number | null;
  postingUrl: string;
  location: string;
  workArrangement: string;
  salaryMin: string;
  salaryMax: string;
  compensation: string;
  source: string;
  // The date the posting is up until (feature 009).
  postedUntil: string;
  // The networking lead it came through (feature 010); blank for none.
  leadId: string;
  followUpDate: string;
  notes: string;
  // The day it was added (YYYY-MM-DD, in the device's time zone). Blank on the add form
  // means today.
  dateAdded: string;
}

type TextField = Exclude<keyof FormValues, 'interest'>;

export const EMPTY_VALUES: FormValues = {
  company: '',
  title: '',
  contactName: '',
  contactRole: '',
  contactEmail: '',
  contactPhone: '',
  description: '',
  interest: null,
  postingUrl: '',
  location: '',
  workArrangement: '',
  salaryMin: '',
  salaryMax: '',
  compensation: '',
  source: '',
  postedUntil: '',
  leadId: '',
  followUpDate: '',
  notes: '',
  dateAdded: '',
};

// A lead's name in the "Lead" list, with its email or phone when another lead has the same
// name, to tell them apart.
export function leadLabel(lead: Lead, leads: readonly Lead[]): string {
  const sameName = leads.some((other) => other.id !== lead.id && other.name === lead.name);
  const detail = lead.email ?? lead.phone;
  return sameName && detail ? `${lead.name} (${detail})` : lead.name;
}

// "150k" and "$150,000" become 150000. Text that isn't an amount is passed on for the schema to
// reject, and blank stays blank, which the schema drops (adding) or clears (editing).
function amount(text: string): number | string {
  return parseAmount(text) ?? '';
}

// What the date added is checked against: the day the form started with (an unchanged day
// isn't sent), and, when editing, the history, so the day of the first move stays allowed.
export interface DateAddedContext {
  originalDateAdded?: string;
  history?: readonly Pick<StageChange, 'seq' | 'changedAt'>[];
  // The date added can't be after the first interview either (feature 005).
  interviews?: readonly { heldAt: string }[];
}

// The date added to send, or undefined when it's blank or unchanged (feature 004).
function createdAt(
  values: FormValues,
  { originalDateAdded, history, interviews }: DateAddedContext,
) {
  return values.dateAdded && values.dateAdded !== originalDateAdded
    ? dateAddedTimestamp(values.dateAdded, history, new Date(), interviews)
    : undefined;
}

// The shared schema drops blank optional fields and an all-blank contact.
export function toInput(values: FormValues, context: DateAddedContext = {}): unknown {
  return {
    company: values.company,
    title: values.title,
    contact: {
      name: values.contactName,
      role: values.contactRole,
      email: values.contactEmail,
      phone: values.contactPhone,
    },
    description: values.description,
    interest: values.interest,
    postingUrl: values.postingUrl,
    location: values.location,
    workArrangement: values.workArrangement,
    salaryMin: amount(values.salaryMin),
    salaryMax: amount(values.salaryMax),
    compensation: values.compensation,
    source: values.source,
    postedUntil: values.postedUntil,
    leadId: values.leadId,
    followUpDate: values.followUpDate,
    notes: values.notes,
    createdAt: createdAt(values, context),
  };
}

// Schema issue path -> form field.
const CONTACT_FIELDS: Record<string, TextField> = {
  name: 'contactName',
  role: 'contactRole',
  email: 'contactEmail',
  phone: 'contactPhone',
};

export function fieldForPath(path: PropertyKey[]): keyof FormValues {
  const [first, second] = path;
  if (first === 'createdAt') {
    return 'dateAdded';
  }
  return first === 'contact'
    ? (CONTACT_FIELDS[String(second)] ?? 'contactName')
    : (first as keyof FormValues);
}

type Errors = Partial<Record<keyof FormValues, string>>;

export type FormMode = 'create' | 'edit';

// Create drops blank optional fields; edit turns them into null, which clears them.
const SCHEMAS = { create: OpportunityInputSchema, edit: OpportunityPatchSchema };

export function validate(
  values: FormValues,
  mode: FormMode = 'create',
  context: DateAddedContext = {},
): { input?: OpportunityInput | OpportunityPatch; errors: Errors } {
  const input = toInput(values, context) as { createdAt?: string };
  const parsed = SCHEMAS[mode].safeParse(input);
  const errors: Errors = {};
  // The same rules as the API's, checked here so the problem shows on the field.
  const dateProblem =
    input.createdAt &&
    dateAddedProblem(input.createdAt, new Date(), context.history, context.interviews);
  // Stryker disable next-line ConditionalExpression: setting an undefined problem shows nothing either
  if (dateProblem) {
    errors.dateAdded = dateProblem;
  }
  if (parsed.success) {
    return dateProblem ? { errors } : { input: parsed.data, errors };
  }
  for (const issue of parsed.error.issues) {
    errors[fieldForPath(issue.path)] ??= issue.message;
  }
  return { errors };
}

// The form for an opportunity's current values, for editing.
export function toFormValues(o: Opportunity): FormValues {
  return {
    company: o.company,
    title: o.title,
    contactName: o.contact?.name ?? '',
    contactRole: o.contact?.role ?? '',
    contactEmail: o.contact?.email ?? '',
    contactPhone: o.contact?.phone ?? '',
    description: o.description ?? '',
    interest: o.interest ?? null,
    postingUrl: o.postingUrl ?? '',
    location: o.location ?? '',
    workArrangement: o.workArrangement ?? '',
    salaryMin: o.salaryMin?.toString() ?? '',
    salaryMax: o.salaryMax?.toString() ?? '',
    compensation: o.compensation ?? '',
    source: o.source ?? '',
    postedUntil: o.postedUntil ?? '',
    leadId: o.leadId ?? '',
    followUpDate: o.followUpDate ?? '',
    notes: o.notes ?? '',
    dateAdded: localDate(new Date(o.createdAt)),
  };
}

interface CommonProps {
  initialValues?: FormValues;
  submitLabel: string;
  submitting?: boolean;
  // A problem reported by the server, shown above the submit button.
  serverError?: string;
  // When editing, the history, so the date added can't be moved after the first move.
  history?: DateAddedContext['history'];
  // And its interviews: the date added can't be after the first (feature 005).
  interviews?: DateAddedContext['interviews'];
  // The networking leads it can be linked to (feature 010), by name.
  leads?: readonly Lead[];
}

interface CreateProps {
  mode?: 'create';
  onSubmit: (input: OpportunityInput) => void;
  // Reads a posting link for "Fill from link". Without it, the link has no button.
  onImport?: (url: string) => Promise<PostingDetails>;
}

// Adding submits a new opportunity; editing submits a patch, where null clears a field.
type OpportunityFormProps = CommonProps &
  (CreateProps | { mode: 'edit'; onSubmit: (patch: OpportunityPatch) => void; onImport?: never });

export function OpportunityForm({
  initialValues = EMPTY_VALUES,
  submitLabel,
  submitting = false,
  serverError,
  history,
  interviews,
  leads = [],
  ...modeProps
}: OpportunityFormProps) {
  // Adding starts on today. The day the form starts with is never sent unless it changes.
  const [start] = useState(() => ({
    ...initialValues,
    dateAdded: initialValues.dateAdded || localDate(),
  }));
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState<Errors>({});
  // Replaced with a new object on each failed submit; the effect below then focuses the first
  // problem. Only the change matters, not the value.
  const [focusRequest, setFocusRequest] = useState({});
  const formRef = useRef<HTMLFormElement>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string>();
  const [importError, setImportError] = useState<string>();
  // The latest values, for applying a fill that finishes after the owner kept typing.
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  });
  const linkFirst = modeProps.mode !== 'edit';

  // Runs after React has rendered the errors, so keyboard and screen reader users land on the
  // problem. On the first render there are no errors, so nothing gets focus.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  const set = (field: TextField) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(values, modeProps.mode, {
      originalDateAdded: start.dateAdded,
      history,
      interviews,
    });
    setErrors(result.errors);
    if (result.input) {
      // validate used the schema for this mode, so the input has the matching shape.
      (modeProps.onSubmit as (input: OpportunityInput | OpportunityPatch) => void)(result.input);
      return;
    }
    setFocusRequest({});
  }

  // "Fill from link": fill the empty fields from the posting, without saving (spec FR-006).
  async function fillFromLink(onImport: (url: string) => Promise<PostingDetails>) {
    setImportNote(undefined);
    setImportError(undefined);
    const link = PostingUrlSchema.safeParse(values.postingUrl);
    if (!link.success) {
      setErrors((e) => ({ ...e, postingUrl: link.error.issues[0]?.message }));
      setFocusRequest({});
      return;
    }
    setErrors((e) => ({ ...e, postingUrl: undefined }));
    setImporting(true);
    try {
      const details = await onImport(link.data);
      const result = fillForm(latest.current, details);
      setValues(result.values);
      // A filled field no longer has the problem it had; other fields keep theirs.
      setErrors((e) =>
        Object.fromEntries(Object.entries(e).filter(([f]) => !result.filled.includes(f as never))),
      );
      setImportNote(fillMessage(result, details.descriptionTruncated));
    } catch (failure) {
      setImportError((failure as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const field = (name: TextField, label: string, extra: Partial<FieldProps> = {}) => (
    <Field
      name={name}
      label={label}
      value={values[name]}
      error={errors[name]}
      onChange={set(name)}
      {...extra}
    />
  );

  // Every field below company and title, always shown: the add form no longer folds them under
  // "More details" (feature 011).
  const details = (
    <div className={styles.detailsBody}>
      <StarRating
        value={values.interest}
        onChange={(interest) => setValues((v) => ({ ...v, interest }))}
      />

      <fieldset className={styles.group}>
        <legend>Point of contact</legend>
        <div className={styles.pair}>
          {field('contactName', 'Name')}
          {field('contactRole', 'Role')}
        </div>
        <div className={styles.pair}>
          {field('contactEmail', 'Email', { type: 'email' })}
          {field('contactPhone', 'Phone', { type: 'tel' })}
        </div>
      </fieldset>

      {field('description', 'Job description', { multiline: true })}
      {!linkFirst && field('postingUrl', 'Job posting link', { type: 'url' })}
      <div className={styles.pair}>
        {field('location', 'Location')}
        <Field
          name="workArrangement"
          label="Work arrangement"
          value={values.workArrangement}
          error={errors.workArrangement}
          onChange={set('workArrangement')}
          options={[
            { value: '', label: 'Not specified' },
            ...WORK_ARRANGEMENTS.map((value) => ({
              value,
              label: WORK_ARRANGEMENT_LABELS[value],
            })),
          ]}
        />
      </div>
      <div className={styles.pair}>
        {field('salaryMin', 'Salary minimum', { inputMode: 'numeric' })}
        {field('salaryMax', 'Salary maximum', { inputMode: 'numeric' })}
      </div>
      {field('compensation', 'Pay notes')}
      {field('source', 'Where you found it')}
      <Field
        name="leadId"
        label="Lead"
        value={values.leadId}
        error={errors.leadId}
        onChange={set('leadId')}
        options={[
          { value: '', label: 'No lead' },
          ...leads.map((lead) => ({ value: lead.id, label: leadLabel(lead, leads) })),
        ]}
      />
      {field('postedUntil', 'Posted until', { type: 'date' })}
      {field('followUpDate', 'Follow-up date', { type: 'date' })}
      {field('dateAdded', 'Date added', { type: 'date', max: localDate() })}
      {field('notes', 'Notes', { multiline: true })}
    </div>
  );

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
      {linkFirst && (
        <div className={styles.link}>
          <div className={styles.linkRow}>
            {field('postingUrl', 'Job posting link', { type: 'url' })}
            {modeProps.onImport && (
              <button
                type="button"
                className={styles.fill}
                // A url input drops surrounding spaces itself.
                disabled={importing || values.postingUrl === ''}
                onClick={() =>
                  void fillFromLink(modeProps.onImport as (url: string) => Promise<PostingDetails>)
                }
              >
                {importing ? 'Filling…' : 'Fill from link'}
              </button>
            )}
          </div>
          {importError && (
            <p role="alert" className={styles.alert}>
              {importError}
            </p>
          )}
          <div role="status" className={styles.note}>
            {importNote}
          </div>
        </div>
      )}
      {field('company', 'Company', { required: true })}
      {field('title', 'Job title', { required: true })}

      {details}

      {serverError && (
        <p role="alert" className={styles.alert}>
          {serverError}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

interface FieldProps {
  name: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: 'numeric';
  // The latest day a date field offers.
  max?: string;
  required?: boolean;
  multiline?: boolean;
  options?: { value: string; label: string }[];
}

function Field({
  name,
  label,
  value,
  error,
  onChange,
  type = 'text',
  inputMode,
  max,
  required,
  multiline,
  options,
}: FieldProps) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    name,
    value,
    className: styles.input,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    'aria-required': required ? true : undefined,
  };

  let control: ReactNode;
  if (options) {
    control = (
      <select {...common} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (multiline) {
    control = <textarea {...common} onChange={(e) => onChange(e.target.value)} />;
  } else {
    control = (
      <input
        {...common}
        type={type}
        inputMode={inputMode}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
