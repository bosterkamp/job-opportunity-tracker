import {
  MAX_OFFER_FIELDS,
  OFFER_MESSAGES,
  OfferFieldsPatchSchema,
  type OfferField,
  type OfferFields as Fields,
  type Opportunity,
} from '@jot/shared';
import { useId, useState, type FormEvent } from 'react';
import { useOfferFields, useSaveOfferFields } from '../api/hooks';
import formStyles from './OpportunityForm.module.css';
import styles from './OfferFields.module.css';
import { RemoveInterview } from './RemoveInterview';

// The custom fields every offer shares (feature 013): add one, and on the Offers page rename,
// reorder and remove them. Each change replaces the whole list, as of the version shown.

interface OfferFieldsProps {
  // "Fields to compare" on the Offers page manages them; the comparison only adds one.
  manage?: boolean;
  // The offers, to say how many have a value for a field about to be removed.
  offers?: readonly Opportunity[];
}

const plain = (fields: readonly OfferField[]) => fields.map(({ id, name }) => ({ id, name }));

type FieldPatch = { id?: string; name: string };

// The schema's message for a new or renamed field, or the list's own (the limit). The field
// is checked after the others, which are already valid, so a repeated name is reported on it
// whichever comes first in the list.
function problemWith(others: readonly FieldPatch[], field: FieldPatch): string | undefined {
  return OfferFieldsPatchSchema.safeParse({ fields: [...others, field], expectedVersion: 0 }).error
    ?.issues[0]?.message;
}

export function OfferFields({ manage = false, offers = [] }: OfferFieldsProps) {
  const { data } = useOfferFields();
  if (!data) {
    return null;
  }
  return <Loaded data={data} manage={manage} offers={offers} />;
}

function Loaded({
  data,
  manage,
  offers,
}: {
  data: Fields;
  manage: boolean;
  offers: readonly Opportunity[];
}) {
  const id = useId();
  const save = useSaveOfferFields();
  const [name, setName] = useState('');
  const [addProblem, setAddProblem] = useState<string>();
  const [renaming, setRenaming] = useState<{ id: string; name: string; problem?: string }>();
  const fields = data.fields;
  const full = fields.length >= MAX_OFFER_FIELDS;

  function send(next: FieldPatch[], confirmRemove = false) {
    return save.mutateAsync({
      patch: { fields: next, expectedVersion: data.version },
      confirmRemove,
    });
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const next = [...plain(fields), { name }];
    const problem = problemWith(plain(fields), { name });
    setAddProblem(problem);
    if (!problem) {
      send(next).then(
        () => setName(''),
        () => undefined,
      );
    }
  }

  function rename(event: FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    const next = plain(fields).map((field) =>
      field.id === renaming.id ? { ...field, name: renaming.name } : field,
    );
    const problem = problemWith(
      plain(fields).filter((field) => field.id !== renaming.id),
      { id: renaming.id, name: renaming.name },
    );
    if (problem) {
      setRenaming({ ...renaming, problem });
      return;
    }
    send(next).then(
      () => setRenaming(undefined),
      () => undefined,
    );
  }

  function move(index: number, step: -1 | 1) {
    const next = plain(fields);
    const [field] = next.splice(index, 1) as [OfferField];
    next.splice(index + step, 0, field);
    void send(next).catch(() => undefined);
  }

  const withValue = (fieldId: string) =>
    offers.filter((o) => o.offer?.custom?.[fieldId] !== undefined).length;

  return (
    <section aria-labelledby={`${id}-heading`} className={styles.section}>
      <h3 id={`${id}-heading`}>{manage ? 'Fields to compare' : 'Add a field to compare'}</h3>
      {manage && fields.length === 0 && (
        <p className={styles.hint}>
          Add your own fields, such as the commute or tuition support. Every offer gets them.
        </p>
      )}
      {manage && fields.length > 0 && (
        <ol className={styles.list} aria-label="Custom fields">
          {fields.map((field, index) =>
            renaming?.id === field.id ? (
              <li key={field.id}>
                <form className={styles.row} onSubmit={rename} aria-label={`Rename ${field.name}`}>
                  <label htmlFor={`${id}-rename`} className={styles.visuallyHidden}>
                    New name for {field.name}
                  </label>
                  <input
                    id={`${id}-rename`}
                    className={formStyles.input}
                    value={renaming.name}
                    autoFocus
                    aria-invalid={renaming.problem ? true : undefined}
                    aria-describedby={renaming.problem ? `${id}-rename-error` : undefined}
                    onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                  />
                  <button type="submit" className={styles.button} disabled={save.isPending}>
                    Save name
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => setRenaming(undefined)}
                  >
                    Cancel
                  </button>
                  {renaming.problem && (
                    <p id={`${id}-rename-error`} className={formStyles.error}>
                      {renaming.problem}
                    </p>
                  )}
                </form>
              </li>
            ) : (
              <li key={field.id} className={styles.row}>
                <span className={styles.name}>{field.name}</span>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Rename ${field.name}`}
                  onClick={() => setRenaming({ id: field.id, name: field.name })}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Move ${field.name} up`}
                  disabled={index === 0 || save.isPending}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Move ${field.name} down`}
                  disabled={index === fields.length - 1 || save.isPending}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <RemoveInterview
                  label={`Remove ${field.name}`}
                  title={removeTitle(field.name, withValue(field.id))}
                  onRemove={() =>
                    send(
                      plain(fields).filter((kept) => kept.id !== field.id),
                      true,
                    )
                  }
                />
              </li>
            ),
          )}
        </ol>
      )}
      {full ? (
        <p className={styles.hint}>{OFFER_MESSAGES.TOO_MANY_FIELDS}</p>
      ) : (
        <form className={styles.row} onSubmit={add} aria-label="Add a custom field">
          <label htmlFor={`${id}-new`} className={styles.label}>
            New field
          </label>
          <input
            id={`${id}-new`}
            className={formStyles.input}
            value={name}
            placeholder="Commute"
            aria-invalid={addProblem ? true : undefined}
            aria-describedby={addProblem ? `${id}-new-error` : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className={styles.button} disabled={save.isPending}>
            Add field
          </button>
          {addProblem && (
            <p id={`${id}-new-error`} className={formStyles.error}>
              {addProblem}
            </p>
          )}
        </form>
      )}
      {save.error && (
        <p role="alert" className={formStyles.error}>
          {save.error.message}
        </p>
      )}
    </section>
  );
}

function removeTitle(name: string, withValue: number): string {
  const values =
    withValue === 0
      ? 'No offer has a value for it.'
      : withValue === 1
        ? '1 offer has a value for it, which goes too, with its score.'
        : `${withValue} offers have a value for it, which go too, with their scores.`;
  return `Remove the field "${name}"? ${values}`;
}
