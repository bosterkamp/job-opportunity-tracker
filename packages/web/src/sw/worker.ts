// The service worker's behaviour (feature 006), separate from its entry (sw.ts) so it can be
// tested. It only ever caches the app's own files, never anything from the API or Cognito
// (spec FR-009, Constitution Principle IV).

export type Rule = 'passthrough' | 'page' | 'network-first' | 'cache-first';

interface RequestLike {
  method: string;
  mode: string;
  url: string;
}

// How a request is answered (research.md §2):
// - another origin (the API, Cognito), anything but GET, and the worker itself: not at all;
// - a page: the network first, so a deploy shows on the next launch, else the cached page;
// - the hashed build files: the cache first, since they never change once built;
// - anything else on the site (config.json, icons, the manifest): the network first.
export function ruleFor(request: RequestLike, origin: string): Rule {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin || url.pathname === '/sw.js') {
    return 'passthrough';
  }
  if (request.mode === 'navigate') {
    return 'page';
  }
  return url.pathname.startsWith('/assets/') ? 'cache-first' : 'network-first';
}

export const CACHE_PREFIX = 'job-tracker-';
export const cacheName = (buildId: string) => `${CACHE_PREFIX}${buildId}`;

// Every app page is the same single-page app, cached under one key.
export const PAGE = '/index.html';
// The icon on the banner (feature 008), so it's there when the app first opens offline.
export const ICON = '/icon.svg';

export interface WorkerDeps {
  caches: CacheStorage;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  origin: string;
  // Set at build time: a new build gets a new cache, and the old one is deleted.
  buildId: string;
  // This build's hashed files, cached up front so the first offline open works.
  assets: readonly string[];
  skipWaiting: () => Promise<void>;
  claim: () => Promise<void>;
}

// Install: cache the page, this build's files and the icon, then take over without waiting for every
// tab to close. config.json is cached when there is one: local builds have none.
export async function install(deps: WorkerDeps): Promise<void> {
  const cache = await deps.caches.open(cacheName(deps.buildId));
  await cache.addAll([PAGE, ...deps.assets, ICON]);
  await cache.add('/config.json').catch(() => undefined);
  await deps.skipWaiting();
}

// Activate: delete older builds' caches (only this app's), then control open pages.
export async function activate(deps: WorkerDeps): Promise<void> {
  const current = cacheName(deps.buildId);
  const names = await deps.caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== current)
      .map((name) => deps.caches.delete(name)),
  );
  await deps.claim();
}

// Only complete answers from this site are kept.
const keepable = (response: Response) => response.ok && response.type === 'basic';

// Looked up by address alone. Servers often answer with "Vary: Origin", and the app's scripts
// are requested with an Origin header that the precaching request didn't have; matching on
// it would miss every cached script when offline. Everything cached is from this site anyway.
const MATCH = { ignoreVary: true } as const;

async function networkFirst(
  deps: WorkerDeps,
  fetchIt: () => Promise<Response>,
  key: Request | string,
): Promise<Response> {
  const cache = await deps.caches.open(cacheName(deps.buildId));
  try {
    const response = await fetchIt();
    if (keepable(response)) {
      await cache.put(key, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key, MATCH);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(deps: WorkerDeps, request: Request): Promise<Response> {
  const cache = await deps.caches.open(cacheName(deps.buildId));
  const cached = await cache.match(request, MATCH);
  if (cached) {
    return cached;
  }
  const response = await deps.fetch(request);
  if (keepable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

// The answer to a request, or undefined to leave it to the browser.
export function respond(request: Request, deps: WorkerDeps): Promise<Response> | undefined {
  switch (ruleFor(request, deps.origin)) {
    case 'passthrough':
      return undefined;
    case 'page':
      // Revalidated with the server, so a new deploy's page is never served from a stale copy.
      return networkFirst(deps, () => deps.fetch(request.url, { cache: 'no-cache' }), PAGE);
    case 'cache-first':
      return cacheFirst(deps, request);
    case 'network-first':
      return networkFirst(deps, () => deps.fetch(request), request);
  }
}
