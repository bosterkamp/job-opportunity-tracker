import { OPEN_STAGES, OUTCOME_STAGES, stageDescription, stageLabel, type Stage } from '@jot/shared';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import dialog from './Dialog.module.css';
import { keepFocusInside } from './focusTrap';
import styles from './MoveStageMenu.module.css';

export interface StageMove {
  toStage: Stage;
  note?: string;
  // ISO date-time; left out when the user didn't change "When?", so the server uses now.
  changedAt?: string;
}

interface MoveStageMenuProps {
  currentStage: Stage;
  // Resolves when the move is saved; a rejection's message is shown in the menu.
  onMove: (move: StageMove) => Promise<unknown>;
  // Names the opportunity for screen readers when several menus are on one page.
  label?: string;
  now?: () => Date;
}

// A <input type="datetime-local"> value (YYYY-MM-DDTHH:mm) in the browser's time zone.
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// One-step stage change (Constitution Principle I): pick a stage, optionally add a note and
// an earlier date, done. A centered dialog on desktop and a bottom sheet on phones (CSS).
export function MoveStageMenu({
  currentStage,
  onMove,
  label,
  now = () => new Date(),
}: MoveStageMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `Move ${label} to another stage` : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Move to…
      </button>
      {/* Mounted only while open, so each opening starts with a fresh form. */}
      {open && (
        <MovePanel
          currentStage={currentStage}
          onMove={onMove}
          label={label}
          now={now}
          onClose={close}
        />
      )}
    </div>
  );
}

interface MovePanelProps extends Required<Omit<MoveStageMenuProps, 'label'>> {
  label?: string;
  onClose: () => void;
}

function MovePanel({ currentStage, onMove, label, now, onClose }: MovePanelProps) {
  const [toStage, setToStage] = useState<Stage | null>(null);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(() => toLocalInputValue(now()));
  const [whenChanged, setWhenChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!toStage) {
      setError('Choose a stage');
      return;
    }
    if (whenChanged && new Date(when) > now()) {
      setError("The date can't be in the future");
      return;
    }
    setSaving(true);
    try {
      await onMove({
        toStage,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(whenChanged ? { changedAt: new Date(when).toISOString() } : {}),
      });
      onClose();
    } catch (failure) {
      setError((failure as Error).message);
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
    keepFocusInside(event);
  }

  // `focusFirst`: focus moves to the first choice when the menu opens.
  const choices = (legend: string, stages: readonly Stage[], focusFirst: boolean) => (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {stages
        .filter((stage) => stage !== currentStage)
        .map((stage, index) => {
          const description = stageDescription(stage);
          // The whole row picks the stage; the meaning is read as a description, not the name.
          return (
            <label key={stage} className={styles.option}>
              <input
                autoFocus={focusFirst && index === 0}
                type="radio"
                name={`${id}-stage`}
                value={stage}
                checked={toStage === stage}
                onChange={() => setToStage(stage)}
                aria-labelledby={`${id}-${stage}`}
                aria-describedby={description ? `${id}-${stage}-description` : undefined}
              />
              <span className={styles.optionText}>
                <span id={`${id}-${stage}`}>{stageLabel(stage)}</span>
                {description && (
                  <span id={`${id}-${stage}-description`} className={styles.description}>
                    {description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
    </fieldset>
  );

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
          {label ? `Move ${label} to` : 'Move to'}
        </h3>
        <form className={dialog.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className={styles.stages}>
            {choices('Still in progress', OPEN_STAGES, true)}
            {choices('Close as', OUTCOME_STAGES, false)}
          </div>
          <div className={dialog.field}>
            <label htmlFor={`${id}-note`}>Note (optional)</label>
            <textarea
              id={`${id}-note`}
              className={dialog.input}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className={dialog.field}>
            <label htmlFor={`${id}-when`}>When?</label>
            <input
              id={`${id}-when`}
              type="datetime-local"
              className={dialog.input}
              value={when}
              max={toLocalInputValue(now())}
              onChange={(event) => {
                setWhen(event.target.value);
                setWhenChanged(true);
              }}
            />
          </div>
          {error && (
            <p role="alert" className={dialog.error}>
              {error}
            </p>
          )}
          <div className={dialog.actions}>
            <button type="submit" className={dialog.primary} disabled={saving}>
              {saving ? 'Moving…' : 'Move'}
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
