---

description: "Task list for the retro theme (feature 008)"
---

# Tasks: Retro Theme

**Input**: Design documents from `specs/008-retro-theme/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: Setup, then one phase per user story (spec.md US1–US2), then polish.

**Pushing**: commit after each phase and push the branch (free: no Actions run). Open the pull
request and merge only when the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US2 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `theme` (Vitest `// @module-tag theme`; Playwright `{ tag: '@theme' }`).
- **Edits**: write multi-line edits with Python script files in the scratchpad. Never pipe a check
  through `tail` when its exit code matters, and stop the chain (`|| exit 1`) before any commit.
- **The look**: the reference is the owner's chosen mockup, concept A ("Sunset horizon"); compare
  screenshots against it at 1,280 and 390 px.
- **Colours**: use the exact values in research.md §4's table; components keep using tokens,
  never literal colours.

---

## Phase 1: Setup

- [X] T001 Add the `theme` tag to `scripts/test-tags.mjs`:
  - `{ name: 'theme', description: 'The banner and the site colours (feature 008)' }`
  - `'theme'` in `E2E_FEATURES`
  - `SOURCE_TAGS`: `packages/web/src/assets/banner-scene.svg` → `['theme']`, placed before the
    `packages/*/src/**` catch-all
  - a row for `theme` in the README's "Test tags" table
  - extend `scripts/test-tags.test.*` (or the existing tag tests) for the new mapping

---

## Phase 2: User Story 1 — A banner that matches the app icon (Priority: P1) 🎯 MVP

**Goal**: Every page has the synthwave banner with the icon, title, nav and add button, and the
iPhone status bar runs into it.

**Independent Test**: quickstart.md "Locally, by eye" steps 1, 5 and 6, and `e2e/theme.spec.ts`.

### Tests for User Story 1

- [X] T002 [P] [US1] Extend `packages/web/tests/App.test.tsx` (Layout):
  - the banner shows a decorative icon (`img` with `alt=""`, `src="/icon.svg"`)
  - the title link's accessible name is "Job Opportunity Tracker" on every width, and it holds
    both the long title and "Job Tracker"
  - the `h1`, nav links and add button are unchanged (existing assertions keep passing)
- [X] T003 [P] [US1] Extend `packages/web/tests/manifest.test.ts`:
  - `theme_color` is `#140230`; `background_color` is the light `--color-bg` token
  - `theme-color` meta is `#140230` for both light and dark
  - `apple-mobile-web-app-status-bar-style` is `black-translucent`
  - the viewport meta includes `viewport-fit=cover`
- [X] T004 [P] [US1] Extend `packages/web/tests/worker.test.ts`: install caches `/icon.svg` as
  well as `/config.json`, and a failure to fetch either doesn't fail the install
- [X] T005 [P] [US1] Create `e2e/theme.spec.ts` (`@theme`, desktop Chromium and iPhone):
  - every page (overview, archive, an opportunity, add, edit) has the banner with its scene as a
    background image
  - banner height: 150 ± 10 px at 1,280; 120 ± 10 px on the iPhone
  - at 320, 390, 640, 1,024, 1,280, 1,920 and 2,560 px: the title, nav links and button don't
    overlap each other or the viewport's edges; `document.documentElement.scrollWidth` equals
    the viewport width; every content box's bottom is above the scene's strip (`--banner-scene-height`)
  - the title reads "Job Tracker" below 1,024 px and "Job Opportunity Tracker" from 1,024 px
  - with the root font size at 200%, the banner grows and its content still doesn't overlap
  - Tab moves focus through the title, links and button with a visible outline (outline width
    > 0 and colour `#00f0ff`)

### Implementation for User Story 1

- [X] T006 [P] [US1] Create `packages/web/src/assets/banner-scene.svg` (research §1): as
  revised in research §1: a 5000 × 100 strip along the banner's bottom under a CSS sky gradient
  (`#140230` → `#5b1683` → `#ff4fa3` at the horizon); striped sun `#ffe23b` →
  `#ff2f7d` right of centre, fully inside the viewBox; floor `#12002a` with `#ff3fd8` perspective
  grid and a `#00f0ff` horizon line; white sparkles. A comment says it expands the icon
  and must stay in step with `public/icon.svg`'s colours
- [X] T007 [US1] Update `packages/web/src/components/Layout.tsx`: the icon `<img src="/icon.svg"
  alt="" />` inside the title link; the link has `aria-label="Job Opportunity Tracker"` and two
  spans (long, short) for the CSS to choose between (research §3)
- [X] T008 [US1] Rewrite the header in `packages/web/src/components/Layout.module.css`:
  - background: the scene (`url('../assets/banner-scene.svg') center bottom / cover no-repeat`),
    `min-height` 150 px (120 px below 640 px)
  - padding includes `env(safe-area-inset-top)`, `-left` and `-right`
  - content laid out in the top part, above the horizon; title bold white with a dark
    `text-shadow` and pink glow; icon 52 px (42 px on phones) with a cyan ring and pink glow
  - nav links white; the current page underlined in cyan (`#00f0ff`)
  - add button `#ff3fd8` with `#12002a` text and a pink glow
  - focus outline on banner items `#00f0ff`
  - the bottom nav adds `env(safe-area-inset-bottom)` to its height and padding
  - banner colours as `--banner-*` tokens in `global.css` (fixed, the same in light and dark)
- [X] T009 [US1] Update `packages/web/index.html` and `packages/web/public/manifest.webmanifest`
  (research §6): `viewport-fit=cover`; `black-translucent`; `theme-color` `#140230` for both
  schemes; `theme_color` `#140230`; `background_color` the new light page colour
- [X] T010 [US1] Update `packages/web/src/sw/worker.ts` install to cache `/icon.svg` (research §2)
- [X] T011 [US1] Make T002–T005 pass; take screenshots at 1,280 and 390 px, light and dark, and
  compare with mockup A; run lint, typecheck and the affected tests; commit and push:
  `feat(web): a synthwave banner that matches the icon (008: US1)`

**Checkpoint**: the banner is on every page; the rest of the site still has today's colours.

---

## Phase 3: User Story 2 — The icon's colours across the whole site (Priority: P2)

**Goal**: The page, cards, accents, warnings and focus use the new palette in light and dark.

**Independent Test**: quickstart.md "Locally, by eye" steps 2–4, `theme.test.ts`, and
`e2e/accessibility.spec.ts`.

### Tests for User Story 2

- [X] T012 [P] [US2] Create `packages/web/tests/theme.test.ts` (`@module-tag theme`), reading the
  light (`:root`) and dark (`@media (prefers-color-scheme: dark)`) token blocks from
  `packages/web/src/styles/global.css`:
  - a small WCAG contrast helper (relative luminance), tested on known pairs (black/white 21:1)
  - in each scheme, ≥ 4.5:1 for: text and muted text on bg, surface and column; accent on bg,
    surface and column; accent-text on accent; danger on surface and column
  - ≥ 3:1 for: control border on surface; focus on bg and surface
  - banner: white and `--banner-button-text` on their backgrounds, and `#00f0ff` focus on
    `#5b1683`, all ≥ 4.5:1 (the button ≥ 4.5:1 as text)
  - the danger and accent hues differ by at least 40° in each scheme
  - no `.css` file under `packages/web/src` contains the old blues `#2f5bd3` or `#7e9bff`
- [X] T013 [P] [US2] Review `e2e/accessibility.spec.ts`: it already runs axe on every page and
  dialog in light and dark; add any page the new colours touch that it doesn't cover (none
  expected)

### Implementation for User Story 2

- [X] T014 [US2] Update `packages/web/src/styles/global.css` with research §4's palette, light and
  dark:
  - `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`,
    `--color-accent`, `--color-accent-text`, `--color-danger`, `--color-focus`
  - new `--color-column` and `--color-control-border`
  - update the comment at the top: the colours come from the app icon (feature 008)
- [X] T015 [US2] Use the new tokens where they belong:
  - `--color-column` for the board column in `StageBoard.module.css` (replacing its
    `color-mix`)
  - `--color-control-border` for inputs, selects, textareas and secondary buttons in
    `OpportunityForm.module.css`, `InterviewForm.module.css`, `ListToolbar.module.css`,
    `MoveStageMenu.module.css`, `Dialog.module.css`, `Page.module.css` and
    `OpportunityCard.module.css`'s "Move to…" button
  - `Dialog.module.css`'s backdrop and shadows: a purple tint (`rgb(18 0 42 / …)`) instead of
    black
  - check every `--color-danger` use (due card border and badge, errors, the remove button)
    still reads as a warning in orange/amber
- [X] T016 [US2] Make T012–T013 pass; run the full e2e suite in light and dark; take screenshots of
  every page in both schemes and check nothing is left blue; commit and push:
  `feat(web): the icon's colours across the site (008: US2)`

**Checkpoint**: the whole site matches the icon, in light and dark.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T017 [P] README: a short "Look" note (the banner, the palette tokens in `global.css`, and that
  `banner-scene.svg` follows the icon's colours); `theme` in the Test tags table (T001)
- [X] T018 [P] Create `specs/008-retro-theme/checklists/validation.md`: automated results;
  **architecture diagrams** checked and unchanged (no diagram shows styling); the owner's iPhone
  checks (quickstart.md "On the iPhone"), still open
- [X] T019 Full local check: lint, typecheck, build; all unit tests with coverage ≥ 80%; the full
  e2e suite (desktop and iPhone); mutation testing on the changed source files (≥ 95%);
  record the results in validation.md; commit and push
- [X] T020 **Only when the owner says so**: open the pull request (it also carries the
  `validation-notes` commit for 005 and 006), merge when every check is green, and confirm the
  deploy and its smoke test
- [X] T021 **After the deploy**: the owner's iPhone checks (quickstart.md "On the iPhone"),
  including 006's still-open offline and update checks

---

## Dependencies & Execution Order

- **Setup (T001)** comes first.
- **US1 (T002–T011)** is the MVP: the banner.
- **US2 (T012–T016)** follows: it changes `global.css`, which T008 also adds banner tokens to.
- **Polish (T017–T019)** comes last; T020 and T021 wait for the owner.

## Parallel Opportunities

- **US1**: the tests T002–T005 are in different files; T006 (the scene) alongside them.
- **US2**: T012 and T013 together.
- **Polish**: T017 and T018 together.

## Implementation Strategy

- **MVP**: US1 alone gives the banner the owner asked for first.
- **Then**: US2 carries the colours through the site.
- **One PR** when the owner says to merge.
