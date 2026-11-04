import type { ApiResult } from '../http.js';
import type { InternalRequest } from '../router.js';

// Calls the web API's own routes in the same process, so every rule, check, and message is
// exactly the web app's (research.md §4). The MCP handler has already verified the owner's
// token; its subject is the request's user.

export interface ApiResponse {
  status: number;
  body: unknown;
}

export type ApiCall = (
  method: InternalRequest['method'],
  path: string,
  options?: { body?: unknown; query?: Record<string, string> },
) => Promise<ApiResponse>;

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function apiCaller(
  dispatch: (request: InternalRequest) => Promise<ApiResult>,
  sub: string,
): ApiCall {
  return async (method, path, { body, query } = {}) => {
    const result = await dispatch({ method, path, query, body, userId: sub });
    return {
      status: result.statusCode ?? 500,
      body: result.body ? (JSON.parse(result.body) as unknown) : undefined,
    };
  };
}

// The response body when the call worked, or a ToolError with the API's code and message.
export async function expectOk(response: Promise<ApiResponse>): Promise<unknown> {
  const { status, body } = await response;
  if (status >= 400) {
    const { code, message } = body as { code: string; message: string };
    throw new ToolError(code, message);
  }
  return body;
}
