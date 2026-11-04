// @module-tag mcp
import { describe, expect, it, vi } from 'vitest';
import { json, noContent } from '../../../src/http.js';
import { apiCaller, expectOk, ToolError } from '../../../src/mcp/apiCall.js';
import { createDispatcher, type Route } from '../../../src/router.js';

describe('apiCaller', () => {
  it('passes the request on as the signed-in owner, and parses the answer', async () => {
    const dispatch = vi.fn(() => Promise.resolve(json(201, { id: 'x' })));
    const call = apiCaller(dispatch, 'owner-sub');

    expect(await call('POST', '/opportunities', { body: { a: 1 }, query: { q: 'v' } })).toEqual({
      status: 201,
      body: { id: 'x' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      method: 'POST',
      path: '/opportunities',
      query: { q: 'v' },
      body: { a: 1 },
      userId: 'owner-sub',
    });
  });

  it('handles an answer without a body, and one without a status', async () => {
    expect(await apiCaller(() => Promise.resolve(noContent()), 's')('GET', '/x')).toEqual({
      status: 204,
      body: undefined,
    });
    expect(await apiCaller(() => Promise.resolve({}), 's')('GET', '/x')).toEqual({
      status: 500,
      body: undefined,
    });
  });
});

describe('expectOk', () => {
  it('returns the body below 400', async () => {
    expect(await expectOk(Promise.resolve({ status: 399, body: 'fine' }))).toBe('fine');
  });

  it("throws the API's code and message from 400 up", async () => {
    const failure = expectOk(
      Promise.resolve({ status: 400, body: { code: 'VALIDATION_ERROR', message: 'Bad' } }),
    );

    await expect(failure).rejects.toBeInstanceOf(ToolError);
    await expect(failure).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Bad' });
  });
});

describe('createDispatcher', () => {
  const routes: Route[] = [
    {
      method: 'GET',
      path: '/things/:id',
      handle: (request) => Promise.resolve(json(200, request)),
    },
    {
      method: 'POST',
      path: '/broken',
      handle: () => Promise.reject(new Error('boom')),
    },
  ];

  it('routes to the matching route, with its parameters and no headers', async () => {
    const result = await createDispatcher(routes)({
      method: 'GET',
      path: '/things/a%20b',
      userId: 'u',
    });

    expect(JSON.parse(result.body ?? '')).toEqual({
      method: 'GET',
      path: '/things/a%20b',
      params: { id: 'a b' },
      query: {},
      headers: {},
      userId: 'u',
    });
  });

  it('answers an unknown route, or a failing one, the way the web API does', async () => {
    const missing = await createDispatcher(routes)({
      method: 'POST',
      path: '/things/1',
      userId: 'u',
    });
    const broken = await createDispatcher(routes)({ method: 'POST', path: '/broken', userId: 'u' });

    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.body ?? '')).toEqual({
      code: 'NOT_FOUND',
      message: 'No route for POST /things/1',
    });
    expect(broken.statusCode).toBe(500);
  });
});
