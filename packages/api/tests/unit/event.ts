import type { ApiEvent } from '../../src/router.js';

interface EventOptions {
  body?: unknown;
  rawBody?: string;
  base64?: boolean;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  sub?: string | null;
}

// Builds a minimal API Gateway HTTP API (v2) event for tests.
export function apiEvent(method: string, path: string, options: EventOptions = {}): ApiEvent {
  const raw =
    options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const body = raw !== undefined && options.base64 ? Buffer.from(raw).toString('base64') : raw;

  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: options.headers ?? {},
    queryStringParameters: options.query,
    body,
    isBase64Encoded: options.base64 ?? false,
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
      authorizer:
        options.sub === null
          ? undefined
          : {
              principalId: '',
              integrationLatency: 0,
              jwt: { claims: { sub: options.sub ?? 'user-1' }, scopes: [] },
            },
    },
  };
}
