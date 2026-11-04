import { loadImportConfig, type ImportConfig } from './config.js';
import type { ApiResult } from './http.js';
import { defaultImportDeps, importPosting, type ImportDeps } from './import/importPosting.js';
import { createRouter, type ApiEvent } from './router.js';
import { importRoutes } from './routes/imports.js';

// The import function's handler: only POST /imports, and no table access (plan.md, Complexity
// Tracking). Tests may override how pages are fetched.
export function createImportHandler(config: ImportConfig, overrides: Partial<ImportDeps> = {}) {
  const deps: ImportDeps = { ...defaultImportDeps, allowHosts: config.allowHosts, ...overrides };
  return createRouter(
    importRoutes({ importPosting: (link) => importPosting(link, deps) }),
    config.appEnv,
  );
}

let cached: ReturnType<typeof createImportHandler> | undefined;

// Lambda entry point for ImportFunction.
export function handler(event: ApiEvent): Promise<ApiResult> {
  cached ??= createImportHandler(loadImportConfig());
  return cached(event);
}
