import {
  formatSalaryRange,
  interviewCountText,
  interviewSummary,
  isFollowUpDue,
  localDate,
  respondByText,
  stageLabel,
  type Opportunity,
} from '@jot/shared';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDateTime, formatShortCalendarDate } from '../format';
import { postingDeadline, sinceLabel } from '../features/overview/overviewModel';
import { MoveStage } from './MoveStage';
import styles from './OpportunityCard.module.css';
import { StarDisplay } from './StarRating';

interface OpportunityCardProps {
  opportunity: Opportunity;
  // The archive shows the outcome as a badge; the board already groups cards by stage.
  showStage?: boolean;
  // The board offers "Move to…" on each card; the archive reopens from the detail page.
  showMove?: boolean;
  // The board's Offer column ticks offers to compare (feature 013).
  compare?: ReactNode;
}

// One opportunity at a glance (spec FR-017): company, job title, interest, salary, when the
// posting closes, and how long since its last stage change. The whole card opens the detail
// page.
export function OpportunityCard({
  opportunity: o,
  showStage = false,
  showMove = false,
  compare,
}: OpportunityCardProps) {
  const headingId = useId();
  // Due on the follow-up date and after, by the device's own date (spec FR-020).
  const due = isFollowUpDue(o.followUpDate, localDate());
  const salary = formatSalaryRange(o.salaryMin, o.salaryMax);
  // Only once at least one has happened (features 005 and 012), and the next one if any.
  const { held, nextAt } = interviewSummary(o, new Date());
  const interviews = interviewCountText(held);
  // When the posting is up until (feature 009). Closing soon is highlighted only while there's
  // still something to do.
  const deadline = postingDeadline(o.postedUntil, localDate());
  const deadlineClass =
    deadline?.kind === 'ended'
      ? styles.deadlineEnded
      : deadline?.kind === 'soon' && o.status === 'OPEN'
        ? styles.deadlineSoon
        : undefined;
  // When the offer needs an answer (feature 013): a warning within 3 days while it's open.
  const today = localDate();
  const respondBy = respondByText(o.offer?.respondBy, today, o.status, (ymd) =>
    formatShortCalendarDate(ymd, today),
  );

  return (
    <article className={due ? styles.cardDue : styles.card} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.company}>
          <Link to={`/opportunities/${o.id}`} className={styles.link}>
            {o.company}
          </Link>
        </h3>
        {interviews && <span className={styles.interviews}>{interviews}</span>}
      </div>
      <p className={styles.title}>{o.title}</p>
      {nextAt && <p className={styles.nextInterview}>Next interview: {formatDateTime(nextAt)}</p>}
      <p className={styles.meta}>
        {due && <span className={styles.dueBadge}>Follow up</span>}
        {showStage && <span className={styles.badge}>{stageLabel(o.stage)}</span>}
        <StarDisplay value={o.interest} />
        {salary && <span className={styles.salary}>{salary}</span>}
        {deadline && <span className={deadlineClass}>{deadline.text}</span>}
        {respondBy && (
          <span className={respondBy.warning ? styles.deadlineSoon : undefined}>
            {respondBy.text}
          </span>
        )}
        <span>Last change {sinceLabel(o.lastStageChangeAt)}</span>
      </p>
      {compare}
      {showMove && (
        <div className={styles.move}>
          <MoveStage opportunity={o} label={o.company} />
        </div>
      )}
    </article>
  );
}
