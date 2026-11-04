import {
  formatSalaryRange,
  INTERVIEW_MESSAGES,
  MAX_INTERVIEWS,
  timeline,
  isFollowUpDue,
  localDate,
  stageLabel,
  type OpportunityWithHistory,
} from '@jot/shared';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  useAddInterview,
  useDeleteOpportunity,
  useLeads,
  useOpportunity,
  useRemoveInterview,
  useUpdateInterview,
  useUpdateOpportunity,
} from '../api/hooks';
import { DeleteOpportunity } from '../components/DeleteOpportunity';
import { InterviewForm } from '../components/InterviewForm';
import { RemoveInterview } from '../components/RemoveInterview';
import { MoveStage } from '../components/MoveStage';
import { OpportunityForm, toFormValues } from '../components/OpportunityForm';
import { QueryState } from '../components/QueryState';
import { StarDisplay } from '../components/StarRating';
import { WORK_ARRANGEMENT_LABELS, formatCalendarDate, formatDate } from '../format';
import styles from './Page.module.css';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function contactText(contact: NonNullable<OpportunityWithHistory['contact']>): string {
  const who = [contact.name, contact.role].filter(Boolean).join(', ');
  return [who, contact.email, contact.phone].filter(Boolean).join(' · ');
}

function Details({
  opportunity: o,
  onEdit,
}: {
  opportunity: OpportunityWithHistory;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const remove = useDeleteOpportunity(o.id);
  const salary = formatSalaryRange(o.salaryMin, o.salaryMax);
  const addInterview = useAddInterview(o.id);
  const updateInterview = useUpdateInterview(o.id);
  const removeInterview = useRemoveInterview(o.id);
  const [adding, setAdding] = useState(false);
  // The interview being changed, if any.
  const [editing, setEditing] = useState<string | null>(null);
  const atLimit = (o.interviewCount ?? 0) >= MAX_INTERVIEWS;
  // Its networking lead (feature 010), from the leads list. A link to a lead that's gone shows
  // nothing.
  const { data: leads } = useLeads();
  const lead = o.leadId ? leads?.find((l) => l.id === o.leadId) : undefined;

  return (
    <>
      <h2>{o.title}</h2>
      <p className={styles.subtitle}>{o.company}</p>
      <div className={styles.actions}>
        <MoveStage opportunity={o} />
        <button type="button" className={styles.secondaryButton} onClick={onEdit}>
          Edit details
        </button>
        {!atLimit && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            Add interview
          </button>
        )}
        <DeleteOpportunity
          company={o.company}
          onDelete={() => remove.mutateAsync().then(() => navigate('/'))}
        />
      </div>
      {atLimit && <p className={styles.muted}>{INTERVIEW_MESSAGES.LIMIT}</p>}
      {adding && (
        <InterviewForm
          createdAt={o.createdAt}
          submitLabel="Save interview"
          submitting={addInterview.isPending}
          serverError={addInterview.error?.message}
          onSubmit={(input) => addInterview.mutate(input, { onSuccess: () => setAdding(false) })}
          onCancel={() => {
            addInterview.reset();
            setAdding(false);
          }}
        />
      )}

      <dl className={styles.facts}>
        <Fact label="Stage">{stageLabel(o.stage)}</Fact>
        <Fact label="Interest">
          <StarDisplay value={o.interest} />
        </Fact>
        <Fact label="Date added">{formatDate(o.createdAt)}</Fact>
        {o.contact && <Fact label="Point of contact">{contactText(o.contact)}</Fact>}
        {lead && (
          <Fact label="Lead">
            {[lead.name, lead.email, lead.phone].filter(Boolean).join(' · ')}
          </Fact>
        )}
        {o.postingUrl && (
          <Fact label="Job posting">
            <a href={o.postingUrl} target="_blank" rel="noreferrer">
              {o.postingUrl}
            </a>
          </Fact>
        )}
        {o.location && <Fact label="Location">{o.location}</Fact>}
        {o.workArrangement && (
          <Fact label="Work arrangement">{WORK_ARRANGEMENT_LABELS[o.workArrangement]}</Fact>
        )}
        {salary && <Fact label="Salary">{salary}</Fact>}
        {o.compensation && <Fact label="Pay notes">{o.compensation}</Fact>}
        {o.source && <Fact label="Where you found it">{o.source}</Fact>}
        {o.postedUntil && <Fact label="Posted until">{formatCalendarDate(o.postedUntil)}</Fact>}
        {o.followUpDate && (
          <Fact label="Follow-up date">
            {formatCalendarDate(o.followUpDate)}
            {isFollowUpDue(o.followUpDate, localDate()) && (
              <span className={styles.due}> · Follow up now</span>
            )}
          </Fact>
        )}
      </dl>
      {o.detailsEditedViaClaudeAt && (
        <p className={styles.muted}>
          Details last changed through Claude on {formatDate(o.detailsEditedViaClaudeAt)}
        </p>
      )}

      {o.description && (
        <section aria-labelledby="description-heading">
          <h3 id="description-heading">Job description</h3>
          <p className={styles.longText}>{o.description}</p>
        </section>
      )}
      {o.notes && (
        <section aria-labelledby="notes-heading">
          <h3 id="notes-heading">Notes</h3>
          <p className={styles.longText}>{o.notes}</p>
        </section>
      )}

      <section aria-labelledby="history-heading">
        <h3 id="history-heading">History</h3>
        <ol className={styles.history}>
          {timeline(o).map((entry) =>
            entry.kind === 'stage' ? (
              <li key={`stage-${entry.change.seq}`}>
                {stageLabel(entry.change.toStage)} · {formatDate(entry.at)}
                {entry.change.via === 'CLAUDE' && (
                  <span className={styles.muted}> · via Claude</span>
                )}
                {entry.change.note && <> · {entry.change.note}</>}
              </li>
            ) : (
              <li key={`interview-${entry.interview.id}`}>
                {editing === entry.interview.id ? (
                  <InterviewForm
                    createdAt={o.createdAt}
                    initial={entry.interview}
                    submitLabel="Save interview"
                    submitting={updateInterview.isPending}
                    serverError={updateInterview.error?.message}
                    onSubmit={(patch) =>
                      updateInterview.mutate(
                        { interviewId: entry.interview.id, patch },
                        { onSuccess: () => setEditing(null) },
                      )
                    }
                    onCancel={() => {
                      updateInterview.reset();
                      setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    Interview · {formatDate(entry.at)}
                    {entry.interview.via === 'CLAUDE' && (
                      <span className={styles.muted}> · via Claude</span>
                    )}
                    {entry.interview.note && <> · {entry.interview.note}</>}
                    <span className={styles.entryActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        aria-label={`Edit the interview on ${formatDate(entry.at)}`}
                        onClick={() => setEditing(entry.interview.id)}
                      >
                        Edit
                      </button>
                      <RemoveInterview
                        label={`Remove the interview on ${formatDate(entry.at)}`}
                        onRemove={() => removeInterview.mutateAsync(entry.interview.id)}
                      />
                    </span>
                  </>
                )}
              </li>
            ),
          )}
        </ol>
      </section>
    </>
  );
}

export function OpportunityDetailPage() {
  // The route is /opportunities/:id, so the id is always there.
  const id = useParams().id as string;
  const { data, error, isPending, isFetching, refetch } = useOpportunity(id);

  if (data) {
    return <Loaded opportunity={data} />;
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <h2>Opportunity not found</h2>
        <Link to="/">Back to the overview</Link>
      </>
    );
  }
  return (
    <>
      {error && <h2>Couldn't load this opportunity</h2>}
      <QueryState
        what="this opportunity"
        isPending={isPending}
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
        skeleton="detail"
      />
      {error && <Link to="/">Back to the overview</Link>}
    </>
  );
}

// Viewing, or editing the details (spec US4). Stage changes go through "Move to…" instead.
function Loaded({ opportunity }: { opportunity: OpportunityWithHistory }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateOpportunity(opportunity.id);
  const { data: leads } = useLeads();

  if (!editing) {
    return <Details opportunity={opportunity} onEdit={() => setEditing(true)} />;
  }
  return (
    <>
      <h2>Edit {opportunity.title}</h2>
      <p className={styles.subtitle}>{opportunity.company}</p>
      <OpportunityForm
        mode="edit"
        initialValues={toFormValues(opportunity)}
        submitLabel="Save changes"
        submitting={update.isPending}
        serverError={update.error?.message}
        history={opportunity.history}
        interviews={opportunity.interviews}
        leads={leads}
        onSubmit={(patch) => update.mutate(patch, { onSuccess: () => setEditing(false) })}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </>
  );
}
