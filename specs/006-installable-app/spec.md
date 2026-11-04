# Feature Specification: Installable App

**Feature Branch**: `006-installable-app`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Make the tracker installable as an app on the owner's phone (a progressive web app), option 1 of the three discussed on 2026-10-29: no app store, no native shell. The owner can add it to the iPhone home screen (Safari, Share → Add to Home Screen) and install it on Android (Chrome, Install app); it then opens from its own icon, full screen, without browser bars, and looks like an app (name, icon, colours). Signing in, every page, and updates keep working as on the website; a new deploy reaches the installed app without reinstalling. When offline, the installed app still opens and says it's offline (as the site does today), rather than showing a browser error. Push notifications are out of scope (they belong with the follow-up reminders, issue #1). Desktop browsers may also offer to install it."

## Clarifications

### Session 2026-10-29

- Q: Which way to put the tracker on the phone? → A: An installable web app, with no app
  store and no native shell (option 1 of 3). A native wrapper or rewrite can come later if
  needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install it on my phone (Priority: P1)

On my iPhone I open the tracker in Safari, choose Share → Add to Home Screen, and the tracker
appears on my home screen with its own icon and name. On Android, Chrome offers "Install app".
Tapping the icon opens the tracker full screen, without the browser's address bar, like any
other app.

**Why this priority**: It's the point of the feature: getting to the tracker in one tap.

**Independent Test**: Add it to an iPhone home screen and install it on an Android phone. Check
the icon, the name under it, and that it opens without browser bars.

**Acceptance Scenarios**:

1. **Given** the tracker open in Safari on an iPhone, **When** I choose Share → Add to Home
   Screen, **Then** the suggested name is "Job Tracker" and the icon is the tracker's own
   (not a screenshot of the page).
2. **Given** the tracker open in Chrome on Android, **When** I open the menu, **Then** it offers
   "Install app", and installing puts "Job Tracker" with its icon among my apps.
3. **Given** the installed app, **When** I tap its icon, **Then** it opens on the board, full
   screen, with no address bar or browser buttons, in the tracker's colours.
4. **Given** a desktop browser that supports installing web apps, **When** I visit the tracker,
   **Then** it may offer to install it too; nothing on the site depends on that.

---

### User Story 2 - Use it as I use the website (Priority: P1)

Everything works in the installed app as it does on the website: signing in, the board,
adding and editing opportunities, moving stages, interviews, and signing out. When I'm signed
out, signing in returns me to the installed app, not to a browser tab.

**Why this priority**: An installed app that can't sign in, or loses its place, is worse than
the website.

**Independent Test**: In the installed app on each phone, sign out, sign in, add an opportunity,
move it, log an interview, and close and reopen the app.

**Acceptance Scenarios**:

1. **Given** the installed app and I'm signed out, **When** I sign in, **Then** I finish in the
   installed app, signed in, on the board.
2. **Given** I'm signed in, **When** I close the app and open it again later, **Then** I'm still
   signed in for as long as the website keeps me signed in.
3. **Given** the installed app, **When** I use any page, **Then** it behaves as the website
   does.
4. **Given** an opportunity's posting link, **When** I tap it, **Then** it opens in the browser,
   outside the app, so the app stays where I was.

---

### User Story 3 - Get updates without reinstalling (Priority: P2)

When a new version of the tracker is deployed, the installed app picks it up by itself. I
never need to remove and reinstall it.

**Why this priority**: Updates must keep flowing, but this works in the background.

**Independent Test**: With the app installed, deploy a visible change, then close and reopen the
app, and check the change is there.

**Acceptance Scenarios**:

1. **Given** a new version has been deployed, **When** I next open the installed app, or reload
   it, **Then** I get the new version, at most one launch later.
2. **Given** a new version, **When** it's picked up, **Then** I don't lose anything I was in the
   middle of saving.

---

### User Story 4 - Open it offline (Priority: P3)

When my phone has no connection, the installed app still opens. It tells me I'm offline, as the
website does today, rather than showing a browser error page.

**Why this priority**: It's rare, and nothing can be saved offline anyway, but a browser error
looks broken.

**Independent Test**: Turn on airplane mode, open the installed app, and check that it shows the
tracker with the offline message. Turn the connection back on and check the board loads.

**Acceptance Scenarios**:

1. **Given** no connection, **When** I open the installed app, **Then** it opens and says I'm
   offline, with no browser error page.
2. **Given** the connection comes back, **When** I'm on the board, **Then** it loads by itself,
   as the website does today.

---

### Edge Cases

- **Already installed**: Installing again does nothing harmful; there's still one app.
- **Uninstalling**: Removing the app from the home screen loses nothing, because all data lives
  in the owner's account, not on the phone.
- **Website and app together**: The website keeps working in the browser at the same address,
  and both show the same data.
- **Sign-in expired while closed**: Opening the app after the sign-in has expired asks the owner
  to sign in again, and returns to the app.
- **Dark mode**: The app's colours, and the colours of the phone's status bar area, suit both
  light and dark mode.
- **Offline beyond opening**: Saving while offline fails with the existing message; nothing is
  queued to send later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tracker MUST be installable to an iPhone home screen through Safari's "Add to
  Home Screen", and on Android through Chrome's "Install app", with the name "Job Tracker" and
  its own icon.
- **FR-002**: The installed app MUST open on the board, full screen, without browser bars, in
  the tracker's colours.
- **FR-003**: Signing in from the installed app MUST return to the installed app, signed in.
- **FR-004**: Every page MUST work in the installed app as it does on the website.
- **FR-005**: Links that leave the tracker (such as job postings) MUST open in the browser,
  outside the app.
- **FR-006**: A new deploy MUST reach the installed app by its next launch or reload, without
  reinstalling.
- **FR-007**: With no connection, the installed app MUST open and show the existing offline
  message instead of a browser error.
- **FR-008**: The website MUST keep working unchanged in the browser.
- **FR-009**: No opportunity data MUST be kept on the phone beyond what the website already
  keeps in the browser.

### Key Entities

None: no data changes. The app is the same tracker, presented as an app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the home screen, the board is ready in under 3 seconds on a normal mobile
  connection.
- **SC-002**: Installing takes under 30 seconds and at most three taps, on both an iPhone and an
  Android phone.
- **SC-003**: 100% of the website's pages and actions work in the installed app.
- **SC-004**: A deployed change appears in the installed app within one launch, without
  reinstalling.
- **SC-005**: With no connection, the installed app opens with the offline message in 100% of
  tries, never a browser error.

## Assumptions

- **No app store, no fees**: The owner installs it themselves; nothing is published.
- **Name and icon**: The app is called "Job Tracker" (short enough to fit under an icon), with a
  90s-style icon the owner chose: a chrome briefcase launching over a synthwave sunset
  (research §4).
- **Phones in use**: A current iPhone (iOS 16.4 or later) and current Android with Chrome.
- **Push notifications are out of scope**: They come with the follow-up reminders (issue #1).
- **Sign-in on iPhone**: Apps added to the home screen open sign-in pages from other sites
  inside the app on current iOS. This is checked on a real phone before the feature is called
  done, because it can't be tested automatically.
- **No offline editing**: Nothing is stored or queued for later; offline only means the app
  opens and says so. Offline editing is a later feature, filed as GitHub issue #30.
- **Claude's connector is unaffected**.
