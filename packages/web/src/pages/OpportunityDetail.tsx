import {
  formatSalaryRange,
  timeline,
  isFollowUpDue,
  localDate,
  stageLabel,
  type OpportunityWithHistory,
} from '@jot/shared';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useDeleteOpportunity, useLeads, useUpdateOpportunity } from '../api/hooks';
import { DeleteOpportunity } from '../components/DeleteOpportunity';
import { InterviewList, interviewLine, interviewPath } from '../components/InterviewList';
import { MoveStage } from '../components/MoveStage';
import { OfferSection } from '../components/OfferSection';
import { OpportunityForm, toFormValues } from '../components/OpportunityForm';
import { OpportunityLoader } from '../components/OpportunityLoader';
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
        <DeleteOpportunity
          company={o.company}
          onDelete={() => remove.mutateAsync().then(() => navigate('/'))}
        />
      </div>

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
      <InterviewList opportunity={o} />
      <OfferSection opportunity={o} />

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
          {timeline(o, new Date()).map((entry) =>
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
                <Link to={interviewPath(o.id, entry.interview.id)}>
                  Interview · {interviewLine(entry.interview, { withFormat: false })}
                </Link>
                {entry.interview.via === 'CLAUDE' && (
                  <span className={styles.muted}> · via Claude</span>
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
  return (
    <OpportunityLoader id={id}>
      {(opportunity) => <Loaded opportunity={opportunity} />}
    </OpportunityLoader>
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
