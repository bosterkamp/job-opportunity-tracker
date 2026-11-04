import {
  LeadInputSchema,
  LeadPatchSchema,
  type Lead,
  type LeadInput,
  type LeadPatch,
} from '@jot/shared';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';

// Adding a lead, or editing one: `onSave` resolves once saved, and a rejection's message is
// shown in the dialog.
type LeadDialogProps = { onClose: () => void } & (
  | { lead?: undefined; onSave: (input: LeadInput) => Promise<unknown> }
  | { lead: Lead; onSave: (patch: LeadPatch) => Promise<unknown> }
);

const FIELDS = [
  { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
] as const;

type Field = (typeof FIELDS)[number]['name'];
type Values = Record<Field, string>;

// The first message for each field, from the shared schema's issues.
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Partial<Record<Field, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0] as Field;
    errors[field] ??= issue.message;
  }
  return errors;
}

// A networking lead's three fields (feature 010), checked with the same rules as the API.
export function LeadDialog(props: LeadDialogProps) {
  const { lead, onClose } = props;
  const [values, setValues] = useState<Values>({
    name: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = useId();
  const title = lead ? `Edit ${lead.name}` : 'Add lead';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Blank fields: left out when adding, cleared (null) when editing.
    const parsed = props.lead
      ? LeadPatchSchema.safeParse(values)
      : LeadInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // The data's type is either schema's; which one follows from `props.lead`, as parsed above.
      await (props.lead ? props.onSave(parsed.data) : props.onSave(parsed.data as LeadInput));
      onClose();
    } catch (error) {
      setFailure((error as Error).message);
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
    keepFocusInside(event);
  }

  return (
    <>
      <div className={dialog.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={dialog.panel}
        onKeyDown={handleKeyDown}
      >
        <h3 id={`${id}-title`} className={dialog.title}>
          {title}
        </h3>
        <form className={dialog.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          {FIELDS.map((field, index) => {
            const error = errors[field.name];
            return (
              <div key={field.name} className={dialog.field}>
                <label htmlFor={`${id}-${field.name}`}>{field.label}</label>
                <input
                  id={`${id}-${field.name}`}
                  autoFocus={index === 0}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  className={dialog.input}
                  value={values[field.name]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-${field.name}-error` : undefined}
                  onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
                />
                {error && (
                  <p id={`${id}-${field.name}-error`} className={dialog.error}>
                    {error}
                  </p>
                )}
              </div>
            );
          })}
          {failure && (
            <p role="alert" className={dialog.error}>
              {failure}
            </p>
          )}
          <div className={dialog.actions}>
            <button type="submit" className={dialog.primary} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={dialog.secondary} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
