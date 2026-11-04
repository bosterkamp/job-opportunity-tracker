// @module-tag core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json } from '../../src/http.js';
import { DEV_USER_ID, createRouter, type ApiRequest, type Route } from '../../src/router.js';
import { apiEvent } from './event.js';

let seen: ApiRequest[];

const echo = (method: Route['method'], path: string, status = 200): Route => ({
  method,
  path,
  handle: (request) => {
    seen.push(request);
    return Promise.resolve(json(status, { route: `${method} ${path}` }));
  },
});

const routes = [
  echo('GET', '/opportunities'),
  echo('POST', '/opportunities', 201),
  echo('GET', '/opportunities/:id'),
  echo('POST', '/opportunities/:id/stage-changes', 201),
];

const parse = (result: { body?: string }) =>
  JSON.parse(result.body ?? '') as Record<string, unknown>;

beforeEach(() => {
  seen = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRouter', () => {
  const route = createRouter(routes, 'aws');

  it('dispatches by method and exact path', async () => {
    expect(parse(await route(apiEvent('GET', '/opportunities')))).toEqual({
      route: 'GET /opportunities',
    });
    const created = await route(apiEvent('POST', '/opportunities', { body: {} }));
    expect(created.statusCode).toBe(201);
    expect(parse(created)).toEqual({ route: 'POST /opportunities' });
  });

  it('matches the method case-insensitively', async () => {
    expect(parse(await route(apiEvent('get', '/opportunities')))).toEqual({
      route: 'GET /opportunities',
    });
    expect(seen[0]?.method).toBe('GET');
  });

  it('extracts and decodes path parameters', async () => {
    await route(apiEvent('POST', '/opportunities/abc%20123/stage-changes'));

    expect(seen[0]?.params).toEqual({ id: 'abc 123' });
    expect(seen[0]?.path).toBe('/opportunities/abc%20123/stage-changes');
  });

  it('ignores a trailing slash', async () => {
    expect(parse(await route(apiEvent('GET', '/opportunities/')))).toEqual({
      route: 'GET /opportunities',
    });
  });

  it.each([
    ['GET', '/nope'],
    ['GET', '/opportunities/1/stage-changes'],
    ['DELETE', '/opportunities/1'],
    ['GET', '/opportunities/1/extra'],
    ['GET', '/'],
  ])('returns 404 for %s %s', async (method, path) => {
    const result = await route(apiEvent(method, path));

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: `No route for ${method} ${path}` });
    expect(seen).toEqual([]);
  });

  it('passes the parsed JSON body, query, and lowercased headers', async () => {
    await route(
      apiEvent('POST', '/opportunities', {
        body: { company: 'Acme' },
        query: { status: 'OPEN' },
        headers: { 'X-Confirm-Delete': 'true' },
      }),
    );

    expect(seen[0]).toMatchObject({
      body: { company: 'Acme' },
      query: { status: 'OPEN' },
      headers: { 'x-confirm-delete': 'true' },
    });
  });

  it('decodes a base64 body', async () => {
    await route(apiEvent('POST', '/opportunities', { body: { company: 'Ünïcode' }, base64: true }));

    expect(seen[0]?.body).toEqual({ company: 'Ünïcode' });
  });

  it('passes an undefined body, empty query, and empty headers when the event has none', async () => {
    const event = apiEvent('GET', '/opportunities');
    delete (event as { headers?: unknown }).headers;

    await route(event);

    expect(seen[0]).toMatchObject({ body: undefined, query: {}, headers: {} });
  });

  it('rejects a body that is not valid JSON', async () => {
    const result = await route(apiEvent('POST', '/opportunities', { rawBody: '{not json' }));

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request body must be valid JSON',
    });
    expect(seen).toEqual([]);
  });

  it('identifies the caller from the JWT sub claim', async () => {
    await route(apiEvent('GET', '/opportunities', { sub: 'cognito-sub-123' }));

    expect(seen[0]?.userId).toBe('cognito-sub-123');
  });

  it.each([
    ['no authorizer context', null],
    ['an empty sub claim', ''],
  ])('returns 401 with %s', async (_label, sub) => {
    const result = await route(apiEvent('GET', '/opportunities', { sub }));

    expect(result.statusCode).toBe(401);
    expect(parse(result)).toEqual({ code: 'UNAUTHORIZED', message: 'Sign in required' });
    expect(seen).toEqual([]);
  });

  it('turns an error thrown by a route into an error response', async () => {
    const failing = createRouter(
      [{ method: 'GET', path: '/boom', handle: () => Promise.reject(new Error('boom')) }],
      'aws',
    );

    const result = await failing(apiEvent('GET', '/boom'));

    expect(result.statusCode).toBe(500);
    expect(parse(result)).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });
});

describe('createRouter in local mode', () => {
  it('uses the fixed dev user and ignores any claims', async () => {
    const route = createRouter(routes, 'local');

    await route(apiEvent('GET', '/opportunities', { sub: null }));
    await route(apiEvent('GET', '/opportunities', { sub: 'someone-else' }));

    expect(seen.map((request) => request.userId)).toEqual([DEV_USER_ID, DEV_USER_ID]);
    expect(DEV_USER_ID).toBe('local-dev-user');
  });
});
