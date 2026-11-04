import { JwtVerifier } from 'aws-jwt-verify';
import type { ApiResult } from '../http.js';

// Checks the access token on every MCP request (research.md §3, data-model.md "Access token
// checks"). Cognito issues the tokens; this server only verifies them.

// Cognito binds a token to the requested resource (the MCP URL) only when the requested scope
// belongs to a resource server with that URL as its identifier, so the scope is
// "<MCP URL>/tools" (research.md §2; the first connection failed without this).
export function mcpScope(resource: string): string {
  return `${resource}/tools`;
}

export interface TokenVerifier {
  // Resolves with the token's claims, or rejects when any check fails.
  verify(token: string): Promise<Record<string, unknown>>;
}

export interface VerifierSettings {
  region: string;
  userPoolId: string;
  // The Claude connector's app client.
  clientId: string;
  // The MCP server's URL, which the token's audience must name.
  resource: string;
}

export function issuerFor(region: string, userPoolId: string): string {
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

// Where Cognito publishes the user pool's signing keys.
export function jwksUriFor(issuer: string): string {
  return `${issuer}/.well-known/jwks.json`;
}

export function createVerifier({ region, userPoolId, clientId, resource }: VerifierSettings) {
  const issuer = issuerFor(region, userPoolId);
  return JwtVerifier.create({
    issuer,
    audience: resource,
    jwksUri: jwksUriFor(issuer),
    scope: mcpScope(resource),
    // Any failure only refuses the token, so the error needs no message.
    customJwtCheck: ({ payload }) => {
      if (payload.token_use !== 'access' || payload.client_id !== clientId) {
        throw new Error();
      }
    },
  });
}

export type AuthResult = { ok: true; sub: string } | { ok: false; invalid: boolean };

// A missing or malformed header is "not signed in"; a token that fails a check is invalid.
export async function verifyAccessToken(
  header: string | undefined,
  verifier: TokenVerifier,
): Promise<AuthResult> {
  // A missing header reads as "undefined", which doesn't match.
  const match = /^Bearer (\S+)$/i.exec(String(header));
  if (!match) {
    return { ok: false, invalid: false };
  }
  try {
    const claims = await verifier.verify(match[1] as string);
    return { ok: true, sub: String(claims.sub) };
  } catch {
    return { ok: false, invalid: true };
  }
}

// The 401 that tells Claude where to sign in (contracts/oauth-metadata.md).
export function unauthorized(
  resourceMetadataUrl: string,
  scope: string,
  invalid: boolean,
): ApiResult {
  const challenge = [
    `resource_metadata="${resourceMetadataUrl}"`,
    `scope="${scope}"`,
    ...(invalid ? ['error="invalid_token"'] : []),
  ].join(', ');
  return {
    statusCode: 401,
    headers: { 'content-type': 'application/json', 'www-authenticate': `Bearer ${challenge}` },
    body: JSON.stringify({ error: 'unauthorized' }),
  };
}
