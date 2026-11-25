---

description: "Task list for interview details (feature 012)"
---

# Tasks: Interview Details

**Input**: Design documents from `specs/012-interview-details/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/changes.md](./contracts/changes.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: setup, a foundational phase (the new fields, the date rule, the summary, and
the API), then one phase per user story (spec.md US1–US5), then polish.

**Pushing**: commit after each phase and push the branch (free: no Actions run). Open the pull
request and merge only when the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `interview` (Vitest `// @module-tag interview`, or
  `{ tags: ['interview'] }` on a block in a file that mixes features; Playwright
  `{ tag: '@interview' }`). Card tests are also `overview`; Claude's are also `mcp`.
- **Edits**: write multi-line edits with Python script files in the scratchpad (`newline=''`).
  Never pipe a check through `tail` when its exit code matters, and stop the chain (`|| exit 1`)
  before any commit.
- **Names**:
  - in code and data: `kind`, `panel`, `format`, `outcome`, `nextSteps`, `interviewers`
    (`Interviewer`: `name`, `title`, `email`, `phone`, `linkedin`), `interviewTimes`,
    `interviewSummary` (`{ held, nextAt }`);
  - values: `HR`, `HIRING_MANAGER`, `BUSINESS`, `ENGINEERING`, `OTHER`; `PHONE`, `VIDEO`,
    `IN_PERSON`; `WENT_WELL`, `NOT_SURE`, `WENT_BADLY`;
  - for Claude: `kind`, `panel`, `format`, `outcome`, `next_steps`, `interviewers`, `held_at`,
    `upcoming`, `nextInterviewAt`;
  - on screen: "Interviews", "Upcoming", "Add interview", "Type", "Panel", "Format", "How it
    went", "Next steps", "Interviewers", "Add interviewer", "Next interview: {date and time}",
    and the labels in data-model.md.
- **The rules** (data-model.md "Rules and messages"): every new field optional; `nextSteps` at
  most 500 characters, the note still 200; "at most 10" interviewers, each with a name ("Name is
  required"), `name` and `title` at most 100, `email` a valid address at most 254, `phone` at
  most 50, `linkedin` at most 300 and "an `https` address on `linkedin.com` or a subdomain, with
  a path starting `/in/`", `https://` added when left out; `heldAt` "at most one year after
  now" and not before the date added; "up to 6" interviews, past and upcoming together.
- **Plain text**: next steps, the note and every interviewer detail but LinkedIn are plain text
  (FR-011); LinkedIn opens in a new tab with `rel="noopener noreferrer"`.
- **Past or upcoming**: `heldAt <= now` is past. Always computed from a `now` passed in, never
  stored.

---

## Phase 1: Setup

- [X] T001 In `scripts/test-tags.mjs`:
  - widen the `interview` description to "Interviews: logging them with their details and
    interviewers, upcoming ones, their pages, and the count (features 005 and 012)";
  - add `SOURCE_TAGS` entries tagged `interview`, before the catch-alls, for
    `packages/web/src/components/InterviewList*`, `packages/web/src/pages/NewInterview*` and
    `packages/web/src/pages/InterviewDetail*`; add `interview` to `OpportunityCard*`.

  Run `npm run lint`.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 Tests first in `packages/shared/tests/unit/interviews.test.ts`:
  - **`InterviewInputSchema`**: keeps every new field; refuses an unknown `kind`, `format` or
    `outcome`, a `panel` that isn't a boolean, `nextSteps` over 500, 11 interviewers, an
    interviewer without a name, a bad email, and each text over its limit; trims text, and
    drops blank optional text.
  - **`linkedin`**: keeps `https://www.linkedin.com/in/someone` and `https://uk.linkedin.com/in/x`;
    turns `linkedin.com/in/someone` into `https://linkedin.com/in/someone`; refuses
    `http://linkedin.com/in/x`, `https://linkedin.com/company/x`,
    `https://notlinkedin.com/in/x` and `https://linkedin.com.evil.example/in/x` with "Enter a
    LinkedIn profile address".
  - **`InterviewPatchSchema`**: each new field optional; `null` clears it, and `[]` or `null`
    clears `interviewers`.
  - **`interviewDateProblem`**: a time a year ahead is fine, a year and a day is "An interview
    can't be more than a year ahead"; before the date added is still refused.
  - **`interviewSummary(o, now)`**: `held` counts times at or before now (exactly now counts);
    `nextAt` is the soonest later time, or undefined; with no `interviewTimes`, `held` is
    `interviewCount` (older items); with both, the extra count is added to `held`.
  - **`interviewCountText`** takes the held count, as before.
  - **`timeline(o, now)`**: leaves out upcoming interviews; past ones are placed as before.
  - **`interviewSections(interviews, now)`**: `{ upcoming, past }`, upcoming soonest first, past
    newest first, ties by `recordedAt`.
  - **Labels**: `interviewKindLabel`, `interviewFormatLabel`, `interviewOutcomeLabel` give the
    data model's labels.
  - **`OpportunitySchema`** accepts `interviewTimes: string[]`, and `InterviewSchema` the new
    fields.
- [X] T003 Make T002 pass in `packages/shared/src/schemas.ts` (the enums, `InterviewerSchema`,
  the new fields on `InterviewSchema`, its input and patch schemas, and `interviewTimes` on
  `OpportunitySchema`) and `packages/shared/src/interviews.ts` (the labels, the year rule,
  `interviewSummary`, `interviewSections`, and `timeline`'s `now`). Export from the package
  index. Update the callers of `timeline` and `interviewCountText` so the build passes.

  Rebuild with `npm run build -w @jot/shared`.
- [X] T004 API tests first in `packages/api/tests/integration/interviews.test.ts`:
  - **Add**: every new field is stored and returned; an upcoming interview (tomorrow) is
    accepted; more than a year ahead is refused on `heldAt`; the limit of 6 counts upcoming
    ones.
  - **Edit**: each new field changes and clears; `interviewers` is replaced as a whole.
  - **`interviewTimes`**: the opportunity's times follow every add, date change and remove;
    an edit that keeps the date leaves them alone; the board's `GET /opportunities` returns
    them, sorted.
  - **Older items**: an opportunity with interviews stored before this feature (seeded without
    `interviewTimes`) gets them all on its first interview change, including when two changes
    run at once.
  - **Nothing else changes**: the stage, `lastStageChangeAt` and `changeCount` stay as they
    were (FR-013).
- [X] T005 Make T004 pass:
  - **`packages/api/src/repo/opportunityRepo.ts`**: store the new fields; start the map when
    it's missing (research §2), then keep `interviewTimes.#iid` in the add, date-changing edit
    and remove transactions; return `interviewTimes` as a sorted array; an edit's `null` clears
    with `REMOVE`.
  - **`packages/api/src/routes/interviews.ts`**: pass the new fields; the year rule.

  Run the API tests.

**Checkpoint**: the API takes and returns everything. Commit and push.

---

## Phase 3: User Story 1 - Record an interview's details (Priority: P1) 🎯 MVP

**Goal**: the form records every new field; the add page.

**Independent Test**: spec.md US1: log a hiring-manager video panel that went well, with next
steps; reopen and see each field; change the type.

- [X] T006 [P] [US1] Tests first in `packages/web/tests/interviews.test.tsx`:
  - **The form**: date and time (now by default), Type, Panel, Format, How it went, Next steps
    and Note; saving with only the date posts `{ heldAt }`; saving every field posts each, with
    the API's values; clearing a field on edit sends `null`.
  - **How it went**: offered for a past date; hidden for a future one, and hidden again when
    the date moves ahead.
  - **The add page** at `/opportunities/:id/interviews/new`: titled "Add an interview for
    {company}"; saving goes to the new interview's page; Cancel goes back to the opportunity;
    the API's refusal shows on its field; "Saving…" while waiting.
- [X] T007 [US1] Make T006 pass:
  - **`packages/web/src/components/InterviewForm.tsx`** (+css): the new fields, with native
    `<select>`s, a checkbox for Panel, and a `datetime-local` date (max a year ahead).
  - **`packages/web/src/pages/NewInterview.tsx`** (new) and its route in
    **`packages/web/src/App.tsx`**.
  - **`packages/web/src/api/hooks.ts`**: the add mutation returns the new interview's id (the
    newest by `recordedAt` in the response).

**Checkpoint**: interviews are recorded with their details. Commit and push.

---

## Phase 4: User Story 2 - Interviewers' contact details (Priority: P1)

**Goal**: the interviewers in the form and on the interview.

**Independent Test**: spec.md US2: three interviewers on a panel, one removed, one changed.

- [X] T008 [P] [US2] Tests first in `packages/web/tests/interviews.test.tsx`:
  - "Add interviewer" adds a row (Name, Title, Email, Phone, LinkedIn); each row's "Remove
    {name}" removes it; the order is kept; at 10, "Add interviewer" is disabled with the limit
    stated.
  - A row without a name, a bad email or a non-LinkedIn address shows its message on that field
    and posts nothing.
  - The list is posted as `interviewers`, and an edit sends the whole list.
- [X] T009 [US2] Make T008 pass in `packages/web/src/components/InterviewForm.tsx` (+css): the
  interviewer rows, each in a `<fieldset>` with a legend ("Interviewer 2"), and the checks
  mirrored from the shared schema.

**Checkpoint**: the owner can keep each interviewer's details. Commit and push.

---

## Phase 5: User Story 3 - The Interviews section and a page per interview (Priority: P1)

**Goal**: the section on the opportunity page, the interview page, and one-line history
entries.

**Independent Test**: spec.md US3: one upcoming and two past interviews, in order; each opens
its page; the history's lines open the same pages.

- [X] T010 [P] [US3] Tests first in `packages/web/tests/interviews.test.tsx` (and
  `pages.test.tsx` where it covers the detail page):
  - **The section**: "Interviews" with "Add interview" (a link to the add page; disabled with
    the limit stated at 6); "Upcoming" first, soonest first, then past, newest first; each a
    link with its date and time and, when set, its type, "Panel" and format; no list when there
    are none.
  - **The interview page** at `/opportunities/:id/interviews/:interviewId`: heading "{type}
    interview" or "Interview", the date and time, every set field with its label, the
    interviewers (LinkedIn a link, the rest plain text), and "Back to {company}"; Edit opens the
    form on the page and saving shows the change; Remove asks first and, when confirmed, goes
    back to the opportunity; an unknown id says "Interview not found" with the way back.
  - **The history**: each past interview is one line, "Interview · {date and time} · {type} ·
    Panel", linking to its page; upcoming ones aren't there; the old inline Edit and Remove are
    gone.
- [X] T011 [US3] Make T010 pass:
  - **`packages/web/src/components/InterviewList.tsx`** (+css, new): the section.
  - **`packages/web/src/pages/InterviewDetail.tsx`** (+css, new) and its route in
    **`packages/web/src/App.tsx`**, using `RemoveInterview`.
  - **`packages/web/src/pages/OpportunityDetail.tsx`**: the section after the details; the
    history's interview lines as links; the inline form and buttons removed.
- [X] T012 [US3] `e2e/interviews.spec.ts` (`{ tag: ['@interview', '@responsive'] }`), with an
  `addInterview` helper in `e2e/fixtures.ts` that posts through the API:
  - add an interview with every field and two interviewers from the add page; its page shows
    them;
  - open it from the section and from the history; reload its page;
  - edit it; remove it after confirming, and land on the opportunity;
  - axe on the add page, the interview page and the section, in light and dark;
  - on iPhone, a long email and LinkedIn address wrap and nothing scrolls sideways.

  Update the existing interview e2e steps for the moved Edit and Remove.

**Checkpoint**: the web app part of the request is done. Commit and push.

---

## Phase 6: User Story 4 - Upcoming interviews (Priority: P2)

**Goal**: upcoming interviews show as such, and the board shows the next one.

**Independent Test**: spec.md US4: an interview tomorrow is upcoming, not in the history or the
count, and on the card; moved to an hour ago, it's past and counted.

- [X] T013 [P] [US4] Tests first in `packages/web/tests/interviews.test.tsx` and the card tests
  (`overview` too):
  - the card's badge counts held interviews only; "Next interview: {date and time}" shows when
    one is upcoming, and nothing otherwise; a card without `interviewTimes` shows its
    `interviewCount` as before;
  - an upcoming interview moved into the past moves sections and appears in the history.
- [X] T014 [US4] Make T013 pass in `packages/web/src/components/OpportunityCard.tsx` (+css),
  using `interviewSummary`.
- [X] T015 [US4] `e2e/interviews.spec.ts` and `e2e/us3-overview.spec.ts`: an interview added for
  tomorrow is upcoming, its card shows the next interview and an unchanged count; edited to an
  hour ago, it's in the history and the count goes up.

**Checkpoint**: upcoming interviews work. Commit and push.

---

## Phase 7: User Story 5 - Claude works with interview details (Priority: P2)

**Goal**: Claude reads, adds and changes interviews with every field.

**Independent Test**: spec.md US5, through the MCP tests.

- [X] T016 [P] [US5] Tests first in `packages/api/tests/integration/mcp-read-tools.test.ts` and
  `mcp-write-tools.test.ts` (blocks tagged `interview` and `mcp`):
  - **`get_opportunity`**: every interview's new fields, interviewers and `upcoming`.
  - **`list_opportunities`, `find_opportunities`**: `interviewCount` is the held count;
    `nextInterviewAt` the next time or null.
  - **`add_interview`**: every new field and interviewers; an upcoming `held_at`; refusals with
    the web app's messages.
  - **`update_interview`**: changes and clears (`null`) each field; `interviewers` replaces the
    list.
  - **The limit**: each counts toward the change limit, as before; there's still no remove
    tool.
  - **Descriptions**: each changed tool's description lists the values and says to set
    `outcome` only after the interview.

  Then make them pass in `packages/api/src/mcp/tools.ts`. Update the tests that pin the tool
  schemas.
- [X] T017 [US5] Contracts: `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml` (the
  new fields, `Interviewer`, `interviewTimes`) and `specs/003-mcp-server/contracts/mcp-tools.md`
  (the changed tools). Check the YAML parses.

**Checkpoint**: everything in the spec works. Commit and push.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T018 [P] Docs:
  - **README**: interview details, upcoming interviews and the interview pages among what the
    app does; Claude's interview tools.
  - **`specs/005-interview-count/data-model.md`**: a line saying feature 012 adds the details
    and `interviewTimes`.

  Check the README's diagrams: the system diagram is unchanged (no new service or store).
- [X] T019 [P] Create `specs/012-interview-details/checklists/validation.md`:
  - automated results;
  - the **architecture diagrams** checked (FR-016), with a note on whether they changed, and
    the data-model diagram checked to draw;
  - the owner's checks (quickstart.md "By hand"), still open.

  Also record in `specs/011-lead-notes/checklists/validation.md` and its `tasks.md` the 011
  merge and deploy (T017) and the owner's checks (T018), once the owner confirms them.
- [X] T020 Full local check, then record the results in validation.md, commit and push:
  - lint, typecheck and build;
  - all unit tests, with coverage ≥ 80%;
  - the full e2e suite, desktop and iPhone;
  - mutation testing on every file (the shared schemas changed), ≥ 95%.
- [ ] T021 **Only when the owner says so**: open the pull request, merge when every check is
  green, and confirm the deploy and its smoke test.
- [ ] T022 **After the deploy**: the owner's checks (quickstart.md "By hand"). Claude's
  connector may need reconnecting to see the changed tools.

---

## Dependencies & Execution Order

- **Setup (T001)**, then **Foundational (T002–T005)**: every story needs the fields, the rules
  and the API.
- **US1 (T006–T007)** first: the form and the add page.
- **US2 (T008–T009)** extends the same form, so it follows US1.
- **US3 (T010–T012)** needs the add page from US1; with US1 and US2, it's the MVP.
- **US4 (T013–T015)** needs US3's section and history.
- **US5 (T016–T017)** needs only the API, so it can run beside US1–US4.
- **Polish (T018–T020)** comes last. T021 and T022 wait for the owner.

## Parallel Opportunities

- **Stories**: Claude's tools (T016) beside any web phase.
- **Polish**: T018 and T019.

## Implementation Strategy

- **MVP**: Foundational plus US1–US3: interviews with every detail and interviewer, each on its
  own page.
- **Then**: US4 adds upcoming interviews to the board, and US5 lets Claude use the details.
- **One PR** when the owner says to merge.
