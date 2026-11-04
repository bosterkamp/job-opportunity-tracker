# Feature Specification: Appearance Option

**Feature Branch**: `007-appearance-option`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Add an option for dark mode." Clarified with the owner on
2026-10-29: "Add an appearance option so the owner can choose System, Light, or Dark. System is
the default and keeps today's behaviour (the app follows the phone or computer's dark mode
setting); Light and Dark override it. The choice is remembered on each device (browser or
installed app), works offline, and applies immediately and on the next launch without a flash of
the wrong colours. No change to stored opportunity data or the API. The installed app's status
bar colours follow the chosen appearance."

## Clarifications

### Session 2026-10-29

- Q: Which choices should the option offer? → A: System, Light, and Dark. System is the
  default and keeps today's behaviour; Light and Dark override the device's setting.
- Q: Where is the choice remembered? → A: On each device (each browser, and the installed
  app), not in the owner's account. Phone and computer can differ.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose dark or light, whatever my device is set to (Priority: P1)

My phone is in light mode, but I want the tracker dark (or the other way round). I open the
appearance option and choose Dark, and the whole tracker turns dark straight away, on every
page.

**Why this priority**: It's the feature: today the tracker can only follow the device.

**Independent Test**: With the device in light mode, choose Dark and check every page is dark;
with the device in dark mode, choose Light and check every page is light.

**Acceptance Scenarios**:

1. **Given** the device is in light mode and the tracker shows light colours, **When** I choose
   Dark, **Then** the tracker turns dark at once, without reloading, and stays dark on every
   page I visit.
2. **Given** the device is in dark mode, **When** I choose Light, **Then** the tracker turns
   light at once.
3. **Given** any page, **When** I look for the option, **Then** I reach it in at most two taps
   or clicks, and it shows which choice is active.
4. **Given** I chose Dark, **When** I open a dialog, a form, or the stage menu, **Then** it's
   dark too, and text stays as readable as in today's dark mode.

---

### User Story 2 - My choice is remembered on this device (Priority: P1)

Once I've chosen, the tracker opens in that appearance every time on that device, including
the installed app and when I'm offline, without first flashing the other colours.

**Why this priority**: An option that resets, or flashes white before turning dark, isn't worth
having.

**Independent Test**: Choose Dark, close the browser or app, and reopen it, online and offline;
check it opens dark from the first frame.

**Acceptance Scenarios**:

1. **Given** I chose Dark, **When** I reload, or close and reopen the browser or installed app,
   **Then** it opens dark, with no flash of light colours first.
2. **Given** I chose Dark on my phone, **When** I open the tracker on my computer, **Then** the
   computer keeps its own choice (System, unless I changed it there).
3. **Given** I chose Light, **When** I open the installed app offline, **Then** it opens light,
   showing the offline message.
4. **Given** I chose Dark in the installed app, **When** I look at the phone's status bar area,
   **Then** it matches the dark colours rather than the device's setting.

---

### User Story 3 - Go back to following my device (Priority: P2)

I choose System again, and the tracker goes back to following my phone or computer, including
when the device switches between light and dark by itself (for example at sunset).

**Why this priority**: It's today's behaviour, so it must stay reachable, but it's the default
and rarely changed.

**Independent Test**: Choose Dark, then System; switch the device between light and dark and
check the tracker follows each time.

**Acceptance Scenarios**:

1. **Given** I chose Dark and the device is in light mode, **When** I choose System, **Then**
   the tracker turns light at once.
2. **Given** System is chosen, **When** the device switches between light and dark while the
   tracker is open, **Then** the tracker follows without a reload.
3. **Given** I never chose anything on this device, **When** I open the tracker, **Then** it
   behaves exactly as it does today (System).

---

### Edge Cases

- **Remembering isn't possible**: If the browser can't remember the choice (for example a
  private window that blocks saving), the chosen appearance still applies until the page is
  closed, and the tracker opens as System next time. Nothing breaks.
- **An unknown saved value**: If what's remembered isn't one of the three choices (for example
  after a future change), the tracker uses System.
- **Signed out**: The sign-in page belongs to the sign-in service and follows the device; the
  tracker's own "Signing in…" and offline messages follow the chosen appearance.
- **Several tabs open**: Changing the choice in one tab is picked up by the others at the
  latest when they're next opened or reloaded.
- **Colours stay accessible**: Every combination of text and background meets the same contrast
  as today's light and dark modes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tracker MUST offer an appearance option with three choices: System, Light,
  and Dark.
- **FR-002**: System MUST be the default, and with System the tracker MUST look and behave
  exactly as it does today, following the device's setting, including changes while open.
- **FR-003**: Light and Dark MUST apply the tracker's existing light or dark colours to every
  page, dialog, and menu, regardless of the device's setting.
- **FR-004**: A change MUST apply at once, without a reload, and MUST NOT lose anything being
  typed or saved.
- **FR-005**: The option MUST be reachable from every page in at most two taps or clicks, MUST
  show the active choice, and MUST be usable with a keyboard and a screen reader.
- **FR-006**: The choice MUST be remembered on the device (each browser and the installed app
  separately) and used from the first frame on every later visit, online or offline, with no
  flash of the other colours.
- **FR-007**: The installed app's status bar area and the browser's toolbar colour MUST follow
  the appearance in use.
- **FR-008**: The choice MUST NOT be stored in the owner's account or sent to the tracker's
  server; no opportunity data or interface changes.
- **FR-009**: If the choice can't be remembered or is unreadable, the tracker MUST fall back to
  System without an error.

### Key Entities

- **Appearance choice**: System, Light, or Dark; one per device, kept on that device only. Not
  part of the owner's opportunity data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Changing the appearance takes at most two taps or clicks from any page, and the
  new colours show in under half a second.
- **SC-002**: On 100% of later launches on the same device, online or offline, the tracker opens
  in the chosen appearance with no visible flash of the other colours.
- **SC-003**: With System chosen, or nothing chosen, the tracker is indistinguishable from today.
- **SC-004**: Every page, dialog, and menu shows the chosen appearance, with text meeting the
  same contrast as today (at least 4.5:1 for body text).

## Assumptions

- **Existing colours**: Light and Dark reuse the tracker's existing light and dark colours; no
  new palette or accent colours.
- **Per device, not per account**: As chosen by the owner, so it works offline and needs no
  server change. Syncing across devices can come later if wanted.
- **Sign-in pages**: The sign-in service's own pages aren't the tracker's and keep following
  the device.
- **Claude's connector is unaffected**: Claude shows its own interface.
- **No scheduled switching**: Beyond following the device (System), there's no option to switch
  at set times.
