// @module-tag core
// @module-tag import
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, ERROR_STATUS, errorResponse, json, noContent } from '../../src/http.js';

let logged: string[];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    logged.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const parseBody = (result: { body?: string }) => JSON.parse(result.body ?? '') as unknown;

describe('json', () => {
  it('serializes the body with a JSON content type', () => {
    expect(json(201, { id: 'x' })).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"id":"x"}',
    });
  });

  it('adds extra headers', () => {
    expect(json(200, null, { 'cache-control': 'no-store' }).headers).toEqual({
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
  });
});

describe('noContent', () => {
  it('returns 204 with no body', () => {
    expect(noContent()).toEqual({ statusCode: 204 });
  });
});

describe('ApiError', () => {
  it('maps each code to its HTTP status', () => {
    expect(ERROR_STATUS).toEqual({
      VALIDATION_ERROR: 400,
      UNAUTHORIZED: 401,
      NOT_FOUND: 404,
      CONFLICT: 409,
      SAME_STAGE: 422,
      FUTURE_DATE: 422,
      SIGN_IN_REQUIRED: 422,
      NO_JOB_DETAILS: 422,
      MULTIPLE_JOBS: 422,
      UNREACHABLE: 422,
      URL_NOT_ALLOWED: 422,
      INTERNAL_ERROR: 500,
    });
    expect(new ApiError('CONFLICT', 'Changed').status).toBe(409);
  });

  it('is a named Error with code, message, and fields', () => {
    const error = new ApiError('VALIDATION_ERROR', 'Bad', ['title']);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Bad');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toEqual(['title']);
  });
});

describe('errorResponse', () => {
  it('returns an ApiError as { code, message } with its status, and logs it', () => {
    const result = errorResponse(new ApiError('NOT_FOUND', 'Opportunity not found'));

    expect(result.statusCode).toBe(404);
    expect(result.headers).toEqual({ 'content-type': 'application/json' });
    expect(parseBody(result)).toEqual({ code: 'NOT_FOUND', message: 'Opportunity not found' });
    expect(logged.map((line) => JSON.parse(line) as unknown)).toEqual([
      { level: 'error', status: 404, code: 'NOT_FOUND', message: 'Opportunity not found' },
    ]);
  });

  it('includes fields when the error has them', () => {
    expect(parseBody(errorResponse(new ApiError('VALIDATION_ERROR', 'Bad', ['a', 'b'])))).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Bad',
      fields: ['a', 'b'],
    });
  });

  it('turns a zod error into a 400 with every message and each field once', () => {
    const schema = z.object({
      company: z.string().min(1, 'Company is required'),
      title: z.string(),
    });
    const parsed = schema.safeParse({ company: '', title: 1 });

    const result = errorResponse(parsed.error);

    expect(result.statusCode).toBe(400);
    expect(parseBody(result)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Company is required; Invalid input: expected string, received number',
      fields: ['company', 'title'],
    });
  });

  it('joins nested paths and lists a field once even with several issues', () => {
    const schema = z.object({ contact: z.object({ email: z.string().min(5).includes('@') }) });
    const parsed = schema.safeParse({ contact: { email: 'x' } });

    expect(parseBody(errorResponse(parsed.error))).toMatchObject({ fields: ['contact.email'] });
  });

  it('leaves out fields for a zod error on the whole body', () => {
    const parsed = z.strictObject({}).safeParse({ extra: 1 });

    expect(parseBody(errorResponse(parsed.error))).not.toHaveProperty('fields');
  });

  it('hides unexpected errors behind a generic 500 and logs the details', () => {
    const result = errorResponse(new Error('Dynamo exploded'));

    expect(result.statusCode).toBe(500);
    expect(parseBody(result)).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    const entry = JSON.parse(logged[0] ?? '') as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'error',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Dynamo exploded',
    });
    expect(entry.stack).toContain('Dynamo exploded');
  });

  it('logs a thrown non-Error value as a string', () => {
    errorResponse('plain string');

    expect(JSON.parse(logged[0] ?? '')).toEqual({
      level: 'error',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'plain string',
    });
  });
});
