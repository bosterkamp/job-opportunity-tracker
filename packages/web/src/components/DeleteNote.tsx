import { useId, useState, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';

interface DeleteNoteProps {
  // The note's day, as the card shows it.
  day: string;
  // Resolves once deleted; a rejection's message is shown in the dialog.
  onDelete: () => Promise<unknown>;
  onClose: () => void;
}

// Deleting a note on a lead (feature 011) asks first, like deleting the lead.
export function DeleteNote({ day, onDelete, onClose }: DeleteNoteProps) {
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
          Delete this note?
        </h3>
        <div className={dialog.form}>
          <p id={`${id}-description`}>The note from {day} is deleted, and it can't be undone.</p>
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
