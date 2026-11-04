// @module-tag installable
import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../src/registerServiceWorker';

function navigatorWith(register: ReturnType<typeof vi.fn>) {
  return { serviceWorker: { register } } as unknown as Pick<Navigator, 'serviceWorker'>;
}

describe('registerServiceWorker', () => {
  it('registers /sw.js for the whole site in a production build', () => {
    const register = vi.fn(() => Promise.resolve());

    registerServiceWorker(navigatorWith(register), true);

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('does nothing in development, where there is no /sw.js', () => {
    const register = vi.fn(() => Promise.resolve());

    registerServiceWorker(navigatorWith(register), false);

    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing in a browser without service workers', () => {
    expect(() => registerServiceWorker({}, true)).not.toThrow();
  });

  it('logs a failure instead of throwing', async () => {
    const failure = new Error('blocked');
    const log = vi.fn();

    registerServiceWorker(navigatorWith(vi.fn(() => Promise.reject(failure))), true, log);

    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith('Could not register the service worker', failure),
    );
  });

  it('defaults to the browser and the build mode', () => {
    // Vitest isn't a production build, so nothing is registered.
    expect(() => registerServiceWorker()).not.toThrow();
  });
});
