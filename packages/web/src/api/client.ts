import { z } from 'zod';

// Error body from contracts/api.openapi.yaml.
const ErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.array(z.string()).optional(),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. Check your connection and try again.";

export interface RequestOptions<T> {
  body?: unknown;
  headers?: Record<string, string>;
  // Validates the response. Without one, the response body is ignored.
  schema?: z.ZodType<T>;
}

export interface ApiClient {
  request<T = undefined>(method: string, path: string, options?: RequestOptions<T>): Promise<T>;
}

interface ClientOptions {
  apiUrl: string;
  getAccessToken: () => Promise<string | undefined>;
  fetchFn?: typeof fetch;
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) {
    return new ApiError(response.status, parsed.data.code, parsed.data.message, parsed.data.fields);
  }
  return new ApiError(response.status, 'HTTP_ERROR', `Request failed (HTTP ${response.status})`);
}

export function createApiClient({
  apiUrl,
  getAccessToken,
  fetchFn = fetch,
}: ClientOptions): ApiClient {
  const base = apiUrl.replace(/\/+$/, '');

  return {
    async request<T>(method: string, path: string, options: RequestOptions<T> = {}): Promise<T> {
      const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
      const token = await getAccessToken();
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
      }

      let response: Response;
      try {
        response = await fetchFn(`${base}${path}`, {
          method,
          headers,
          // JSON.stringify(undefined) is undefined, so requests without a body send none.
          body: JSON.stringify(options.body),
        });
      } catch {
        throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
      }

      if (!response.ok) {
        throw await toApiError(response);
      }
      if (!options.schema || response.status === 204) {
        return undefined as T;
      }
      return options.schema.parse(await response.json());
    },
  };
}
