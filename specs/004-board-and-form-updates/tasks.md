---

description: "Task list for board and form updates (issues #14, #16, #17, #18)"
---

# Tasks: Board and Form Updates

**Input**: Design documents from `specs/004-board-and-form-updates/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api-changes.md](./contracts/api-changes.md),
[contracts/mcp-tools-changes.md](./contracts/mcp-tools-changes.md), [quickstart.md](./quickstart.md)

**Tests**: Required. Constitution Principle VI asks for tests for the rules, coverage at or
above 80%, and zero surviving mutants. Within each story, write the tests first and watch them
fail.

**Organization**: By user story (spec.md US1–US4), one phase each. The stories are independent;
the only overlap is the files they share, listed under Dependencies.

**Local only**: Commit after each phase. Don't push, open a PR, or re-run workflows until the
owner says so (Actions minutes, 2026-10-20). Run CI's checks locally instead (Phase 7).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are from the repository root

## Conventions that apply to every task

- Tag every test with the functionality it checks. `npm run lint` checks the tags.
  - Salary display, sorting, and filtering: `overview`
  - The salary fields in the form: `capture` and `edit`
  - Fill from link: `import`
  - Claude's tools: `mcp`
  - Date added: `capture` and `edit`; its history entry: `pipeline`
  - The Closed column: `overview`
  - The edit page: `edit`
- Build fixtures inside each test, not at module load (Stryker issue #6234).
- Phone e2e scenarios open on the first tab, Considering. Seed in Considering, or select the tab
  first.
- Write multi-line edits with Python scripts in the scratchpad, not Bash heredocs or PowerShell
  (both have mangled quotes and UTF-8 before).

---

## Phase 1: Setup

- [X] T001 Add `['packages/shared/src/salary.ts', ['capture', 'overview', 'edit', 'import', 'mcp']]` to `SOURCE_TAGS` in `scripts/test-tags.mjs`, above the catch-alls, No new tags are needed (the tag script has no tests of its own; `npm run lint` checks every test is tagged)

---

## Phase 2: Foundational

None. Each story brings its own schema change. `packages/shared/src/schemas.ts` is `core`, so
any change to it runs the whole suite.

---

## Phase 3: User Story 1 — Record and compare salary ranges (Priority: P1) 🎯 MVP

**Goal**: Salary minimum and maximum on every opportunity, shown on cards, with sorting and a
"Salary at least" filter. "Compensation" becomes "Pay notes", and both Fill from link and
Claude fill the numbers.

**Independent test**: quickstart.md "Salary (US1)", steps 1–7.

### Tests for US1 (write first; they must fail)

- [X] T002 [P] [US1] Write `packages/shared/tests/unit/salary.test.ts`:
  - `parseAmount`:
    - `"150000"`, `"150,000"`, `"$150,000"`, `" 150k "`, `"150K"` → 150000
    - `"152.5k"` → 152500
    - `""` → undefined
    - `"abc"`, `"150.5"`, `"-5"`, `"1.2.3k"` → the original text, so the schema rejects it
  - `formatSalaryRange`:
    - (150000, 180000) → "$150k–$180k"
    - (150000, undefined) → "$150k+"
    - (undefined, 180000) → "Up to $180k"
    - (undefined, undefined) → undefined
    - (152500, 152500) → "$152.5k"
    - (45, 60) → "$45–$60"
    - (999, 1000) → "$999–$1k"
  - `salaryReach`: the max; the min when there's no max; undefined when neither is set
- [X] T003 [P] [US1] Extend `packages/shared/tests/unit/schemas.test.ts`:
  - `OpportunityInputSchema` and `OpportunityPatchSchema` accept `salaryMin` and `salaryMax` from 0 to 10,000,000
  - they reject 10,000,001, -1, 1.5, and `"150000"` with "Enter a whole number, like 150000"
  - create rejects min > max with "The minimum can't be more than the maximum" at path `salaryMin`, and accepts min = max
  - the patch accepts `null` to clear either one
  - `OpportunitySchema` accepts both as optional integers
- [X] T004 [P] [US1] Extend `packages/api/tests/integration/edit-delete.test.ts` and `create-opportunity.test.ts` (tag `edit` and `capture`):
  - **POST**: saves and returns the salary
  - **PATCH, only `salaryMin`**: rejected with 400 and fields `['salaryMin']` when it exceeds the stored `salaryMax`; allowed when the same request also raises `salaryMax`
  - **PATCH, clearing**: clearing `salaryMax` lets any `salaryMin` through
  - **Old item**: an item with `compensation` and no salary still reads back unchanged
- [X] T005 [P] [US1] Extend `packages/api/tests/unit/import/format.test.ts`, `jobPosting.test.ts`, and `greenhouse.test.ts`:
  - `payAmounts` rounds, orders low to high, and drops values that are ≤ 0 or > 10,000,000
  - JobPosting `baseSalary` with `minValue`/`maxValue`, or a single `value`, gives `salaryMin`/`salaryMax` alongside the unchanged `compensation` text
  - Greenhouse `pay_input_ranges` gives cents ÷ 100, as its text already does; check the existing code for the unit
  - no pay gives no fields
  - Extend `packages/shared/tests/unit/imports.test.ts`: `PostingDetailsSchema` accepts the new fields
- [X] T006 [P] [US1] Extend `packages/web/tests/overviewModel.test.ts` and `listParams.test.ts`:
  - **Sorts**: `salary-min` and `salary-max` order high to low, put missing values last, and break ties by newest change
  - **Filter**: `filterBySalary(items, 150000)` keeps a reach of ≥ 150000, using the max or else the min, and reports the hidden-without-salary count
  - **Address**: `?salary=150000` is read; `?salary=123` and `?salary=abc` fall back to any; writing leaves out the default
- [X] T007 [P] [US1] Extend `packages/web/tests/OpportunityForm.test.tsx` and `import-fill.test.tsx`:
  - **Fields**: "Salary minimum" and "Salary maximum" inputs (`inputMode="numeric"`) sit next to each other under "More details", and "Pay notes" replaces "Compensation"
  - **Parsing**: typing "$150k" submits 150000
  - **Errors**: "abc" shows "Enter a whole number, like 150000" and focuses the field, opening "More details" when adding; min > max shows the range message on the minimum
  - **Edit**: blank on edit sends `null`; `toFormValues` shows stored numbers as plain digits
  - **Fill from link**: fills empty salary fields, keeps typed ones, and lists "Salary minimum" and "Salary maximum" in the "Filled in" message
- [X] T008 [P] [US1] Extend `packages/web/tests/overview-board.test.tsx` and `pages.test.tsx`:
  - **Card**: shows "$150k–$180k", and nothing without a salary
  - **Toolbar**: offers "Salary (minimum)" and "Salary (maximum)", and a "Salary at least" select with Any and the presets from data-model.md
  - **Filter**: choosing $150k updates the address and the board, and shows "2 hidden because they have no salary" (singular "1 hidden because it has no salary")
  - **Detail page**: shows "Salary" with the range text and "Pay notes" with the text
- [X] T009 [P] [US1] Extend `packages/api/tests/integration/mcp-write-tools.test.ts` and `mcp-read-tools.test.ts`:
  - `add_opportunity` and `update_opportunity` accept `salaryMin`/`salaryMax`, with the exact descriptions from contracts/mcp-tools-changes.md
  - the `compensation` description is "Pay notes: bonus, equity, currency, or pay period"
  - min > max is refused with the web API's message
  - list and find summaries include `salaryMin` and `salaryMax` (number or null)
- [X] T010 [US1] Write `e2e/board-and-form.spec.ts` (`test.describe('salary', { tag: ['@overview', '@capture'] })`):
  - add two opportunities with salaries and one without
  - check the card text
  - sort by maximum
  - filter at least $150k and check the hidden count
  - In `e2e/fixtures.ts`, rename the `Compensation` label to `Pay notes`, and add `salaryMin`/`salaryMax` to the form helper. Update `us1-capture.spec.ts` and `import-from-link.spec.ts` for the label (`Pay notes` in the "Filled in" list)

### Implementation for US1

- [X] T011 [US1] Create `packages/shared/src/salary.ts`:
  - `MAX_SALARY = 10_000_000`
  - `parseAmount(text): number | string | undefined`
  - `formatSalaryRange(min?, max?)`
  - `salaryReach(o)`
  - `SALARY_MESSAGE = 'Enter a whole number, like 150000'`

  Export it from `packages/shared/src/index.ts`. Make T002 pass
- [X] T012 [US1] In `packages/shared/src/schemas.ts`, add `Salary = z.number(SALARY_MESSAGE).int(...).min(0, ...).max(MAX_SALARY, ...)`:
  - `salaryMin`/`salaryMax` are `Salary.nullable().optional()` on create (drop null via `withoutUndefined`; null means not provided) and on the patch
  - a `superRefine` on the create schema checks min ≤ max: "The minimum can't be more than the maximum", path `['salaryMin']`
  - add both as optional integers to `OpportunitySchema`

  Make T003 pass
- [X] T013 [US1] In `packages/api/src/routes/opportunities.ts` PATCH: when the patch has `salaryMin` or `salaryMax`, read the stored opportunity (404 if missing), merge (null clears), and throw `ApiError('VALIDATION_ERROR', "The minimum can't be more than the maximum", ['salaryMin'])` when min > max. Then call `updateDetails` as before. Make T004 pass. Update `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml` (contracts/api-changes.md)
- [X] T014 [P] [US1] Add `payAmounts(pay: Pay): { salaryMin?: number; salaryMax?: number }` to `packages/api/src/import/format.ts`. Use it in `jobPosting.ts` and `greenhouse.ts`, and add the two fields to `PostingDetailsSchema` in `packages/shared/src/imports.ts`. Make T005 pass
- [X] T015 [P] [US1] In `packages/web/src/features/overview/overviewModel.ts`:
  - add the `salary-min` and `salary-max` comparators and their `SORT_OPTIONS` labels ("Salary (minimum)", "Salary (maximum)")
  - add `SALARY_FILTERS` (the presets) and `filterBySalary(items, atLeast): { items; hiddenWithoutSalary }`

  In `listParams.ts`, add `salary: number | null` read from and written to `?salary=`. Make T006 pass
- [X] T016 [US1] In `packages/web/src/components/OpportunityForm.tsx`:
  - add `salaryMin`/`salaryMax` to `FormValues` (text) and `EMPTY_VALUES`
  - `toInput` passes `parseAmount` results; `toFormValues` converts with `String(n)`
  - render a "Salary minimum" / "Salary maximum" pair with `inputMode="numeric"` before "Pay notes" (renamed from "Compensation")

  In `features/import/fillForm.ts`, fill the salary fields from `PostingDetails` named "Salary minimum" and "Salary maximum" in the message, like the form labels. A typed "$150k" counts as the same as the posting's 150000. Make T007 pass
- [X] T017 [US1] Show the salary:
  - **Card**: `OpportunityCard.tsx` shows `formatSalaryRange` in the meta line
  - **Toolbar**: `ListToolbar.tsx` adds the "Salary at least" select (`--controls` grows by one; check the phone layout in `ListToolbar.module.css`)
  - **Board**: `pages/Overview.tsx` applies `filterBySalary` and shows the hidden count in a `role="status"` line
  - **Detail page**: `pages/OpportunityDetail.tsx` shows a "Salary" fact and relabels "Compensation" as "Pay notes"

  Make T008 pass
- [X] T018 [US1] In `packages/api/src/mcp/tools.ts`:
  - add `salaryMin`/`salaryMax` (`z.number().int()` with the contract's descriptions) to `detailTypes`
  - describe `compensation` as "Pay notes: …"
  - add both to `summary`

  Update `specs/003-mcp-server/contracts/mcp-tools.md`. Make T009 pass
- [X] T019 [US1] Make T010 pass. Run `npm run lint`, `npm run typecheck`, and `npm run test:affected`, then commit locally: `feat: salary range on opportunities and the board (004: US1, #16)`

**Checkpoint**: Salary works end to end on its own.

---

## Phase 4: User Story 2 — Enter opportunities with their real dates (Priority: P1)

**Goal**: A settable "Date added" when adding and editing. The first history entry, and "last
change" until the first move, follow it.

**Independent test**: quickstart.md "Date added (US2)", steps 1–4.

### Tests for US2 (write first; they must fail)

- [X] T020 [P] [US2] Extend `packages/shared/tests/unit/schemas.test.ts`:
  - both input schemas accept an optional `createdAt` as an ISO date-time with offset
  - they reject `"2026-10-01"` and `"yesterday"` with "Use a date and time with a time zone"
  - the patch rejects `createdAt: null`
- [X] T021 [P] [US2] Extend `packages/api/tests/integration/create-opportunity.test.ts`:
  - **Backdated POST**: a past `createdAt` sets `createdAt`, `lastStageChangeAt`, and the first entry's `changedAt` to it; `updatedAt` and `recordedAt` are now; it lists in the right GSI1 order behind newer items
  - **Future**: more than 60 s ahead is a 400 "The date can't be in the future", fields `['createdAt']`
  - **Not given**: omitted, it's now, as before
- [X] T022 [P] [US2] Extend `packages/api/tests/integration/edit-delete.test.ts` (tag `edit`, `pipeline`):
  - **Never moved**: PATCH `createdAt` moves `createdAt`, `lastStageChangeAt`, `GSI1SK` (check the list order), and `CHANGE#000001.changedAt`
  - **Moved**: it moves `createdAt` and the first entry but not `lastStageChangeAt`; a date after the first move's `changedAt` is a 400 with the exact message; equal to it is allowed
  - **Future**: a 400
  - **Other fields**: combined with other fields, both apply
  - **Missing**: a missing id is a 404
  - **Race**: when a stage change lands between the read and the write (inject it through a repo wrapper), the result is 409 CONFLICT and nothing changed

  Add repo unit cases to `packages/api/tests/unit/edit-delete-repo.test.ts` for the transaction shape and the condition-failure mapping
- [X] T023 [P] [US2] Extend `packages/web/tests/OpportunityForm.test.tsx` and `pages.test.tsx`:
  - **Add form**: "Date added" (`type="date"`) defaults to today's local date (fake timers), and sending is omitted when unchanged
  - **Earlier date**: sends noon local time of that day as ISO
  - **Future**: a future date shows "The date can't be in the future" without calling the API
  - **Edit form**: shows the stored local date; an unchanged date isn't sent; changing it to today sends the current time
  - **Detail page**: the existing "Date added" fact shows the date; a 400 about the date shows its message (above Save, like other server problems). The form itself checks the same rules first, on the field
  - (Implemented in the new `packages/web/tests/date-added.test.tsx`; the rules themselves in `packages/shared/tests/unit/dateAdded.test.ts`)
- [X] T024 [P] [US2] Extend `packages/api/tests/integration/mcp-write-tools.test.ts`:
  - `createdAt` is accepted by both tools with the contract's description
  - a future date is refused with the web API's message
- [X] T025 [US2] Add to `e2e/board-and-form.spec.ts` (`test.describe('date added', { tag: ['@capture', '@edit'] })`):
  - add an opportunity dated 90 days ago; the history shows that date and the card "Last change 3 months ago"
  - edit it to 60 days ago; the history moves too

### Implementation for US2

- [X] T026 [US2] In `packages/shared/src/schemas.ts`, add `createdAt: Timestamp.optional()` to `OpportunityInputSchema` and to `OpportunityPatchSchema` (not clearable). Export `DATE_ADDED_MESSAGES` (future; after first change). Make T020 pass
- [X] T027 [US2] In `packages/api/src/repo/opportunityRepo.ts`:
  - **`create`**: uses `input.createdAt ?? now` for `createdAt`, `lastStageChangeAt`, GSI1, and the first `changedAt`, keeping `updatedAt`/`recordedAt` = now
  - **New `changeDateAdded(id, { createdAt, expectedChangeCount, now })`**: a `TransactWriteCommand` that updates OPP (`createdAt`, `updatedAt`, and, when `expectedChangeCount === 1`, `lastStageChangeAt` and `GSI1SK`) with `changeCount = :expected`, and `CHANGE#000001.changedAt` with `attribute_exists(PK)`; condition failures map to `ApiError('CONFLICT', CONFLICT_MESSAGE)`
  - add it to the `OpportunityRepo` interface
- [X] T028 [US2] In `packages/api/src/routes/opportunities.ts`:
  - **POST**: rejects a future `createdAt` (using `CLOCK_SKEW_MS`) with fields `['createdAt']`
  - **PATCH with `createdAt`**: reads with history (404), checks future and "after the first stage change" (the earliest `changedAt` with seq > 1), calls `changeDateAdded` with the read `changeCount`, then `updateDetails` with the remaining fields (always, so `updatedAt` and the via mark behave as before)

  Share the read with T013's salary merge, and read only when the patch has a salary or a date added. Make T021 and T022 pass, and update `api.openapi.yaml`
- [X] T029 [US2] In `packages/web/src/components/OpportunityForm.tsx`:
  - add `dateAdded` (YYYY-MM-DD) to `FormValues`, defaulting to `localDate()` when adding and the local date of `createdAt` when editing
  - render "Date added" (`type="date"`, `max` = today) after "Follow-up date"
  - `toInput` sends `createdAt` only when it differs from the initial value: today → `new Date().toISOString()`; other days → local noon
  - a future date, or one after the first move, fails locally with the shared message (`dateAddedProblem` in the new `packages/shared/src/dateAdded.ts`); on the first move's day the time is capped at that move, so that day stays allowed

  `pages/OpportunityDetail.tsx` passes the history to the edit form; its existing "Date added" fact needed no change. Make T023 pass
- [X] T030 [US2] In `packages/api/src/mcp/tools.ts`, add `createdAt` (`z.string()` with the contract's description) to `detailTypes`; on update it's nullable like the others, and the API refuses null. Make T024 pass
- [X] T031 [US2] Make T025 pass. Run lint, typecheck, and the affected tests; commit locally: `feat: set the date an opportunity was added (004: US2, #14)`

**Checkpoint**: Backdating works on its own.

---

## Phase 5: User Story 3 — See closed opportunities on the main page (Priority: P2)

**Goal**: A last "Closed" column (a "Closed (n)" tab on phones) whose cards show their outcome.

**Independent test**: quickstart.md "Closed (US3)", steps 1–3.

### Tests for US3 (write first; they must fail)

- [X] T032 [P] [US3] Extend `packages/web/tests/overviewModel.test.ts` and `listParams.test.ts`:
  - `boardGroups(open, closed, stageFilter)` gives the open stages then `CLOSED`
  - an open stage gives only that group; `CLOSED` gives only the closed group
  - `?stage=CLOSED` is read and written
- [X] T033 [P] [US3] Extend `packages/web/tests/overview-board.test.tsx` (wide and narrow through `media.ts`):
  - **Wide**: a "Closed" column comes last with its count; its cards show the outcome badge and no "Move to…"
  - **Narrow**: the "Closed (2)" tab comes last; arrow keys reach it and wrap
  - **Empty**: "Nothing closed yet"
  - **Toolbar**: search, sort, and the salary filter apply to the closed cards; the stage filter offers "Closed"
  - **Empty board**: with only closed opportunities the board shows, not "No opportunities yet"
  - **Errors**: a failed closed request shows the retry state
- [X] T034 [US3] Add to `e2e/board-and-form.spec.ts` (`test.describe('closed column', { tag: ['@overview', '@responsive'] })`):
  - seed one Considering and one Rejected
  - wide: the Closed column shows "Rejected"
  - phone: select the "Closed (1)" tab, then check the card
  - open it and reopen it to Applied; it leaves the Closed column

### Implementation for US3

- [X] T035 [US3] In `packages/web/src/features/overview/overviewModel.ts`:
  - add `type BoardKey = Stage | 'CLOSED'`, `BoardGroup { key; label; items }`, and `boardGroups(...)`, replacing `groupByStage` and `filterByStage`
  - extend `StageFilter` with `'CLOSED'`; `?stage=` now accepts only open stages and `CLOSED`

  In `listParams.ts`, accept `CLOSED`. Make T032 pass
- [X] T036 [US3] `components/StageBoard.tsx` takes `BoardGroup`s (key, label, empty text: "Nothing in {stage}" or "Nothing closed yet"). `ListToolbar.tsx` adds the "Closed" option after the open stages. Archive.tsx is unaffected (FR-016); check it still compiles and its tests pass
- [X] T037 [US3] In `pages/Overview.tsx`:
  - load `useOpportunities('CLOSED')` alongside the open list
  - apply search, sort, and the salary filter to both lists, and the hidden count across both
  - render closed cards with `showStage` and without `showMove`
  - show "No opportunities yet" only when both lists are empty, and a `QueryState` for either error

  The test harness answers the closed list with an empty one unless a test mocks it. Update `e2e/us3-overview.spec.ts`, which expected closed opportunities only in the Archive. Make T033 and T034 pass
- [X] T038 [US3] Run lint, typecheck, and the affected tests; commit locally: `feat: closed column on the board (004: US3, #17)`

**Checkpoint**: The board shows the whole search.

---

## Phase 6: User Story 4 — Edit every detail at once (Priority: P2)

**Goal**: The edit form shows every field. The add form keeps "More details".

**Independent test**: quickstart.md "Full edit page (US4)", steps 1–2.

- [X] T039 [P] [US4] Extend `packages/web/tests/OpportunityForm.test.tsx` and `edit-delete-duplicates.test.tsx`:
  - **Edit mode**: has no "More details" summary or `<details>` element, and every field (salary, pay notes, date added, contact, description, notes) is visible
  - **Errors**: a validation error focuses its field
  - **Create mode**: still closed by default, and opens on an error in a hidden field, as before
- [X] T040 [US4] Add to `e2e/board-and-form.spec.ts` (`{ tag: '@edit' }`):
  - "Edit details" shows "Notes" and "Salary maximum" without a click
  - "Add opportunity" shows "More details" closed
- [X] T041 [US4] In `packages/web/src/components/OpportunityForm.tsx`:
  - render the detail fields in a plain `<div className={styles.detailsBody}>` when `mode === 'edit'`, and in the `<details>` element otherwise
  - limit `detailsOpen` and the "open on error" logic to create mode
  - remove dead branches, so no mutants survive for a create-only check (`detailFields(mode)` became one `DETAIL_FIELDS` set)
  - update the tests that opened "More details" while editing, including `e2e/us4-edit.spec.ts` and `e2e/us2-pipeline.spec.ts` (closing now leaves the opportunity in the Closed column)

  Make T039 and T040 pass
- [X] T042 [US4] Run lint, typecheck, and the affected tests; commit locally: `feat: show every field when editing (004: US4, #18)`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 [P] README: describe salary, pay notes, date added, and the Closed column under the features list; note the new tool fields under "Use from Claude"
- [X] T044 Run the full local equivalent of a master build:
  - `npm run lint`, `npm run typecheck`, `npm run build`
  - `npm run test:coverage` (≥ 80% across packages)
  - `npm run test:mutation:full` (zero survivors; for equivalent mutants only, add an inline disable comment with the reason)
  - `npm run test:e2e` (every project)

  Record the results in `specs/004-board-and-form-updates/checklists/validation.md`
- [ ] T045 Walk through quickstart.md's manual checks against `npm run dev`, and record them in `checklists/validation.md`. Commit locally. (The end-to-end tests cover each check; the owner's walk-through is listed in the validation record)
- [ ] T046 **Only when the owner says to push**:
  - push `003-mcp-release-2` first, merge its PR when green, and confirm its deploy
  - then rebase this branch on `master`, push, and open the PR, which closes #14, #16, #17, and #18
  - merge when ci and e2e are green; never cancel runs
- [ ] T047 **After the deploy**: run quickstart.md's "Through Claude" check and the deployed checks; record them in `validation.md`

---

## Dependencies & Execution Order

- **Setup (T001)** comes first; it's tiny.
- **US1 and US2** are both P1 and independent. They share these files, so do them one after the
  other (US1 first):
  - `schemas.ts`
  - `opportunities.ts` (T013 and T028 share the PATCH read)
  - `OpportunityForm.tsx`
  - `tools.ts`
- **US3** needs US1's `filterBySalary` only to apply the filter to the closed list (T037). Done
  before US1, it would leave that out and add it later.
- **US4** needs the full field list, so do it after US1 and US2 so the edit-mode tests cover the
  new fields.
- **Polish** comes last. T046 and T047 wait for the owner.

## Parallel Opportunities

- **US1**: the tests T002–T009 are in different files and can be written together. T014 (import)
  and T015 (overview model) are independent of T016 (form).
- **US2**: T020–T024 can be written together.
- **US3**: T032 and T033 can be written together.

## Implementation Strategy

- **MVP**: US1 (salary) is the most-asked-for change (#16). It's useful on its own.
- **Then** US2, US3, and US4, each committed locally and checked on its own.
- **One PR for the whole feature**, opened only when the owner says to push and after
  `003-mcp-release-2` has merged.
