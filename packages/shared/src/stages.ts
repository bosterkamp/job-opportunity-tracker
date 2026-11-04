// The fixed pipeline (spec FR-008). Display order is the array order.
export const STAGES = [
  { id: 'CONSIDERING', label: 'Considering', category: 'open' },
  { id: 'APPLIED', label: 'Applied', category: 'open' },
  { id: 'CONTACTED', label: 'Contacted', category: 'open' },
  { id: 'INTERVIEWING', label: 'Interviewing', category: 'open' },
  { id: 'OFFER', label: 'Offer', category: 'open' },
  // Outcomes say what each one means, shown under it when closing an opportunity.
  { id: 'ACCEPTED', label: 'Accepted', category: 'outcome', description: 'You took the job.' },
  {
    id: 'DECLINED',
    label: 'Declined',
    category: 'outcome',
    description: 'They made an offer and you turned it down.',
  },
  {
    id: 'REJECTED',
    label: 'Rejected',
    category: 'outcome',
    description: 'They turned you down.',
  },
  {
    id: 'NO_LONGER_AVAILABLE',
    label: 'No Longer Available',
    category: 'outcome',
    description: 'The role was filled or taken down without a decision on you.',
  },
  {
    id: 'WITHDRAWN',
    label: 'Withdrawn',
    category: 'outcome',
    description: 'You pulled out before any offer.',
  },
  {
    id: 'NO_RESPONSE',
    label: 'No Response',
    category: 'outcome',
    description: 'You never heard back.',
  },
] as const;

export type StageDefinition = (typeof STAGES)[number];
export type Stage = StageDefinition['id'];
export type StageCategory = StageDefinition['category'];
export type OpportunityStatus = 'OPEN' | 'CLOSED';

// A tuple (not just Stage[]) so zod's z.enum can use it directly.
export const STAGE_IDS = STAGES.map((stage) => stage.id) as unknown as readonly [Stage, ...Stage[]];

export const OPEN_STAGES: readonly Stage[] = STAGES.filter((s) => s.category === 'open').map(
  (s) => s.id,
);

export const OUTCOME_STAGES: readonly Stage[] = STAGES.filter((s) => s.category === 'outcome').map(
  (s) => s.id,
);

export function isOutcome(stage: Stage): boolean {
  return OUTCOME_STAGES.includes(stage);
}

// Status is always derived from the stage, never set directly (data-model.md).
export function statusForStage(stage: Stage): OpportunityStatus {
  return isOutcome(stage) ? 'CLOSED' : 'OPEN';
}

export function stageLabel(stage: Stage): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

// What an outcome means; open stages have none.
export function stageDescription(stage: Stage): string | undefined {
  const definitions: readonly { id: Stage; description?: string }[] = STAGES;
  return definitions.find((s) => s.id === stage)?.description;
}
