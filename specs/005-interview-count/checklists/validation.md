# Validation: Interview Count

**Purpose**: Record that feature 005 works, locally and deployed, before calling it done.
**Started**: 2026-10-26

Built locally only. It's pushed when the owner says so (tasks.md T028).

## Automated (local, 2026-10-26)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All tests pass: 1,277 in 64 files. Coverage: 99.82% statements, 99.14% branches, 99.62%
  functions, 99.87% lines (the gate is 80%)
- [x] End-to-end: the full suite passes on every project (74 runs), including
  `e2e/interviews.spec.ts`
- [x] Mutation testing with `--force`, static mutants included, on every source file the feature
  changed. The first run was 97.91% with 22 survivors. Each was fixed:
  - **Simpler code**: the route's limit pre-check, which only repeated the transaction's
    check, was removed; the date added's earlier limit now comes from one sort
  - **New tests**:
    - the confirm header, the form's own submit, and a cleared date
    - the remove dialog's busy state, keys, and focus
    - Cancel closing the form and forgetting a failed save
    - unique list keys
    - an interview can't be added to a missing opportunity
  - **One equivalent mutant**, disabled with its reason (setting an undefined date problem
    shows nothing either)

  The rerun of the seven affected files is at 100%
- Fixed during the work:
  - **A dated test**: a feature 001 test's follow-up date (2026-10-24) had passed, so the
    detail page added "Follow up now". It's now 2099-10-24
  - **The Closed column cut off on desktop** (reported by the owner, from feature 004): six
    columns at 12rem each needed 1,212 px but the page allowed 1,120 px, so Closed ran off the
    side. The columns now share the width, the board may use up to 96rem, and the board starts
    at 1280 px (tabs below that). A new end-to-end test checks it at 1280 and 1920 px
- **Process slip**: one commit (`e22e729`) went in before its lint ran, because a failed
  task-list script stopped the chain but `;` let the commit through. Lint on that exact state
  passed afterwards. Later commits run each check and stop on failure

- [x] **Architecture documents** (constitution 5.1.0):
  - the README's diagram is unchanged: interviews use the same table, API, and MCP functions
  - the README's Data note and feature 001's table layout now include interview items and the
    interview count, and the table layout links each later feature's data model

## By hand (needs the owner)

Checked by the owner on 2026-10-29, after the deploy: all pass.

- [x] **US1**: log an interview today and one last week with a note; both appear in the history
  in date order, and the stage doesn't change
- [x] **US2**:
  - a card shows "2 interviews" at the top right, and a card without interviews shows nothing
  - a closed opportunity's card keeps its count in the Closed column and the Archive
  - at 6 interviews, "Add interview" is replaced by the limit message
- [x] **US3**:
  - edit an interview's date and note
  - remove one after confirming; Cancel keeps it
  - moving the date added after the first interview is refused
- [x] **US4** (after deploy):
  - "I had a panel interview with Farmers today" logs it, marked "via Claude"
  - "That Farmers interview was yesterday" moves it
  - asking Claude to remove one is declined

## Deployed

- [x] Pushed and merged when the owner said so, in PR #31 (T028)
- [x] The deploy's smoke test passes
