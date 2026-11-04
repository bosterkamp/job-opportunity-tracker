// @module-tag installable
import { describe, expect, it, vi } from 'vitest';
import {
  activate,
  cacheName,
  CACHE_PREFIX,
  install,
  PAGE,
  respond,
  ruleFor,
  type WorkerDeps,
} from '../src/sw/worker';

const ORIGIN = 'https://tracker.example';

describe('ruleFor', () => {
  const request = (url: string, { method = 'GET', mode = 'cors' } = {}) => ({ url, method, mode });

  it.each([
    ['the API, on another origin', 'https://api.example/opportunities'],
    ['Cognito, on another origin', 'https://auth.example/login'],
    ['the worker itself', `${ORIGIN}/sw.js`],
  ])('leaves %s to the browser', (_label, url) => {
    expect(ruleFor(request(url), ORIGIN)).toBe('passthrough');
  });

  it('leaves anything but GET to the browser', () => {
    expect(ruleFor(request(`${ORIGIN}/config.json`, { method: 'POST' }), ORIGIN)).toBe(
      'passthrough',
    );
  });

  it('answers a page from the network first', () => {
    expect(ruleFor(request(`${ORIGIN}/archive`, { mode: 'navigate' }), ORIGIN)).toBe('page');
  });

  it('answers the hashed build files from the cache first', () => {
    expect(ruleFor(request(`${ORIGIN}/assets/main-abc.js`), ORIGIN)).toBe('cache-first');
  });

  it.each(['/config.json', '/manifest.webmanifest', '/icons/icon-192.png', '/assetsx/a.js'])(
    'answers %s from the network first',
    (path) => {
      expect(ruleFor(request(`${ORIGIN}${path}`), ORIGIN)).toBe('network-first');
    },
  );
});

// A fake of the browser's CacheStorage: named caches holding responses by URL.
function fakeCaches(start: Record<string, Record<string, Response>> = {}) {
  const store = new Map<string, Map<string, Response>>(
    Object.entries(start).map(([name, entries]) => [name, new Map(Object.entries(entries))]),
  );
  const keyOf = (key: RequestInfo | URL) =>
    new URL(typeof key === 'string' ? key : key instanceof URL ? key.href : key.url, ORIGIN)
      .pathname;
  const cacheFor = (name: string) => {
    const entries = store.get(name) ?? new Map<string, Response>();
    store.set(name, entries);
    return {
      addAll: vi.fn((keys: string[]) => {
        for (const key of keys) entries.set(keyOf(key), new Response(`fetched ${key}`));
        return Promise.resolve();
      }),
      add: vi.fn((key: string) => {
        if (key === '/config.json' && !hasConfig) return Promise.reject(new TypeError('404'));
        entries.set(keyOf(key), new Response(`fetched ${key}`));
        return Promise.resolve();
      }),
      put: vi.fn((key: RequestInfo | URL, response: Response) => {
        entries.set(keyOf(key), response);
        return Promise.resolve();
      }),
      match: vi.fn((key: RequestInfo | URL, options?: CacheQueryOptions) => {
        lookups.push(options);
        return Promise.resolve(entries.get(keyOf(key)));
      }),
    };
  };
  let hasConfig = true;
  const lookups: (CacheQueryOptions | undefined)[] = [];
  const caches = {
    open: vi.fn((name: string) => Promise.resolve(cacheFor(name))),
    keys: vi.fn(() => Promise.resolve([...store.keys()])),
    delete: vi.fn((name: string) => Promise.resolve(store.delete(name))),
  };
  return {
    caches: caches as unknown as CacheStorage,
    store,
    lookups,
    withoutConfig() {
      hasConfig = false;
    },
  };
}

// A response as fetch gives it: same-origin answers are "basic".
function response(
  body: string,
  { status = 200, type = 'basic' }: { status?: number; type?: ResponseType } = {},
) {
  const r = new Response(body, { status });
  Object.defineProperty(r, 'type', { value: type });
  return r;
}

function deps(overrides: Partial<WorkerDeps> = {}, caches = fakeCaches().caches): WorkerDeps {
  return {
    caches,
    fetch: vi.fn(() => Promise.resolve(response('from the network'))),
    origin: ORIGIN,
    buildId: 'b2',
    assets: ['/assets/main-1.js', '/assets/main-1.css'],
    skipWaiting: vi.fn(() => Promise.resolve()),
    claim: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('install', () => {
  it("caches the page, this build's files, the icon, and config.json, then takes over", async () => {
    const fake = fakeCaches();
    const d = deps({}, fake.caches);

    await install(d);

    expect([...(fake.store.get('job-tracker-b2')?.keys() ?? [])]).toEqual([
      '/index.html',
      '/assets/main-1.js',
      '/assets/main-1.css',
      '/icon.svg',
      '/config.json',
    ]);
    expect(d.skipWaiting).toHaveBeenCalledOnce();
  });

  it('still installs without a config.json (local builds have none)', async () => {
    const fake = fakeCaches();
    fake.withoutConfig();
    const d = deps({}, fake.caches);

    await install(d);

    expect(fake.store.get('job-tracker-b2')?.has('/config.json')).toBe(false);
    expect(d.skipWaiting).toHaveBeenCalledOnce();
  });

  it('names caches by build', () => {
    expect(CACHE_PREFIX).toBe('job-tracker-');
    expect(cacheName('abc')).toBe('job-tracker-abc');
    expect(PAGE).toBe('/index.html');
  });
});

describe('activate', () => {
  it("deletes older builds' caches, keeps others, then controls open pages", async () => {
    const fake = fakeCaches({ 'job-tracker-b1': {}, 'job-tracker-b2': {}, 'another-app': {} });
    const d = deps({}, fake.caches);

    await activate(d);

    expect([...fake.store.keys()].sort()).toEqual(['another-app', 'job-tracker-b2']);
    expect(d.claim).toHaveBeenCalledOnce();
  });
});

describe('respond', () => {
  const page = () => new Request(`${ORIGIN}/archive`, { mode: 'same-origin' });
  const asNavigation = (request: Request) =>
    Object.defineProperty<Request>(request, 'mode', { value: 'navigate' });

  it('leaves passthrough requests to the browser', () => {
    expect(respond(new Request('https://api.example/opportunities'), deps())).toBeUndefined();
  });

  it('fetches a page fresh and keeps it as the app page', async () => {
    const fake = fakeCaches({ 'job-tracker-b2': { '/index.html': response('old page') } });
    const fetch = vi.fn(() => Promise.resolve(response('new page')));

    const answer = await respond(asNavigation(page()), deps({ fetch }, fake.caches));

    expect(fetch).toHaveBeenCalledWith(`${ORIGIN}/archive`, { cache: 'no-cache' });
    expect(await answer?.text()).toBe('new page');
    expect(await fake.store.get('job-tracker-b2')?.get('/index.html')?.text()).toBe('new page');
  });

  it('answers a page from the cache when the network fails', async () => {
    const fake = fakeCaches({ 'job-tracker-b2': { '/index.html': response('cached page') } });
    const fetch = vi.fn(() => Promise.reject(new TypeError('offline')));

    const answer = await respond(asNavigation(page()), deps({ fetch }, fake.caches));

    expect(await answer?.text()).toBe('cached page');
  });

  it('passes the network failure on when nothing is cached', async () => {
    const offline = new TypeError('offline');
    const fetch = vi.fn(() => Promise.reject(offline));

    await expect(respond(new Request(`${ORIGIN}/config.json`), deps({ fetch }))).rejects.toBe(
      offline,
    );
  });

  it('keeps a good same-origin answer, and answers from it later when offline', async () => {
    const fake = fakeCaches();
    const request = () => new Request(`${ORIGIN}/config.json`);

    await respond(
      request(),
      deps({ fetch: vi.fn(() => Promise.resolve(response('{"a":1}'))) }, fake.caches),
    );
    const offline = await respond(
      request(),
      deps({ fetch: vi.fn(() => Promise.reject(new TypeError('offline'))) }, fake.caches),
    );

    expect(await offline?.text()).toBe('{"a":1}');
  });

  it.each([
    ['an error', response('nope', { status: 500 })],
    ['an opaque answer', response('', { type: 'opaque' })],
  ])('never keeps %s', async (_label, bad) => {
    const fake = fakeCaches();

    const answer = await respond(
      new Request(`${ORIGIN}/manifest.webmanifest`),
      deps({ fetch: vi.fn(() => Promise.resolve(bad)) }, fake.caches),
    );

    expect(answer).toBe(bad);
    expect(fake.store.get('job-tracker-b2')?.size ?? 0).toBe(0);
  });

  it('looks cached files up by address alone, ignoring Vary', async () => {
    const fake = fakeCaches({ 'job-tracker-b2': { '/assets/main-1.js': response('cached js') } });
    const offline = vi.fn(() => Promise.reject(new TypeError('offline')));

    await respond(new Request(`${ORIGIN}/assets/main-1.js`), deps({}, fake.caches));
    // Nothing cached for the page: the lookup still happens, then the failure passes on.
    await expect(
      respond(asNavigation(page()), deps({ fetch: offline }, fake.caches)),
    ).rejects.toThrow('offline');

    expect(fake.lookups).toEqual([{ ignoreVary: true }, { ignoreVary: true }]);
  });

  it('answers build files from the cache without fetching', async () => {
    const fake = fakeCaches({ 'job-tracker-b2': { '/assets/main-1.js': response('cached js') } });
    const fetch = vi.fn();

    const answer = await respond(
      new Request(`${ORIGIN}/assets/main-1.js`),
      deps({ fetch }, fake.caches),
    );

    expect(await answer?.text()).toBe('cached js');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches and keeps a build file that is not cached yet', async () => {
    const fake = fakeCaches();

    const answer = await respond(
      new Request(`${ORIGIN}/assets/chunk-2.js`),
      deps({ fetch: vi.fn(() => Promise.resolve(response('new js'))) }, fake.caches),
    );

    expect(await answer?.text()).toBe('new js');
    expect(fake.store.get('job-tracker-b2')?.has('/assets/chunk-2.js')).toBe(true);
  });

  it('does not keep a failed build file', async () => {
    const fake = fakeCaches();

    await respond(
      new Request(`${ORIGIN}/assets/missing.js`),
      deps({ fetch: vi.fn(() => Promise.resolve(response('', { status: 404 }))) }, fake.caches),
    );

    expect(fake.store.get('job-tracker-b2')?.has('/assets/missing.js')).toBe(false);
  });
});
