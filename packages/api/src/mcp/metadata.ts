import type { ApiResult } from '../http.js';
import { mcpScope } from './auth.js';

// OAuth discovery for the MCP server (contracts/oauth-metadata.md). Cognito's own discovery
// document leaves out the PKCE advertisement the MCP spec asks for, so this describes Cognito's
// endpoints with it added (research.md §2).

export const MCP_PATH = '/mcp';
export const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/mcp';
export const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';

export function protectedResourceMetadata(apiUrl: string) {
  return {
    resource: `${apiUrl}${MCP_PATH}`,
    authorization_servers: [apiUrl],
    scopes_supported: [mcpScope(`${apiUrl}${MCP_PATH}`)],
    bearer_methods_supported: ['header'],
    resource_name: 'Job Opportunity Tracker',
  };
}

export function authorizationServerMetadata(apiUrl: string, cognitoDomainUrl: string) {
  return {
    issuer: apiUrl,
    authorization_endpoint: `${cognitoDomainUrl}/oauth2/authorize`,
    token_endpoint: `${cognitoDomainUrl}/oauth2/token`,
    revocation_endpoint: `${cognitoDomainUrl}/oauth2/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    scopes_supported: [mcpScope(`${apiUrl}${MCP_PATH}`)],
  };
}

export function metadataResponse(document: object): ApiResult {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' },
    body: JSON.stringify(document),
  };
}
