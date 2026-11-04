// @module-tag mcp
import { generateKeyPairSync, sign } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpConfig } from '../../src/config.js';
import { createMcpHandler, defaultMcpDeps, handler, toRequest } from '../../src/mcpHandler.js';
import type { TokenVerifier } from '../../src/mcp/auth.js';
import { SERVER_INFO } from '../../src/mcp/server.js';
import { apiEvent } from '../unit/event.js';

const API = 'https://api.example';
const config: McpConfig = {
  appEnv: 'aws',
  tableName: 'JobTracker',
  region: 'us-east-1',
  apiUrl: API,
  userPoolId: 'us-east-1_TEST',
  clientId: 'connector',
  cognitoDomainUrl: 'https://jot.auth.example',
  importFunctionName: 'import-fn',
};

// Accepts only the token "good".
const verifier: TokenVerifier = {
  verify: (token) =>
    token === 'good' ? Promise.resolve({ sub: 'owner' }) : Promise.reject(new Error('bad')),
};

// A server with one harmless tool, standing in for the real tools.
function testServer() {
  const server = new McpServer(SERVER_INFO);
  server.registerTool('echo', { description: 'Echo' }, () => ({
    content: [{ type: 'text', text: 'hi' }],
  }));
  return server;
}

const handle = () => createMcpHandler(config, { verifier, createServer: testServer });

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  apiEvent('POST', '/mcp', {
    body,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer good',
      ...headers,
    },
  });

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  },
};

const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as Record<string, never>;

describe('the MCP endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['POST', 'GET', 'DELETE'])(
    'answers %s without a token with the sign-in pointer',
    async (method) => {
      const result = await handle()(apiEvent(method, '/mcp', { body: initialize }));

      expect(result.statusCode).toBe(401);
      expect(result.headers?.['www-authenticate']).toBe(
        `Bearer resource_metadata="${API}/.well-known/oauth-protected-resource/mcp", scope="https://api.example/mcp/tools"`,
      );
    },
  );

  it('says when the token was invalid', async () => {
    const result = await handle()(rpc(initialize, { authorization: 'Bearer stolen' }));

    expect(result.statusCode).toBe(401);
    expect(result.headers?.['www-authenticate']).toContain('error="invalid_token"');
  });

  it('reads the Authorization header in any case', async () => {
    const event = rpc(initialize);
    const { authorization, ...others } = event.headers;
    const result = await handle()({
      ...event,
      headers: { ...others, Authorization: authorization },
    });

    expect(result.statusCode).toBe(200);
  });

  it('initializes as the tracker, with tools, as JSON and without a session', async () => {
    const result = await handle()(rpc(initialize));

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['content-type']).toContain('application/json');
    expect(result.headers).not.toHaveProperty('mcp-session-id');
    expect(parse(result)).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverInfo: { name: 'job-opportunity-tracker', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    });
  });

  it('lists and calls tools without a prior initialize on the same server', async () => {
    const list = await handle()(
      rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { 'mcp-protocol-version': '2025-06-18' },
      ),
    );
    const call = await handle()(
      rpc(
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: {} } },
        { 'mcp-protocol-version': '2025-06-18' },
      ),
    );

    expect(parse(list)).toMatchObject({ result: { tools: [{ name: 'echo' }] } });
    expect(parse(call)).toMatchObject({ result: { content: [{ type: 'text', text: 'hi' }] } });
  });

  it('decodes a base64 body', async () => {
    const event = rpc(initialize);
    const result = await handle()({
      ...event,
      body: Buffer.from(event.body ?? '').toString('base64'),
      isBase64Encoded: true,
    });

    expect(parse(result)).toMatchObject({ id: 1, result: { serverInfo: SERVER_INFO } });
  });

  it.each(['GET', 'DELETE'])('answers %s with a token as not allowed', async (method) => {
    const result = await handle()(
      apiEvent(method, '/mcp', { headers: { authorization: 'Bearer good' } }),
    );

    expect(result.statusCode).toBe(405);
    expect(result.headers?.allow).toBe('POST');
    expect(parse(result)).toEqual({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  });

  it('serves the discovery documents without a token', async () => {
    const resource = await handle()(apiEvent('GET', '/.well-known/oauth-protected-resource/mcp'));
    const server = await handle()(apiEvent('GET', '/.well-known/oauth-authorization-server'));

    expect(parse(resource)).toMatchObject({ resource: `${API}/mcp`, authorization_servers: [API] });
    expect(parse(server)).toMatchObject({
      issuer: API,
      authorization_endpoint: 'https://jot.auth.example/oauth2/authorize',
    });
    expect(resource.headers?.['cache-control']).toBe('max-age=300');
  });

  it.each([
    ['POST', '/.well-known/oauth-protected-resource/mcp'],
    ['POST', '/.well-known/oauth-authorization-server'],
    ['GET', '/opportunities'],
    ['POST', '/mcp/extra'],
  ])('answers %s %s as not found', async (method, path) => {
    const result = await handle()(
      apiEvent(method, path, { headers: { authorization: 'Bearer good' } }),
    );

    expect(result.statusCode).toBe(404);
    expect(parse(result)).toEqual({ code: 'NOT_FOUND', message: `No route for ${method} ${path}` });
  });

  it('never logs the token', async () => {
    const logs: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(...args));
    }

    await handle()(rpc(initialize, { authorization: 'Bearer stolen' }));
    await handle()(rpc(initialize));

    expect(JSON.stringify(logs)).not.toMatch(/stolen|Bearer good/);
  });
});

describe('each MCP request', () => {
  it('gets its own server, acting for the signed-in owner, closed afterwards', async () => {
    const subs: string[] = [];
    const closes: ReturnType<typeof vi.spyOn>[] = [];
    const handleIt = createMcpHandler(config, {
      verifier,
      createServer: (sub) => {
        subs.push(sub);
        const server = testServer();
        closes.push(vi.spyOn(server, 'close'));
        return server;
      },
    });

    await handleIt(rpc(initialize));
    await handleIt(rpc(initialize));

    expect(subs).toEqual(['owner', 'owner']);
    expect(closes).toHaveLength(2);
    for (const close of closes) {
      expect(close).toHaveBeenCalledOnce();
    }
  });
});

describe('the default wiring', () => {
  it('offers the read and write tools, and accepts only tokens for this server', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const deps = defaultMcpDeps(config);
    deps.verifier.cacheJwks?.({
      keys: [
        {
          ...(publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string }),
          kid: 'k',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    });
    const b64 = (v: object | Buffer) =>
      (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');
    const tokenFor = (aud: string) => {
      const signed = `${b64({ alg: 'RS256', kid: 'k' })}.${b64({
        sub: 'owner',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST',
        aud,
        client_id: 'connector',
        token_use: 'access',
        scope: 'https://api.example/mcp/tools',
        exp: Math.floor(Date.now() / 1000) + 600,
      })}`;
      return `${signed}.${b64(sign('RSA-SHA256', Buffer.from(signed), privateKey))}`;
    };
    const handleIt = createMcpHandler(config, { verifier: deps.verifier });

    const list = await handleIt(
      rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { authorization: `Bearer ${tokenFor(`${API}/mcp`)}`, 'mcp-protocol-version': '2025-06-18' },
      ),
    );
    const elsewhere = await handleIt(
      rpc(initialize, { authorization: `Bearer ${tokenFor('https://other.example/mcp')}` }),
    );

    const names = (
      parse(list) as unknown as { result: { tools: { name: string }[] } }
    ).result.tools.map((t) => t.name);
    expect(names).toEqual([
      'list_opportunities',
      'find_opportunities',
      'get_opportunity',
      'list_leads',
      'read_posting',
      'add_opportunity',
      'update_opportunity',
      'move_opportunity',
      'add_interview',
      'update_interview',
      'add_lead',
      'update_lead',
      'add_lead_note',
      'update_lead_note',
    ]);
    // There is deliberately no way to delete through Claude (spec FR-014).
    expect(names.some((name) => /delete|remove/.test(name))).toBe(false);
    expect(elsewhere.statusCode).toBe(401);
  });
});

describe('toRequest', () => {
  it('addresses the request to the configured URL, whatever the Host header says', () => {
    const request = toRequest(rpc(initialize, { host: 'evil.example' }), API);

    expect(request.url).toBe(`${API}/mcp`);
    expect(request.method).toBe('POST');
  });

  it('accepts an event marked base64 that has no body', async () => {
    const event = { ...apiEvent('POST', '/mcp'), isBase64Encoded: true };

    expect(await toRequest(event, API).text()).toBe('');
  });

  it('never sends a body with GET, even if the event has one', async () => {
    const event = apiEvent('GET', '/mcp', { body: { ignored: true } });

    expect(await toRequest(event, API).text()).toBe('');
  });

  it('sends no body for other methods, and skips missing header values', async () => {
    const event = apiEvent('GET', '/mcp', { headers: { accept: 'application/json' } });
    const request = toRequest({ ...event, headers: { ...event.headers, empty: undefined } }, API);

    expect(request.body).toBeNull();
    expect(request.headers.has('empty')).toBe(false);
    expect(await request.text()).toBe('');
  });
});

describe('the Lambda entry point', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads its configuration from the environment', async () => {
    for (const [name, value] of Object.entries({
      APP_ENV: 'aws',
      TABLE_NAME: 'JobTracker',
      AWS_REGION: 'us-east-1',
      API_URL: API,
      USER_POOL_ID: 'us-east-1_TEST',
      MCP_CLIENT_ID: 'connector',
      COGNITO_DOMAIN_URL: 'https://jot.auth.example',
      IMPORT_FUNCTION_NAME: 'import-fn',
    })) {
      vi.stubEnv(name, value);
    }

    const result = await handler(apiEvent('GET', '/.well-known/oauth-protected-resource/mcp'));

    expect(parse(result)).toMatchObject({ resource: `${API}/mcp` });
    expect((await handler(apiEvent('POST', '/mcp'))).statusCode).toBe(401);
  });
});
