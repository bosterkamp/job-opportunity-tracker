import type { OpportunityStatus } from '@jot/shared';

// Single-table key layout from specs/001-job-opportunity-tracker/data-model.md.
export const OPPORTUNITY_SK = 'OPP';
export const CHANGE_PREFIX = 'CHANGE#';
export const INTERVIEW_PREFIX = 'INTERVIEW#';
export const GSI1 = 'GSI1';

export const opportunityPk = (id: string) => `OPP#${id}`;

export function opportunityKey(id: string) {
  return { PK: opportunityPk(id), SK: OPPORTUNITY_SK };
}

// GSI1 lists opportunities by status, ordered by their most recent stage change.
export function opportunityGsi1(status: OpportunityStatus, lastStageChangeAt: string, id: string) {
  return { GSI1PK: statusPartition(status), GSI1SK: gsi1SortKey(lastStageChangeAt, id) };
}

export const gsi1SortKey = (lastStageChangeAt: string, id: string) => `${lastStageChangeAt}#${id}`;

export const statusPartition = (status: OpportunityStatus) => `STATUS#${status}`;

// Zero-padded so history items sort in entry order within the partition.
export function stageChangeKey(id: string, seq: number) {
  return { PK: opportunityPk(id), SK: `${CHANGE_PREFIX}${String(seq).padStart(6, '0')}` };
}

// An interview (feature 005), in its opportunity's partition.
export function interviewKey(id: string, interviewId: string) {
  return { PK: opportunityPk(id), SK: `${INTERVIEW_PREFIX}${interviewId}` };
}

export const isInterviewItem = (item: { SK?: unknown }) =>
  typeof item.SK === 'string' && item.SK.startsWith(INTERVIEW_PREFIX);

export const isOpportunityItem = (item: { SK?: unknown }) => item.SK === OPPORTUNITY_SK;

export const isStageChangeItem = (item: { SK?: unknown }) =>
  typeof item.SK === 'string' && item.SK.startsWith(CHANGE_PREFIX);

// A networking lead (feature 010): its own partition, listed through GSI1's LEADS partition.
export const LEAD_SK = 'LEAD';
export const LEADS_PARTITION = 'LEADS';

export const leadPk = (id: string) => `LEAD#${id}`;

export function leadKey(id: string) {
  return { PK: leadPk(id), SK: LEAD_SK };
}

export const isLeadItem = (item: { SK?: unknown }) => item.SK === LEAD_SK;

// A note on a lead (feature 011), in its lead's partition. It's listed with the leads, in the
// same GSI1 partition, sorting after its lead's own entry.
export const NOTE_PREFIX = 'NOTE#';

export function leadNoteKey(leadId: string, noteId: string) {
  return { PK: leadPk(leadId), SK: `${NOTE_PREFIX}${noteId}` };
}

export function leadNoteGsi1(leadId: string, noteId: string) {
  return { GSI1PK: LEADS_PARTITION, GSI1SK: `${leadId}#${NOTE_PREFIX}${noteId}` };
}

export const isLeadNoteItem = (item: { SK?: unknown }) =>
  typeof item.SK === 'string' && item.SK.startsWith(NOTE_PREFIX);
