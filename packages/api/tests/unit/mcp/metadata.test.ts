// @module-tag mcp
import { describe, expect, it } from 'vitest';
import {
  AUTHORIZATION_SERVER_PATH,
  authorizationServerMetadata,
  MCP_PATH,
  metadataResponse,
  protectedResourceMetadata,
  RESOURCE_METADATA_PATH,
} from '../../../src/mcp/metadata.js';

const API = 'https://api.example';
const COGNITO = 'https://jot-123.auth.us-east-1.amazoncognito.com';

describe('OAuth discovery documents', () => {
  it('serves them at the contract paths', () => {
    expect(MCP_PATH).toBe('/mcp');
    expect(RESOURCE_METADATA_PATH).toBe('/.well-known/oauth-protected-resource/mcp');
    expect(AUTHORIZATION_SERVER_PATH).toBe('/.well-known/oauth-authorization-server');
  });

  it('describes this server as a protected resource', () => {
    expect(protectedResourceMetadata(API)).toEqual({
      resource: 'https://api.example/mcp',
      authorization_servers: ['https://api.example'],
      scopes_supported: ['https://api.example/mcp/tools'],
      bearer_methods_supported: ['header'],
      resource_name: 'Job Opportunity Tracker',
    });
  });

  it("describes Cognito's endpoints, with PKCE advertised", () => {
    expect(authorizationServerMetadata(API, COGNITO)).toEqual({
      issuer: 'https://api.example',
      authorization_endpoint: `${COGNITO}/oauth2/authorize`,
      token_endpoint: `${COGNITO}/oauth2/token`,
      revocation_endpoint: `${COGNITO}/oauth2/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['https://api.example/mcp/tools'],
    });
  });

  it('answers as cacheable JSON', () => {
    expect(metadataResponse({ a: 1 })).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' },
      body: '{"a":1}',
    });
  });
});
