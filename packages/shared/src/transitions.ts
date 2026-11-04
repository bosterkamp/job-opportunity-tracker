import { stageLabel, statusForStage, type OpportunityStatus, type Stage } from './stages.js';

// How far into the future a change may be dated, to allow for clocks that are slightly off.
export const CLOCK_SKEW_MS = 60_000;

export type StageChangeRuleError = 'SAME_STAGE' | 'FUTURE_DATE';

export type StageChangeResult =
  | {
      ok: true;
      stage: Stage;
      status: OpportunityStatus;
      // When the change happened, in UTC. Defaults to now; may be earlier (backdated).
      changedAt: string;
      // The latest changedAt across the whole history, including this change.
      lastStageChangeAt: string;
    }
  | { ok: false; error: StageChangeRuleError; message: string };

// The stage-change rules (data-model.md): any stage may move to any other stage, including
// skipping stages, moving back, closing (an outcome stage), and reopening; never to the
// stage it's already in, and never dated in the future.
export function validateStageChange(
  current: { stage: Stage; lastStageChangeAt: string },
  input: { toStage: Stage; changedAt?: string },
  now: Date,
): StageChangeResult {
  if (input.toStage === current.stage) {
    return { ok: false, error: 'SAME_STAGE', message: `Already in ${stageLabel(current.stage)}` };
  }

  const changedAt = input.changedAt ? new Date(input.changedAt) : now;
  if (changedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    return { ok: false, error: 'FUTURE_DATE', message: "The date can't be in the future" };
  }

  return {
    ok: true,
    stage: input.toStage,
    status: statusForStage(input.toStage),
    changedAt: changedAt.toISOString(),
    lastStageChangeAt: new Date(
      Math.max(changedAt.getTime(), Date.parse(current.lastStageChangeAt)),
    ).toISOString(),
  };
}
