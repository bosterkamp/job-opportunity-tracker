# Implementation Plan: Installable App

**Branch**: `006-installable-app` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-installable-app/spec.md`

## Summary

The web app becomes a progressive web app:

- **Manifest**: a web app manifest gives it its name ("Job Tracker"), icons, colours, start
  page, and standalone display, so phones can install it.
- **iPhone**: `<head>` tags add the iPhone's home-screen icon, title, and status bar colours.
- **Service worker**: a small hand-written service worker lets the installed app open offline
  and picks up each deploy by the next launch:
  - pages (navigations) are fetched from the network first, falling back to the cached page;
  - the hashed build assets are cached;
  - `config.json` is fetched from the network first, falling back to the cached copy;
  - nothing from another origin (the API, Cognito) is ever cached.
- **Offline while signed out**: the sign-in gate stops redirecting to Cognito when the phone is
  offline. It shows the existing offline message instead, and redirects once the connection is
  back.

There are no API, data, or infrastructure changes. The existing CloudFront security policy
already allows a same-origin manifest and service worker, and each deploy already invalidates
the cache. Details are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–005

**Primary Dependencies**:
- **Packages**: no new dependencies. The service worker is a small TypeScript entry built by the
  existing Vite build, with no Workbox or PWA plugin (research §2).
- **Icons**: PNGs rendered once from an SVG with the Playwright already installed, by a
  checked-in script (research §4).

**Storage**: None new. The service worker's cache holds only the app's own files (HTML, JS, CSS,
icons, `config.json`), never opportunity data (FR-009)

**Testing**:
- **Vitest unit tests**: the service worker's request rules (which requests are cached, and
  how), its install and activate steps, the registration, and the offline sign-in gate, with
  fakes for `caches` and `fetch`
- **Playwright**: a new `@installable` spec against a production build served by `vite
  preview`:
  - the manifest is linked and valid, and its icons load;
  - the service worker takes control;
  - the app opens with the network off and shows the offline message;
  - a rebuilt app is picked up on the next load
- **By hand (needs real phones)**: Add to Home Screen on the iPhone, Install on Android, and
  signing in from the installed app (spec Assumptions)
- **Quality gates**: coverage at or above 80%, and Stryker with no surviving mutants

**Target Platform**: iOS 16.4+ Safari (Add to Home Screen) and current Android Chrome; desktop
browsers may also install it

**Project Type**: Web application (React SPA)

**Performance Goals**: From the home screen, the board is ready in under 3 seconds (SC-001).
Cached assets make repeat launches faster than today

**Constraints**:
- No opportunity data stored by the service worker (FR-009, Principle IV)
- A deploy reaches the app by its next launch (FR-006)
- The website must stay unchanged (FR-008)

**Scale/Scope**: One owner, two phones

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | No change. | PASS |
| II. History is never lost | No change. | PASS |
| III. Fast capture, progressive detail | Opening the app from the home screen makes capture faster. Forms are unchanged. | PASS |
| IV. Data privacy & ownership | The service worker caches only the app's own files. It never caches API responses, Cognito, or anything from another origin. Nothing new leaves the owner's account. | PASS |
| V. Simplicity (YAGNI) | No new dependencies. The service worker is a few small rules, there's no offline editing (issue #30), and there's no push. | PASS |
| VI. Test the rules | The caching rules and the offline sign-in gate are pure or injectable functions with unit tests. The manifest and offline open are checked end to end. | PASS |
| VII. Automated quality gates | Same pipeline. A new `installable` test tag. Checked locally, and pushed only when the owner says so. | PASS |

**Post-design re-check (after Phase 1)**: PASS. There are no new entities, endpoints, or
infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/006-installable-app/
├── plan.md
├── research.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

There's no `data-model.md` or `contracts/`: no data or interfaces change.

### Source Code (repository root)

```text
packages/web/
├── index.html                         # (changed) manifest link, theme-color (light and dark),
│                                      #   apple-touch-icon, apple-mobile-web-app-* meta
├── public/
│   ├── manifest.webmanifest           # (new) name, short_name, start_url, scope, display,
│   │                                  #   colours, icons
│   ├── icon.svg                       # (new) the icon's source
│   └── icons/                         # (new) 180, 192, 512, and maskable 512 PNGs
├── src/
│   ├── sw/
│   │   ├── strategy.ts                # (new) the request rules (pure, testable)
│   │   └── sw.ts                      # (new) service worker entry: install, activate, fetch
│   ├── registerServiceWorker.ts       # (new) registers /sw.js in production builds
│   ├── auth/AuthProvider.tsx          # (changed) no sign-in redirect while offline
│   └── main.tsx                       # (changed) calls registerServiceWorker
└── vite.config.ts                     # (changed) builds sw.ts to /sw.js; injects the build
                                       #   id and asset list

scripts/make-icons.mjs                 # (new) renders icon.svg to the PNGs with Playwright
e2e/installable.spec.ts                # (new) @installable, against `vite preview`
playwright.config.ts                   # (changed) a preview server for @installable
scripts/test-tags.mjs                  # (changed) the `installable` tag
```

**Coverage and mutation exclusion** (Principle VI): `packages/web/src/sw/sw.ts` is a thin entry
point, like `main.tsx`. It only wires the tested handlers in `worker.ts` to the browser, and it's
covered by the `@installable` Playwright spec.

**Structure Decision**: Everything lives in the web package. The service worker is a second
build entry, so it's type-checked, linted, unit-tested, and mutation-tested like the rest of
the code.

## Complexity Tracking

No constitution violations to justify.
