import { INTERVIEW_MESSAGES, MAX_INTERVIEWS, type OpportunityWithHistory } from '@jot/shared';
import { Link, useNavigate, useParams } from 'react-router';
import { useAddInterview } from '../api/hooks';
import { InterviewForm } from '../components/InterviewForm';
import { interviewPath } from '../components/InterviewList';
import { OpportunityLoader } from '../components/OpportunityLoader';
import styles from './Page.module.css';

// Adding an interview (feature 012), on its own page. Saving opens the new interview's page.
export function NewInterviewPage() {
  // The route is /opportunities/:id/interviews/new, so the id is always there.
  const id = useParams().id as string;
  return (
    <OpportunityLoader id={id}>
      {(opportunity) => <AddInterview opportunity={opportunity} />}
    </OpportunityLoader>
  );
}

function AddInterview({ opportunity: o }: { opportunity: OpportunityWithHistory }) {
  const navigate = useNavigate();
  const add = useAddInterview(o.id);
  const back = `/opportunities/${o.id}`;

  return (
    <>
      <h2>Add an interview for {o.company}</h2>
      <p className={styles.subtitle}>{o.title}</p>
      {(o.interviewCount ?? 0) >= MAX_INTERVIEWS ? (
        <>
          <p>{INTERVIEW_MESSAGES.LIMIT}</p>
          <Link to={back} className={styles.backLink}>
            Back to {o.company}
          </Link>
        </>
      ) : (
        <InterviewForm
          createdAt={o.createdAt}
          submitLabel="Save interview"
          submitting={add.isPending}
          serverError={add.error?.message}
          onSubmit={(input) =>
            add.mutate(input, {
              onSuccess: (updated) => {
                // The new one is the interview that wasn't there before.
                const known = new Set(o.interviews?.map((interview) => interview.id));
                const created = updated.interviews?.find((interview) => !known.has(interview.id));
                void navigate(created ? interviewPath(o.id, created.id) : back);
              },
            })
          }
          onCancel={() => void navigate(back)}
        />
      )}
    </>
  );
}
