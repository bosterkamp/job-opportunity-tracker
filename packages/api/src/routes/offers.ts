import {
  customFieldId,
  OFFER_DETAILS,
  OFFER_MESSAGES,
  OfferFieldsPatchSchema,
  OfferInputSchema,
  OfferScoresPatchSchema,
  offerChanges,
  type Offer,
  type OfferField,
  type OfferInput,
  type OpportunityWithHistory,
} from '@jot/shared';
import { ApiError, json } from '../http.js';
import type { OfferFieldsRepo } from '../repo/offerFieldsRepo.js';
import type { OpportunityRepo } from '../repo/opportunityRepo.js';
import type { Route } from '../router.js';
import type { OpportunityRouteDeps } from './opportunities.js';

// An opportunity's offer, its scores, and the custom fields every offer shares (feature 013).
// None of them changes the stage or its history (FR-015).

export interface OfferRouteDeps extends OpportunityRouteDeps {
  offerFieldsRepo: OfferFieldsRepo;
}

const FIELDS_CONFLICT = 'The custom fields changed since you loaded them. Reload and try again.';

function confirmed(headers: Record<string, string | undefined>, what: string) {
  // Removing is deliberate, as deleting an opportunity is.
  if (headers['x-confirm-delete'] !== 'true') {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Confirm removing ${what} with the header X-Confirm-Delete: true`,
      ['X-Confirm-Delete'],
    );
  }
}

async function loadOpportunity(repo: OpportunityRepo, id: string) {
  const current = await repo.getWithHistory(id);
  if (!current) {
    throw new ApiError('NOT_FOUND', 'Opportunity not found');
  }
  return current;
}

// The offer's version is the last history entry's seq: each saved change adds one.
const offerVersion = (o: OpportunityWithHistory) => o.offerHistory?.at(-1)?.seq ?? 0;

// The offer as it would be after the change: given details set, nulls cleared, and values of
// custom fields that have been removed dropped (research §4).
function applyOffer(
  before: Offer | undefined,
  input: OfferInput,
  current: ReadonlySet<string>,
): Partial<Offer> {
  const next: Record<string, unknown> = {};
  for (const detail of OFFER_DETAILS) {
    const value = detail in input ? input[detail] : before?.[detail];
    if (value !== null && value !== undefined) {
      next[detail] = value;
    }
  }
  const custom = Object.fromEntries(
    Object.entries({ ...before?.custom, ...input.custom }).filter(
      (entry): entry is [string, string] => entry[1] !== null && current.has(entry[0]),
    ),
  );
  if (Object.keys(custom).length > 0) {
    next.custom = custom;
  }
  return next;
}

// A value for a custom field that doesn't exist is refused; clearing one is always fine.
function checkCustomValues(input: OfferInput, current: ReadonlySet<string>) {
  for (const [id, value] of Object.entries(input.custom ?? {})) {
    if (value !== null && !current.has(id)) {
      throw new ApiError('VALIDATION_ERROR', OFFER_MESSAGES.UNKNOWN_FIELD, [`custom.${id}`]);
    }
  }
}

export function offerRoutes({ repo, offerFieldsRepo, newId, now, via }: OfferRouteDeps): Route[] {
  const fieldIds = async () =>
    new Set((await offerFieldsRepo.get()).fields.map((field) => field.id));

  return [
    {
      method: 'PATCH',
      path: '/opportunities/:id/offer',
      async handle({ params, body }) {
        const id = params.id as string;
        const input = OfferInputSchema.parse(body ?? {});
        const current = await loadOpportunity(repo, id);
        const ids = await fieldIds();
        checkCustomValues(input, ids);
        const before = current.offer;
        const next = applyOffer(before, input, ids);
        const changes = offerChanges(before, next);
        // A save that changes nothing adds nothing to the history.
        if (before && changes.length === 0) {
          return json(200, current);
        }
        const at = now().toISOString();
        const expectedVersion = offerVersion(current);
        const dropScores = Object.keys(current.offerScores ?? {}).filter((key) => {
          const fieldId = customFieldId(key);
          return fieldId !== undefined && !ids.has(fieldId);
        });
        await repo.saveOffer(id, {
          offer: { ...next, createdAt: before?.createdAt ?? at, updatedAt: at },
          expectedVersion,
          entry: {
            seq: expectedVersion + 1,
            at,
            kind: before ? 'CHANGED' : 'RECORDED',
            changes,
            ...(via && { via }),
          },
          dropScores,
          now: at,
        });
        return json(200, await repo.getWithHistory(id));
      },
    },
    {
      method: 'DELETE',
      path: '/opportunities/:id/offer',
      async handle({ params, headers }) {
        confirmed(headers, 'the offer and its history');
        const id = params.id as string;
        const current = await loadOpportunity(repo, id);
        if (!current.offer) {
          throw new ApiError('NOT_FOUND', OFFER_MESSAGES.NOTHING_TO_REMOVE);
        }
        await repo.removeOffer(id, offerVersion(current), now().toISOString());
        return json(200, await repo.getWithHistory(id));
      },
    },
    {
      method: 'PATCH',
      path: '/opportunities/:id/offer/scores',
      async handle({ params, body }) {
        const id = params.id as string;
        const { scores } = OfferScoresPatchSchema.parse(body);
        const current = await loadOpportunity(repo, id);
        if (!current.offer) {
          throw new ApiError('VALIDATION_ERROR', OFFER_MESSAGES.NO_OFFER);
        }
        const ids = await fieldIds();
        for (const [key, score] of Object.entries(scores)) {
          const fieldId = customFieldId(key);
          if (score !== null && fieldId !== undefined && !ids.has(fieldId)) {
            throw new ApiError('VALIDATION_ERROR', OFFER_MESSAGES.UNKNOWN_FIELD, [`scores.${key}`]);
          }
        }
        if (Object.keys(scores).length === 0) {
          return json(200, current);
        }
        if (!(await repo.setOfferScores(id, scores, now().toISOString()))) {
          // Removed since it was read.
          throw new ApiError('VALIDATION_ERROR', OFFER_MESSAGES.NO_OFFER);
        }
        return json(200, await repo.getWithHistory(id));
      },
    },
    {
      method: 'GET',
      path: '/offer-fields',
      async handle() {
        return json(200, await offerFieldsRepo.get());
      },
    },
    {
      method: 'PATCH',
      path: '/offer-fields',
      async handle({ body, headers }) {
        const input = OfferFieldsPatchSchema.parse(body);
        const current = await offerFieldsRepo.get();
        if (input.expectedVersion !== current.version) {
          throw new ApiError('CONFLICT', FIELDS_CONFLICT);
        }
        const known = new Map(current.fields.map((field) => [field.id, field]));
        const fields: OfferField[] = input.fields.map((field, index) => {
          if (field.id !== undefined && !known.has(field.id)) {
            throw new ApiError('VALIDATION_ERROR', OFFER_MESSAGES.UNKNOWN_FIELD, [
              `fields.${index}.id`,
            ]);
          }
          return { id: field.id ?? newId(), name: field.name };
        });
        const kept = new Set(fields.map((field) => field.id));
        const dropped = current.fields.filter((field) => !kept.has(field.id));
        if (dropped.length > 0) {
          confirmed(headers, 'a custom field');
        }
        // A removed field keeps its last name, so the history can still name it. (Its id is
        // never used again, so it's never in both lists.)
        const next = {
          fields,
          removed: [...current.removed, ...dropped],
          version: current.version + 1,
        };
        if (!(await offerFieldsRepo.put(next, current.version))) {
          throw new ApiError('CONFLICT', FIELDS_CONFLICT);
        }
        return json(200, next);
      },
    },
  ];
}
