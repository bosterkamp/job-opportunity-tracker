# Validation: Retro Theme

**Purpose**: Record that feature 008 works, locally and on the owner's iPhone, before calling it
done.
**Started**: 2026-10-29

## Automated (local, 2026-10-29)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,370 in 68 files. Coverage: 99.82% statements, 99.17% branches,
  99.63% functions, 99.87% lines (the gate is 80%)
- [x] `tests/theme.test.ts`: every colour pair used together meets WCAG AA in light and dark
  (text 4.5:1; control borders and focus 3:1). The banner's text, button and focus colours pass
  on its sky. Warnings are at least 40° of hue from the accent. No stylesheet, head tag or
  manifest still uses the old colours
- [x] End-to-end: the full suite passes on desktop and iPhone (77 runs, 9 skipped by design).
  That includes axe on every page and dialog in light and dark, and `e2e/theme.spec.ts`:
  - the banner on every page, about 150 px tall on desktop and 120 px on the iPhone
  - at 320, 390, 640, 1,024, 1,280, 1,920 and 2,560 px: nothing overlaps, nothing scrolls
    sideways, and the content sits on the sky above the scene
  - "Job Tracker" below 1,024 px and the full title from there
  - with 200% text the banner grows, and the content stays above the scene
  - a cyan focus outline on the banner's links and button
- [x] Mutation testing on the changed source files (`Layout.tsx`, `sw/worker.ts`): 100% (59 killed, none survived).
  The CSS and SVG aren't mutated
- [x] Screenshots of the overview, an opportunity and the add form, at 1,280 px and on the
  iPhone, in light and dark, compared with the owner's mockup A: they match, with no blue left
- Changed while building (research §1, §3): the scene is a fixed-height strip along the banner's
  bottom under a CSS sky, instead of one image covering the banner. Covering cropped the sky on
  wide screens and moved the sun behind the text. The short title is used up to 1,024 px, where
  the full one doesn't fit beside the nav and button

- [x] **Architecture diagrams** (constitution 5.1.0): the README's system diagram now lists the
  icon among the files the app loads from CloudFront (the service worker caches it at install).
  A new "Look" note describes the banner, the colour tokens and the contrast test. The README's
  two Mermaid diagrams were checked by rendering them with Mermaid 11.4.1. No other diagram
  shows styling, so the others are unchanged

## By hand (needs the owner, after deploy; quickstart.md)

Checked by the owner on 2026-10-30, after the deploy:

- [x] **iPhone banner**: the installed app's purple sky runs up behind the clock and battery,
  with no white or black strip, and the banner and colours match the icon
- [x] **iPhone bottom bar**: it sits above the home indicator. Overview and Archive stay in the
  bottom bar on the phone, as designed (FR-003), and the owner is happy with that
- [ ] **iPhone offline**: in airplane mode the banner, icon and colours all appear (with 006's
  open offline and update checks). **Failed on 2026-10-30**: the app shows only "You're offline.
  Sign in again once you're connected.", with no banner. The sign-in is kept for the session
  only, which iOS ends when the app is closed, and the sign-in screen is drawn outside the
  banner. Local end-to-end tests have no sign-in, so they didn't catch it
  - **Fixed** (owner's choice: the banner and staying signed in): the sign-in is kept on the
    device, and offline a kept one opens the app, even once expired, so the banner and the
    pages' offline messages show. A token refresh that fails offline no longer shows "Sign-in
    failed". `tests/auth.test.tsx` covers each case; mutation 100% on `AuthProvider.tsx` (one
    equivalent mutant marked). Needs the owner's iPhone check again after the deploy
- [x] **Safari**: the website's toolbar is tinted purple

## Deployed

- [x] Merged when the owner said so, with the `validation-notes` commit for 005 and 006, in
  PR #32
- [x] The deploy's smoke test passes
