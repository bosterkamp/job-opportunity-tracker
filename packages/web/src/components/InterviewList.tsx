import {
  INTERVIEW_MESSAGES,
  interviewFormatLabel,
  interviewKindLabel,
  interviewSections,
  MAX_INTERVIEWS,
  type Interview,
  type OpportunityWithHistory,
} from '@jot/shared';
import { Link } from 'react-router';
import { formatDateTime } from '../format';
import page from '../pages/Page.module.css';
import styles from './InterviewList.module.css';

// What an interview is, in a line: its time, then its type, "Panel" and format when set.
export function interviewLine(interview: Interview, { withFormat = true } = {}): string {
  return [
    formatDateTime(interview.heldAt),
    interview.kind && interviewKindLabel(interview.kind),
    interview.panel && 'Panel',
    withFormat && interview.format && interviewFormatLabel(interview.format),
  ]
    .filter(Boolean)
    .join(' · ');
}

export const interviewPath = (opportunityId: string, interviewId: string) =>
  `/opportunities/${opportunityId}/interviews/${interviewId}`;

// The Interviews section on an opportunity's page (feature 012): upcoming ones first, soonest
// first, then past ones, newest first. Each opens its own page.
export function InterviewList({ opportunity: o }: { opportunity: OpportunityWithHistory }) {
  const { upcoming, past } = interviewSections(o.interviews, new Date());
  const atLimit = (o.interviewCount ?? 0) >= MAX_INTERVIEWS;

  const list = (title: string, label: string, interviews: Interview[]) =>
    interviews.length > 0 && (
      <>
        <h4 className={styles.group}>{title}</h4>
        <ul className={styles.list} aria-label={label}>
          {interviews.map((interview) => (
            <li key={interview.id}>
              <Link to={interviewPath(o.id, interview.id)}>{interviewLine(interview)}</Link>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <section aria-labelledby="interviews-heading" className={styles.section}>
      <h3 id="interviews-heading">Interviews</h3>
      {atLimit ? (
        <p className={page.muted}>{INTERVIEW_MESSAGES.LIMIT}</p>
      ) : (
        <Link to={`/opportunities/${o.id}/interviews/new`} className={page.secondaryLink}>
          Add interview
        </Link>
      )}
      {list('Upcoming', 'Upcoming interviews', upcoming)}
      {list('Past', 'Past interviews', past)}
    </section>
  );
}
