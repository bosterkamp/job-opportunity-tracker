// Registers the service worker (feature 006), which lets the installed app open offline and
// pick up each deploy. Only production builds have one: the dev server serves no /sw.js.
export function registerServiceWorker(
  nav: Pick<Navigator, 'serviceWorker'> | Record<string, never> = navigator,
  isProduction: boolean = import.meta.env.PROD,
  log: (message: string, error: unknown) => void = console.error,
): void {
  if (!isProduction || !('serviceWorker' in nav)) {
    return;
  }
  // A failure only means no offline open; the app works without it.
  nav.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
    log('Could not register the service worker', error);
  });
}
