# Research: Installable App

## 1. What makes it installable

- **Decision**: three pieces.
  - **`manifest.webmanifest`**, linked from `index.html`, with:
    - `name: "Job Tracker"` and `short_name: "Job Tracker"`
    - `start_url: "/"`, `scope: "/"`, and `display: "standalone"`
    - `theme_color` and `background_color` from the design tokens
    - icons at 192 and 512 px, plus a 512 px `maskable` icon
  - **Tags for iPhone**, which still reads some of its own instead of the manifest:
    - `apple-touch-icon` at 180 px
    - `apple-mobile-web-app-title`
    - `apple-mobile-web-app-status-bar-style: default`
    - two `theme-color` meta tags, one per colour scheme
  - **A service worker**, which Chrome on Android needs for a full "Install app" and offline
    open. Chrome no longer strictly requires it for installing, but offline open (FR-007) does.
- **Rationale**: This is the documented minimum for both platforms, and it changes nothing for
  the website in a browser.

## 2. A hand-written service worker, not Workbox

- **Decision**: `packages/web/src/sw/sw.ts` is built by Vite as a second entry with a fixed name,
  `/sw.js`. A small inline plugin in `vite.config.ts` replaces two placeholders in it at build
  time: the build id, and the list of hashed assets in the bundle.
- **The request rules**, pure in `strategy.ts`:

  | Request | Rule |
  |---|---|
  | Another origin (API, Cognito) | Not handled: goes straight to the network, never cached |
  | Not a GET | Not handled |
  | Navigation (any app page) | Network first, fetched with `cache: 'no-cache'`, falling back to the cached `/index.html`. This is what makes a deploy show on the next launch (FR-006) and offline open work (FR-007) |
  | `/config.json` | Network first, falling back to the cached copy |
  | Hashed `/assets/*` | Cache first; they never change once built |
  | Anything else on the site (icons, manifest) | Network first, falling back to the cache |

- **Install**: caches `/index.html`, `/config.json`, and the asset list for this build, then
  calls `skipWaiting()`.
- **Activate**: deletes the caches of older builds, then calls `clients.claim()`.
- **Rationale**:
  - The rules are about 60 lines, and every one can be tested.
  - Workbox (or `vite-plugin-pwa`) would add a dependency and generated code that this
    project's mutation and coverage gates can't see into.
  - Precaching this build's assets means the first offline open works even if the owner never
    visited every page.
- **Alternatives**: `vite-plugin-pwa` is the usual choice, and was rejected for the reasons
  above (Principle V). A cache-only service worker was also rejected: it would delay deploys.

## 3. Updates

- **Decision**: Pages are network first with `no-cache`, so every launch or reload with a
  connection gets the newest `index.html`, which points at the newest hashed assets. The browser
  also checks `/sw.js` itself for changes on each navigation, without its HTTP cache, which is
  the default for service worker scripts. A new build id installs the new worker, which takes
  over at once (`skipWaiting` + `clients.claim`).
- **Nothing in flight is lost**: an install never reloads the page by itself. API calls aren't
  handled by the worker at all, so a save in progress completes.
- **Rationale**: This meets FR-006 (by the next launch) without an "update available" prompt.
  The CloudFront invalidation of `/*` on each deploy already keeps the edge current.

## 4. Icons

- **Decision**: A simple SVG source (`public/icon.svg`): a rounded square in the accent colour
  (`#2f5bd3`) with a white briefcase. The "maskable" version keeps the briefcase inside the
  central 80% safe zone.
  - **Making the PNGs**: `scripts/make-icons.mjs` uses Playwright's Chromium to render it at 180,
    192, and 512 px, and the maskable 512 px. It's run by hand when the icon changes, and the
    PNGs are committed.
- **Rationale**: There's no new image tooling: Playwright is already installed, and the output is
  reproducible.
- **Changed by the owner (2026-10-29)**: After looking at options in realistic, 90s, and 8-bit
  styles, the owner chose a 90s design: a chrome briefcase launching like a rocket over a
  synthwave sunset and neon grid ("career launch"). It fills the square, so the iPhone's icon
  (180 px) is square and iOS rounds it; the browser icons keep the rounded tile. The owner uses
  an iPhone only, so Android's crop wasn't a constraint.

## 5. Sign-in from the installed app

- **Decision**: The OIDC flow is unchanged: authorization code and PKCE, redirecting to
  Cognito's managed login and back to `/`. On iPhone, a home-screen app that navigates to
  another site shows that page inside the app, and the redirect back returns to the app.
  - **The session**: it stays in `sessionStorage`, as on the website, so a cold launch makes one
    quick redirect through Cognito. Cognito's own cookie usually signs in with no password.
  - **Offline**: the sign-in gate checks `navigator.onLine` before redirecting. While offline it
    shows the existing offline message instead, and redirects when the `online` event fires.
- **Rationale**: Keeping the same storage as the website changes nothing about how long tokens
  live (FR-008). Without the offline check, an offline cold launch would redirect to Cognito and
  show a browser error (FR-007).
- **Risk**: The iPhone behaviour can only be confirmed on a real phone (spec Assumptions). If
  it fails, the fallback is `redirect_uri` handling with a popup, which is a contained change.
- **Alternative considered**: `localStorage` for the session, to skip the redirect on each cold
  launch. It was rejected for now: tokens would outlive the tab on the website too, which
  changes FR-008. It can be revisited with issue #30 (offline editing).
- **Revised in feature 008** (2026-10-30): the owner's iPhone check found that iOS ends the
  session whenever the installed app is closed, so an offline launch never had a sign-in and
  showed only the offline message, without the banner. The owner chose to keep the sign-in in
  `localStorage`. Tokens last as long as Cognito issues them for, on the website too. Offline,
  a kept sign-in opens the app even once expired; online, an expired one redirects as before.

## 6. Testing installability

- **Decision**: Playwright gets a third local server, `vite preview` of a production build on its
  own port, used only by `e2e/installable.spec.ts` (tag `@installable`, desktop Chromium only).
  - **Installability**: the manifest is linked, parses, has the required fields, and its icons
    load. The service worker becomes the controller.
  - **Offline open**: with the context offline (`context.setOffline(true)`), a reload shows the
    app with the offline message.
  - **Updates**: after a second build with a different build id, the next load uses it.

  WebKit doesn't support service workers in Playwright, so the iPhone is checked by hand.
- **Rationale**: Service workers only run in production builds, and the dev server is for
  everything else.
