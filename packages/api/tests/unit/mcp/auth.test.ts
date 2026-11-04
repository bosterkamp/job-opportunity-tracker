// @module-tag mcp
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createVerifier,
  issuerFor,
  jwksUriFor,
  mcpScope,
  unauthorized,
  verifyAccessToken,
} from '../../../src/mcp/auth.js';

const REGION = 'us-east-1';
const POOL = 'us-east-1_TEST';
const CLIENT = 'connector-client';
const RESOURCE = 'https://api.example/mcp';
const ISSUER = issuerFor(REGION, POOL);
const SCOPE = mcpScope(RESOURCE);

const base64url = (value: object | Buffer) =>
  (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

function keyPair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    kid,
    privateKey,
    jwk: {
      ...(publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string }),
      kid,
      alg: 'RS256',
      use: 'sig',
    },
  };
}

function token(privateKey: KeyObject, kid: string, claims: Record<string, unknown>) {
  const header = base64url({ alg: 'RS256', typ: 'JWT', kid });
  const payload = base64url(claims);
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

const now = () => Math.floor(Date.now() / 1000);
const goodClaims = () => ({
  sub: 'owner-sub',
  iss: ISSUER,
  aud: RESOURCE,
  client_id: CLIENT,
  token_use: 'access',
  scope: SCOPE,
  iat: now(),
  exp: now() + 3600,
});

// A verifier with the test key preloaded, so nothing is fetched.
function setup() {
  const signer = keyPair('key-1');
  const verifier = createVerifier({
    region: REGION,
    userPoolId: POOL,
    clientId: CLIENT,
    resource: RESOURCE,
  });
  verifier.cacheJwks({ keys: [signer.jwk] });
  const bearer = (claims: Record<string, unknown>) =>
    `Bearer ${token(signer.privateKey, signer.kid, claims)}`;
  return { verifier, bearer };
}

describe('verifyAccessToken', () => {
  it("accepts an access token for this server, from the connector's client, with the scope", async () => {
    const { verifier, bearer } = setup();

    expect(await verifyAccessToken(bearer(goodClaims()), verifier)).toEqual({
      ok: true,
      sub: 'owner-sub',
    });
  });

  it('accepts the scope among others, and a lowercase bearer prefix', async () => {
    const { verifier } = setup();
    const signer = keyPair('key-1');
    verifier.cacheJwks({ keys: [signer.jwk] });
    const value = token(signer.privateKey, 'key-1', {
      ...goodClaims(),
      scope: `openid ${SCOPE}`,
    });

    expect((await verifyAccessToken(`bearer ${value}`, verifier)).ok).toBe(true);
  });

  it.each([
    ['another issuer', { iss: issuerFor(REGION, 'us-east-1_OTHER') }],
    ['another audience (a web app token)', { aud: 'https://elsewhere.example/mcp' }],
    ['no audience', { aud: undefined }],
    ['another client', { client_id: 'web-client' }],
    ['an ID token', { token_use: 'id' }],
    ['no scope', { scope: undefined }],
    ['another scope', { scope: 'openid email' }],
    ['the old scope name', { scope: 'jot-mcp/tools' }],
    ['an expired token', { exp: now() - 60 }],
  ])('refuses %s as invalid', async (_label, change) => {
    const { verifier, bearer } = setup();

    expect(await verifyAccessToken(bearer({ ...goodClaims(), ...change }), verifier)).toEqual({
      ok: false,
      invalid: true,
    });
  });

  it('refuses a token signed with another key', async () => {
    const { verifier } = setup();
    const stranger = keyPair('key-1');

    expect(
      await verifyAccessToken(
        `Bearer ${token(stranger.privateKey, 'key-1', goodClaims())}`,
        verifier,
      ),
    ).toEqual({ ok: false, invalid: true });
  });

  it('refuses something that is not a JWT as invalid', async () => {
    const { verifier } = setup();

    expect(await verifyAccessToken('Bearer not-a-jwt', verifier)).toEqual({
      ok: false,
      invalid: true,
    });
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer two words', 'Token abc', 'NotBearer abc'])(
    'treats %j as not signed in',
    async (header) => {
      const { verifier } = setup();

      expect(await verifyAccessToken(header, verifier)).toEqual({ ok: false, invalid: false });
    },
  );
});

describe('unauthorized', () => {
  const url = 'https://api.example/.well-known/oauth-protected-resource/mcp';

  it('points Claude at the sign-in metadata', () => {
    expect(unauthorized(url, 'https://api.example/mcp/tools', false)).toEqual({
      statusCode: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer resource_metadata="${url}", scope="https://api.example/mcp/tools"`,
      },
      body: '{"error":"unauthorized"}',
    });
  });

  it('says when the token was invalid', () => {
    expect(
      unauthorized(url, 'https://api.example/mcp/tools', true).headers?.['www-authenticate'],
    ).toBe(
      `Bearer resource_metadata="${url}", scope="https://api.example/mcp/tools", error="invalid_token"`,
    );
  });

  it('finds the signing keys where Cognito publishes them', () => {
    expect(jwksUriFor('https://cognito-idp.us-east-1.amazonaws.com/p')).toBe(
      'https://cognito-idp.us-east-1.amazonaws.com/p/.well-known/jwks.json',
    );
  });

  it('names the issuer from the region and pool', () => {
    expect(issuerFor('eu-west-1', 'eu-west-1_X')).toBe(
      'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_X',
    );
    expect(mcpScope('https://api.example/mcp')).toBe('https://api.example/mcp/tools');
  });
});
