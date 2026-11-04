// @module-tag core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, handler } from '../../src/handler.js';
import { apiEvent } from './event.js';

const config = { tableName: 'JobTracker', appEnv: 'aws', region: 'us-east-1' } as const;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createHandler', () => {
  it('answers GET /health with { ok: true }', async () => {
    const result = await createHandler(config)(apiEvent('GET', '/health'));

    expect(result.statusCode).toBe(200);
    expect(result.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(result.body ?? '')).toEqual({ ok: true });
  });

  it('returns 404 for unknown routes', async () => {
    expect((await createHandler(config)(apiEvent('GET', '/nope'))).statusCode).toBe(404);
  });
});

describe('handler', () => {
  it('loads config from the environment on first use and reuses it', async () => {
    vi.stubEnv('APP_ENV', 'aws');
    vi.stubEnv('TABLE_NAME', 'JobTracker');
    vi.stubEnv('AWS_REGION', 'us-east-1');

    expect((await handler(apiEvent('GET', '/health'))).statusCode).toBe(200);

    vi.stubEnv('APP_ENV', '');
    expect((await handler(apiEvent('GET', '/health'))).statusCode).toBe(200);
  });
});
