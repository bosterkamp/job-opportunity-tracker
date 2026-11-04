---

description: "Task list for networking leads (feature 010)"
---

# Tasks: Networking Leads

**Input**: Design documents from `specs/010-networking-leads/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/changes.md](./contracts/changes.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: Setup, a foundational phase (the lead's schemas, storage and API), then one
phase per user story (spec.md US1–US2), then polish.

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
  - in code and data: `lead`, `leadId`, `LEAD#`;
  - on screen: "Networking leads" (the page and nav), "Leads" (the phone's bottom bar), "Add
    lead", "Lead" (the form field and the detail fact), "No lead".
- **Email and phone are plain text everywhere**: never `mailto:` or `tel:` links (spec FR-003).
- **Only three fields**: a lead has `name`, `email` and `phone`, plus `id`, `createdAt` and
  `updatedAt`. Nothing else (FR-002).

---

## Phase 1: Setup

- [X] T001 Add the `leads` tag to `scripts/test-tags.mjs`:
  - in `TAGS`, described as "Networking leads: the page, linking opportunities to them, and
    Claude's lead tools (feature 010)";
  - in `E2E_FEATURES`;
  - in `SOURCE_TAGS`:
    - new entries, before the catch-alls, for `api/src/repo/leadRepo.ts`,
      `api/src/routes/leads.ts`, `web/src/pages/Leads*`, `web/src/components/LeadDialog*` and
      `web/src/components/DeleteLead*`;
    - `leads` added to the existing entries for `OpportunityForm*`,
      `pages/OpportunityDetail.tsx`, `components/Layout*`, `api/src/mcp/tools.ts` and
      `api/src/routes/opportunities.ts`, if it has its own entry.

  Run `npm run lint`.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 Tests first in a new `packages/shared/tests/unit/leads.test.ts` (`@module-tag leads`):
  - **`LeadInputSchema`**:
    - keeps a trimmed name, email and phone;
    - refuses a missing or blank name ("Name is required"), and a name over 200 characters;
    - refuses an invalid email ("Enter a valid email address") and a phone over 50
      characters;
    - drops a blank email or phone;
    - refuses any other field (for example `notes`).
  - **`LeadPatchSchema`**: `null` or blank clears `email` or `phone` (to `null`), and the name
    can't be cleared.
  - **`LeadSchema`** and **`LeadWithOpportunitiesSchema`** parse the shapes in
    contracts/changes.md.

  In `packages/shared/tests/unit/schemas.test.ts` (block tagged `leads`):
  `OpportunityInputSchema` keeps `leadId` and drops a blank one; `OpportunityPatchSchema` keeps
  one, and `null` or blank clears it; `OpportunitySchema` accepts it missing.
- [X] T003 Make T002 pass in `packages/shared/src/schemas.ts`: the lead schemas beside the
  contact's, reusing its `Email` and `shortText` rules (the name uses
  `requiredText('Name is required')`), and `leadId` on the opportunity schemas, a short text
  trimmed to 100 characters. (Planned as a separate `leads.ts`; kept in `schemas.ts` so the
  private helpers stay private.)
- [X] T004 API tests first in a new `packages/api/tests/integration/leads.test.ts`
  (`@module-tag leads`), using the existing Dynamo test helpers:
  - `POST /leads` returns 201 with the lead;
  - `GET /leads` sorts by name ignoring case, gives each lead its linked opportunities (open and
    closed, newest stage change first) and `[]` when none, and gives `{ items: [] }` when there
    are no leads;
  - `PATCH /leads/:id` changes and clears fields, and gives 404 for an unknown id;
  - `DELETE /leads/:id` without the header gives 400; with it, 204, the lead is gone, its
    opportunities have no `leadId` and a new `updatedAt`, and their stage and history are
    unchanged; an unknown id gives 404;
  - deleting a lead with 101 linked opportunities (use `pageSize` or a direct batch write to
    seed) unlinks them all;
  - opportunities: `POST` and `PATCH` with an unknown `leadId` give 400 "That lead doesn't
    exist" on `leadId`; with a real one, it's stored; `PATCH` with `null` removes it; moving
    stage keeps it; no history entry is added by linking.
- [X] T005 Make T004 pass:
  - **`packages/api/src/repo/keys.ts`**: `leadKey` and the `LEADS` partition.
  - **`packages/api/src/repo/leadRepo.ts`**: `create`, `get`, `list`, `update` (null removes
    the attribute) and `deleteWithUnlinks(id, opportunityIds, now)`. The delete is one
    transaction, or batches of unlinks then the delete when there are more than 99.
  - **`packages/api/src/routes/leads.ts`**: the four routes.
  - **`routes/opportunities.ts`**: check `leadId` against the lead repo on create and patch.
  - **`handler.ts`**: wire it all into `createRoutes`.

  Run the API tests.

**Checkpoint**: leads can be stored, listed, edited, linked and deleted through the API.
Commit and push.

---

## Phase 3: User Story 1 - Keep a list of networking leads (Priority: P1) 🎯 MVP

**Goal**: the Networking leads page, "Add lead", editing and deleting.

**Independent Test**: spec.md US1: add, see, edit and delete a lead; the empty state.

- [X] T006 [P] [US1] Tests first in a new `packages/web/tests/leads.test.tsx`
  (`@module-tag leads`), with the existing test harness and a mocked API:
  - **Empty state**: the page has the heading "Networking leads", and with no leads it says so
    and shows "Add lead".
  - **The list**: leads are listed by name with their email and phone as plain text (no links
    in the card except the opportunities').
  - **Adding**: "Add lead" opens a dialog with Name, Email and Phone. Saving posts the values
    and the list refreshes. A blank name shows "Name is required" without posting. The API's
    errors show in the dialog.
  - **Editing**: "Edit" opens the dialog filled in, and saving sends a PATCH (clearing a field
    sends `null`).
  - **Deleting**: "Delete" opens a confirm naming the lead. Cancel does nothing; confirming
    sends the DELETE with the header.
  - **Accessibility**: the dialogs trap focus and Escape closes them, as the existing dialogs
    do.
- [X] T007 [US1] Make T006 pass:
  - **`packages/web/src/api/hooks.ts`**: `useLeads`, `useCreateLead`, `useUpdateLead` and
    `useDeleteLead`. Each mutation refreshes the leads list, and deleting also refreshes the
    opportunities.
  - **`packages/web/src/components/LeadDialog.tsx`**: one dialog for add and edit, using
    `Dialog.module.css` and `keepFocusInside`.
  - **`packages/web/src/components/DeleteLead.tsx`**: the confirm, like `DeleteOpportunity`.
  - **`packages/web/src/pages/Leads.tsx`** and **`Leads.module.css`**: the page, with "Add
    lead" styled like the header's "Add opportunity".
  - **`App.tsx`**: the `/leads` route.
- [X] T008 [US1] Navigation, tests first in the existing Layout or App test file (find the one
  that checks `NAV_ITEMS`; block tagged `leads`):
  - the main navigation lists Overview, Archive, Networking leads;
  - the leads link's accessible name is always "Networking leads", and it has a short "Leads"
    label for phones.

  Then make them pass in `packages/web/src/components/Layout.tsx` and `Layout.module.css`, with
  long and short label spans like the site title's (feature 008).

**Checkpoint**: the leads page works on its own. Commit and push.

---

## Phase 4: User Story 2 - Link a lead to the opportunities they helped with (Priority: P2)

**Goal**: an opportunity links to a lead; both sides show it; Claude can do it all.

**Independent Test**: spec.md US2: link two opportunities, see them on both sides, unlink one,
delete the lead.

- [X] T009 [P] [US2] Form tests first in `packages/web/tests/OpportunityForm.test.tsx` (block
  tagged `leads`):
  - a "Lead" select lists "No lead" then every lead by name;
  - two leads with the same name show their email (or phone) after the name;
  - picking one sends `leadId` on add;
  - on edit it's preselected, and choosing "No lead" sends `null`.

  Then make them pass in `packages/web/src/components/OpportunityForm.tsx` (the form gets the
  leads from `useLeads`). Saving an opportunity refreshes the leads list.
- [X] T010 [P] [US2] Detail and leads page tests first:
  - **In `packages/web/tests/pages.test.tsx`** (block tagged `leads`):
    - the opportunity's page shows "Lead" with the name, email and phone as text;
    - with no lead, or a `leadId` that isn't in the list, it shows nothing.
  - **In `leads.test.tsx`**:
    - each lead lists its opportunities as links to `/opportunities/:id`, with company, title
      and stage;
    - the delete confirm says how many opportunities will be unlinked ("1 opportunity", "2
      opportunities"; nothing when there are none).

  Then make them pass in `pages/OpportunityDetail.tsx`, `pages/Leads.tsx` and
  `components/DeleteLead.tsx`.
- [X] T011 [P] [US2] Claude's tools, tests first in `packages/api/tests/integration/`
  `mcp-read-tools.test.ts` and `mcp-write-tools.test.ts` (blocks tagged `leads`):
  - **`list_leads`**: every lead, with `null` for a missing email or phone, and its
    opportunities' ids, companies, titles and stages.
  - **`add_lead`** and **`update_lead`**:
    - they work, and `null` clears the email or phone;
    - a bad email is refused with the web app's message;
    - both count toward the change limit.
  - **Linking**: `add_opportunity` and `update_opportunity` take `leadId`, and `null` unlinks
    on update. An unknown lead is refused with "That lead doesn't exist".
  - **`get_opportunity`**: returns `lead` with the lead's fields, or `null`, including for a
    link to a missing lead.
  - **No delete**: the tool list has no tool that deletes a lead.

  Then make them pass in `packages/api/src/mcp/tools.ts`. Update any test that pins the tool
  list or a tool's exact shape.
- [X] T012 [US2] Contracts:
  - **`specs/001-job-opportunity-tracker/contracts/api.openapi.yaml`**: the lead routes and
    schemas, and `leadId` on the opportunity.
  - **`specs/003-mcp-server/contracts/mcp-tools.md`**: the new tools and the changed ones, per
    contracts/changes.md.
- [X] T013 [US2] `e2e/leads.spec.ts` (`{ tag: ['@leads', '@responsive'] }`), with a
  `createLead` helper in `e2e/fixtures.ts`:
  - **Empty**: open Networking leads from the navigation; the empty state shows.
  - **Add**: add a lead with "Add lead".
  - **Link**:
    - add an opportunity picking the lead under "Lead";
    - the opportunity's page shows the lead;
    - the lead's card lists the opportunity, and its link opens it.
  - **Unlink**: edit the opportunity to "No lead"; the lead no longer lists it.
  - **Delete**: link it again, delete the lead, and confirm. The dialog says 1 opportunity; the
    opportunity remains, with no lead.
  - **Accessibility**: axe on the leads page and the add dialog, in light and dark.
  - **Phones**: on iPhone, the bottom bar shows "Leads" and the page doesn't scroll sideways.

**Checkpoint**: everything in the spec works. Commit and push.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T014 [P] README:
  - the Networking leads page and linking, among what the app does;
  - Claude's three lead tools, and `leadId` on the add and update tools;
  - the `leads` row in the Test tags table.

  Check the README's diagrams: the system diagram is unchanged (no new service or store).
- [X] T015 [P] Create `specs/010-networking-leads/checklists/validation.md`:
  - automated results;
  - the **architecture diagrams** checked (FR-012), with a note on whether they changed, and
    the data-model diagram checked to draw;
  - the owner's checks (quickstart.md "Deployed"), still open.
- [X] T016 Full local check, then record the results in validation.md, commit and push:
  - lint, typecheck and build;
  - all unit tests, with coverage ≥ 80%;
  - the full e2e suite, desktop and iPhone;
  - mutation testing on every file (the shared schemas changed), ≥ 95%.
- [ ] T017 **Only when the owner says so**: open the pull request, merge when every check is
  green, and confirm the deploy and its smoke test. The `stage-descriptions` branch is its own
  pull request unless the owner says to combine them.
- [ ] T018 **After the deploy**: the owner's checks (quickstart.md "Deployed"). Claude's
  connector may need reconnecting to see the new tools.

---

## Dependencies & Execution Order

- **Setup (T001)** comes first, then **Foundational (T002–T005)**. Both stories need the
  schemas and the API.
- **US1 (T006–T008)** is the MVP: leads exist and can be managed.
- **US2 (T009–T013)** needs leads to link to:
  - T009, T010 and T011 are in different files;
  - T013's e2e covers US1 too.
- **Polish (T014–T016)** comes last. T017 and T018 wait for the owner.

## Parallel Opportunities

- **Foundational**: T002's two test files.
- **US1**: T006 runs beside T008's tests.
- **US2**: T009 (form), T010 (detail and leads page) and T011 (tools).
- **Polish**: T014 and T015.

## Implementation Strategy

- **MVP**: Foundational plus US1: a list of leads with add, edit and delete.
- **Then**: US2 links them to opportunities, in the web app and through Claude.
- **One PR** when the owner says to merge.
