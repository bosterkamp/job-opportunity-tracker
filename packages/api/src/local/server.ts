import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ApiResult } from '../http.js';
import type { ApiEvent } from '../router.js';

export interface LocalServerOptions {
  handler: (event: ApiEvent) => Promise<ApiResult>;
  // The web app's origin (Vite dev server), allowed by CORS. Several can be given, separated by
  // commas: Playwright also runs a production build on another port (feature 006).
  corsOrigin: string;
  // Clears all data for end-to-end tests. Only given when the server is started for
  // Playwright (ALLOW_TEST_RESET=true); without it, the reset route doesn't exist.
  reset?: () => Promise<void>;
}

export const RESET_PATH = '/__test/reset';

const CORS_HEADERS = {
  'access-control-allow-headers': 'authorization, content-type, x-confirm-delete',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

async function readBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined;
}

function singleValueHeaders(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      headers[name] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return headers;
}

// Turns a Node HTTP request into the API Gateway HTTP API (v2) event the Lambda receives.
export function toApiEvent(request: IncomingMessage, body: string | undefined): ApiEvent {
  // A missing URL resolves to the base, so the path is '/'.
  const url = new URL(request.url ?? '', 'http://localhost');
  const method = request.method ?? 'GET';
  const query = Object.fromEntries(url.searchParams);

  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: singleValueHeaders(request),
    queryStringParameters: Object.keys(query).length > 0 ? query : undefined,
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method,
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: request.socket.remoteAddress ?? '',
        userAgent: request.headers['user-agent'] ?? '',
      },
      requestId: crypto.randomUUID(),
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };
}

function send(response: ServerResponse, origin: string, result: ApiResult): void {
  response.writeHead(result.statusCode ?? 200, {
    ...CORS_HEADERS,
    'access-control-allow-origin': origin,
    ...(result.headers as Record<string, string> | undefined),
  });
  response.end(result.body);
}

// The request's own origin when it's one of the allowed ones; otherwise the first, which a
// browser then refuses, as it should.
export function allowedOrigin(corsOrigin: string, requestOrigin: string | undefined): string {
  const origins = corsOrigin.split(',').map((origin) => origin.trim());
  return origins.find((origin) => origin === requestOrigin) ?? (origins[0] as string);
}

export function createLocalServer({
  handler,
  corsOrigin: allowed,
  reset,
}: LocalServerOptions): Server {
  return createServer((request, response) => {
    const corsOrigin = allowedOrigin(allowed, request.headers.origin);
    void (async () => {
      try {
        if (request.method === 'OPTIONS') {
          send(response, corsOrigin, { statusCode: 204 });
          return;
        }
        if (reset && request.method === 'POST' && request.url === RESET_PATH) {
          await reset();
          send(response, corsOrigin, { statusCode: 204 });
          return;
        }
        const event = toApiEvent(request, await readBody(request));
        send(response, corsOrigin, await handler(event));
      } catch (error) {
        console.error(error);
        send(response, corsOrigin, {
          statusCode: 500,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Local server error' }),
        });
      }
    })();
  });
}
