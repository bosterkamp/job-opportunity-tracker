// @module-tag core
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfigContext, loadConfig, useConfig } from '../src/config';

const awsConfig = {
  appEnv: 'aws',
  apiUrl: 'https://api.example.com',
  cognitoAuthority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc',
  cognitoClientId: 'client123',
  redirectUri: 'https://d111.cloudfront.net/',
};

const respondWith = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

describe('loadConfig', () => {
  it('builds the local config from VITE_* variables without fetching', async () => {
    const fetchFn = vi.fn<typeof fetch>();

    await expect(
      loadConfig({ VITE_APP_ENV: 'local', VITE_API_URL: 'http://localhost:3001' }, fetchFn),
    ).resolves.toEqual({ appEnv: 'local', apiUrl: 'http://localhost:3001' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires VITE_API_URL locally', async () => {
    await expect(loadConfig({ VITE_APP_ENV: 'local' }, vi.fn())).rejects.toThrow(
      'VITE_API_URL must be set when VITE_APP_ENV is local',
    );
  });

  it('fetches /config.json, uncached, in AWS', async () => {
    const fetchFn = respondWith(200, awsConfig);

    await expect(loadConfig({}, fetchFn)).resolves.toEqual(awsConfig);
    expect(fetchFn).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
  });

  it('reports a failed /config.json request', async () => {
    await expect(loadConfig({}, respondWith(404, {}))).rejects.toThrow(
      'Could not load /config.json (HTTP 404)',
    );
  });

  it.each(['apiUrl', 'cognitoAuthority', 'redirectUri'])(
    'rejects a config whose %s is not a URL',
    async (key) => {
      await expect(
        loadConfig({}, respondWith(200, { ...awsConfig, [key]: 'nope' })),
      ).rejects.toThrow();
    },
  );

  it('rejects an empty client id or the wrong appEnv', async () => {
    await expect(
      loadConfig({}, respondWith(200, { ...awsConfig, cognitoClientId: '' })),
    ).rejects.toThrow();
    await expect(
      loadConfig({}, respondWith(200, { ...awsConfig, appEnv: 'local' })),
    ).rejects.toThrow();
  });

  it('uses the build environment and global fetch by default', async () => {
    // Vitest builds with mode "test", so VITE_APP_ENV is unset and /config.json is fetched.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(awsConfig)));

    await expect(loadConfig()).resolves.toEqual(awsConfig);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });
});

describe('useConfig', () => {
  function ShowApiUrl() {
    return <p>{useConfig().apiUrl}</p>;
  }

  it('reads the config from context', () => {
    render(
      <ConfigContext.Provider value={{ appEnv: 'local', apiUrl: 'http://localhost:3001' }}>
        <ShowApiUrl />
      </ConfigContext.Provider>,
    );

    expect(screen.getByText('http://localhost:3001')).toBeInTheDocument();
  });

  it('throws outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ShowApiUrl />)).toThrow(
      'useConfig must be used inside <ConfigContext.Provider>',
    );
  });
});
