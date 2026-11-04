# Validation: Board and Form Updates

**Purpose**: Record that feature 004 works, locally and deployed, before calling it done.
**Started**: 2026-10-20

Built locally only. The owner is near the monthly GitHub Actions limit, so nothing is pushed
until they say so (tasks.md T046).

## Automated (local, 2026-10-21)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All tests pass: 1,175 in 61 files. Coverage: 99.79% statements, 99.13% branches, 99.57%
  functions, 99.85% lines (the gate is 80%)
- [x] End-to-end: the full suite passes on every project (desktop Chromium, mobile WebKit, mobile
  Chromium), including `e2e/board-and-form.spec.ts`. One accessibility scan failed once on mobile
  Chromium and passed when rerun
- [x] Mutation testing on every source file the feature changed: 1,226 mutants. All are killed
  except one equivalent mutant, which is disabled with its reason (a select with no matching
  option chooses "Any", which is what `''` means). The last five files were rerun with `--force`,
  static mutants included, at 100%
- Found by mutation testing: the first salary schema tests had never been written to their file,
  because a shell command swallowed the edit script's input. They were added, and the mutants
  they cover are killed
- Fixed during validation: the date-added end-to-end test used "90 days ago", which shows as
  "2 months ago" just after midnight. It now uses 100 days

## By hand (needs the owner)

The quickstart's manual checks are covered by the end-to-end tests above. The owner walks
through them once deployed:

- [ ] Salary: card text, sorting, "Salary at least" with the hidden count, and the range rule
- [ ] Pay notes: an older opportunity's compensation text shows unchanged as "Pay notes"
- [ ] Fill from link: a real posting with pay fills the minimum, the maximum, and the pay notes
- [ ] Date added: backdate a real older opportunity; the history and "Last change" follow it
- [ ] Closed column on a wide screen and the Closed tab on the phone
- [ ] Edit details shows every field; Add opportunity keeps "More details" closed
- [ ] Through Claude: "Farmers pays 150 to 180k" sets the range ("$150k–$180k" on the card)

## Deployed

- [ ] Pushed and merged only when the owner says so, after `003-mcp-release-2` (tasks.md T046)
- [ ] The deploy's smoke test passes
