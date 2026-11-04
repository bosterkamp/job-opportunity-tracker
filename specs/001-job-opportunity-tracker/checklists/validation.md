# Validation: Job Opportunity Tracker (T095)

**Purpose**: Record that feature 001 works, locally and deployed, before calling it done.
**Started**: 2026-10-18

## Automated (local), 2026-10-18

- [x] `npm run lint` and `npm run typecheck` pass
- [x] `npm run test:coverage`: 501 tests pass. Coverage: 100% statements, 99.13% branches,
  100% functions, 100% lines (the gate is 80%)
- [x] `npm run test:e2e`: 48 tests pass on desktop-chromium, plus the `@responsive` scenarios
  on mobile-webkit and mobile-chromium. This covers the quickstart steps 1–4 for every user
  story, and the accessibility checks (axe, WCAG 2.2 AA in light and dark mode, 44 px touch
  targets on phones, focus kept inside dialogs)
- [x] Mutation testing on the files changed in Phase 8: 100%, no surviving mutants (CI runs it
  across the whole codebase on `master`)

## Automated (deployed)

The smoke test (`e2e/deployed-smoke.spec.ts`) runs after every deploy in `deploy.yml`.

- [x] Before the Phase 8 deploy, against https://<distribution>.cloudfront.net: sign-in
  redirect, `/archive` fallback, the API's 401, and the CORS preflight pass. The
  security-headers check fails as expected, because the headers aren't deployed yet
- [x] After the Phase 8 deploy (2026-10-19, commit `ce05a09`): all five checks pass in the
  `deploy` job, including the security headers

## By hand, signed in (needs the owner)

The deployed app needs a real Cognito sign-in, so these can't be automated in CI. Use
https://<distribution>.cloudfront.net and the steps in [quickstart.md](../quickstart.md).

| Check | Desktop | Phone |
|---|---|---|
| Sign in through Cognito, and sign out | [ ] | [ ] |
| 1. Capture (US1): quick add, the required-title error, a full add that survives a reload | [ ] | [ ] |
| 2. Pipeline (US2): move with a note and an earlier date, skip and go back, close and reopen | [ ] | [ ] |
| 3. Overview (US3): columns on desktop, stage tabs and the bottom sheet on the phone; filter, sort, search | [ ] | [ ] |
| 4. Edit (US4): stars 3 → 5, a follow-up today is highlighted, clearing the company is blocked; delete needs the company name | [ ] | [ ] |
| No errors after a few minutes signed in (the session renews without a sign-in loop) | [ ] | [ ] |

### Timing goals

Time each with a stopwatch on the deployed app, from the overview.

| Goal | Target | Desktop | Phone |
|---|---|---|---|
| SC-001: quick add (company and title) | under 30 s | | |
| SC-001: full add (every field) | under 2 min | | |
| SC-002: move to another stage | under 10 s | | |

## Notes

- Record any problem found by hand here, with the date, and open a GitHub issue for it.
