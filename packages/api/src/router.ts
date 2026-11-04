import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import type { AppEnv } from './config.js';
import { ApiError, errorResponse, type ApiResult } from './http.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  body: unknown;
  userId: string;
}

export interface Route {
  method: HttpMethod;
  // Path pattern with `:name` segments, for example `/opportunities/:id`.
  path: string;
  handle: (request: ApiRequest) => Promise<ApiResult>;
}

// The fixed identity used when running locally, where there is no Cognito authorizer.
export const DEV_USER_ID = 'local-dev-user';

// Lambda receives events with or without a JWT authorizer context (none locally).
export type ApiEvent = Omit<APIGatewayProxyEventV2WithJWTAuthorizer, 'requestContext'> & {
  requestContext: Omit<APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'], 'authorizer'> & {
    authorizer?: APIGatewayProxyEventV2WithJWTAuthorizer['requestContext']['authorizer'];
  };
};

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchPath(pattern: string, path: string): Record<string, string> | undefined {
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(path);
  if (patternParts.length !== pathParts.length) {
    return undefined;
  }

  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] as string;
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(actual);
    } else if (part !== actual) {
      return undefined;
    }
  }
  return params;
}

function parseBody(event: ApiEvent): unknown {
  if (!event.body) {
    return undefined;
  }
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

function userIdFor(event: ApiEvent, appEnv: AppEnv): string {
  if (appEnv === 'local') {
    return DEV_USER_ID;
  }
  const sub = event.requestContext.authorizer?.jwt.claims.sub;
  if (typeof sub !== 'string' || sub === '') {
    throw new ApiError('UNAUTHORIZED', 'Sign in required');
  }
  return sub;
}

function lowercaseKeys(headers: Record<string, string | undefined> = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

// The route for a method and path, with its path parameters.
function findRoute(routes: Route[], method: string, path: string) {
  for (const route of routes) {
    const params = route.method === method ? matchPath(route.path, path) : undefined;
    if (params) {
      return { route, params };
    }
  }
  throw new ApiError('NOT_FOUND', `No route for ${method} ${path}`);
}

// A request already authenticated and parsed, for callers inside this process (the MCP
// tools, feature 003): no API Gateway event, the same routes, rules, and error responses.
export interface InternalRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  userId: string;
}

export function createDispatcher(routes: Route[]) {
  return async function dispatch({ method, path, query = {}, body, userId }: InternalRequest) {
    try {
      const { route, params } = findRoute(routes, method, path);
      return await route.handle({ method, path, params, query, headers: {}, body, userId });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createRouter(routes: Route[], appEnv: AppEnv) {
  return async function route(event: ApiEvent): Promise<ApiResult> {
    try {
      const method = event.requestContext.http.method.toUpperCase();
      const path = event.rawPath;

      const { route, params } = findRoute(routes, method, path);
      return await route.handle({
        method,
        path,
        params,
        query: event.queryStringParameters ?? {},
        headers: lowercaseKeys(event.headers),
        body: parseBody(event),
        userId: userIdFor(event, appEnv),
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
