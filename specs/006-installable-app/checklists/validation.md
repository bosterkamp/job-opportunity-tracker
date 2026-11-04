# Validation: Installable App

**Purpose**: Record that feature 006 works, locally and on real phones, before calling it done.
**Started**: 2026-10-29

Built locally only, on top of feature 005. It's pushed when the owner says so (tasks.md T023).

## Automated (local, 2026-10-29)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass.
  `/sw.js` builds as one self-contained script with its build id and asset list filled in
- [x] All tests pass: 1,320 in 67 files. Coverage: 99.82% statements, 99.18% branches, 99.63%
  functions, 99.87% lines (the gate is 80%)
- [x] End-to-end: the full suite passes on every project (77 runs), including
  `e2e/installable.spec.ts` against a production build:
  - the manifest and its icons
  - opening offline, with one offline message, then recovering
  - a new build replacing the old one on the next load
- [x] Mutation testing with `--force`, static mutants included, on every source file the feature
  changed (`main.tsx` and the worker's entry `sw.ts` are thin entry points, excluded as listed in
  the plan): 100%
- Found by the end-to-end test:
  - **Scripts missed offline**: the server answers "Vary: Origin", and the app's scripts are
    requested with an Origin header, so offline every cached script missed. Cache lookups now
    ignore Vary
  - **Two offline messages**: opening offline showed the message twice (open and closed lists);
    now it shows once

- [x] **Architecture diagrams** (constitution 5.1.0): the README's diagram now shows the
  installed app and its service worker, with a note on what it caches. The diagrams are now
  Mermaid, checked by rendering them with Mermaid 11.4.1:
  - the README's system layout, and a new sign-in sequence (including opening offline)
  - feature 001's stage diagram, now a state diagram
  - the last two text drawings (001's first architecture sketch, 002's form states), so every
    diagram follows constitution 5.2.0

## By hand (needs the owner, after deploy; quickstart.md)

The iPhone can't be tested automatically: Playwright's WebKit doesn't run service workers.

Checked by the owner on 2026-10-29, after the deploy:

- [x] **iPhone**:
  - Share → Add to Home Screen shows "Job Tracker" with the launching-briefcase icon
  - it opens full screen on the board
- [x] **iPhone sign-in**: sign out, then sign in from the installed app. You finish in the app,
  not in Safari. If not, follow research.md §5's fallback
- [x] **iPhone links**: a posting link opens in Safari, and the app stays where it was
- [x] **Desktop**: the website looks and works as before

Checked by the owner on 2026-10-30, after feature 008's deploy:

- [x] **iPhone offline**: in airplane mode, the app opens and says it's offline
- [x] **iPhone updates**: after the next deploy, the change shows on the next launch (008's new
  look arrived)

Android isn't checked: the owner uses an iPhone only.

## Deployed

- [x] Pushed and merged when the owner said so, together with feature 005, in PR #31
- [x] The deploy's smoke test passes
