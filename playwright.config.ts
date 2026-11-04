import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Playwright runs its own copy of the local stack, separate from `npm run dev`: its own table
// (wiped before every test) and its own ports, so it never touches your local data.
// Keep in step with E2E_API_URL in e2e/fixtures.ts.
const E2E_WEB_PORT = 5174;
const E2E_API_PORT = 3101;
const localWebUrl = `http://localhost:${E2E_WEB_PORT}`;
const localApiUrl = `http://localhost:${E2E_API_PORT}`;
// Synthetic job postings for "Fill from link" (feature 002), the only local host the e2e API
// may read (IMPORT_ALLOW_LOCAL_HOSTS, honored only when APP_ENV is local).
const POSTING_PORT = 5175;
// A production build, for the installable app (feature 006): its service worker runs only in a
// build, never on the dev server. Keep in step with PREVIEW_URL in e2e/installable.spec.ts.
const E2E_PREVIEW_PORT = 5176;

const baseURL = process.env.E2E_BASE_URL ?? localWebUrl;

export default defineConfig({
  testDir: 'e2e',
  // Tests share one table (reset before each test), so they must not run in parallel.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  // Combinatorial split (research.md): every scenario runs on desktop Chrome. Scenarios whose
  // behavior depends on the device (layout, touch, Safari's form controls) are tagged
  // @responsive and also run on the iPhone. Every device and every scenario stays covered,
  // without running every scenario on every device. There's no Android project: the owner uses
  // an iPhone only (2026-10-29).
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // Playwright's WebKit doesn't run service workers, so @installable is desktop Chrome only.
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 14'] },
      grep: /@responsive/,
      grepInvert: /@installable/,
    },
  ],
  // Against a deployed site (E2E_BASE_URL set) there is nothing to start locally. Otherwise
  // start DynamoDB Local, the API, and the web app with the e2e table and ports. The reset
  // fixture in e2e/fixtures.ts waits for the API to come up.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node e2e/fixtures/posting-server.mjs',
          url: `http://localhost:${POSTING_PORT}/posting.html`,
          reuseExistingServer: !isCI,
          env: { POSTING_PORT: String(POSTING_PORT) },
        },
        {
          command: 'npm run dev',
          url: localWebUrl,
          // Only ever reuses an e2e copy left running, never your `npm run dev`.
          reuseExistingServer: !isCI,
          timeout: 120_000,
          env: {
            TABLE_NAME: 'JobTracker-e2e',
            PORT: String(E2E_API_PORT),
            CORS_ORIGIN: `${localWebUrl},http://localhost:${E2E_PREVIEW_PORT}`,
            ALLOW_TEST_RESET: 'true',
            WEB_PORT: String(E2E_WEB_PORT),
            VITE_API_URL: localApiUrl,
            IMPORT_ALLOW_LOCAL_HOSTS: `localhost:${POSTING_PORT},127.0.0.1:${POSTING_PORT}`,
          },
        },
        {
          // The same app as a production build, talking to the same e2e API.
          command: `npm run build -w @jot/web && npm run preview -w @jot/web -- --port ${E2E_PREVIEW_PORT} --strictPort`,
          url: `http://localhost:${E2E_PREVIEW_PORT}`,
          reuseExistingServer: !isCI,
          timeout: 180_000,
          env: { VITE_APP_ENV: 'local', VITE_API_URL: localApiUrl },
        },
      ],
});
