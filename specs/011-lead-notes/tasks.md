---

description: "Task list for notes on networking leads (feature 011)"
---

# Tasks: Notes on Networking Leads

**Input**: Design documents from `specs/011-lead-notes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/changes.md](./contracts/changes.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: the owner's quick changes (done), setup, a foundational phase (the note's
rules, storage and API), then one phase per user story (spec.md US1–US2), then polish.

**Pushing**: commit after each phase and push the branch (free: no Actions run). Open the pull
request and merge only when the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US2 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `leads` (Vitest `// @module-tag leads`, or `{ tags: ['leads'] }` on a
  block in a file that mixes features; Playwright `{ tag: '@leads' }`).
- **Edits**: write multi-line edits with Python script files in the scratchpad (`newline=''`).
  Never pipe a check through `tail` when its exit code matters, and stop the chain (`|| exit 1`)
  before any commit.
- **Names**:
  - in code and data: `LeadNote`, `notes`, `noteId`, `heldAt`, `NOTE#`, `noteCount`;
  - for Claude: `add_lead_note`, `update_lead_note`, with `lead_id`, `note_id`, `text`,
    `held_at`, as the interview tools name theirs;
  - on screen: "Notes", "Add note", "Show all N notes", "Edit note", "Delete note".
- **Notes are plain text**: never turned into links (FR-005); line breaks kept as typed.
- **The rules** (data-model.md): `text` required, "Write a note" when blank, "up to 5,000
  characters"; `heldAt` "Defaults to now; not in the future"; "up to 200" notes a lead; order
  "newest `heldAt` first, then newest `createdAt`".

---

## Phase 0: The owner's quick changes (done)

- [X] T001 Archive last in the navigation, on desktop and phones (FR-011):
  `packages/web/src/components/Layout.tsx`, with the order test in
  `packages/web/tests/App.test.tsx`.
- [X] T002 A lead's Edit and Delete keep their normal size on cards without opportunities:
  `packages/web/src/pages/Leads.module.css` (the card is a column, the buttons at its bottom),
  with a size check in `e2e/leads.spec.ts`.
- [X] T003 The add form shows every field at once, with no "More details" (FR-012):
  `packages/web/src/components/OpportunityForm.tsx` (+css), the unit tests that opened the
  section, and the e2e steps in `e2e/fixtures.ts`, `e2e/board-and-form.spec.ts` and
  `e2e/accessibility.spec.ts`.

---

## Phase 1: Setup

- [X] T004 In `scripts/test-tags.mjs`:
  - widen the `leads` description to "Networking leads: the page, their notes, linking
    opportunities to them, and Claude's lead tools (features 010–011)";
  - add `SOURCE_TAGS` entries tagged `leads`, before the catch-alls, for
    `packages/shared/src/leadNotes.ts`, `packages/web/src/components/NoteDialog*` and
    `packages/web/src/components/DeleteNote*`.

  Run `npm run lint`.

---

## Phase 2: Foundational (blocks every story)

- [X] T005 Tests first in a new `packages/shared/tests/unit/leadNotes.test.ts`
  (`@module-tag leads`):
  - **`LeadNoteInputSchema`**: keeps `text` with its line breaks (trimmed at the ends only) and
    an optional `heldAt`; refuses a missing or blank text ("Write a note"), a text over 5,000
    characters, a `heldAt` that isn't an ISO timestamp, and any other field.
  - **`LeadNotePatchSchema`**: `text` and `heldAt` both optional; a blank `text` is refused (it
    can't be cleared); any other field refused.
  - **`noteDateProblem(heldAt, now)`**: undefined for now and the past; "A note can't be dated
    in the future" past the stage change's clock skew.
  - **`byNewestNote`**: newest `heldAt` first; on the same `heldAt`, newest `createdAt` first.
  - **`LeadNoteSchema`** and the lead list's `notes` (`LeadWithOpportunitiesSchema` gains
    `notes: LeadNote[]`) parse the shapes in contracts/changes.md.
  - **Constants**: `MAX_LEAD_NOTES` is 200; `LEAD_NOTE_MESSAGES` holds "Write a note", the future
    message, "This lead already has 200 notes, the most it can have" and "Note not found".
- [X] T006 Make T005 pass:
  - **`packages/shared/src/leadNotes.ts`** (new): the constants, `noteDateProblem` (reusing
    `CLOCK_SKEW_MS`, as `interviewDateProblem` does) and `byNewestNote`.
  - **`packages/shared/src/schemas.ts`**: `LeadNoteSchema`
    (`{ id, leadId, heldAt, text, createdAt, updatedAt }`), its input and patch schemas, `notes`
    on `LeadWithOpportunitiesSchema`, and the types. Export from the package index.

  Rebuild with `npm run build -w @jot/shared`.
- [X] T007 API tests first in a new `packages/api/tests/integration/lead-notes.test.ts`
  (`@module-tag leads`; planned inside `leads.test.ts`, which was long enough already):
  - **`POST /leads/:id/notes`**: 201 with the note; `heldAt` defaults to now; an earlier
    `heldAt` is kept; a future one, a blank text and an unknown field give 400 on the field;
    an unknown lead gives 404 "Lead not found".
  - **The limit**: the 201st note gives 400 with the limit message, and two adds at once never
    pass 200 (seed 199 directly, then add two at once: one is refused). A lead stored before
    this feature (no `noteCount`) takes notes.
  - **`GET /leads`**: each lead has `notes`, in order (same `heldAt`: newest added first), and
    `[]` without any; the notes never show up as leads.
  - **`PATCH /leads/:id/notes/:noteId`**: changes the text or date, sets `updatedAt`, and
    refuses a future date; an unknown note or lead gives 404 "Note not found".
  - **`DELETE /leads/:id/notes/:noteId`**: 400 without `X-Confirm-Delete: true`; with it, 204,
    the note is gone and another can be added at the limit; an unknown note gives 404.
  - **Nothing else changes** (FR-008): adding, editing and deleting a note leave the lead's
    item (but `noteCount`) and its linked opportunities as they were.
  - **Deleting a lead** deletes its notes too, including more than one transaction holds
    (seed bare note items directly, as the 199-opportunity test does), with the lead last.
- [X] T008 Make T007 pass:
  - **`packages/api/src/repo/keys.ts`**: `NOTE_PREFIX`, `leadNoteKey(leadId, noteId)`, its GSI1
    keys (`GSI1PK = LEADS`, `GSI1SK = <leadId>#NOTE#<noteId>`) and `isLeadNoteItem`.
  - **`packages/api/src/repo/leadRepo.ts`**:
    - `list()` returns leads with their `notes`, from the same paged query, telling items apart
      by `SK`;
    - `addNote` (one transaction: the note's Put, and the lead's `noteCount` raised only if the
      lead exists and the count is under 200, as `addInterview` does), `updateNote`
      (conditional on the note existing) and `deleteNote` (Delete and `noteCount` lowered, in
      one transaction);
    - `delete` also deletes the lead's notes, read with a query on its partition, in the same
      batches as the unlinks, with the lead's own item last.
  - **`packages/api/src/routes/leads.ts`**: the three note routes, checking `heldAt` with
    `noteDateProblem`; `GET /leads` sorts each lead's notes with `byNewestNote`.

  Run the API tests.

**Checkpoint**: notes can be added, listed, edited and deleted through the API. Commit and push.

---

## Phase 3: User Story 1 - Note each conversation with a lead (Priority: P1) 🎯 MVP

**Goal**: notes on each lead's card, with add, edit and delete.

**Independent Test**: spec.md US1: add a note for today and one for last week; both show, newest
first; edit one, delete the other.

- [X] T009 [P] [US1] Tests first in a new `packages/web/tests/lead-notes.test.tsx`
  (`@module-tag leads`; planned inside `leads.test.tsx`):
  - **No notes**: the card has "Add note" and no notes area.
  - **One note**: its day ("Oct 30, 2026") and text, line breaks kept; no "Show all".
  - **Several**: the newest shows; "Show all 3 notes" (`aria-expanded="false"`) opens the rest
    below it, newest first, and closes them again.
  - **Plain text**: a link written in a note isn't a link.
  - **Adding**: "Add note" opens a dialog titled "Add a note for Dana Ruiz", with the date
    (today, max today) and the note. Saving posts `text` and `heldAt` (today: now; an earlier
    day: noon, from `dayToTimestamp`), the list refreshes, and focus returns to "Add note". A
    blank note shows "Write a note" without posting. The API's refusal shows in the dialog;
    "Saving…" while waiting.
  - **Editing**: a note's "Edit" (named "Edit the note on Oct 30, 2026 with Dana Ruiz") opens
    the dialog filled in, titled "Edit note"; saving sends a PATCH of what changed.
  - **Deleting**: its "Delete" asks first; Cancel does nothing; confirming sends the DELETE with
    the header; a failure shows in the confirmation.
  - **The lead's delete**: says " 2 notes will be deleted." (and "1 note") beside the
    opportunities it already counts; nothing when there are none.
  - **Focus and keys**: the dialogs keep focus inside, close on Escape, and give focus back.
  - **Refreshing**: a note change refreshes only the leads.
- [X] T010 [US1] Make T009 pass:
  - **`packages/web/src/api/hooks.ts`**: `useAddLeadNote`, `useUpdateLeadNote` and
    `useDeleteLeadNote`, each refreshing only the leads.
  - **`packages/web/src/components/NoteDialog.tsx`** (new): add and edit, like `LeadDialog`,
    with the date as the interview form has it and a textarea for the note.
  - **`packages/web/src/components/DeleteNote.tsx`** (new): the confirmation, like
    `DeleteLead`.
  - **`packages/web/src/components/DeleteLead.tsx`**: the note count.
  - **`packages/web/src/pages/Leads.tsx`** and **`Leads.module.css`**: the card's notes (text
    with `white-space: pre-wrap`, wrapping long words), "Show all", and "Add note" beside Edit
    and Delete.
- [X] T011 [US1] `e2e/leads.spec.ts` (`{ tag: ['@leads', '@responsive'] }`), with an
  `addLeadNote` helper in `e2e/fixtures.ts` that posts through the API:
  - add a note from the card; it shows with today's day;
  - with an older note seeded, "Show all 2 notes" lists both, newest first;
  - edit the older one's text; delete it after confirming;
  - deleting the lead says how many notes will go;
  - axe on the card with notes open and on the note dialog, in light and dark;
  - on iPhone, a long note wraps and the page doesn't scroll sideways.

**Checkpoint**: notes work in the web app. Commit and push.

---

## Phase 4: User Story 2 - Claude works with a lead's notes (Priority: P2)

**Goal**: Claude reads, adds and changes notes, and can't delete them.

**Independent Test**: spec.md US2, through the MCP tests.

- [X] T012 [P] [US2] Tests first in `packages/api/tests/integration/mcp-read-tools.test.ts` and
  `mcp-write-tools.test.ts` (blocks tagged `leads`):
  - **`list_leads`**: each lead's `notes` as `[{ id, heldAt, text }]`, newest first, `[]`
    without any; its description mentions the notes.
  - **`add_lead_note`**: adds with `held_at` defaulting to now, or an earlier one; a blank text
    and a future date are refused with the web app's messages; an unknown lead gives
    "NOT_FOUND: Lead not found".
  - **`update_lead_note`**: changes the text or date; an unknown note gives "NOT_FOUND: Note not
    found".
  - **The limit**: each counts toward the change limit; listing doesn't.
  - **No delete**: no tool deletes a note.
  - **Descriptions**: each new tool's title, description and field descriptions, as the lead
    tools' are checked.

  Then make them pass in `packages/api/src/mcp/tools.ts`. Update the tests that pin the tool
  lists.
- [X] T013 [US2] Contracts:
  - **`specs/001-job-opportunity-tracker/contracts/api.openapi.yaml`**: the note routes, the
    `LeadNote` schema, and `notes` on `LeadWithOpportunities`.
  - **`specs/003-mcp-server/contracts/mcp-tools.md`**: the two tools and `list_leads`' notes.

  Check the YAML parses.

**Checkpoint**: everything in the spec works. Commit and push.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T014 [P] Docs:
  - **README**: lead notes among what the app does; Claude's two note tools; the add form
    showing every field; the navigation order, if it's described.
  - **`specs/010-networking-leads/data-model.md`**: a line saying feature 011 adds notes.

  Check the README's diagrams: the system diagram is unchanged (no new service or store).
- [X] T015 [P] Create `specs/011-lead-notes/checklists/validation.md`:
  - automated results;
  - the **architecture diagrams** checked (FR-010), with a note on whether they changed, and
    the data-model diagram checked to draw;
  - the owner's checks (quickstart.md "Deployed"), still open.

  Also record in `specs/010-networking-leads/checklists/validation.md` that the owner checked
  Claude's lead tools after the 010 deploy (2026-11-01).
- [X] T016 Full local check, then record the results in validation.md, commit and push:
  - lint, typecheck and build;
  - all unit tests, with coverage ≥ 80%;
  - the full e2e suite, desktop and iPhone;
  - mutation testing on every file (the shared schemas changed), ≥ 95%.
- [ ] T017 **Only when the owner says so**: open the pull request, merge when every check is
  green, and confirm the deploy and its smoke test.
- [ ] T018 **After the deploy**: the owner's checks (quickstart.md "Deployed"). Claude's
  connector may need reconnecting to see the new tools.

---

## Dependencies & Execution Order

- **Phase 0 (T001–T003)** is done.
- **Setup (T004)**, then **Foundational (T005–T008)**: both stories need the rules and the API.
- **US1 (T009–T011)** is the MVP: notes in the web app.
- **US2 (T012–T013)** needs only the API, so it can run beside US1.
- **Polish (T014–T016)** comes last. T017 and T018 wait for the owner.

## Parallel Opportunities

- **Stories**: T009–T010 (web) and T012 (Claude) are in different files.
- **Polish**: T014 and T015.

## Implementation Strategy

- **MVP**: Foundational plus US1: dated notes on each lead, in the web app.
- **Then**: US2 lets Claude read and add them.
- **One PR** when the owner says to merge, including Phase 0's changes.
