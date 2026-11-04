import { StageChangeInputSchema, validateStageChange } from '@jot/shared';
import { ApiError, json } from '../http.js';
import type { Route } from '../router.js';
import type { OpportunityRouteDeps } from './opportunities.js';

export function stageChangeRoutes({
  repo,
  now,
  via,
}: Omit<OpportunityRouteDeps, 'newId'>): Route[] {
  return [
    {
      method: 'POST',
      path: '/opportunities/:id/stage-changes',
      async handle({ params, body }) {
        const id = params.id as string;
        const input = StageChangeInputSchema.parse(body);

        const current = await repo.getWithHistory(id);
        if (!current) {
          throw new ApiError('NOT_FOUND', 'Opportunity not found');
        }

        // A stale expectedChangeCount is caught by changeStage's transaction condition, which
        // also covers two requests racing each other, so there's no separate check here.
        const at = now();
        const rule = validateStageChange(current, input, at);
        if (!rule.ok) {
          throw new ApiError(rule.error, rule.message);
        }

        await repo.changeStage(id, {
          expectedChangeCount: input.expectedChangeCount,
          fromStage: current.stage,
          toStage: rule.stage,
          status: rule.status,
          changedAt: rule.changedAt,
          lastStageChangeAt: rule.lastStageChangeAt,
          note: input.note ?? null,
          now: at.toISOString(),
          via,
        });

        return json(201, await repo.getWithHistory(id));
      },
    },
  ];
}
