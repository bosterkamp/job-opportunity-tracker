// @module-tag core
import type { IncomingMessage, Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/http.js';
import {
  RESET_PATH,
  allowedOrigin,
  createLocalServer,
  toApiEvent,
} from '../../src/local/server.js';
import type { ApiEvent } from '../../src/router.js';

const ORIGIN = 'http://localhost:5173';
const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'authorization, content-type, x-confirm-delete',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

let server: Server;
let baseUrl: string;
let events: ApiEvent[];
let reply: () => Promise<ApiResult>;
let reset: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(async () => {
  events = [];
  reply = () =>
    Promise.resolve({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
  reset = vi.fn(() => Promise.resolve());
  server = createLocalServer({
    handler: (event) => {
      events.push(event);
      return reply();
    },
    corsOrigin: ORIGIN,
    reset,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
});

function headersOf(response: Response) {
  return Object.fromEntries(
    [...response.headers.entries()].filter(
      ([name]) => name.startsWith('access-control') || name === 'content-type',
    ),
  );
}

describe('createLocalServer', () => {
  it('turns the request into an HTTP API v2 event and returns the handler result with CORS', async () => {
    const response = await fetch(`${baseUrl}/opportunities?status=OPEN&x=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-custom': 'yes' },
      body: '{"company":"Acme"}',
    });

    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual({ ...CORS, 'content-type': 'application/json' });
    expect(await response.text()).toBe('{"ok":true}');

    const [event] = events;
    expect(event).toMatchObject({
      rawPath: '/opportunities',
      rawQueryString: 'status=OPEN&x=1',
      queryStringParameters: { status: 'OPEN', x: '1' },
      body: '{"company":"Acme"}',
      requestContext: { http: { method: 'POST', path: '/opportunities' } },
    });
    expect(event?.headers['x-custom']).toBe('yes');
  });

  it('passes no body and no query when the request has none', async () => {
    await fetch(`${baseUrl}/opportunities`);

    expect(events[0]?.body).toBeUndefined();
    expect(events[0]?.queryStringParameters).toBeUndefined();
    expect(events[0]?.rawQueryString).toBe('');
  });

  it('defaults the status to 200 and sends no extra headers when the result has none', async () => {
    reply = () => Promise.resolve({ body: 'plain' });

    const response = await fetch(`${baseUrl}/x`);

    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual(CORS);
    expect(await response.text()).toBe('plain');
  });

  it('answers CORS preflight requests without calling the handler', async () => {
    const response = await fetch(`${baseUrl}/opportunities`, { method: 'OPTIONS' });

    expect(response.status).toBe(204);
    expect(headersOf(response)).toEqual(CORS);
    expect(events).toEqual([]);
  });

  it('resets the data on POST /__test/reset without calling the handler', async () => {
    expect(RESET_PATH).toBe('/__test/reset');

    const response = await fetch(`${baseUrl}${RESET_PATH}`, { method: 'POST' });

    expect(response.status).toBe(204);
    expect(headersOf(response)).toEqual(CORS);
    expect(reset).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it('sends any other request to the reset path to the handler', async () => {
    await fetch(`${baseUrl}${RESET_PATH}`);

    expect(reset).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it('has no reset route when started without one, so dev data cannot be wiped', async () => {
    const plain = createLocalServer({
      handler: (event) => {
        events.push(event);
        return reply();
      },
      corsOrigin: ORIGIN,
    });
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(plain.address() as AddressInfo).port}`;

    const response = await fetch(`${url}${RESET_PATH}`, { method: 'POST' });
    await new Promise((resolve) => plain.close(resolve));

    // The request goes to the API handler like any other path (which answers 404 for it).
    expect(response.status).toBe(200);
    expect(events.map((event) => event.rawPath)).toEqual([RESET_PATH]);
    expect(reset).not.toHaveBeenCalled();
  });

  it('returns a JSON 500 and logs when the handler throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reply = () => Promise.reject(new Error('boom'));

    const response = await fetch(`${baseUrl}/x`);

    expect(response.status).toBe(500);
    expect(headersOf(response)).toEqual({ ...CORS, 'content-type': 'application/json' });
    expect(await response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Local server error',
    });
    expect(logged).toHaveBeenCalledWith(new Error('boom'));
  });

  it('joins repeated headers into one value', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        `${baseUrl}/x`,
        { headers: { 'set-cookie': ['a=1', 'b=2'] } },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      req.on('error', reject);
      req.end();
    });

    expect(events[0]?.headers['set-cookie']).toBe('a=1, b=2');
  });
});

describe('toApiEvent', () => {
  it('builds the full event shape', () => {
    const request = {
      url: '/opportunities/1?a=b',
      method: 'GET',
      headers: { 'user-agent': 'test-agent', host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;

    expect(toApiEvent(request, undefined)).toEqual({
      version: '2.0',
      routeKey: '$default',
      rawPath: '/opportunities/1',
      rawQueryString: 'a=b',
      headers: { 'user-agent': 'test-agent', host: 'localhost' },
      queryStringParameters: { a: 'b' },
      body: undefined,
      isBase64Encoded: false,
      requestContext: {
        accountId: 'local',
        apiId: 'local',
        domainName: 'localhost',
        domainPrefix: 'localhost',
        http: {
          method: 'GET',
          path: '/opportunities/1',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        routeKey: '$default',
        stage: '$default',
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
        timeEpoch: expect.any(Number) as unknown,
      },
    });
  });

  it('falls back to safe defaults when the request lacks details', () => {
    const request = { headers: {}, socket: {} } as unknown as IncomingMessage;

    const event = toApiEvent(request, 'body');

    expect(event.rawPath).toBe('/');
    expect(event.requestContext.http).toMatchObject({ method: 'GET', sourceIp: '', userAgent: '' });
    expect(event.body).toBe('body');
  });
});

describe('allowedOrigin', () => {
  it("answers with the request's origin when it is one of those allowed", () => {
    expect(allowedOrigin('http://a.test, http://b.test', 'http://b.test')).toBe('http://b.test');
    expect(allowedOrigin('http://a.test,http://b.test', 'http://a.test')).toBe('http://a.test');
  });

  it('answers with the first allowed origin otherwise', () => {
    expect(allowedOrigin('http://a.test, http://b.test', 'http://evil.test')).toBe('http://a.test');
    expect(allowedOrigin('http://a.test', undefined)).toBe('http://a.test');
  });
});
