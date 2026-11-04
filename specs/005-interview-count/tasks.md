---

description: "Task list for the interview count (feature 005)"
---

# Tasks: Interview Count

**Input**: Design documents from `specs/005-interview-count/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api-changes.md](./contracts/api-changes.md),
[contracts/mcp-tools-changes.md](./contracts/mcp-tools-changes.md), [quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI: tests for the rules, coverage at or above 80%,
zero surviving mutants). Within each phase, write the tests first and see them fail.

**Organization**: A foundational phase (the shared rules, storage, and API that every story
needs), then one phase per user story (spec.md US1–US4).

**Local only**: Commit after each phase. Don't push, open a PR, or re-run workflows until the
owner says so. This feature changes functionality, so it goes up when they say to push.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are from the repository root

## Conventions that apply to every task

- **Tags**: tag new tests `interview` (Vitest `// @module-tag interview`; Playwright
  `{ tag: '@interview' }`). The board badge's tests also carry `overview`, and the MCP tests
  `mcp`.
- **Fixtures**: build them inside each test, not at module load (Stryker issue #6234).
- **Edit scripts**: write multi-line edits with Python script files in the scratchpad, not shell
  heredocs piped into other commands. In feature 004 one such edit silently did nothing.
- **Checking a command**: never pipe a check through `tail` when its exit code matters. Capture
  the output to a file, then check `$?`.
- **Phones**: phone e2e scenarios open on the Considering tab; seed there.

---

## Phase 1: Setup

- [X] T001 Add the `interview` tag to `scripts/test-tags.mjs`:
  - `{ name: 'interview', description: 'Logging interviews and the interview count (feature 005)' }` in `TAGS`
  - `'interview'` in `E2E_FEATURES`
  - `SOURCE_TAGS` entries, added as the files appear:
    - `packages/shared/src/interviews.ts` → `['interview', 'overview', 'mcp']`
    - `packages/api/src/routes/interviews.ts` → `['interview', 'mcp']`
    - `packages/web/src/components/InterviewForm*` → `['interview']` (added in T012: the tag check refuses a pattern that matches no file)
  - a row for `interview` in the README's "Test tags" table

---

## Phase 2: Foundational (blocks every story)

**Purpose**: The interview rules, storage, and API routes, so a story can log and count them.

### Tests first

- [X] T002 [P] Write `packages/shared/tests/unit/interviews.test.ts`:
  - **Schemas**:
    - `InterviewInputSchema` accepts `{}`, `{ heldAt }`, and `{ note }`; trims the note; drops a blank note; rejects 201 characters ("Must be 200 characters or fewer"), a `heldAt` without a time zone, and unknown fields
    - `InterviewPatchSchema` turns a blank or null note into null
  - **`MAX_INTERVIEWS`** is 6, and **`INTERVIEW_MESSAGES`** has the exact texts from data-model.md
  - **`interviewDateProblem(heldAt, now, createdAt)`**:
    - accepts now, up to 60 s of clock skew, and exactly `createdAt`
    - refuses later than the skew ("The date can't be in the future") and 1 ms before `createdAt` ("An interview can't be before the date added")
    - checks the future first
  - **`interviewCountText`**: 0, undefined, and null → undefined; 1 → "1 interview"; 6 → "6 interviews"
  - **`timeline(o)`**:
    - merges stage changes and interviews oldest first by `changedAt`/`heldAt`, then by `recordedAt`
    - entries say which kind they are
    - an opportunity without `interviews` gives just its stage changes
- [X] T003 [P] Extend `packages/shared/tests/unit/dateAdded.test.ts`:
  - `dateAddedProblem` refuses a date after the earliest interview ("The date added can't be after the first interview"), accepts exactly that moment, and checks the first stage change before the first interview
  - the generalised day helper clamps to a lower bound on that bound's day (an interview on the date added's day is never before it) and to an upper bound as before
- [X] T004 [P] Write `packages/api/tests/integration/interviews.test.ts` (fresh items per test):
  - **POST**:
    - logs an interview (201): it's in `interviews`, `interviewCount` is 1, and `updatedAt` is now
    - stage, status, `lastStageChangeAt`, `changeCount`, and the GSI1 keys are unchanged
    - `heldAt` defaults to now
  - **The limit**: a 7th is refused with the exact message, and the count stays 6. Two adds racing at 5 leave exactly 6 (fire both at once)
  - **Date rules**: future, and before `createdAt`, give 400 with fields `['heldAt']`
  - **Not found**: an unknown opportunity is a 404, and nothing is written
  - **PATCH**:
    - changes `heldAt` and the note; a null note clears it
    - applies the same date rules
    - an unknown interview is a 404 "Interview not found"
    - the count is unchanged
  - **DELETE**:
    - needs `X-Confirm-Delete: true` (400 without it)
    - removes the item and lowers the count
    - an unknown interview is a 404, and the count is unchanged
  - **GET** returns `interviews` oldest first
  - **Permanent deletion** of the opportunity removes its interviews
  - **Via**: through a `via: 'CLAUDE'` handler, adding and editing set `via: 'CLAUDE'`; a web edit removes it
  - **Date added**: `PATCH /opportunities/{id}` with `createdAt` after the first interview gives 400 with the message
- [X] T005 [P] Add repo unit cases to `packages/api/tests/unit/change-stage-errors.test.ts` (or a new `interview-repo-errors.test.ts`):
  - a failed condition on add, edit, or remove maps to the right result (limit, or not found)
  - any other failure passes through unchanged

### Implementation

- [X] T006 Create `packages/shared/src/interviews.ts` (the schemas went in `schemas.ts` beside the others, to reuse its field helpers; `interviews.ts` imports only types from it, so there's no import cycle):
  - `MAX_INTERVIEWS = 6`
  - `INTERVIEW_MESSAGES`
  - `InterviewInputSchema`, `InterviewPatchSchema`, and `InterviewSchema` (`id`, `heldAt`, `note`, `recordedAt`, and optional `via`)
  - `interviewDateProblem`
  - `interviewCountText`
  - `timeline`

  In `schemas.ts`, add an optional `interviewCount` (int 0–6) to `OpportunitySchema`, and an optional `interviews: InterviewSchema[]` to `OpportunityWithHistorySchema`. Export the module from `index.ts`. Make T002 pass
- [X] T007 In `packages/shared/src/dateAdded.ts`:
  - `dateAddedProblem` takes the interviews too, and checks "after the first interview" after "after the first stage change"
  - generalise `dateAddedTimestamp` into `dayToTimestamp(day, { notBefore?, notAfter? }, now)`, keeping `dateAddedTimestamp` as a thin wrapper so feature 004 stays unchanged

  Make T003 pass
- [X] T008 Repository work, in `packages/api/src/repo/keys.ts` and `opportunityRepo.ts`:
  - **Keys**: `interviewKey(id, iid)` and `isInterviewItem`
  - **`getWithHistory`** also returns `interviews`, oldest first by `heldAt`
  - **`addInterview(id, interview, now)`**: a transaction that Puts the item, with `attribute_not_exists`, and Updates the OPP item. The update sets `interviewCount = if_not_exists(interviewCount, :zero) + :one` and `updatedAt`, with the condition `attribute_exists(PK) AND (attribute_not_exists(interviewCount) OR interviewCount < :max)`. A condition failure maps to `ApiError('VALIDATION_ERROR', limit message)`
  - **`updateInterview(id, iid, fields, via)`** updates the item with `attribute_exists`. It sets or removes `via` and `note`, and returns false if the interview is missing
  - **`removeInterview(id, iid, now)`**: a transaction that Deletes the item, with `attribute_exists`, and Updates the OPP item with `interviewCount - 1` and `updatedAt`, guarded by `interviewCount > :zero`. Returns false if the interview is missing
  - add all three to the `OpportunityRepo` interface

  Make T005 pass
- [X] T009 Create `packages/api/src/routes/interviews.ts`, registered in `handler.ts`:
  - **POST**: parse the body; read the opportunity (404); check `interviewDateProblem` (400 with fields `['heldAt']`); refuse a 7th up front with the limit message (the transaction guards the race); then `addInterview`, with a ULID from `newId`. Return 201 with `getWithHistory`
  - **PATCH**: the same checks for a given `heldAt`; then `updateInterview` (404 "Interview not found"). Return 200
  - **DELETE**: the confirm header; then `removeInterview` (404). Return 200

  In `routes/opportunities.ts`, pass the interviews to `dateAddedProblem`. Make T004 pass. Update `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml` (contracts/api-changes.md). Creating an opportunity now also returns `interviews: []`, so every response with history has the same shape
- [X] T010 Run lint, typecheck, and the affected tests; commit locally: `feat(api): log, edit, and remove interviews, with a stored count (005: foundation)`

---

## Phase 3: User Story 1 — Log an interview (Priority: P1) 🎯 MVP

**Goal**: "Add interview" on the opportunity page, with the interview shown in the history.

**Independent test**: quickstart.md "Log interviews (US1)", steps 1–5.

- [X] T011 [P] [US1] Write `packages/web/tests/interviews.test.tsx` (tag `interview`):
  - **`InterviewForm`**:
    - "Date" (`type="date"`, `max` today) defaults to today and sends nothing when unchanged; an earlier day sends noon local time
    - on the date added's day it sends no earlier than `createdAt`
    - a future day or a day before the date added shows the message on the field and focuses it
    - "Note" is optional
  - **Detail page**:
    - "Add interview" opens the form; saving posts to `/opportunities/{id}/interviews` and shows "Interview · {date} · {note}" in the history in date order
    - the stage is unchanged
    - a server error shows above Save
    - "Cancel" closes the form
- [X] T012 [US1] Create `packages/web/src/components/InterviewForm.tsx` (and its CSS module), using `dayToTimestamp` and `interviewDateProblem`. Add `useAddInterview(id)` to `packages/web/src/api/hooks.ts`; it refreshes the opportunity and both lists. In `pages/OpportunityDetail.tsx`:
  - an "Add interview" button by "Edit details"
  - the history renders `timeline(o)`, with interview entries as "Interview · {date}", "· via Claude" when marked, then "· {note}"

  Make T011 pass
- [X] T013 [US1] Write `e2e/interviews.spec.ts` (`@interview`): log one today and one last week with a note; check the history order, and that the stage is unchanged
- [X] T014 [US1] Run lint, typecheck, and the affected tests; commit locally: `feat(web): log interviews from the opportunity page (005: US1)`

---

## Phase 4: User Story 2 — See the count on the board (Priority: P1)

**Goal**: The "{n} interviews" badge at the top right of cards with interviews.

**Independent test**: quickstart.md "The badge (US2)", steps 1–4.

- [X] T015 [P] [US2] Extend `packages/web/tests/overview-board.test.tsx` and `pages.test.tsx` (tags `overview`, `interview`):
  - **Board**: a card with `interviewCount: 1` shows "1 interview", and one with 3 shows "3 interviews", at the top right (in the card's header, after the company)
  - **No badge**: a card with 0 or no count has no badge
  - **Closed and Archive**: the badge shows in the Closed column and in the Archive
  - **The limit**: with 6 interviews, "Add interview" shows the limit message instead of the form
- [X] T016 [US2] In `packages/web/src/components/OpportunityCard.tsx` (and its CSS module), show `interviewCountText(o.interviewCount)` as a pill in the card header, top right, only when there is text. In `OpportunityDetail.tsx`, at 6, "Add interview" shows the limit message. Make T015 pass
- [X] T017 [US2] Add to `e2e/interviews.spec.ts` (`@interview @overview`, `@responsive`): seed an opportunity in Considering with two interviews and one without; the board shows "2 interviews" on the first card only, on phones too
- [X] T018 [US2] Run lint, typecheck, and the affected tests; commit locally: `feat(web): show the interview count on cards (005: US2)`

---

## Phase 5: User Story 3 — Correct or remove an interview (Priority: P2)

**Goal**: Edit and Remove on each interview in the history.

**Independent test**: quickstart.md "Correct and remove (US3)", steps 1–3.

- [X] T019 [P] [US3] Extend `packages/web/tests/interviews.test.tsx`:
  - **Edit**: swaps the entry for the filled-in form; saving sends `PATCH` with only what changed, and a cleared note as null
  - **Remove**: asks "Remove this interview? This can't be undone."; confirming sends `DELETE` with the confirm header, and the badge count drops; cancelling keeps it
  - **Date added**: the edit form's date-added field refuses a day after the first interview
- [X] T020 [US3] Add `useUpdateInterview` and `useRemoveInterview` to `hooks.ts`. In `OpportunityDetail.tsx`, add "Edit" and "Remove" on each interview entry; the confirm dialog reuses the pattern from `DeleteOpportunity`. Pass the interviews to the edit form's date-added check. Make T019 pass
- [X] T021 [US3] Add to `e2e/interviews.spec.ts`: edit an interview's date, then remove another; the history and the board's count follow
- [X] T022 [US3] Run lint, typecheck, and the affected tests; commit locally: `feat(web): edit and remove interviews (005: US3)`

---

## Phase 6: User Story 4 — Log interviews through Claude (Priority: P3)

**Goal**: The `add_interview` and `update_interview` tools, and counts in the summaries.

**Independent test**: quickstart.md "Through Claude (US4)", after deploy.

- [X] T023 [P] [US4] Extend `packages/api/tests/integration/mcp-write-tools.test.ts` and `mcp-read-tools.test.ts` (tag `mcp`):
  - **`add_interview`**: logs with a note, marked `via: 'CLAUDE'`, and takes one from the change limit
  - **`update_interview`**: changes the date and note; a null note clears it
  - **Refusals**: a future date and a 7th interview are refused with the web API's messages
  - **Descriptions**: the exact texts from contracts/mcp-tools-changes.md
  - **No remove tool**: there's no tool that removes interviews
  - **Summaries** include `interviewCount` (0 when none)
  - **`get_opportunity`** returns `interviews`
- [X] T024 [US4] In `packages/api/src/mcp/tools.ts`, register `add_interview` and `update_interview` (`CHANGES` annotations, `takeChange` first), and add `interviewCount: o.interviewCount ?? 0` to `summary`. Update `specs/003-mcp-server/contracts/mcp-tools.md`. Make T023 pass
- [X] T025 [US4] Run lint, typecheck, and the affected tests; commit locally: `feat(mcp): log and edit interviews through Claude (005: US4)`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T026 [P] README: interviews and the badge in the features paragraph; the new tools under "Use from Claude"
- [X] T027 Full local check:
  - `npm run lint`, `npm run typecheck`, `npm run build`
  - `npm run test:coverage`
  - `npx stryker run --force --mutate "<every changed source file>"` (zero survivors, static included)
  - `npm run test:e2e` (every project)

  Record the results in `specs/005-interview-count/checklists/validation.md`, listing the owner's by-hand checks from quickstart.md
- [ ] T028 **Only when the owner says to push**: push, open the PR, merge when every check is green, and confirm master's CI and Deploy
- [ ] T029 **After the deploy**: the owner's by-hand checks, including "I had a panel interview with Farmers today" through Claude

---

## Dependencies & Execution Order

- **Setup (T001)** first, then **Foundational (T002–T010)**, which every story needs.
- **US1 (T011–T014)** before **US2 (T015–T018)**: the e2e test for the badge logs interviews
  through the UI from US1. US2's unit work could start after Foundational.
- **US3** needs US1's form and history entries.
- **US4** needs only Foundational, so it can run in parallel with US1–US3.
- **Polish** comes last. T028 and T029 wait for the owner.

## Parallel Opportunities

- **Foundational**: the tests T002–T005 are in different files.
- **US4**: can be built alongside US1–US3.

## Implementation Strategy

- **MVP**: Foundational + US1 + US2, which log interviews and show the count. That's the
  owner's request.
- **Then**: US3 (corrections) and US4 (Claude).
- **One PR for the feature**, pushed when the owner says so.
