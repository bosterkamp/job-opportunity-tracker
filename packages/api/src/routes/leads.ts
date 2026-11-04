import {
  LEAD_NOTE_MESSAGES,
  LeadInputSchema,
  LeadNoteInputSchema,
  LeadNotePatchSchema,
  LeadPatchSchema,
  byNewestNote,
  noteDateProblem,
  type LeadOpportunity,
  type Opportunity,
} from '@jot/shared';
import { ApiError, json, noContent } from '../http.js';
import type { LeadRepo } from '../repo/leadRepo.js';
import type { OpportunityRepo } from '../repo/opportunityRepo.js';
import type { Route } from '../router.js';

export interface LeadRouteDeps {
  repo: OpportunityRepo;
  leadRepo: LeadRepo;
  newId: () => string;
  now: () => Date;
}

const notFound = () => new ApiError('NOT_FOUND', 'Lead not found');
const noteNotFound = () => new ApiError('NOT_FOUND', LEAD_NOTE_MESSAGES.NOT_FOUND);

// A note's date in UTC, like every stored timestamp, so they compare as strings (feature 011).
function checkHeldAt(heldAt: string, now: Date): string {
  const problem = noteDateProblem(heldAt, now);
  if (problem) {
    throw new ApiError('VALIDATION_ERROR', problem, ['heldAt']);
  }
  return new Date(heldAt).toISOString();
}

// Every opportunity, open and closed, newest stage change first.
async function allOpportunities(repo: OpportunityRepo): Promise<Opportunity[]> {
  const [open, closed] = await Promise.all([
    repo.listByStatus('OPEN'),
    repo.listByStatus('CLOSED'),
  ]);
  return [...open, ...closed].sort((a, b) =>
    b.lastStageChangeAt.localeCompare(a.lastStageChangeAt),
  );
}

const summary = ({ id, company, title, stage, status }: Opportunity): LeadOpportunity => ({
  id,
  company,
  title,
  stage,
  status,
});

// The networking leads (feature 010).
export function leadRoutes({ repo, leadRepo, newId, now }: LeadRouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/leads',
      async handle() {
        const [leads, opportunities] = await Promise.all([leadRepo.list(), allOpportunities(repo)]);
        const items = leads.map(({ notes, ...lead }) => ({
          ...lead,
          opportunities: opportunities.filter((o) => o.leadId === lead.id).map(summary),
          notes: notes.sort(byNewestNote),
        }));
        return json(200, { items });
      },
    },
    {
      method: 'POST',
      path: '/leads',
      async handle({ body }) {
        const input = LeadInputSchema.parse(body);
        return json(201, await leadRepo.create(input, { id: newId(), now: now().toISOString() }));
      },
    },
    {
      method: 'PATCH',
      path: '/leads/:id',
      async handle({ params, body }) {
        const patch = LeadPatchSchema.parse(body);
        const updated = await leadRepo.update(params.id as string, patch, now().toISOString());
        if (!updated) {
          throw notFound();
        }
        return json(200, updated);
      },
    },
    {
      method: 'DELETE',
      path: '/leads/:id',
      async handle({ params, headers }) {
        if (headers['x-confirm-delete'] !== 'true') {
          throw new ApiError(
            'VALIDATION_ERROR',
            'Confirm permanent deletion with the header X-Confirm-Delete: true',
            ['X-Confirm-Delete'],
          );
        }
        const id = params.id as string;
        if (!(await leadRepo.get(id))) {
          throw notFound();
        }
        const linked = (await allOpportunities(repo)).filter((o) => o.leadId === id);
        await leadRepo.delete(
          id,
          linked.map((o) => o.id),
          now().toISOString(),
        );
        return noContent();
      },
    },

    // Notes on a lead (feature 011).
    {
      method: 'POST',
      path: '/leads/:id/notes',
      async handle({ params, body }) {
        const input = LeadNoteInputSchema.parse(body);
        const leadId = params.id as string;
        if (!(await leadRepo.get(leadId))) {
          throw notFound();
        }
        const at = now();
        const recordedAt = at.toISOString();
        const note = {
          id: newId(),
          leadId,
          heldAt: input.heldAt ? checkHeldAt(input.heldAt, at) : recordedAt,
          text: input.text,
          createdAt: recordedAt,
          updatedAt: recordedAt,
        };
        await leadRepo.addNote(note);
        return json(201, note);
      },
    },
    {
      method: 'PATCH',
      path: '/leads/:id/notes/:noteId',
      async handle({ params, body }) {
        const patch = LeadNotePatchSchema.parse(body);
        const at = now();
        const fields = patch.heldAt ? { ...patch, heldAt: checkHeldAt(patch.heldAt, at) } : patch;
        const updated = await leadRepo.updateNote(
          params.id as string,
          params.noteId as string,
          fields,
          at.toISOString(),
        );
        if (!updated) {
          throw noteNotFound();
        }
        return json(200, updated);
      },
    },
    {
      method: 'DELETE',
      path: '/leads/:id/notes/:noteId',
      async handle({ params, headers }) {
        if (headers['x-confirm-delete'] !== 'true') {
          throw new ApiError(
            'VALIDATION_ERROR',
            'Confirm deleting the note with the header X-Confirm-Delete: true',
            ['X-Confirm-Delete'],
          );
        }
        if (!(await leadRepo.deleteNote(params.id as string, params.noteId as string))) {
          throw noteNotFound();
        }
        return noContent();
      },
    },
  ];
}
