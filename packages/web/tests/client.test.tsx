// @module-tag core
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClientProvider, useApiClient } from '../src/api/ApiClientProvider';
import { ApiError, NETWORK_ERROR_MESSAGE, createApiClient } from '../src/api/client';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ConfigContext } from '../src/config';

const ItemSchema = z.object({ id: z.string() });

function fetchReturning(status: number, body?: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );
}

const client = (fetchFn: typeof fetch, token?: string, apiUrl = 'https://api.example.com/') =>
  createApiClient({ apiUrl, getAccessToken: () => Promise.resolve(token), fetchFn });

function lastInit(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchFn.mock.calls.at(-1) ?? [];
  return { url, init: init as RequestInit & { headers: Record<string, string> } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createApiClient', () => {
  it('sends a GET with the bearer token and validates the response', async () => {
    const fetchFn = fetchReturning(200, { id: 'a', extra: true });

    await expect(
      client(fetchFn, 'tok').request('GET', '/opportunities/a', { schema: ItemSchema }),
    ).resolves.toEqual({
      id: 'a',
    });
    expect(lastInit(fetchFn)).toEqual({
      url: 'https://api.example.com/opportunities/a',
      init: {
        method: 'GET',
        headers: { accept: 'application/json', authorization: 'Bearer tok' },
        body: undefined,
      },
    });
  });

  it('sends a JSON body, extra headers, and no authorization without a token', async () => {
    const fetchFn = fetchReturning(201, { id: 'b' });

    await client(fetchFn, undefined, 'http://localhost:3001///').request('POST', '/opportunities', {
      body: { company: 'Acme' },
      headers: { 'x-confirm-delete': 'true' },
      schema: ItemSchema,
    });

    expect(lastInit(fetchFn)).toEqual({
      url: 'http://localhost:3001/opportunities',
      init: {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'x-confirm-delete': 'true',
          'content-type': 'application/json',
        },
        body: '{"company":"Acme"}',
      },
    });
  });

  it('returns undefined for 204 No Content even with a schema', async () => {
    await expect(
      client(fetchReturning(204)).request('DELETE', '/opportunities/a', { schema: ItemSchema }),
    ).resolves.toBeUndefined();
  });

  it('ignores the body when no schema is given', async () => {
    await expect(
      client(fetchReturning(200, { anything: 1 })).request('POST', '/x'),
    ).resolves.toBeUndefined();
  });

  it('rejects a response that does not match the schema', async () => {
    await expect(
      client(fetchReturning(200, { id: 1 })).request('GET', '/x', { schema: ItemSchema }),
    ).rejects.toThrow();
  });

  it('turns an error body into an ApiError with code, message, and fields', async () => {
    const body = { code: 'VALIDATION_ERROR', message: 'Job title is required', fields: ['title'] };

    const error = await client(fetchReturning(400, body))
      .request('POST', '/x')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Job title is required',
      fields: ['title'],
    });
  });

  it('defaults fields to an empty list', async () => {
    const error = await client(fetchReturning(404, { code: 'NOT_FOUND', message: 'Gone' }))
      .request('GET', '/x')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', fields: [] });
  });

  it.each([
    ['a non-JSON body', () => new Response('<html>Bad gateway</html>', { status: 502 })],
    ['an unexpected JSON body', () => new Response('{"error":"x"}', { status: 502 })],
  ])('falls back to a generic error for %s', async (_label, makeResponse) => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(makeResponse()));

    const error = await client(fetchFn)
      .request('GET', '/x')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'Request failed (HTTP 502)',
      fields: [],
    });
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await client(fetchFn)
      .request('GET', '/x')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: NETWORK_ERROR_MESSAGE,
    });
    expect(NETWORK_ERROR_MESSAGE).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    );
  });

  it('uses global fetch by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"g"}'));

    const result = await createApiClient({
      apiUrl: 'http://x',
      getAccessToken: () => Promise.resolve(undefined),
    }).request('GET', '/y', { schema: ItemSchema });

    expect(result).toEqual({ id: 'g' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('ApiClientProvider', () => {
  function CallHealth() {
    const api = useApiClient();
    return (
      <button
        type="button"
        onClick={() => void api.request('GET', '/health').then(() => (document.title = 'called'))}
      >
        call
      </button>
    );
  }

  it('provides a client pointed at the configured API URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    render(
      <ConfigContext.Provider value={{ appEnv: 'local', apiUrl: 'http://localhost:3001' }}>
        <AuthProvider>
          <ApiClientProvider>
            <CallHealth />
          </ApiClientProvider>
        </AuthProvider>
      </ConfigContext.Provider>,
    );
    screen.getByRole('button', { name: 'call' }).click();

    await waitFor(() => expect(document.title).toBe('called'));
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/health');
  });

  it('builds a new client when the API URL changes', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{}')));
    const tree = (apiUrl: string) => (
      <ConfigContext.Provider value={{ appEnv: 'local', apiUrl }}>
        <AuthProvider>
          <ApiClientProvider>
            <CallHealth />
          </ApiClientProvider>
        </AuthProvider>
      </ConfigContext.Provider>
    );
    const { rerender } = render(tree('http://first'));

    rerender(tree('http://second'));
    document.title = '';
    screen.getByRole('button', { name: 'call' }).click();

    await waitFor(() => expect(document.title).toBe('called'));
    expect(fetchSpy.mock.calls.at(-1)?.[0]).toBe('http://second/health');
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<CallHealth />)).toThrow(
      'useApiClient must be used inside <ApiClientProvider>',
    );
  });
});
