// The service worker's entry (feature 006), built to /sw.js. A thin entry point, like main.tsx:
// it only wires the tested handlers in worker.ts to the browser, so it's excluded from coverage
// and mutation testing and covered by the Playwright @installable spec.
import { activate, install, respond, type WorkerDeps } from './worker';

// Replaced at build time by the plugin in vite.config.ts.
declare const __BUILD_ID__: string;
declare const __ASSETS__: string[];

// The parts of the service worker's global scope used here (the web package's types are for
// pages, not workers).
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerScope {
  location: Location;
  caches: CacheStorage;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
}

const scope = self as unknown as WorkerScope;

const deps: WorkerDeps = {
  caches: scope.caches,
  fetch: (input, init) => fetch(input, init),
  origin: scope.location.origin,
  buildId: __BUILD_ID__,
  assets: __ASSETS__,
  skipWaiting: () => scope.skipWaiting(),
  claim: () => scope.clients.claim(),
};

scope.addEventListener('install', (event) => event.waitUntil(install(deps)));
scope.addEventListener('activate', (event) => event.waitUntil(activate(deps)));
scope.addEventListener('fetch', (event) => {
  const response = respond(event.request, deps);
  if (response) {
    event.respondWith(response);
  }
});
