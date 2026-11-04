---

description: "Task list for the installable app (feature 006)"
---

# Tasks: Installable App

**Input**: Design documents from `specs/006-installable-app/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: Setup, then one phase per user story (spec.md US1–US4).

**Local only**: Commit after each phase. Don't push until the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `installable` (Vitest `// @module-tag installable`; Playwright
  `{ tag: '@installable' }`).
- **Edits**: write multi-line edits with Python script files in the scratchpad. Never pipe a check
  through `tail` when its exit code matters, and stop the chain (`|| exit 1`) before any commit.
- **The service worker**: it runs only in a production build, so its end-to-end checks use
  `vite preview`, not the dev server.

---

## Phase 1: Setup

- [X] T001 Add the `installable` tag to `scripts/test-tags.mjs`:
  - `{ name: 'installable', description: 'Installing the app on a phone, offline open, and updates (feature 006)' }`
  - `'installable'` in `E2E_FEATURES`
  - `SOURCE_TAGS` entries as each file appears:
    - `packages/web/src/sw/**` → `['installable']`
    - `packages/web/src/registerServiceWorker.ts` → `['installable']`
    - `packages/web/public/**` → `['installable']`
    - `packages/web/index.html` → `['installable']`
  - a row for `installable` in the README's "Test tags" table
- [X] T002 Add a preview server to `playwright.config.ts`: `npm run build -w @jot/web && npx vite preview --port <E2E_PREVIEW_PORT> --strictPort`, with a local `config.json` like the dev server's (`appEnv: 'local'`). Only `e2e/installable.spec.ts` uses it, on desktop Chromium; the other specs keep the dev server. The local API now accepts a comma-separated `CORS_ORIGIN`, so both the dev server and the preview can call it

---

## Phase 2: User Story 1 — Install it on my phone (Priority: P1) 🎯 MVP

**Goal**: The manifest, icons, and iPhone tags, so both phones offer to install it.

**Independent test**: quickstart.md iPhone step 1–2, and Android step 1.

- [X] T003 [P] [US1] Write `packages/web/tests/manifest.test.ts`. It reads `public/manifest.webmanifest` and `index.html` from disk and checks:
  - **Manifest fields**:
    - `name` and `short_name` are "Job Tracker"
    - `start_url` and `scope` are "/", and `display` is "standalone"
    - `theme_color` and `background_color` match the light design tokens in `src/styles/global.css`
  - **Icons**:
    - the 192, 512, and maskable 512 icons are listed with the right `sizes`, `type`, and `purpose`
    - each listed file exists, and its PNG header gives the stated size
  - **`index.html`** has:
    - `<link rel="manifest">` and `<link rel="apple-touch-icon">` (180 px, which exists)
    - `apple-mobile-web-app-title` "Job Tracker"
    - `apple-mobile-web-app-capable` and `mobile-web-app-capable`
    - two `theme-color` metas with `(prefers-color-scheme: light|dark)`
- [X] T004 [US1] Create:
  - `packages/web/public/icon.svg`: a rounded accent-colour square with a white briefcase
  - `scripts/make-icons.mjs`: renders the SVG with Playwright's Chromium to `public/icons/icon-180.png`, `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (the briefcase inside the central 80%)

  Run the script, and commit the PNGs
- [X] T005 [US1] Create `packages/web/public/manifest.webmanifest`, and add the head tags to `packages/web/index.html`. The page `<title>` stays "Job Opportunity Tracker". Make T003 pass
- [X] T006 [US1] Write `e2e/installable.spec.ts`, its first test, against the preview server:
  - the manifest link resolves and parses as JSON with the expected `name`
  - each icon URL loads with `image/png`
- [X] T007 [US1] Run lint, typecheck, and the affected tests; commit locally: `feat(web): installable on phones, with a manifest and icons (006: US1)`

---

## Phase 3: User Story 2 — Use it as I use the website (Priority: P1)

**Goal**: Sign-in returns to the app; posting links leave it; nothing else changes.

**Independent test**: quickstart.md iPhone steps 3–4 (by hand), and the existing suite.

- [X] T008 [P] [US2] Check that every link leaving the site opens outside the app (`target="_blank"`, `rel="noreferrer"`): extend the existing posting-link test in `packages/web/tests/pages.test.tsx` if anything is missing. The sign-in redirect is unchanged; it's confirmed by hand (T024)
- [X] T009 [US2] (Nothing changed: the posting link is the only link that leaves the site, and `pages.test.tsx` already checks its `target` and `rel`.) Commit locally if anything changed: `test(web): links that leave the site open outside the installed app (006: US2)`

---

## Phase 4: User Story 4 — Open it offline (Priority: P3, built before US3 because US3 builds on the same service worker)

**Goal**: The service worker's caching rules, and no sign-in redirect while offline.

**Independent test**: quickstart.md step 6, and the `@installable` offline test.

- [X] T010 [P] [US4] Write `packages/web/tests/sw-strategy.test.ts` for `src/sw/strategy.ts`. `ruleFor(request, origin)` returns:
  - `'passthrough'` for another origin, a non-GET request, or `/sw.js` itself
  - `'page'` for a navigation
  - `'network-first'` for `/config.json` and other same-origin files
  - `'cache-first'` for `/assets/*`
- [X] T011 [P] [US4] Write `packages/web/tests/sw.test.ts` for `src/sw/sw.ts`'s handlers, with fake `caches`, `fetch`, `self.skipWaiting`, and `self.clients.claim`:
  - **install**: caches `/index.html`, `/config.json`, and the build's assets in the cache named for the build id, then calls `skipWaiting`
  - **activate**: deletes caches of other builds (only those with this app's prefix), then calls `clients.claim`
  - **fetch, by rule**:
    - `page`: fetches with `cache: 'no-cache'` and stores the response under `/index.html`; when the network fails, answers the cached `/index.html`
    - `network-first`: stores a good response; when the network fails, answers the cached copy
    - `cache-first`: answers from the cache without fetching, or fetches and stores
    - `passthrough`: not answered at all, so the browser handles it
  - **What isn't stored**: a non-OK response, or a response from another origin
- [X] T012 [P] [US4] Write `packages/web/tests/registerServiceWorker.test.ts`:
  - it registers `/sw.js` with `{ scope: '/' }` only when `navigator.serviceWorker` exists and the build is production
  - it does nothing otherwise
  - a registration failure is logged, not thrown
- [X] T013 [P] [US4] Extend `packages/web/tests/auth.test.tsx`:
  - **Offline**: when signed out, the Cognito gate shows "You're offline. Sign in again once you're connected." (`role="status"`) and doesn't call `signinRedirect`
  - **Back online**: when the `online` event fires, it redirects
  - **Already online**: it redirects as before
- [X] T014 [US4] (Built as `src/sw/worker.ts`, the tested rules and handlers, and `src/sw/sw.ts`, a thin entry excluded from coverage and mutation like `main.tsx`. Cached files are looked up with `ignoreVary: true`: servers answer "Vary: Origin", and the app's scripts carry an Origin header the precache didn't, so offline every script missed. The end-to-end test found it. When both board lists fail, one message shows, not two.) Create `packages/web/src/sw/strategy.ts` and `packages/web/src/sw/sw.ts`:
  - the handlers are exported for the tests
  - the entry wires them to `self.addEventListener`
  - `__BUILD_ID__` and `__ASSETS__` placeholders

  In `packages/web/vite.config.ts`:
  - add `sw: 'src/sw/sw.ts'` as a build input, named `sw.js` at the root
  - add a small plugin that, in `generateBundle`, replaces the placeholders with the build's hash and its list of `assets/*` files

  Make T010 and T011 pass
- [X] T015 [US4] Create `packages/web/src/registerServiceWorker.ts` and call it from `main.tsx`. In `AuthProvider.tsx`, gate the redirect on `useOnline()` and show the offline message. Make T012 and T013 pass
- [X] T016 [US4] Add to `e2e/installable.spec.ts`:
  - after a first load, the service worker controls the page (`navigator.serviceWorker.controller`)
  - with `context.setOffline(true)`, a reload still shows the app shell and the offline banner, not a browser error
  - back online, the board loads
- [X] T017 [US4] Run lint, typecheck, and the affected tests; commit locally: `feat(web): open offline from the home screen (006: US4)`

---

## Phase 5: User Story 3 — Get updates without reinstalling (Priority: P2)

**Goal**: A new build reaches the installed app by its next launch.

**Independent test**: quickstart.md step 5, and the `@installable` update test.

- [X] T018 [P] [US3] (Already covered by US4's `packages/web/tests/worker.test.ts`: a page fetched fresh even with a cached copy, the cache named per build, and activation deleting only older builds' caches.) Extend `packages/web/tests/sw.test.ts`:
  - a page request always goes to the network first, even when a cached page exists
  - the cache name changes with the build id
  - activating a new build deletes the old build's cache but keeps unrelated caches
- [X] T019 [US3] Add to `e2e/installable.spec.ts`:
  - load the app
  - rebuild with a different build id (an env var read by the plugin, for the test)
  - reload twice; `/sw.js` reports the new build id, and the page uses the new assets

  If rebuilding inside the test is too slow, compare two prebuilt outputs served one after the other (note which in the test). (Rebuilding inside the test takes about a second, so it does that, and rebuilds the usual output afterwards.)
- [X] T020 [US3] Make T018 and T019 pass (any fixes in `sw.ts`); commit locally: `test(web): deploys reach the installed app on the next launch (006: US3)`

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] README:
  - **Installing**: a short "Install on your phone" section with the iPhone and Android steps
  - **Docs**: `scripts/make-icons.mjs` in "Commands" or "Project layout"
- [X] T022 Full local check:
  - `npm run lint`, `npm run typecheck`, `npm run build`
  - `npm run test:coverage`
  - `npx stryker run --force --mutate "<changed source files>"` (zero survivors)
  - `npm run test:e2e`

  Record the results in `specs/006-installable-app/checklists/validation.md`, with the owner's by-hand checks from quickstart.md
- [ ] T023 **Only when the owner says to push**: push 005 and 006 (006 is based on 005), open the PRs, merge each when green, and confirm the deploys
- [ ] T024 **After the deploy**: the owner's phone checks (quickstart.md). They're the only way to confirm sign-in from the iPhone home screen; if it fails, follow research §5's fallback

---

## Dependencies & Execution Order

- **Setup (T001–T002)** comes first.
- **US1 (T003–T007)** is the MVP: the app becomes installable.
- **US2 (T008–T009)** is mostly confirmation, and is independent.
- **US4 (T010–T017)** comes before **US3 (T018–T020)**, because US3 extends US4's service
  worker.
- **Polish** comes last. T023 and T024 wait for the owner.

## Parallel Opportunities

- **US1**: T003 alongside T004 (the icon script).
- **US4**: T010–T013 are in different files.

## Implementation Strategy

- **MVP**: US1 alone already lets both phones install the app, and it opens online.
- **Then**: US4 (offline open) and US3 (updates) make it behave like a real app.
- **One PR**, after feature 005's, when the owner says to push.
