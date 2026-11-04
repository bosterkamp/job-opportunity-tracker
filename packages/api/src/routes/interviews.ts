import {
  INTERVIEW_MESSAGES,
  InterviewInputSchema,
  InterviewPatchSchema,
  interviewDateProblem,
  type OpportunityWithHistory,
} from '@jot/shared';
import { ApiError, json } from '../http.js';
import type { OpportunityRepo } from '../repo/opportunityRepo.js';
import type { Route } from '../router.js';
import type { OpportunityRouteDeps } from './opportunities.js';

// Interviews the owner has had for an opportunity (feature 005): log, edit, and remove. They
// never change the stage. Each route answers with the opportunity as it now is.

async function loadOpportunity(repo: OpportunityRepo, id: string) {
  const current = await repo.getWithHistory(id);
  if (!current) {
    throw new ApiError('NOT_FOUND', 'Opportunity not found');
  }
  return current;
}

// The date in UTC, like every stored timestamp, so they compare as strings.
function checkHeldAt(heldAt: string, now: Date, current: OpportunityWithHistory): string {
  const problem = interviewDateProblem(heldAt, now, current.createdAt);
  if (problem) {
    throw new ApiError('VALIDATION_ERROR', problem, ['heldAt']);
  }
  return new Date(heldAt).toISOString();
}

export function interviewRoutes({ repo, newId, now, via }: OpportunityRouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/opportunities/:id/interviews',
      async handle({ params, body }) {
        const id = params.id as string;
        const input = InterviewInputSchema.parse(body ?? {});
        const current = await loadOpportunity(repo, id);
        const at = now();
        const recordedAt = at.toISOString();
        // The transaction holds the limit of 6, even when two adds race.
        await repo.addInterview(
          id,
          {
            id: newId(),
            heldAt: input.heldAt ? checkHeldAt(input.heldAt, at, current) : recordedAt,
            note: input.note ?? null,
            recordedAt,
            ...(via && { via }),
          },
          recordedAt,
        );
        return json(201, await repo.getWithHistory(id));
      },
    },
    {
      method: 'PATCH',
      path: '/opportunities/:id/interviews/:interviewId',
      async handle({ params, body }) {
        const id = params.id as string;
        const patch = InterviewPatchSchema.parse(body);
        const current = await loadOpportunity(repo, id);
        const fields = patch.heldAt
          ? { ...patch, heldAt: checkHeldAt(patch.heldAt, now(), current) }
          : patch;
        if (!(await repo.updateInterview(id, params.interviewId as string, fields, via))) {
          throw new ApiError('NOT_FOUND', INTERVIEW_MESSAGES.NOT_FOUND);
        }
        return json(200, await repo.getWithHistory(id));
      },
    },
    {
      method: 'DELETE',
      path: '/opportunities/:id/interviews/:interviewId',
      async handle({ params, headers }) {
        // Removing is deliberate, like deleting an opportunity (spec FR-007).
        if (headers['x-confirm-delete'] !== 'true') {
          throw new ApiError(
            'VALIDATION_ERROR',
            'Confirm removing the interview with the header X-Confirm-Delete: true',
            ['X-Confirm-Delete'],
          );
        }
        const id = params.id as string;
        const removed = await repo.removeInterview(
          id,
          params.interviewId as string,
          now().toISOString(),
        );
        if (!removed) {
          throw new ApiError('NOT_FOUND', INTERVIEW_MESSAGES.NOT_FOUND);
        }
        return json(200, await repo.getWithHistory(id));
      },
    },
  ];
}
