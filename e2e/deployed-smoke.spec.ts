import { API_URL, expect, test } from './fixtures';

// Runs after every deploy against the live site (deploy.yml), with E2E_BASE_URL and
// E2E_API_URL read from the stack outputs. It checks only what works without signing in,
// including the things local tests can't catch: the first deploy shipped with CORS preflights
// blocked by the JWT authorizer.
const SITE = process.env.E2E_BASE_URL ?? '';

test.describe('Deployed site', { tag: ['@infra', '@deployed'] }, () => {
  test('the site loads and sends you to the Cognito sign-in page', async ({ page }) => {
    const blocked: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) {
        blocked.push(message.text());
      }
    });

    await page.goto('/');

    await page.waitForURL((url) => url.hostname.endsWith('.amazoncognito.com'));
    expect(blocked).toEqual([]);
  });

  test('a deep link is served by the app (single-page app fallback)', async ({ page }) => {
    const response = await page.goto('/archive', { waitUntil: 'commit' });

    expect(response?.status()).toBe(200);
    expect(await response?.text()).toContain('<div id="root"></div>');
  });

  test('every page is sent with the security headers', async ({ request }) => {
    const response = await request.get(SITE, { maxRedirects: 0 });

    const headers = response.headers();
    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  test('the API rejects a request without a token', async ({ request }) => {
    const response = await request.get(`${API_URL}/opportunities?status=OPEN`);

    expect(response.status()).toBe(401);
  });

  test('"Fill from link" rejects a request without a token', async ({ request }) => {
    const response = await request.post(`${API_URL}/imports`, {
      data: { url: 'https://jobs.lever.co/example/1' },
    });

    expect(response.status()).toBe(401);
  });

  test('the MCP endpoint asks for sign-in, pointing Claude at its metadata', async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/mcp`, {
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()['www-authenticate']).toContain(
      `resource_metadata="${API_URL}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  test('the MCP sign-in metadata is served', async ({ request }) => {
    const resource = await request.get(`${API_URL}/.well-known/oauth-protected-resource/mcp`);
    const server = await request.get(`${API_URL}/.well-known/oauth-authorization-server`);

    expect(resource.status()).toBe(200);
    expect(await resource.json()).toMatchObject({
      resource: `${API_URL}/mcp`,
      authorization_servers: [API_URL],
    });
    expect(server.status()).toBe(200);
    expect(await server.json()).toMatchObject({
      issuer: API_URL,
      code_challenge_methods_supported: ['S256'],
    });
  });

  test('a CORS preflight is answered for the site, not blocked by the authorizer', async ({
    request,
  }) => {
    const response = await request.fetch(`${API_URL}/opportunities`, {
      method: 'OPTIONS',
      headers: {
        Origin: SITE,
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    expect(response.headers()['access-control-allow-origin']).toBe(SITE);
  });
});
