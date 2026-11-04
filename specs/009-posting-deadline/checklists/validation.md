# Validation: Posting Deadline

**Purpose**: Record that feature 009 works, locally and once deployed, before calling it done.
**Started**: 2026-10-30

## Automated (local, 2026-10-30)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,419 in 69 files. Coverage: 99.83% statements, 99.21% branches,
  99.64% functions, 99.88% lines (the gate is 80%). They cover:
  - the field on add, edit (clear with null or blank) and in responses, and dates refused
  - the API: stored, changed and cleared without a history entry, and kept when moving stage
  - fill from link: `validThrough` as a date, a date-time with an offset, UTC; impossible
    days, other formats and missing are left out. The Workday sample posting now states one
  - the form field, filling it from a posting, and the detail page
  - Claude's tools: set on add, changed and cleared on update, listed and found, refused when
    invalid, and returned by `read_posting`
  - the card text at every boundary (8 days, 7, 2, tomorrow, today, ended; this year and
    another), and its highlight only on open opportunities
  - Closing soonest: upcoming, then undated, then ended, with ties; each page's default sort
- [x] End-to-end: the full suite passes on desktop and iPhone (83 runs, 9 skipped by design),
  including `e2e/deadline.spec.ts`:
  - the overview opens on "Closing soonest", in the order 2 days, 20 days, undated, ended, with
    each card's text
  - axe finds nothing on that board in light and dark
  - "Recently changed" adds `sort=recent`, and a reload keeps it
  - the archive still opens on "Recently changed"
  - a date entered on the add form shows on the opportunity
- [x] Mutation testing, every file (the shared schemas changed, so all of them run): 100% after
  two fixes. The first run (99.89%) found:
  - a closing date inside other text ("by 2026-11-30") was still read; the date must now start
    the value, and a test covers it
  - an unreachable fallback in the Closing soonest comparison; simplified, with one equivalent
    mutant (undated ones are only compared with each other) marked

- [x] **Architecture diagrams** (constitution, FR-011): checked. The README's system diagram and
  sign-in sequence show services and flows, not an opportunity's fields or the sort, so they're
  unchanged. The README describes the field, the card text and the default sort, and fill from
  link's closing date

## Deployed (needs the owner, after deploy; quickstart.md)

- [ ] **Claude**: ask Claude to add a posting with its closing date, then to list
  opportunities; the date comes back
- [ ] **iPhone**: the overview's tabs open sorted by "Closing soonest", and the card text fits

## Deployed

- [ ] Merged when the owner says so (one PR with the feature 008 offline sign-in fix, at the owner's request; 1,423 unit tests pass on the combined branch)
- [ ] The deploy's smoke test passes
