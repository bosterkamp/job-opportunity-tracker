import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { LambdaClient } from '@aws-sdk/client-lambda';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadMcpConfig, type McpConfig } from './config.js';
import { json, type ApiResult } from './http.js';
import {
  createVerifier,
  mcpScope,
  unauthorized,
  verifyAccessToken,
  type TokenVerifier,
} from './mcp/auth.js';
import {
  AUTHORIZATION_SERVER_PATH,
  authorizationServerMetadata,
  MCP_PATH,
  metadataResponse,
  protectedResourceMetadata,
  RESOURCE_METADATA_PATH,
} from './mcp/metadata.js';
import { apiCaller } from './mcp/apiCall.js';
import { createMcpServer } from './mcp/server.js';
import { createImportClient } from './mcp/importClient.js';
import { createChangeLimiter } from './mcp/rateLimit.js';
import { registerReadTools, registerWriteTools } from './mcp/tools.js';
import { createDocumentClient } from './repo/client.js';
import { createRoutes, defaultDeps } from './handler.js';
import { createDispatcher, type ApiEvent } from './router.js';

// The MCP function's handler (feature 003): the OAuth discovery documents, and the MCP
// endpoint behind the owner's sign-in. API Gateway has no authorizer on these routes, so this
// can answer the 401 that tells Claude where to sign in (research.md §3).

export interface McpHandlerDeps {
  verifier: TokenVerifier & Partial<Pick<ReturnType<typeof createVerifier>, 'cacheJwks'>>;
  // A server for one request, acting for the signed-in owner (`sub`).
  createServer: (sub: string) => McpServer;
}

export function defaultMcpDeps(config: McpConfig): McpHandlerDeps {
  // The web API's routes, called in this process, with every change marked as made through
  // Claude (research.md §4–5).
  const api = defaultDeps(config);
  const dispatch = createDispatcher(createRoutes({ ...api, via: 'CLAUDE' }));
  const takeChange = createChangeLimiter(createDocumentClient(config), config.tableName);
  const readPosting = createImportClient(
    // The region comes from the Lambda environment, like the other AWS clients.
    new LambdaClient({}),
    config.importFunctionName,
  );
  const now = () => new Date();
  return {
    verifier: createVerifier({
      region: config.region,
      userPoolId: config.userPoolId,
      clientId: config.clientId,
      resource: `${config.apiUrl}${MCP_PATH}`,
    }),
    createServer: (sub) => {
      const deps = { api: apiCaller(dispatch, sub), now };
      return createMcpServer([
        (server) => registerReadTools(server, deps),
        (server) =>
          registerWriteTools(server, {
            ...deps,
            takeChange,
            readPosting: (url) => readPosting(url, sub),
          }),
      ]);
    },
  };
}

const header = (event: ApiEvent, name: string) =>
  Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];

// API Gateway's event as a web Request, addressed to the configured URL, never the Host header.
export function toRequest(event: ApiEvent, apiUrl: string): Request {
  const method = event.requestContext.http.method.toUpperCase();
  const body =
    event.body === undefined
      ? undefined
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
  return new Request(`${apiUrl}${event.rawPath}`, {
    method,
    headers: Object.entries(event.headers ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
    ...(method === 'POST' && { body }),
  });
}

export async function toResult(response: Response): Promise<ApiResult> {
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

export function createMcpHandler(config: McpConfig, overrides: Partial<McpHandlerDeps> = {}) {
  const deps = { ...defaultMcpDeps(config), ...overrides };
  const resourceMetadataUrl = `${config.apiUrl}${RESOURCE_METADATA_PATH}`;

  return async function handle(event: ApiEvent): Promise<ApiResult> {
    const method = event.requestContext.http.method.toUpperCase();
    const path = event.rawPath;

    if (method === 'GET' && path === RESOURCE_METADATA_PATH) {
      return metadataResponse(protectedResourceMetadata(config.apiUrl));
    }
    if (method === 'GET' && path === AUTHORIZATION_SERVER_PATH) {
      return metadataResponse(authorizationServerMetadata(config.apiUrl, config.cognitoDomainUrl));
    }
    if (path !== MCP_PATH) {
      return json(404, { code: 'NOT_FOUND', message: `No route for ${method} ${path}` });
    }

    const auth = await verifyAccessToken(header(event, 'authorization'), deps.verifier);
    if (!auth.ok) {
      return unauthorized(
        resourceMetadataUrl,
        mcpScope(`${config.apiUrl}${MCP_PATH}`),
        auth.invalid,
      );
    }
    // No sessions, so there's no server stream to open (GET) or session to end (DELETE).
    if (method !== 'POST') {
      return json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' }, { allow: 'POST' });
    }

    const server = deps.createServer(auth.sub);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return await toResult(await transport.handleRequest(toRequest(event, config.apiUrl)));
    } finally {
      await server.close();
    }
  };
}

let cached: ReturnType<typeof createMcpHandler> | undefined;

// Lambda entry point for McpFunction.
export function handler(event: ApiEvent): Promise<ApiResult> {
  cached ??= createMcpHandler(loadMcpConfig());
  return cached(event);
}
