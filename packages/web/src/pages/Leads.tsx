import { stageLabel, type LeadNote, type LeadWithOpportunities } from '@jot/shared';
import { useId, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import {
  useAddLeadNote,
  useCreateLead,
  useDeleteLead,
  useDeleteLeadNote,
  useLeads,
  useUpdateLead,
  useUpdateLeadNote,
} from '../api/hooks';
import { DeleteLead } from '../components/DeleteLead';
import { DeleteNote } from '../components/DeleteNote';
import { LeadDialog } from '../components/LeadDialog';
import { NoteDialog } from '../components/NoteDialog';
import { QueryState } from '../components/QueryState';
import { formatDate } from '../format';
import styles from './Leads.module.css';
import page from './Page.module.css';

type Open =
  | { kind: 'add' }
  | { kind: 'edit' | 'delete' | 'addNote'; lead: LeadWithOpportunities }
  | { kind: 'editNote' | 'deleteNote'; lead: LeadWithOpportunities; note: LeadNote }
  | null;

type Show = (event: MouseEvent<HTMLButtonElement>, next: Open) => void;

// The people helping the owner find jobs (feature 010): a name, an email and a phone, the
// opportunities linked to each, and a dated note for each conversation (feature 011). Email,
// phone and notes are plain text, never links (010 spec FR-003, 011 spec FR-005).
export function LeadsPage() {
  const { data, error, isPending, isFetching, refetch } = useLeads();
  const [open, setOpen] = useState<Open>(null);
  // Where focus goes back to when a dialog closes.
  const returnFocus = useRef<HTMLElement | null>(null);

  function show(event: MouseEvent<HTMLButtonElement>, next: Open) {
    returnFocus.current = event.currentTarget;
    setOpen(next);
  }
  // `focus` overrides where focus goes back to, for a button that's gone.
  function close(focus?: HTMLElement | null) {
    setOpen(null);
    (focus ?? returnFocus.current)?.focus();
  }

  return (
    <>
      <div className={styles.heading}>
        <h2>Networking leads</h2>
        <button
          type="button"
          className={styles.addButton}
          onClick={(event) => show(event, { kind: 'add' })}
        >
          Add lead
        </button>
      </div>
      <QueryState
        what="your leads"
        isPending={isPending}
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
      {data?.length === 0 && (
        <div className={page.empty}>
          <p>No networking leads yet.</p>
          <p className={page.muted}>
            Add the people helping you find jobs, then link opportunities to them.
          </p>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className={styles.list} aria-label="Networking leads">
          {data.map((lead) => (
            <li key={lead.id}>
              <LeadCard lead={lead} show={show} />
            </li>
          ))}
        </ul>
      )}
      {open?.kind === 'add' && <AddLead onClose={() => close()} />}
      {open?.kind === 'edit' && <EditLead lead={open.lead} onClose={() => close()} />}
      {open?.kind === 'delete' && <RemoveLead lead={open.lead} onClose={() => close()} />}
      {open?.kind === 'addNote' && <AddNote lead={open.lead} onClose={() => close()} />}
      {open?.kind === 'editNote' && (
        <EditNote lead={open.lead} note={open.note} onClose={() => close()} />
      )}
      {open?.kind === 'deleteNote' && (
        <RemoveNote
          lead={open.lead}
          note={open.note}
          onClose={() => close()}
          // The note's own button goes with it, so focus moves to the card's "Add note".
          onDeleted={() =>
            close(
              returnFocus.current
                ?.closest('article')
                ?.querySelector<HTMLElement>('[data-add-note]'),
            )
          }
        />
      )}
    </>
  );
}

function LeadCard({ lead, show }: { lead: LeadWithOpportunities; show: Show }) {
  return (
    <article className={styles.card} aria-label={lead.name}>
      <h3 className={styles.name}>{lead.name}</h3>
      {lead.email && <p className={styles.detail}>{lead.email}</p>}
      {lead.phone && <p className={styles.detail}>{lead.phone}</p>}
      {lead.opportunities.length > 0 && (
        <ul className={styles.opportunities} aria-label={`Opportunities from ${lead.name}`}>
          {lead.opportunities.map((o) => (
            <li key={o.id}>
              <Link to={`/opportunities/${o.id}`}>
                {o.company}: {o.title}
              </Link>{' '}
              <span className={page.muted}>({stageLabel(o.stage)})</span>
            </li>
          ))}
        </ul>
      )}
      {lead.notes.length > 0 && <Notes lead={lead} show={show} />}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${page.secondaryButton} ${styles.addNote}`}
          aria-label={`Add a note for ${lead.name}`}
          data-add-note
          onClick={(event) => show(event, { kind: 'addNote', lead })}
        >
          Add note
        </button>
        <button
          type="button"
          className={page.secondaryButton}
          aria-label={`Edit ${lead.name}`}
          onClick={(event) => show(event, { kind: 'edit', lead })}
        >
          Edit
        </button>
        <button
          type="button"
          className={`${page.secondaryButton} ${styles.deleteLead}`}
          aria-label={`Delete ${lead.name}`}
          onClick={(event) => show(event, { kind: 'delete', lead })}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

// The newest note, and the rest on request, newest first (the API's order).
function Notes({ lead, show }: { lead: LeadWithOpportunities; show: Show }) {
  const [all, setAll] = useState(false);
  const id = useId();
  const shown = all ? lead.notes : lead.notes.slice(0, 1);
  return (
    <>
      <section id={id} className={styles.notes} aria-label={`Notes with ${lead.name}`}>
        <ol className={styles.noteList}>
          {shown.map((note) => {
            const day = formatDate(note.heldAt);
            return (
              <li key={note.id} className={styles.note}>
                <div className={styles.noteHeader}>
                  <p className={styles.noteDay}>{day}</p>
                  <div className={styles.noteActions}>
                    <button
                      type="button"
                      className={styles.noteButton}
                      aria-label={`Edit the note on ${day} with ${lead.name}`}
                      onClick={(event) => show(event, { kind: 'editNote', lead, note })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${styles.noteButton} ${styles.noteDelete}`}
                      aria-label={`Delete the note on ${day} with ${lead.name}`}
                      onClick={(event) => show(event, { kind: 'deleteNote', lead, note })}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className={styles.noteText}>{note.text}</p>
              </li>
            );
          })}
        </ol>
      </section>
      {lead.notes.length > 1 && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={all}
          aria-controls={id}
          onClick={() => setAll(!all)}
        >
          {all ? 'Show fewer' : `Show all ${lead.notes.length} notes`}
        </button>
      )}
    </>
  );
}

function AddLead({ onClose }: { onClose: () => void }) {
  const create = useCreateLead();
  return <LeadDialog onSave={(input) => create.mutateAsync(input)} onClose={onClose} />;
}

function EditLead({ lead, onClose }: { lead: LeadWithOpportunities; onClose: () => void }) {
  const update = useUpdateLead(lead.id);
  return <LeadDialog lead={lead} onSave={(patch) => update.mutateAsync(patch)} onClose={onClose} />;
}

function RemoveLead({ lead, onClose }: { lead: LeadWithOpportunities; onClose: () => void }) {
  const remove = useDeleteLead(lead.id);
  return (
    <DeleteLead
      name={lead.name}
      linked={lead.opportunities.length}
      notes={lead.notes.length}
      onDelete={async () => {
        await remove.mutateAsync();
        onClose();
      }}
      onClose={onClose}
    />
  );
}

function AddNote({ lead, onClose }: { lead: LeadWithOpportunities; onClose: () => void }) {
  const add = useAddLeadNote(lead.id);
  return (
    <NoteDialog leadName={lead.name} onSave={(input) => add.mutateAsync(input)} onClose={onClose} />
  );
}

interface NoteProps {
  lead: LeadWithOpportunities;
  note: LeadNote;
  onClose: () => void;
}

function EditNote({ lead, note, onClose }: NoteProps) {
  const update = useUpdateLeadNote(lead.id, note.id);
  return (
    <NoteDialog
      leadName={lead.name}
      note={note}
      onSave={(patch) => update.mutateAsync(patch)}
      onClose={onClose}
    />
  );
}

function RemoveNote({ lead, note, onClose, onDeleted }: NoteProps & { onDeleted: () => void }) {
  const remove = useDeleteLeadNote(lead.id, note.id);
  return (
    <DeleteNote
      day={formatDate(note.heldAt)}
      onDelete={async () => {
        await remove.mutateAsync();
        onDeleted();
      }}
      onClose={onClose}
    />
  );
}
