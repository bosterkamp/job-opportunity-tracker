# Quickstart: Offer Weights and a Settings Page

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-25

How to check that feature 014 works, locally and once deployed. The rules are in
[data-model.md](./data-model.md) and the routes and tools in
[contracts/changes.md](./contracts/changes.md).

## Prerequisites

- Docker Desktop running (DynamoDB Local), `npm ci`, and Playwright's browsers
  (`npx playwright install`).
- For the deployed checks: the app deployed from `master`, signed in, and Claude's Job Tracker
  connector connected. Reconnect it if Claude doesn't list `set_offer_weights`.

## Automated

```sh
npm run lint
npm run typecheck
npm test                                   # Vitest: shared, API, MCP and web
npm run test:e2e -- --grep @offer          # desktop Chrome and iPhone
npm run test:mutation -- --mutate "<the changed source files>"
```

Expected:
- Everything passes.
- Coverage stays at least 80% and the mutation score at least 95%.
- The unit test comparing the weighted overall, with every weight Normal, against the plain
  average passes for every case.

## By hand (local `npm run dev`, then deployed)

1. **Nothing changes until you set a weight.**
   - Record the overall scores of two or three scored offers on the comparison.
   - Open **Settings**: every detail is "1 · Normal".
   - Go back: the overall scores are the same as before.
2. **Weigh what matters.**
   - On Settings, set Base salary to "3 · Critical" and Title to "0 · Ignore". Each change says
     "Saved" with no Save button.
   - Reload: both are kept.
3. **The overall follows.**
   - On a comparison, check an offer scored 5 on base salary, 2 on a Normal detail and 1 on
     title: its overall is 4.3, the same as on the Offers page and the opportunity's Offer
     section.
   - The Base salary row reads "Base salary · Critical", and the Title row "Title · Ignored,
     doesn't count".
4. **Custom fields live on Settings.**
   - The Offers page and the comparison have no field controls, only a link to Settings.
   - On Settings, add "Commute": it's Normal, in every offer's form, and a row on the
     comparison.
   - Set it to Important, rename it, then move it.
   - Remove it and confirm: it's gone, with its importance.
5. **Two places at once.**
   - Open Settings in two tabs. Change a weight in one, then in the other.
   - The second is refused with "Settings changed since you loaded them. Reload and try
     again.", and nothing is overwritten.
6. **Claude.**
   - Ask Claude to make the commute critical (add the field first): Settings shows it.
   - Ask Claude how your offers compare: its overall scores match the web app's.
   - Ask it to remove a custom field: it says that's done in the web app.
7. **iPhone.**
   - The bottom bar shows Overview, Leads, Offers, Archive and Settings, each easy to tap,
     with nothing drawn over it.
   - Settings fits the screen without sideways scrolling, in light and dark.
