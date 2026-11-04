import { useId, useRef, useState, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';

interface RemoveInterviewProps {
  // What the trigger says to screen readers, for example "Remove the interview on Oct 5, 2026".
  label: string;
  // Resolves once removed; a rejection's message is shown in the dialog.
  onRemove: () => Promise<unknown>;
}

// Removing an interview is deliberate (spec FR-007): it asks first, like deleting an
// opportunity, but a plain confirmation is enough for one entry.
export function RemoveInterview({ label, onRemove }: RemoveInterviewProps) {
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
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        Remove
      </button>
      {open && <ConfirmDialog onRemove={onRemove} onClose={close} />}
    </>
  );
}

function ConfirmDialog({
  onRemove,
  onClose,
}: Pick<RemoveInterviewProps, 'onRemove'> & { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const id = useId();

  async function remove() {
    setRemoving(true);
    try {
      await onRemove();
    } catch (failure) {
      setError((failure as Error).message);
      setRemoving(false);
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
        className={dialog.panel}
        onKeyDown={handleKeyDown}
      >
        <h3 id={`${id}-title`} className={dialog.title}>
          Remove this interview? This can&apos;t be undone.
        </h3>
        {error && (
          <p role="alert" className={dialog.error}>
            {error}
          </p>
        )}
        <div className={dialog.actions}>
          <button
            type="button"
            autoFocus
            className={dialog.danger}
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
          <button type="button" className={dialog.secondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
