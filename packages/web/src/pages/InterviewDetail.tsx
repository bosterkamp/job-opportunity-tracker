import {
  interviewFormatLabel,
  interviewKindLabel,
  interviewOutcomeLabel,
  isPastInterview,
  type Interview,
  type OpportunityWithHistory,
} from '@jot/shared';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useRemoveInterview, useUpdateInterview } from '../api/hooks';
import { InterviewForm } from '../components/InterviewForm';
import { OpportunityLoader } from '../components/OpportunityLoader';
import { RemoveInterview } from '../components/RemoveInterview';
import { formatDateTime } from '../format';
import own from './InterviewDetail.module.css';
import styles from './Page.module.css';

// One interview's own page (feature 012): every detail and who was in it, with Edit and Remove.
export function InterviewDetailPage() {
  // The route is /opportunities/:id/interviews/:interviewId, so both are always there.
  const params = useParams() as { id: string; interviewId: string };
  return (
    <OpportunityLoader id={params.id}>
      {(opportunity) => (
        <InterviewView opportunity={opportunity} interviewId={params.interviewId} />
      )}
    </OpportunityLoader>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function InterviewView({
  opportunity: o,
  interviewId,
}: {
  opportunity: OpportunityWithHistory;
  interviewId: string;
}) {
  const navigate = useNavigate();
  const update = useUpdateInterview(o.id);
  const remove = useRemoveInterview(o.id);
  const [editing, setEditing] = useState(false);
  const interview = o.interviews?.find((i) => i.id === interviewId);
  const back = `/opportunities/${o.id}`;
  const backLink = (
    <Link to={back} className={styles.backLink}>
      Back to {o.company}
    </Link>
  );

  if (!interview) {
    return (
      <>
        <h2>Interview not found</h2>
        {backLink}
      </>
    );
  }
  const subtitle = (
    <p className={styles.subtitle}>
      {o.company} · {o.title}
    </p>
  );

  if (editing) {
    return (
      <>
        <h2>Edit interview</h2>
        {subtitle}
        <InterviewForm
          createdAt={o.createdAt}
          initial={interview}
          submitLabel="Save interview"
          submitting={update.isPending}
          serverError={update.error?.message}
          onSubmit={(patch) =>
            update.mutate(
              { interviewId: interview.id, patch },
              { onSuccess: () => setEditing(false) },
            )
          }
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
        />
      </>
    );
  }

  const past = isPastInterview(interview.heldAt, new Date());
  return (
    <>
      <h2>{interview.kind ? `${interviewKindLabel(interview.kind)} interview` : 'Interview'}</h2>
      {subtitle}
      {!past && <p className={own.upcoming}>Upcoming</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>
          Edit interview
        </button>
        <RemoveInterview
          label="Remove interview"
          onRemove={() => remove.mutateAsync(interview.id).then(() => navigate(back))}
        />
      </div>

      <section aria-labelledby="details-heading">
        <h3 id="details-heading">Details</h3>
        <dl className={styles.facts}>
          <Fact label="When">{formatDateTime(interview.heldAt)}</Fact>
          {interview.panel && <Fact label="Panel">Yes</Fact>}
          {interview.format && <Fact label="Format">{interviewFormatLabel(interview.format)}</Fact>}
          {past && interview.outcome && (
            <Fact label="How it went">{interviewOutcomeLabel(interview.outcome)}</Fact>
          )}
          {interview.nextSteps && <Fact label="Next steps">{interview.nextSteps}</Fact>}
          {interview.note && <Fact label="Note">{interview.note}</Fact>}
        </dl>
      </section>

      {/* A cleared list isn't stored, so a list here always has someone in it. */}
      {interview.interviewers && <Interviewers people={interview.interviewers} />}
      {backLink}
    </>
  );
}

// Who was in the interview. Only the LinkedIn profile is a link (spec FR-011).
function Interviewers({ people }: { people: NonNullable<Interview['interviewers']> }) {
  return (
    <section aria-labelledby="interviewers-heading">
      <h3 id="interviewers-heading">Interviewers</h3>
      <ul className={own.people}>
        {people.map((person, index) => (
          <li key={index} className={own.person}>
            <span className={own.name}>{person.name}</span>
            {person.title && <span>{person.title}</span>}
            {person.email && <span>{person.email}</span>}
            {person.phone && <span>{person.phone}</span>}
            {person.linkedin && (
              <a
                href={person.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`LinkedIn profile of ${person.name}`}
              >
                LinkedIn
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
