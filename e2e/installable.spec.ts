import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Feature 006: the tracker as an installable app. A service worker runs only in a production
// build, so these tests use the preview server (playwright.config.ts), not the dev server.
// Playwright's WebKit can't run service workers: the iPhone is checked by hand (quickstart.md).

// Keep in step with E2E_PREVIEW_PORT in playwright.config.ts.
const PREVIEW_URL = 'http://localhost:5176';
// Same as the preview server's build in playwright.config.ts.
const API_URL = 'http://localhost:3101';

// The service worker's caches, by name.
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

async function waitForControl(page: Page) {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
}

// Rebuilds the app the preview server serves, as a deploy would replace it.
function rebuild(buildId?: string) {
  execSync('npm run build -w @jot/web', {
    stdio: 'ignore',
    env: {
      ...process.env,
      VITE_APP_ENV: 'local',
      VITE_API_URL: API_URL,
      ...(buildId ? { SW_BUILD_ID: buildId } : {}),
    },
  });
}

test.describe('installable app (feature 006)', { tag: '@installable' }, () => {
  test('the page links a manifest that names the app, with icons that load', async ({
    page,
    request,
  }) => {
    await page.goto(PREVIEW_URL);

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = (await (await request.get(new URL(href ?? '', PREVIEW_URL).href)).json()) as {
      name: string;
      display: string;
      icons: { src: string }[];
    };
    expect(manifest).toMatchObject({ name: 'Job Tracker', display: 'standalone' });
    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, PREVIEW_URL).href);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toBe('image/png');
    }
  });

  test('once loaded, the app opens offline and says so, then recovers', async ({
    page,
    context,
  }) => {
    await page.goto(PREVIEW_URL);
    await expect(page.getByRole('heading', { level: 2, name: 'Overview' })).toBeVisible();
    // The service worker installs on the first visit and then controls the page.
    await page.waitForFunction(async () => {
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    });

    await context.setOffline(true);
    await page.reload();

    // The app itself opens (not a browser error page), and says it can't load right now.
    await expect(page.getByRole('heading', { level: 2, name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText("You're offline");

    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  test('a new build reaches the app on the next load, replacing the old one', async ({ page }) => {
    test.setTimeout(120_000);
    rebuild('e2e-before');
    await page.goto(PREVIEW_URL);
    await waitForControl(page);
    expect(await cacheNames(page)).toEqual(['job-tracker-e2e-before']);

    try {
      rebuild('e2e-after');
      // The next load fetches the page fresh, sees the new worker, which takes over at once.
      await page.reload();
      await expect.poll(() => cacheNames(page)).toEqual(['job-tracker-e2e-after']);
      await page.reload();
      await expect(page.getByRole('heading', { level: 2, name: 'Overview' })).toBeVisible();
    } finally {
      // Leave the usual build behind for the other tests.
      rebuild();
    }
  });
});
