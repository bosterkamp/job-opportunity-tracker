import {
  LeadNoteInputSchema,
  LeadNotePatchSchema,
  dayToTimestamp,
  localDate,
  noteDateProblem,
  type LeadNote,
  type LeadNoteInput,
  type LeadNotePatch,
} from '@jot/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';

// Adding a note to a lead, or changing one (feature 011): `onSave` resolves once saved, and a
// rejection's message is shown in the dialog.
type NoteDialogProps = { leadName: string; onClose: () => void } & (
  | { note?: undefined; onSave: (input: LeadNoteInput) => Promise<unknown> }
  | { note: LeadNote; onSave: (patch: LeadNotePatch) => Promise<unknown> }
);

type Field = 'heldAt' | 'text';

// The day it happened and what was said, checked with the API's own rules first.
export function NoteDialog(props: NoteDialogProps) {
  const { leadName, note, onClose } = props;
  const startDay = note ? localDate(new Date(note.heldAt)) : localDate();
  const [day, setDay] = useState(startDay);
  const [text, setText] = useState(note?.text ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusRequest, setFocusRequest] = useState({});
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  // After a failed save, focus the first field with a problem (it's rendered by then).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Only what changed is sent. An unchanged day on a new note means now, which the API sets.
    const heldAt = day !== startDay && day !== '' ? dayToTimestamp(day, {}) : undefined;
    const body = {
      ...(heldAt && { heldAt }),
      ...((!props.note || text !== props.note.text) && { text }),
    };
    if (props.note && Object.keys(body).length === 0) {
      onClose();
      return;
    }
    const parsed = (props.note ? LeadNotePatchSchema : LeadNoteInputSchema).safeParse(body);
    const found: Partial<Record<Field, string>> = {};
    const dateProblem = heldAt && noteDateProblem(heldAt, new Date());
    // Stryker disable next-line ConditionalExpression: setting an undefined problem shows nothing either
    if (dateProblem) {
      found.heldAt = dateProblem;
    }
    for (const issue of parsed.error?.issues ?? []) {
      found[issue.path[0] as Field] ??= issue.message;
    }
    setErrors(found);
    if (!parsed.success || dateProblem) {
      setFocusRequest({});
      return;
    }
    setSaving(true);
    try {
      // The data's type is either schema's; which one follows from `props.note`, as parsed above.
      await (props.note ? props.onSave(parsed.data) : props.onSave(parsed.data as LeadNoteInput));
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

  const describedBy = (field: Field) => (errors[field] ? `${id}-${field}-error` : undefined);

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
          {note ? 'Edit note' : `Add a note for ${leadName}`}
        </h3>
        <form
          ref={formRef}
          className={dialog.form}
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          <div className={dialog.field}>
            <label htmlFor={`${id}-heldAt`}>Date</label>
            <input
              id={`${id}-heldAt`}
              type="date"
              className={dialog.input}
              value={day}
              max={localDate()}
              aria-invalid={errors.heldAt ? true : undefined}
              aria-describedby={describedBy('heldAt')}
              onChange={(event) => setDay(event.target.value)}
            />
            {errors.heldAt && (
              <p id={`${id}-heldAt-error`} className={dialog.error}>
                {errors.heldAt}
              </p>
            )}
          </div>
          <div className={dialog.field}>
            <label htmlFor={`${id}-text`}>Note</label>
            <textarea
              id={`${id}-text`}
              autoFocus
              rows={6}
              className={dialog.input}
              value={text}
              aria-invalid={errors.text ? true : undefined}
              aria-describedby={describedBy('text')}
              onChange={(event) => setText(event.target.value)}
            />
            {errors.text && (
              <p id={`${id}-text-error`} className={dialog.error}>
                {errors.text}
              </p>
            )}
          </div>
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
