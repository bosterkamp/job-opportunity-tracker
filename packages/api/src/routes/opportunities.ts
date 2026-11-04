import {
  dateAddedProblem,
  OpportunityInputSchema,
  OpportunityPatchSchema,
  SALARY_RANGE_MESSAGE,
  salaryRangeIsValid,
  type OpportunityPatch,
  type OpportunityWithHistory,
  type Via,
} from '@jot/shared';
import { z } from 'zod';
import { ApiError, json, noContent } from '../http.js';
import type { LeadRepo } from '../repo/leadRepo.js';
import type { OpportunityRepo } from '../repo/opportunityRepo.js';
import type { Route } from '../router.js';

export interface OpportunityRouteDeps {
  repo: OpportunityRepo;
  leadRepo: LeadRepo;
  newId: () => string;
  now: () => Date;
  // Set when the request comes through Claude (feature 003); absent for the web app.
  via?: Via;
}

// A bad value is reported by the route's own ApiError, so the enum needs no message.
const StatusQuery = z.enum(['OPEN', 'CLOSED']).default('OPEN');

// A patch may change one end of the salary range, so the schema can't see the other end:
// check the range the opportunity would end up with. Null clears an end.
function checkSalaryRange(current: OpportunityWithHistory, patch: OpportunityPatch) {
  const min = 'salaryMin' in patch ? patch.salaryMin : current.salaryMin;
  const max = 'salaryMax' in patch ? patch.salaryMax : current.salaryMax;
  if (!salaryRangeIsValid(min, max)) {
    throw new ApiError('VALIDATION_ERROR', SALARY_RANGE_MESSAGE, ['salaryMin']);
  }
}

// The date added in UTC, like every stored timestamp, so they compare as strings. Throws
// when it's in the future or after the first stage change (feature 004). A new opportunity has
// no history or interviews yet: dateAddedProblem treats them as empty.
function checkDateAdded(
  createdAt: string,
  now: Date,
  history?: OpportunityWithHistory['history'],
  interviews?: OpportunityWithHistory['interviews'],
) {
  const problem = dateAddedProblem(createdAt, now, history, interviews);
  if (problem) {
    throw new ApiError('VALIDATION_ERROR', problem, ['createdAt']);
  }
  return new Date(createdAt).toISOString();
}

// A link to a networking lead (feature 010) must be to one that exists.
async function checkLead(leadRepo: LeadRepo, leadId: string | null | undefined) {
  if (leadId && !(await leadRepo.get(leadId))) {
    throw new ApiError('VALIDATION_ERROR', "That lead doesn't exist", ['leadId']);
  }
}

export function opportunityRoutes({
  repo,
  leadRepo,
  newId,
  now,
  via,
}: OpportunityRouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/opportunities',
      async handle({ body }) {
        // Trims text, drops blank optional fields and an all-blank contact (shared schema).
        const parsed = OpportunityInputSchema.parse(body);
        await checkLead(leadRepo, parsed.leadId);
        const at = now();
        const input = parsed.createdAt
          ? { ...parsed, createdAt: checkDateAdded(parsed.createdAt, at) }
          : parsed;
        const created = await repo.create(input, { id: newId(), now: at.toISOString(), via });
        return json(201, created);
      },
    },
    {
      method: 'GET',
      path: '/opportunities',
      async handle({ query }) {
        const parsed = StatusQuery.safeParse(query.status);
        if (!parsed.success) {
          throw new ApiError('VALIDATION_ERROR', 'status must be OPEN or CLOSED', ['status']);
        }
        return json(200, { items: await repo.listByStatus(parsed.data) });
      },
    },
    {
      method: 'GET',
      path: '/opportunities/:id',
      async handle({ params }) {
        const opportunity = await repo.getWithHistory(params.id as string);
        if (!opportunity) {
          throw new ApiError('NOT_FOUND', 'Opportunity not found');
        }
        return json(200, opportunity);
      },
    },
    {
      method: 'PATCH',
      path: '/opportunities/:id',
      async handle({ params, body }) {
        // Blank or null optional fields clear them; company and title can't be cleared.
        const id = params.id as string;
        const { createdAt, ...patch } = OpportunityPatchSchema.parse(body);
        await checkLead(leadRepo, patch.leadId);
        const at = now();
        // Only the salary range and the date added need the stored opportunity.
        if (createdAt !== undefined || 'salaryMin' in patch || 'salaryMax' in patch) {
          const current = await repo.getWithHistory(id);
          if (!current) {
            throw new ApiError('NOT_FOUND', 'Opportunity not found');
          }
          checkSalaryRange(current, patch);
          if (createdAt) {
            await repo.changeDateAdded(id, {
              createdAt: checkDateAdded(createdAt, at, current.history, current.interviews),
              expectedChangeCount: current.changeCount,
              now: at.toISOString(),
            });
          }
        }
        // Always, even for a patch with only the date added: it sets updatedAt and the mark for
        // changes made through Claude, and returns the opportunity as it now is.
        const updated = await repo.updateDetails(id, patch, at.toISOString(), via);
        if (!updated) {
          throw new ApiError('NOT_FOUND', 'Opportunity not found');
        }
        return json(200, updated);
      },
    },
    {
      method: 'DELETE',
      path: '/opportunities/:id',
      async handle({ params, headers }) {
        // Permanent deletion must be deliberate (spec FR-016); closing is a stage change.
        if (headers['x-confirm-delete'] !== 'true') {
          throw new ApiError(
            'VALIDATION_ERROR',
            'Confirm permanent deletion with the header X-Confirm-Delete: true',
            ['X-Confirm-Delete'],
          );
        }
        if (!(await repo.deletePermanently(params.id as string))) {
          throw new ApiError('NOT_FOUND', 'Opportunity not found');
        }
        return noContent();
      },
    },
  ];
}
