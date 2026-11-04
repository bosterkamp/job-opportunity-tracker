import type { Via } from '@jot/shared';
import { ulid } from 'ulid';
import { loadConfig, type ApiConfig } from './config.js';
import { json, type ApiResult } from './http.js';
import { createDocumentClient } from './repo/client.js';
import { createLeadRepo, type LeadRepo } from './repo/leadRepo.js';
import { createOpportunityRepo, type OpportunityRepo } from './repo/opportunityRepo.js';
import { createRouter, type ApiEvent, type Route } from './router.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { interviewRoutes } from './routes/interviews.js';
import { leadRoutes } from './routes/leads.js';
import { stageChangeRoutes } from './routes/stageChanges.js';

export interface HandlerDeps {
  repo: OpportunityRepo;
  // Networking leads (feature 010).
  leadRepo: LeadRepo;
  newId: () => string;
  now: () => Date;
  // Marks changes made through Claude (feature 003). The web API never sets it.
  via?: Via;
}

export function defaultDeps(config: ApiConfig): HandlerDeps {
  const client = createDocumentClient(config);
  return {
    repo: createOpportunityRepo(client, config.tableName),
    leadRepo: createLeadRepo(client, config.tableName),
    newId: ulid,
    now: () => new Date(),
  };
}

export function createRoutes(deps: HandlerDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/health',
      handle: () => Promise.resolve(json(200, { ok: true })),
    },
    ...opportunityRoutes(deps),
    ...stageChangeRoutes(deps),
    ...interviewRoutes(deps),
    ...leadRoutes(deps),
  ];
}

// Tests may override the clock, id generator, or repository.
export function createHandler(config: ApiConfig, overrides: Partial<HandlerDeps> = {}) {
  const deps = { ...defaultDeps(config), ...overrides };
  return createRouter(createRoutes(deps), config.appEnv);
}

let cached: ReturnType<typeof createHandler> | undefined;

// Lambda entry point. Config is read on the first request, so a missing setting fails loudly.
export function handler(event: ApiEvent): Promise<ApiResult> {
  cached ??= createHandler(loadConfig());
  return cached(event);
}
