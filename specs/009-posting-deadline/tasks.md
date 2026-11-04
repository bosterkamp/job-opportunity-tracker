---

description: "Task list for the posting deadline (feature 009)"
---

# Tasks: Posting Deadline

**Input**: Design documents from `specs/009-posting-deadline/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/changes.md](./contracts/changes.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: Setup, a foundational phase (the field in the shared schemas), then one phase
per user story (spec.md US1–US3), then polish.

**Pushing**: commit after each phase and push the branch (free: no Actions run). Open the pull
request and merge only when the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `deadline` (Vitest `// @module-tag deadline`, or `{ tags: ['deadline'] }`
  on a block in a file that mixes features; Playwright `{ tag: '@deadline' }`).
- **Edits**: write multi-line edits with Python script files in the scratchpad (`newline=''`).
  Never pipe a check through `tail` when its exit code matters, and stop the chain (`|| exit 1`)
  before any commit.
- **The field's name**: `postedUntil` in code and data, "Posted until" on screen.
- **Dates**: `YYYY-MM-DD` strings throughout; "today" is `localDate()` from `@jot/shared` in the
  web app. Never build a `Date` from a calendar date without `T00:00:00Z`.

---

## Phase 1: Setup

- [X] T001 Add the `deadline` tag to `scripts/test-tags.mjs` (`TAGS`, "The posting's closing date,
  the card's deadline text, and the Closing soonest sort (feature 009)"; `E2E_FEATURES`). Add
  `deadline` to the `SOURCE_TAGS` entries for every source file whose tests gain deadline cases:
  `features/overview/**`, `features/import/**`, `OpportunityCard*`, `OpportunityForm*`,
  `pages/Overview.tsx`, `pages/Archive.tsx`, `pages/OpportunityDetail.tsx`, and new entries
  before the catch-alls for `api/src/import/jobPosting.ts` and `api/src/mcp/tools.ts`. Run
  `npm run lint`.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 Tests first in `packages/shared/tests/unit/schemas.test.ts` (block tagged `deadline`):
  `OpportunityInputSchema` keeps a valid `postedUntil`, drops blank, refuses `2026-13-01` and
  `next week` with "Use a date like 2026-11-03"; `OpportunityPatchSchema` keeps a date, and
  `null` or blank clears it (`null`); `OpportunitySchema` accepts it missing, as a date, or
  `null`; `PostingDetailsSchema` accepts it optional.
- [X] T003 Make T002 pass in `packages/shared/src/schemas.ts` (reuse `FollowUpDate` as a shared
  `CalendarDate`, keeping its message; `postedUntil` beside `followUpDate` in `createFields`,
  the patch, and `OpportunitySchema`) and `packages/shared/src/imports.ts` (`postedUntil:
  z.iso.date().optional()` in `PostingDetailsSchema`).
- [X] T004 API integration tests in `packages/api/tests/integration/create-opportunity.test.ts` and
  `edit-delete.test.ts` (blocks tagged `deadline`): create with `postedUntil` and read it back;
  PATCH changes it, `null` clears it, and neither adds a history entry nor changes
  `lastStageChangeAt` or `changeCount`; a stage change keeps it; an invalid one is a 400 with the
  message on `postedUntil`. Fix anything in the routes or repository they expose (research §1
  expects none). Commit and push: `feat(shared): the posted-until date (009)`.

**Checkpoint**: the API stores, returns, changes and clears the date.

---

## Phase 3: User Story 1 - Record when a posting closes (Priority: P1) 🎯 MVP

**Goal**: The owner (and Claude) can set, change and clear "Posted until"; filling from a link
fills it when the posting states it.

**Independent Test**: spec.md US1's Independent Test.

- [X] T005 [P] [US1] Tests first in `packages/api/tests/unit/` for `mapJobPosting` (find the
  existing JobPosting mapping test file; block tagged `deadline`): `validThrough`
  `2026-11-30`, `2026-11-30T23:59:59-05:00` and `2026-11-30T00:00:00.000Z` all give
  `postedUntil: '2026-11-30'`; `2026-02-30`, `soon`, a number and missing give no `postedUntil`,
  and the rest still maps.
- [X] T006 [US1] Make T005 pass in `packages/api/src/import/jobPosting.ts`: a small
  `calendarDate(value)` that takes the first ten characters of a string when they're a real
  `YYYY-MM-DD` date (round-trip through `Date.UTC` to reject `02-30`), else undefined; add
  `postedUntil: calendarDate(posting.validThrough)` to the mapped details.
- [X] T007 [P] [US1] Tests first in `packages/web/tests/OpportunityForm.test.tsx`,
  `edit-delete-duplicates.test.tsx` and `import-fill.test.tsx` (blocks tagged `deadline`): the
  add form has a "Posted until" date input and sends `postedUntil`; the edit form shows the
  stored date and sends `null` when it's cleared; filling from a posting with `postedUntil`
  fills the empty field and lists "Posted until" in "Filled in", and keeps a typed one.
- [X] T008 [US1] Make T007 pass: `packages/web/src/components/OpportunityForm.tsx` (`postedUntil`
  in `FormValues`, the empty values, the request body and the edit values, and a "Posted until"
  date field beside "Follow-up date"); `packages/web/src/features/import/fillForm.ts`
  (`postedUntil: 'Posted until'` in `FILLABLE`).
- [X] T009 [P] [US1] Detail page: test first in `packages/web/tests/pages.test.tsx` (block tagged
  `deadline`) that a set date shows as "Posted until" with the medium date, and nothing shows
  without one; then add it to `packages/web/src/pages/OpportunityDetail.tsx` beside the
  follow-up date, with `formatCalendarDate`.
- [X] T010 [P] [US1] Claude's tools: tests first in
  `packages/api/tests/integration/mcp-write-tools.test.ts` and `mcp-read-tools.test.ts` (blocks
  tagged `deadline`): `add_opportunity` and `update_opportunity` set it, `null` clears it, an
  invalid one is refused with the web API's message; `list_opportunities` and
  `find_opportunities` summaries include `postedUntil` (or `null`); `read_posting` passes it
  through. Then `packages/api/src/mcp/tools.ts`: `postedUntil: z.string().describe('YYYY-MM-DD:
  the date the posting is up until')` in `detailTypes`, `postedUntil: o.postedUntil ?? null` in
  the summary, and "the closing date" in `read_posting`'s description.
- [X] T011 [US1] Contracts: add the field to `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml`
  (input, patch, response), `specs/002-import-job-from-link/contracts/` (`PostingDetails`) and
  `specs/003-mcp-server/contracts/mcp-tools.md` (the tools and summaries), per
  contracts/changes.md. Run the affected tests, lint and typecheck; commit and push:
  `feat: record when a posting closes (009: US1)`.

**Checkpoint**: the date can be entered, filled from a link, set by Claude, and seen on the
opportunity's page.

---

## Phase 4: User Story 2 - See the closing date on the board (Priority: P2)

**Goal**: Cards show "Open until …", "Closes in N days" or "Posting ended …".

**Independent Test**: spec.md US2's Independent Test.

- [X] T012 [P] [US2] Tests first in a new `packages/web/tests/deadline.test.ts`
  (`// @module-tag deadline`) for `postingDeadline(postedUntil, today, locale)` in
  `overviewModel.ts`, with `today = '2026-11-10'` and locale `en-US`:
  - `undefined` and `null`: undefined
  - `2026-11-19` (9 days) and `2026-11-18` (8): `{ kind: 'open', text: 'Open until Nov 18' }`
  - `2026-11-17` (7): `Closes in 7 days`; `2026-11-12`: `Closes in 2 days`; `2026-11-11`:
    `Closes tomorrow`; `2026-11-10`: `Closes today` (all `soon`)
  - `2026-11-09`: `{ kind: 'ended', text: 'Posting ended Nov 9' }`
  - next year: `Open until Jan 5, 2027`; across a daylight-saving change, the day count is still
    whole.
  And for `formatShortCalendarDate` in `packages/web/src/format.ts`: "Nov 14" this year, "Jan 5,
  2027" otherwise, never shifted a day (UTC).
- [X] T013 [US2] Make T012 pass: `formatShortCalendarDate(ymd, today, locale?)` in `format.ts`
  (`month: 'short', day: 'numeric'`, plus `year` when it differs, `timeZone: 'UTC'`);
  `postingDeadline` and its `PostingDeadline` type in `overviewModel.ts` (days from the two
  dates parsed with `T00:00:00Z`; `Intl.RelativeTimeFormat` is not used, so the wording is
  exactly the spec's).
- [X] T014 [P] [US2] Card tests first in the existing card test file (find the one that tests
  `OpportunityCard`; block tagged `deadline`), with the system date set: an open card shows
  "Open until …"; a card closing in 3 days shows "Closes in 3 days" with the `deadlineSoon`
  class; a closed (archived) one closing in 3 days shows the text without it; an ended one shows
  "Posting ended …" with `deadlineEnded`; no date shows nothing new.
- [X] T015 [US2] Make T014 pass in `packages/web/src/components/OpportunityCard.tsx` (a
  `<span>` after the salary, using `postingDeadline(o.postedUntil, localDate())`; the `soon`
  class only when `o.status === 'OPEN'`) and `OpportunityCard.module.css` (`.deadlineSoon`:
  `color: var(--color-danger)`, weight 600; `.deadlineEnded`: `color: var(--color-text-muted)`).
  Run the axe e2e checks in light and dark; commit and push:
  `feat(web): the closing date on the cards (009: US2)`.

**Checkpoint**: each card says when its posting closes.

---

## Phase 5: User Story 3 - The most urgent postings first (Priority: P3)

**Goal**: The overview sorts by "Closing soonest" by default; the archive keeps "Recently
changed".

**Independent Test**: spec.md US3's Independent Test.

- [X] T016 [P] [US3] Tests first in `packages/web/tests/deadline.test.ts`:
  - `sortBy(items, 'closing', '2026-11-10')`: in 2 days, in 20 days, then undated by most recent
    change, then ended last week, then ended last month; two closing the same day by most
    recent change; today counts as upcoming
  - `SORT_OPTIONS` lists `{ value: 'closing', label: 'Closing soonest' }` first
  - `readListParams(new URLSearchParams(''), OVERVIEW_DEFAULTS).sort === 'closing'` and
    `ARCHIVE_DEFAULTS` gives `recent`; `writeListParams` leaves out each page's default and
    writes `sort=recent` on the overview; `?sort=closing` is read on both
- [X] T017 [US3] Make T016 pass:
  - `overviewModel.ts`: `'closing'` in `SortKey` and first in `SORT_OPTIONS`; `sortBy(items,
    key, today = localDate())`, with the `closing` comparator from data-model.md
  - `listParams.ts`: `OVERVIEW_DEFAULTS` (sort `closing`) and `ARCHIVE_DEFAULTS` (sort
    `recent`); `readListParams` and `writeListParams` take the defaults (no default argument, so
    each page must choose)
  - `pages/Overview.tsx` and `pages/Archive.tsx`: pass their defaults; the overview's "Clear
    filters" resets to `OVERVIEW_DEFAULTS`
  Update the existing tests that assumed `recent` was the overview's default.
- [X] T018 [US3] `e2e/deadline.spec.ts` (`{ tag: ['@deadline', '@responsive'] }`): create
  opportunities through the API with dates in 2 days, 20 days, last week and none, all in
  Considering; open `/`:
  - "Sort by" reads "Closing soonest", and the column (the Considering tab on the iPhone) lists
    them in that order: 2 days, 20 days, undated, ended
  - the cards read "Closes in 2 days", "Open until …" and "Posting ended …"
  - choosing "Recently changed" adds `sort=recent`, and a reload keeps it
  - `/archive` still opens on "Recently changed"
  - adding an opportunity with "Posted until" from the form shows the date on its page
  Run the full e2e suite; commit and push: `feat(web): closing soonest first by default (009:
  US3)`.

**Checkpoint**: the overview opens with the most urgent postings first.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] README: "Posted until" among the opportunity's details and in what fill from link
  reads; the overview's default sort; the `deadline` row in the Test tags table.
- [X] T020 [P] Create `specs/009-posting-deadline/checklists/validation.md`: automated results;
  **architecture diagrams** checked (constitution, FR-011), with a note on whether they changed;
  the owner's checks (quickstart.md "Deployed"), still open.
- [X] T021 Full local check: lint, typecheck, build; all unit tests with coverage ≥ 80%; the full
  e2e suite (desktop and iPhone); mutation testing on the changed source files (≥ 95%); record
  the results in validation.md; commit and push.
- [ ] T022 **Only when the owner says so**: open the pull request, merge when every check is
  green, and confirm the deploy and its smoke test. (The offline fix on `fix-offline-banner` is
  its own pull request, unless the owner says to combine them.)
- [ ] T023 **After the deploy**: the owner's checks (quickstart.md "Deployed").

---

## Dependencies & Execution Order

- **Setup (T001)**, then **Foundational (T002–T004)**: every story needs the field.
- **US1 (T005–T011)** is the MVP: the date can be recorded.
- **US2 (T012–T015)** needs the field only; it can follow US1 or run beside it.
- **US3 (T016–T018)** shares `overviewModel.ts` and `deadline.test.ts` with US2, so it comes
  after; T018's e2e checks the card text from US2 too.
- **Polish (T019–T021)** comes last; T022 and T023 wait for the owner.

## Parallel Opportunities

- **US1**: T005 (API mapping), T007 (form), T009 (detail page) and T010 (tools) are in different
  files.
- **US2**: T012 and T014 together.
- **Polish**: T019 and T020 together.

## Implementation Strategy

- **MVP**: Foundational plus US1: the date is recorded and filled from links.
- **Then**: US2 shows it on the board, and US3 sorts by it.
- **One PR** when the owner says to merge.
