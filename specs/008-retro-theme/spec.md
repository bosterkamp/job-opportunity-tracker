# Feature Specification: Retro Theme

**Feature Branch**: `008-retro-theme`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Create a banner at the top of the web and mobile version that
expands upon the icon. I think that would be a good way to add some style to the page.
Incorporate those colors into the whole site actually." The owner chose concept A, "Sunset
horizon", from three mockups on 2026-10-29: a tall banner showing the icon's whole 90s scene (sky,
striped sun, neon grid, sparkles), with the icon, a glowing title, the navigation and a neon-pink
"Add opportunity" button on it.

## Clarifications

### Session 2026-10-29

- Q: Which banner style? → A: Concept A, "Sunset horizon" (the tallest, with the full scene).
  Not B (a slim neon bar) or C (the title centred in front of the sun).
- Q: Does the System/Light/Dark option (feature 007) come with this feature? → A: No answer
  yet; it stays a separate feature. This feature follows the device's light or dark setting,
  as the site does today, and gives both a light and a dark version of the new colours.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A banner that matches the app icon (Priority: P1)

I open the tracker, on my computer or from the icon on my iPhone's home screen, and the top of
every page shows the same 90s sunset as the icon: a purple-to-pink sky, a striped sun, a neon
grid, and sparkles. The icon and the app's name sit on it, with the navigation and the "Add
opportunity" button, so the app feels like one designed thing from the icon onward.

**Why this priority**: This is what the owner asked for first, and it's the most visible
change.

**Independent Test**: Open each page on a desktop browser and on the installed iPhone app; the
banner is at the top, with the icon, title, navigation and add button, and every one of them
still works.

**Acceptance Scenarios**:

1. **Given** any page on a computer, **When** it opens, **Then** the banner across the top shows
   the sky, the striped sun, the neon grid with a cyan horizon line, and sparkles; the icon
   with a cyan glow; the title "Job Opportunity Tracker" in bold, glowing white lettering; the
   Overview and Archive links; and the neon-pink "Add opportunity" button.
2. **Given** the installed app or the website on a phone, **When** a page opens, **Then** the
   banner is shorter, the title reads "Job Tracker", the add button is on the banner, and the
   Overview and Archive links stay in the bar at the bottom of the screen, as today.
3. **Given** the banner, **When** the owner selects the title or icon, **Then** they go to the
   overview, as the title does today; the links and the add button go where they do today.
4. **Given** the iPhone's installed app, **When** it opens, **Then** the status bar area above
   the banner uses the banner's dark purple, not white or grey.
5. **Given** a very narrow screen (320 points wide) or a very wide one (2,560 pixels), **When**
   the page opens, **Then** the title, button and links don't overlap or get cut off, and the
   scene fills the banner's width without stretching out of shape.

---

### User Story 2 - The icon's colours across the whole site (Priority: P2)

Below the banner, the rest of the app uses the same colours: in light mode a soft lavender page
with white cards and magenta buttons, links, interview counts and selected stage tabs; in dark
mode a deep purple page and cards with neon-pink accents. The app looks consistent everywhere,
not just at the top.

**Why this priority**: The owner asked for it as the second part of the request; the banner is
useful on its own without it.

**Independent Test**: Visit every page (overview board, stage tabs on a phone, archive, an
opportunity, the add and edit forms, the history, interviews, sign-in screens shown by the app,
the offline message, and error messages) in light and in dark mode and check that each uses the
new colours, with nothing left in the old blue.

**Acceptance Scenarios**:

1. **Given** the device is in light mode, **When** any page opens, **Then** the page background
   is soft lavender, cards and forms are white, and buttons, links, interview counts and the
   selected stage tab are magenta.
2. **Given** the device is in dark mode, **When** any page opens, **Then** the background is deep
   purple, cards and forms are a slightly lighter purple, and the accents are neon pink.
3. **Given** the device switches between light and dark while the app is open, **When** it
   switches, **Then** the app follows without a reload, as it does today.
4. **Given** an opportunity's follow-up is due, or an error is shown, **When** it appears,
   **Then** it still stands out in the warning colour, clearly different from the magenta or
   pink accents.

---

### Edge Cases

- **Offline**: the banner and colours appear when the installed app opens offline, the same as
  online; nothing in them is fetched from elsewhere.
- **Reduced motion**: if anything in the banner moves (for example the sparkles), it stays still
  when the device asks for reduced motion. Moving parts aren't required.
- **Larger text**: with the browser or phone text size increased to 200%, the banner grows to
  fit the title and button, and nothing overlaps.
- **Keyboard**: the focus outline on the banner's links and button is visible against the
  banner, and on the rest of the site against the new colours.
- **Printing**: not covered; the site has no print layout today.
- **Slow connections**: the banner shows at once with the page; it doesn't arrive later and push
  the content down.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every page MUST show a banner across the top, in the style of the app icon: a sky
  that goes from deep purple at the top to pink at the horizon, a striped yellow-to-pink sun, a
  dark neon grid floor in pink with a cyan horizon line, and white sparkles.
- **FR-002**: The banner MUST show, from left: the app icon with a cyan glow, then the title in
  bold, glowing white lettering; the title MUST read "Job Opportunity Tracker" on wider screens
  and "Job Tracker" on phones and narrower tablets, where the full title doesn't fit.
- **FR-003**: The banner MUST hold the "Add opportunity" button, in neon pink with dark text,
  and, on screens wider than a phone, the Overview and Archive links, with the current page's
  link underlined in cyan. On phones the links MUST stay in the bottom bar.
- **FR-004**: The banner MUST be about 150 pixels tall on a computer and about 120 on a phone,
  and MUST grow when larger text needs more room. It MUST NOT cover page content or stay fixed
  over it while scrolling.
- **FR-005**: The banner's scene MUST keep its shape at every screen width, from 320 to at least
  2,560 pixels, showing more or less of its sides rather than stretching.
- **FR-006**: The banner MUST look the same in light and dark mode; it's the night scene in both.
- **FR-007**: The rest of the site MUST use the new colours, in a light and a dark version:
  - light: soft lavender background, white cards, forms and dialogs, dark purple text, magenta
    accents;
  - dark: deep purple background, slightly lighter purple cards, forms and dialogs, near-white
    text, neon-pink accents.
  Accents cover buttons, links, the interview count, the selected stage tab, the current page's
  link in the bottom bar, and focus outlines.
- **FR-008**: Warnings (a follow-up that's due, errors, and confirming a removal) MUST keep a
  distinct warning colour that can't be mistaken for the accent.
- **FR-009**: All text and controls MUST meet WCAG 2.1 AA contrast in both versions, on the
  banner and everywhere else: 4.5:1 for normal text, 3:1 for large text, icons, borders of
  controls, and focus outlines.
- **FR-010**: The site MUST follow the device's light or dark setting, switching while open, as
  it does today.
- **FR-011**: The installed app's theme colour (the iPhone's status bar area and the app
  switcher) and the browser's theme colour MUST match the banner's dark purple.
- **FR-012**: The banner and colours MUST work offline in the installed app, with no extra
  downloads from other sites, and MUST NOT delay the page's first appearance noticeably.
- **FR-013**: Nothing other than appearance MUST change: the board's layout and breakpoints,
  every page's contents and behaviour, the data, the assistant connection and the service
  behind the app stay the same.
- **FR-014**: Any movement in the banner MUST stop when the device asks for reduced motion.
- **FR-015**: The project's architecture diagrams MUST be checked, and the validation record
  MUST say whether they changed (constitution, Development Workflow).

### Key Entities

None. This feature changes only how the app looks; no data is added or changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every page, in light and dark mode, on a computer and an iPhone, the banner and
  new colours appear, and an automated accessibility check finds no contrast failures.
- **SC-002**: No page shows the old blue accent after the change.
- **SC-003**: At widths of 320, 390, 640, 1,024, 1,280, 1,920 and 2,560 pixels, nothing in the
  banner overlaps or is cut off, and the page doesn't scroll sideways.
- **SC-004**: The page appears as quickly as before: the first view of the overview takes no
  more than a tenth of a second longer, measured on the same connection.
- **SC-005**: All of the app's existing checks of its pages and workflows pass unchanged, apart
  from ones that test the old colours or header.
- **SC-006**: The owner, opening the installed app on their iPhone, says the banner and colours
  match the icon.

## Assumptions

- The colours come from the icon: deep purple #140230 to #5b1683, pink #ff4fa3, neon pink
  #ff3fd8, sun yellow #ffe23b to pink #ff2f7d, cyan #00f0ff, grid floor #12002a. Exact shades for
  text and accents are adjusted in the plan to meet the contrast requirement (for example a
  darker magenta on white).
- The mockup the owner chose (concept A) is the reference for the look; the plan may refine
  spacing and sizes.
- The System/Light/Dark choice is feature 007, built separately; this feature gives it both
  versions of the colours to switch between.
- The sign-in pages run by the sign-in service (outside the app) keep their own look; only what
  the app itself shows changes.
- The icon files don't change.
- Sparkles may be still; animation isn't required.
