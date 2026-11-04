# Research: Retro Theme

## 1. Drawing the banner's scene

- **Decision** (revised while building): two layers on the header.
  - **The sky**: a CSS gradient over the whole banner: `#140230` → `#5b1683` where the scene
    starts → `#ff4fa3` at the horizon.
  - **The scene**: one SVG, `packages/web/src/assets/banner-scene.svg`, as a strip along the
    banner's bottom. It's 74 px tall from 640 px, and 56 px on phones (`--banner-scene-height`).
    It's scaled to that height (`background-size: auto var(--banner-scene-height)`) and
    centred. It holds:
    - the striped sun `#ffe23b` → `#ff2f7d`, right of centre;
    - the grid floor `#12002a`, with `#ff3fd8` lines to a centre vanishing point and a `#00f0ff`
      horizon line;
    - five sparkles.

  The viewBox is very wide (5000 × 100). A phone shows its middle, and a 2,560 px screen shows
  all it needs, with nothing stretched.
- **Why it was revised**: the first design used one scene covering the whole banner. On very
  wide screens, covering crops the sky, which moved the horizon and the sun up behind the text.
  Now the strip has a fixed height, so the horizon is always below the text.
- **Rationale**:
  - **Shape**: a background that covers keeps the scene's proportions at every width (FR-005).
  - **Loading**: Vite inlines a small asset into the CSS, or hashes it into `assets/`, which the
    service worker caches. So it works offline and arrives with the stylesheet (FR-012,
    SC-004).
  - **Accessibility**: it's decoration, so a CSS background keeps it out of the accessibility
    tree.
- **Alternatives considered**:
  - **Inline SVG in the component**: more markup on every render, and it mixes art into the
    React code.
  - **A PNG**: blurry on retina screens, and heavier.
  - **Several CSS gradients**: the striped sun and perspective grid aren't practical that way.

## 2. The icon on the banner

- **Decision**: An `<img src="/icon.svg" alt="">`, 52 px on desktop and 42 px on phones, with a
  cyan ring and a pink glow (`box-shadow`).
  - **Offline**: the service worker's install step now caches `/icon.svg` alongside
    `/config.json`.
  - **Source**: `public/icon.svg` stays the single source, as feature 006 set up.
- **Rationale**:
  - **Offline**: the worker serves non-asset files network-first, and caches them only after a
    visit. A first offline launch after an update could otherwise miss the icon (FR-012).
  - **Imports**: Vite doesn't allow importing from `public/`. Moving the source would change
    006's icon script for no gain.
  - **Accessibility**: the title next to it names the link, so the image is decorative
    (`alt=""`).
- **Alternatives considered**:
  - **A copy of the icon in `src/assets`**: two sources that could drift apart.
  - **The 192 px PNG**: blurrier than the SVG at 52 px on retina.

## 3. "Job Tracker" on phones

- **Decision**: The title link holds two spans, the long title and "Job Tracker". CSS hides one
  or the other at 1,024 px. Below that, the full title doesn't fit beside the nav (which moves
  into the banner at 640 px) and the add button.
  - **Accessible name**: the link has `aria-label="Job Opportunity Tracker"`, so its name is the
    same on every screen. The `h1`'s name is unchanged, and so are the existing tests.
- **Rationale**: no JavaScript, so there's no layout flash and nothing to mutate. The page's
  heading stays the full name for screen readers.
- **Alternatives considered**:
  - **`useMediaQuery`**: adds a render-time branch for a purely visual change.
  - **Letting CSS truncate the title**: it would read "Job Opportunity Tr…".

## 4. Readable text on the banner, and contrast checks

- **Decision**:
  - **Layout**: the banner's content (icon, title, nav, button) sits above the scene's strip
    (§1). Its bottom padding is the strip's height. Above the strip the sky runs only from
    `#140230` to `#5b1683`, and white text on it is at least 11:1.
    - **Larger text**: the banner has a `min-height`, not a fixed height, so it grows with the
      text and the strip stays below it.
  - **Text styling**: the title gets a dark `text-shadow` as a backstop. Nav links are white,
    and the current page is underlined in cyan.
  - **Button**: the add button is `#ff3fd8` with `#12002a` text (6.6:1).
  - **Focus**: the outline on the banner is `#00f0ff` (7.9:1 on `#5b1683`).
  - **Tests**: `tests/theme.test.ts` parses the light and dark token blocks in `global.css` and
    checks each pair that's used together. It checks text on the page, card and column
    backgrounds, the accent, muted, warning and focus colours, and the control border at 3:1. A
    second test checks the banner tokens against the sky colours behind the content.
    `e2e/theme.spec.ts` checks the content's boxes sit above the strip.
- **Rationale**: axe can't measure text on a background image; it reports it as "needs review",
  not a failure. So the banner's contrast is guaranteed by its layout and checked by our own
  tests. The rest of the site is checked both ways: by the token test, and by axe in light and
  dark on every page.
- **Palette** (contrast with its background):

  | Token | Light | Dark |
  |---|---|---|
  | `--color-bg` (page) | `#faf7ff` | `#12002a` |
  | `--color-surface` (cards, forms) | `#ffffff` | `#1f0b3e` |
  | `--color-column` (board column) | `#f3edfb` | `#180534` |
  | `--color-text` | `#1d1030` (17.0) | `#f3ecff` (15.5 on surface) |
  | `--color-text-muted` | `#5f5277` (6.2 on column) | `#b9a8d6` (8.2) |
  | `--color-border` (decorative) | `#e4dcf0` | `#3b2563` |
  | `--color-control-border` | `#8f80aa` (3.6) | `#7a62a8` (3.5) |
  | `--color-accent` | `#b8146f` (5.4 on column) | `#ff4fa3` (5.9) |
  | `--color-accent-text` | `#ffffff` (6.2) | `#12002a` (6.5) |
  | `--color-danger` (warning) | `#b54708` (4.7 on column) | `#ffb547` (10.2) |
  | `--color-focus` | `#0e7490` (5.1) | `#00f0ff` (14.1) |

- **Alternatives considered**: a translucent dark panel behind the banner's text. It's safer for
  contrast, but it hides the scene the owner chose.

## 5. A warning colour that isn't the accent

- **Decision**: Warnings (a due follow-up, errors, and the remove confirmation's button) move from
  red to burnt orange `#b54708` in light and amber `#ffb547` in dark.
  - **Test**: `theme.test.ts` checks the warning and accent hues are at least 40° apart.
- **Rationale**: today's dark red (`#ff8a7a`) is close to the new neon pink, and light red is
  close to magenta. Orange and amber stay distinct from both, and still read as "attention".
- **Alternatives considered**:
  - **Keeping red and adding an icon**: the borders on due cards would still look like the accent.
  - **Cyan**: it reads as information, not a warning.

## 6. The iPhone status bar

- **Decision**:
  - **Status bar**: `apple-mobile-web-app-status-bar-style` becomes `black-translucent`, and the
    viewport adds `viewport-fit=cover`.
  - **Banner padding**: the banner adds `env(safe-area-inset-top)` above its content and the
    left and right insets at its sides, so the sky runs behind the clock and the notch.
  - **Bottom nav**: it adds `env(safe-area-inset-bottom)` for the home indicator.
  - **Theme colour**: `theme-color` is `#140230` for both schemes, and so is the manifest's
    `theme_color`. That's the browser's toolbar tint and the app switcher.
  - **Splash background**: `background_color` becomes the new light page colour.
- **Rationale**:
  - **`default` status bar**: it gives a plain white or black bar above the banner.
  - **`black-translucent`**: it's the only way to put the banner's colour behind the iPhone
    clock.
  - **The insets**: they're zero on other devices, so the website is unaffected.
- **Alternatives considered**: `black`, a solid black bar. It's close, but it doesn't match the
  purple.

## 7. Test tags

- **Decision**: A new `theme` tag (feature 008) for `tests/theme.test.ts` and
  `e2e/theme.spec.ts`. `src/assets/banner-scene.svg` maps to `theme`. `Layout.tsx`,
  `global.css` and `index.html` keep their current tags: core, and installable for the head.
- **Rationale**: the tag-check script requires every test to have a tag, and a change to the
  scene then runs only the theme tests.
