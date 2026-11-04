# Implementation Plan: Retro Theme

**Branch**: `008-retro-theme` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-retro-theme/spec.md`

## Summary

The header becomes a 90s synthwave banner drawn from the app icon, and the site's colour tokens
change to the icon's palette.

- **Banner scene**: a new SVG, `src/assets/banner-scene.svg` (sky, striped sun, neon grid,
  sparkles), is the header's CSS background. It's scaled to cover, anchored to the bottom
  centre, so it keeps its shape at any width (research §1).
  - **Bundled**: Vite inlines or hashes it into `assets/`, which the service worker already
    caches. So it works offline and arrives with the stylesheet, without pushing the page down.
- **Banner content**:
  - **Icon**: `/icon.svg`, with a cyan glow. The service worker now also caches it at install
    (research §2).
  - **Title**: "Job Opportunity Tracker", with "Job Tracker" swapped in on phones by CSS. The link
    keeps one accessible name (research §3).
  - **Nav and button**: the nav as today, and the add button in neon pink.
  - **Readable text**: everything sits in the dark top part of the sky, above the pink glow at
    the horizon, so white text always passes contrast (research §4).
- **Colours**: `global.css`'s tokens move to the new palette in light and dark. Every component
  already uses the tokens, so most of the work is the token values. There are two new tokens:
  - `--color-control-border`, for inputs and buttons (3:1);
  - `--banner-*`, for the banner's own fixed colours.

  The warning colour moves from red to burnt orange (light) and amber (dark), so it can't be
  mistaken for magenta or pink (FR-008, research §5).
- **iPhone status bar**: `theme-color` becomes the banner's top colour, `#140230`, in both schemes,
  and the manifest's `theme_color` matches it.
  - **Under the status bar**: the installed app's status bar becomes `black-translucent` with
    `viewport-fit=cover`, so the sky runs up behind the clock.
  - **Safe areas**: the banner and the bottom nav pad themselves with the safe-area insets
    (research §6).

Nothing changes in the API, the data, the infrastructure, or the board's layout and breakpoints.

## Technical Context

**Language/Version**: TypeScript 6.0 and CSS, as in features 001–007

**Primary Dependencies**: No new dependencies. The scene is a hand-written SVG; the colours are
CSS custom properties

**Storage**: None

**Testing**:
- **Vitest**:
  - **`theme.test.ts`** (new): reads `global.css` and checks every text and control colour pair
    meets WCAG AA in light and dark (research §4). It also checks that no stylesheet still uses
    the old blue, and that the warning colour stays far from the accent.
  - **`App.test.tsx`**: the banner's title, icon, links and button.
  - **`manifest.test.ts`**: the new theme colour and status bar style.
  - **`worker.test.ts`**: the icon is cached at install.
- **Playwright**:
  - **`e2e/theme.spec.ts`** (new, `@theme`):
    - the banner is there on every page, at its height on desktop and iPhone;
    - its title, links and button sit above the horizon glow;
    - nothing overlaps and nothing scrolls sideways, at 320, 390, 640, 1,024, 1,280, 1,920 and 2,560 px;
    - the banner's height grows with 200% text.
  - **`accessibility.spec.ts`**: the existing axe checks run on every page in light and dark,
    so they cover contrast with the new colours.
- **By hand**: on the iPhone, the status bar runs into the banner, and the app matches the icon
  (SC-006)
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%. CSS and SVG
  aren't mutated

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app)

**Project Type**: Web application (React SPA)

**Performance Goals**: The overview's first view is no more than 0.1 s slower (SC-004). The
scene is small (about 3 KB) and comes with the CSS, so there's no extra round trip

**Constraints**: WCAG 2.1 AA contrast (FR-009); works offline (FR-012); appearance only (FR-013)

**Scale/Scope**:
- **Code**: one component (`Layout`), `global.css`, and the few component styles that hard-code
  shadows or need the control border
- **Head**: `index.html` and the manifest

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | No change. | PASS |
| II. History is never lost | No change. | PASS |
| III. Fast capture, progressive detail | The add button stays in the same place, on the banner. | PASS |
| IV. Data privacy & ownership | Nothing is fetched from elsewhere, and no data changes. | PASS |
| V. Simplicity (YAGNI) | One SVG and new token values. No theme framework, no animation library, and the System/Light/Dark option stays in 007. | PASS |
| VI. Test the rules | The contrast rules are tested against the real token values. The banner's layout rules are checked end to end at seven widths. | PASS |
| VII. Automated quality gates | Same pipeline. A new `theme` test tag. Pushed after each commit; the PR and merge happen when the owner says so. | PASS |
| Workflow: diagrams | No diagram shows styling. The validation record will say the diagrams are unchanged. | PASS |

**Post-design re-check (after Phase 1)**: PASS. There are no new entities, endpoints, or
infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/008-retro-theme/
├── spec.md
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
├── index.html                          # (changed) theme-color #140230, black-translucent status
│                                       #   bar, viewport-fit=cover
├── public/manifest.webmanifest         # (changed) theme_color #140230; background_color the
│                                       #   new light page colour
├── src/
│   ├── assets/banner-scene.svg         # (new) the banner's scene
│   ├── components/Layout.tsx           # (changed) icon, long and short title
│   ├── components/Layout.module.css    # (changed) the banner; safe-area padding
│   ├── components/*.module.css         # (changed where needed) control border, shadows
│   ├── pages/Page.module.css           # (changed where needed) as above
│   ├── sw/worker.ts                    # (changed) caches /icon.svg at install
│   └── styles/global.css               # (changed) the new palette, light and dark
└── tests/
    ├── theme.test.ts                   # (new) contrast and no-old-blue rules
    ├── App.test.tsx                    # (changed) the banner
    ├── manifest.test.ts                # (changed) theme colour, status bar
    └── worker.test.ts                  # (changed) icon cached

e2e/theme.spec.ts                       # (new) @theme: banner layout at seven widths
scripts/test-tags.mjs                   # (changed) the `theme` tag; banner-scene.svg → theme
README.md                               # (changed) a line on the look and the palette tokens
```

**Coverage and mutation exclusions**: none new. The SVG and CSS aren't code Stryker mutates;
`Layout.tsx` stays covered and mutated as today.

**Structure Decision**: Everything lives in the web package. The colours stay in one place
(`global.css` tokens), so feature 007's System/Light/Dark switch can later swap between the two
sets.

## Complexity Tracking

No constitution violations to justify.
