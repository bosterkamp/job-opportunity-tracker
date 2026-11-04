import { useId, useState, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';

interface DeleteLeadProps {
  name: string;
  // How many opportunities are linked to it; they stay, without the link.
  linked: number;
  // How many notes it has; they're deleted with it (feature 011).
  notes: number;
  // Resolves once deleted; a rejection's message is shown in the dialog.
  onDelete: () => Promise<unknown>;
  onClose: () => void;
}

const opportunities = (count: number) =>
  `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`;
const notesText = (count: number) => `${count} ${count === 1 ? 'note' : 'notes'}`;

// Deleting a networking lead (feature 010) asks first. Its opportunities are never deleted.
export function DeleteLead({ name, linked, notes, onDelete, onClose }: DeleteLeadProps) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const id = useId();

  async function handleDelete() {
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
          Delete {name}?
        </h3>
        <div className={dialog.form}>
          <p id={`${id}-description`}>
            This removes the lead, and it can't be undone.
            {linked > 0 && ` ${opportunities(linked)} will stay, without a lead.`}
            {notes > 0 && ` ${notesText(notes)} will be deleted.`}
          </p>
          {error && (
            <p role="alert" className={dialog.error}>
              {error}
            </p>
          )}
          <div className={dialog.actions}>
            <button
              type="button"
              className={dialog.danger}
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            {/* Focus starts on the safe choice. */}
            <button type="button" autoFocus className={dialog.secondary} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
