import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';

interface DeleteOpportunityProps {
  company: string;
  // Resolves once deleted; a rejection's message is shown in the dialog.
  onDelete: () => Promise<unknown>;
}

// Permanent deletion must be deliberate (spec FR-016): the user types the company name to
// confirm. Closing an opportunity (an outcome stage) is the everyday way to finish one.
export function DeleteOpportunity({ company, onDelete }: DeleteOpportunityProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={dialog.secondary}
        onClick={() => setOpen(true)}
      >
        Delete permanently
      </button>
      {open && <ConfirmDialog company={company} onDelete={onDelete} onClose={close} />}
    </>
  );
}

function ConfirmDialog({
  company,
  onDelete,
  onClose,
}: DeleteOpportunityProps & { onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const id = useId();
  const matches = typed.trim() === company;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setDeleting(true);
    try {
      await onDelete();
    } catch (failure) {
      setError((failure as Error).message);
      setDeleting(false);
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className={dialog.panel}
        onKeyDown={handleKeyDown}
      >
        <h3 id={`${id}-title`} className={dialog.title}>
          Delete {company} permanently?
        </h3>
        <form className={dialog.form} onSubmit={(event) => void handleSubmit(event)}>
          <p id={`${id}-description`}>
            This removes the opportunity and its whole history, and it can't be undone. To finish
            with it but keep the record, move it to an outcome such as Withdrawn instead.
          </p>
          <div className={dialog.field}>
            <label htmlFor={`${id}-confirm`}>Type the company name to confirm</label>
            <input
              id={`${id}-confirm`}
              autoFocus
              className={dialog.input}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className={dialog.error}>
              {error}
            </p>
          )}
          <div className={dialog.actions}>
            <button type="submit" className={dialog.danger} disabled={!matches || deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
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
