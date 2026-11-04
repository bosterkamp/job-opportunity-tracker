import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ZodError } from 'zod';

export type ApiResult = APIGatewayProxyStructuredResultV2;

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SAME_STAGE: 422,
  FUTURE_DATE: 422,
  // A posting couldn't be read (feature 002).
  SIGN_IN_REQUIRED: 422,
  NO_JOB_DETAILS: 422,
  MULTIPLE_JOBS: 422,
  UNREACHABLE: 422,
  URL_NOT_ALLOWED: 422,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = ERROR_STATUS[code];
  }
}

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): ApiResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

export function noContent(): ApiResult {
  return { statusCode: 204 };
}

function fromZod(error: ZodError): ApiError {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join('.')).filter(Boolean))];
  const message = error.issues.map((issue) => issue.message).join('; ');
  return new ApiError('VALIDATION_ERROR', message, fields);
}

function log(entry: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', ...entry }));
}

// Turns any thrown value into the contract's { code, message, fields? } error response.
export function errorResponse(error: unknown): ApiResult {
  const apiError = error instanceof ZodError ? fromZod(error) : error;

  if (apiError instanceof ApiError) {
    log({ status: apiError.status, code: apiError.code, message: apiError.message });
    const body: { code: ErrorCode; message: string; fields?: string[] } = {
      code: apiError.code,
      message: apiError.message,
    };
    if (apiError.fields?.length) {
      body.fields = apiError.fields;
    }
    return json(apiError.status, body);
  }

  // Unexpected errors: log the details, but never leak them to the caller.
  log({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return json(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
}
