---

description: "Task list for offer details and comparison (feature 013)"
---

# Tasks: Offer Details and Comparison

**Input**: Design documents from `specs/013-offer-comparison/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/changes.md](./contracts/changes.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: setup, a foundational phase (the shared rules and the API), then one phase per
user story (spec.md US1–US7), then polish.

**Pushing**: commit after each phase and push the branch (free: no Actions run). Open the pull
request and merge only when the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US7 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `offer` (Vitest `// @module-tag offer`, or `{ tags: ['offer'] }` on a
  block in a file that mixes features; Playwright `{ tag: '@offer' }`). Board and card tests are
  also `overview`; Claude's are also `mcp`.
- **Edits**: write multi-line edits with Python script files in the scratchpad (`newline=''`).
  Never pipe a check through `tail` when its exit code matters; guard lint with
  `if ! npm run lint --silent >/dev/null 2>&1; then …; exit 1; fi` before any commit.
- **Names**:
  - in code and data: `offer`, `offerScores`, `offerVersion`, `offerHistory`; the details
    `baseSalary`, `bonusPercent`, `signOnBonus`, `equity`, `retirement`, `insurance`,
    `location`, `workArrangement`, `title`, `role`, `pto`, `leadership`, `culture`,
    `startDate`, `respondBy`, `custom`; `OfferChange` `{ seq, at, kind, changes, via? }` with
    `kind` `RECORDED` | `CHANGED`; score keys are the detail names or `custom:<fieldId>`;
    helpers `offerOverall`, `scoreLabel`, `respondByText`, `isOffer`, `offerChanges`;
  - keys: `OFFERCHANGE#<seq>` (six digits) in `OPP#<id>`; `SETTINGS` / `OFFER_FIELDS`;
  - for Claude: snake_case details (`base_salary`, `bonus_percent`, `sign_on_bonus`,
    `work_arrangement`, `start_date`, `respond_by`, …), `opportunity_id`, `scores`, `custom`,
    `name`, `new_name`;
  - on screen: "Offer", "Add offer", "Edit offer", "Remove offer", "Offer recorded", "via
    Claude", "Offers", "Compare N", "Fields to compare", "Add field", "Not scored", "No details
    yet", "Respond by {date}", "Response was due {date}", the detail labels "Base salary",
    "Bonus", "Sign-on bonus", "Equity", "401k", "Insurance", "Location", "Work arrangement",
    "Title", "Role", "PTO", "Leadership", "Culture", "Start date", "Respond by", and the score
    words 0 "Not offered", 1 "Worst", 2 "Poor", 3 "Okay", 4 "Good", 5 "Best", shown as
    "{n} · {word}".
- **The rules** (data-model.md "Rules and messages"): every detail optional; `baseSalary` and
  `signOnBonus` "a whole number from 0 to 10,000,000" ("Enter a whole number, like 150000"),
  typed through `parseAmount`; `bonusPercent` "0–100, at most one decimal place" ("Enter a
  percentage from 0 to 100, like 12.5"); `title` "At most 200", the other text and each custom
  value "At most 500" ("Must be {n} characters or fewer"); `startDate` and `respondBy`
  "YYYY-MM-DD; any date" ("Use a date like 2026-11-03"); "Unknown custom field"; scores "a whole
  number 0–5" ("Score with a whole number from 0 to 5"); "Add the offer before scoring it";
  custom fields "At most 20; names trimmed, 1–60 characters, unique regardless of case" ("You can
  have at most 20 custom fields", "Name the field", "There's already a field called {name}");
  removing a field or the offer needs `X-Confirm-Delete: true`; a race is 409 "This opportunity
  changed since you loaded it. Reload and try again." Text is trimmed; blank means none; `null`
  clears on a change.
- **Plain text**: every offer text and custom value is shown as plain text.
- **Never changes the stage**: offers, scores and fields leave `stage`, `lastStageChangeAt`,
  `changeCount` and the stage history alone (FR-015).
- **Today**: `respondByText` takes `today` (the device's date) passed in, never read inside.

---

## Phase 1: Setup

- [X] T001 In `scripts/test-tags.mjs`:
  - add the tag `{ name: 'offer', description: 'Offers: their details and history, the Offers
    page, comparing and scoring them, custom fields, and respond-by dates (feature 013)' }`,
    and `offer` to `E2E_FEATURES`;
  - add `SOURCE_TAGS` entries before the catch-alls: `packages/shared/src/offers.ts` →
    `['offer', 'overview', 'mcp']`; `packages/api/src/repo/offerFieldsRepo.ts` and
    `packages/api/src/routes/offers.ts` → `['offer', 'mcp']`; `packages/web/src/components/OfferSection*`,
    `OfferForm*`, `ScoreCell*`, `OfferFields*`, `packages/web/src/pages/EditOffer*`,
    `Offers*` and `CompareOffers*` → `['offer']`; add `offer` to `OpportunityCard*`,
    `StageBoard*`, `OpportunityDetail.tsx` and `packages/api/src/mcp/tools.ts`.

  Create empty placeholder files only when a pattern needs one to exist (the tag check requires
  every pattern to match a file; add each entry in the task that creates its file if simpler).
  Run `npm run lint`.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 Tests first in `packages/shared/tests/unit/offers.test.ts`:
  - **`OfferInputSchema`** (the PATCH body): keeps each detail; parses "165k" and "165,000" to
    165000; refuses an amount over 10,000,000, below 0 or fractional, a bonus of 100.1, -1 or
    12.55, `title` over 200, each other text over 500, a bad date ("2026-13-01", "11/03/2026"),
    a `workArrangement` outside `ONSITE`/`HYBRID`/`REMOTE`, a custom value over 500, and any
    unknown key; trims text and turns blank into a clear; `null` clears each detail and each
    custom value.
  - **`OfferScoresPatchSchema`**: `{ scores: { key: 0–5 | null } }`; refuses 6, -1, 2.5 and a
    key that isn't a detail name or `custom:<id>` (`custom`, `createdAt` and `updatedAt` aren't
    score keys).
  - **`OfferFieldsPutSchema`**: names trimmed; refuses blank ("Name the field"), 61 characters,
    a case-insensitive duplicate ("There's already a field called Commute"), and 21 fields.
  - **`offerChanges(before, after)`**: `[]` when nothing changed; a changed detail is
    `{ field, from, to }`; added has `from: null`, cleared `to: null`; custom values as
    `custom:<id>`; ignores `createdAt` and `updatedAt`; details in FR-002 order.
  - **`offerOverall(scores, fields)`**: 5, 4 and 0 give 3.0; 0s count; 4 and 5 give 4.5;
    rounding to one decimal (1, 2, 2 → 1.7); scores for a removed custom field are ignored;
    none scored is `undefined`.
  - **`scoreLabel(n)`**: the six words; `scoreTone(overall)` rounds to the nearest whole score
    (3.5 → 4, 3.4 → 3).
  - **`respondByText(respondBy, today, status)`**: "Respond by {date}" (plain) more than 3 days
    ahead; warning 3 days ahead, today and 1 day ahead; "Response was due {date}" (plain) once
    passed; never warning for a closed opportunity; undefined with no date.
  - **`isOffer(o)`**: true with `offer`, or in the `OFFER` stage; false otherwise.
  - **`OpportunitySchema`** accepts `offer`, `offerScores` and `offerHistory`; an opportunity
    without them still parses.
- [X] T003 Make T002 pass in `packages/shared/src/schemas.ts` (`OfferSchema`, `OfferInputSchema`,
  `OfferChangeSchema`, `OfferScoresPatchSchema`, `OfferFieldSchema`, `OfferFieldsPutSchema`, and
  the new optional fields on `OpportunitySchema`) and `packages/shared/src/offers.ts` (new: the
  detail keys and labels in FR-002 order, the limits and messages, `offerChanges`,
  `offerOverall`, `scoreLabel`, `scoreTone`, `respondByText`, `isOffer`). Reuse `parseAmount`
  and `MAX_SALARY` from `salary.ts`, and the work-arrangement enum. Export from the package
  index. Rebuild with `npm run build -w @jot/shared`.
- [X] T004 API tests first in `packages/api/tests/integration/offers.test.ts`:
  - **Add** (`PATCH /opportunities/{id}/offer` with no offer yet): stores the details,
    `createdAt`/`updatedAt`, `offerVersion` 1, an empty `offerScores`, and history entry 1
    `RECORDED` listing every value set; 404 for an unknown opportunity.
  - **Change**: only the changed details are written, entry 2 `CHANGED` with `{ field, from,
    to }`; `null` clears; a save that changes nothing writes no entry and returns 200.
  - **Race**: two changes from the same version: one wins, the other is 409 with the reload
    message, and the history has every saved change.
  - **Custom values**: kept for a current field; an unknown id is 400 "Unknown custom field" on
    `custom.<id>`; values of a removed field are dropped on the next save, recorded as cleared.
  - **Scores** (`PATCH …/offer/scores`): set, change and clear (`null`) one at a time; other
    scores untouched; no history entry; 400 "Add the offer before scoring it" without an offer;
    400 for 6 or an unknown key.
  - **Remove** (`DELETE …/offer`): 400 without `X-Confirm-Delete`; with it, the offer, scores,
    `offerVersion` and every `OFFERCHANGE#` item go (more than 25 entries, to cross a batch);
    404 "No offer to remove"; adding again starts at `RECORDED` seq 1.
  - **Reads**: `GET /opportunities` returns `offer` and `offerScores`, not `offerHistory`;
    `GET /opportunities/{id}` adds `offerHistory`, oldest first; an opportunity stored before
    this feature reads as before.
  - **Custom fields** (`GET`/`PATCH /offer-fields`): empty lists and version 0 at first; add
    (new ids given), rename, reorder; 409 on a stale `expectedVersion`; a dropped field needs
    the confirm header and moves to `removed` with its last name (not counted in the 20; a new
    field may reuse the name); the limits and messages; unknown keys refused.
  - **Nothing else changes**: stage, `lastStageChangeAt`, `changeCount` and stage history are
    unchanged by every offer, score and field route (FR-015); deleting the opportunity removes
    its offer history too.
- [X] T005 Make T004 pass:
  - **`packages/api/src/repo/keys.ts`**: `OFFERCHANGE#` (zero-padded to six) and the settings
    keys.
  - **`packages/api/src/repo/opportunityRepo.ts`**: `saveOffer` (one transaction: the OPP update
    conditional on `offerVersion` being what was read, or `attribute_not_exists` the first time,
    and the `OFFERCHANGE#` put), `setOfferScores` (`SET`/`REMOVE offerScores.#k`, conditional on
    `attribute_exists(offer)`), `removeOffer` (the OPP update and the history deletes, batched as
    the opportunity delete is), `offerHistory(id)`; map conflicts with `isConditionFailure`;
    include the offer history items in the opportunity delete.
  - **`packages/api/src/repo/offerFieldsRepo.ts`** (new): get, and put conditional on
    `version`, moving dropped fields to `removed`.
  - **`packages/api/src/routes/offers.ts`** (new): the five routes, with `via` from the change
    source; registered in **`packages/api/src/handler.ts`**.

  Run the API tests.

**Checkpoint**: the API takes and returns offers, scores, history and fields. Commit and push.

---

## Phase 3: User Story 1 - Record an offer's details (Priority: P1) 🎯 MVP

**Goal**: the Offer section, the offer form page, and removing an offer.

**Independent Test**: spec.md US1: record base 165,000, a 10% bonus, "Remote" and a respond-by
date; reopen and see each; the salary range is unchanged.

- [X] T006 [P] [US1] Tests first in `packages/web/tests/offers.test.tsx`:
  - **The section** on `/opportunities/:id`: "Offer" with "Add offer" (a link to the form page)
    when there's none; with one, each set detail with its label (amounts formatted "165,000",
    bonus "10%", the arrangement's label, dates formatted), each scored detail's
    "{n} · {word}", "Edit offer" and "Remove offer"; the salary range still shows separately.
  - **The form page** at `/opportunities/:id/offer`: titled "Add an offer from {company}" or
    "Edit the offer from {company}"; every detail of FR-002 and every custom field (from
    `GET /offer-fields`), none required; a new offer starts with the opportunity's title,
    location and work arrangement; "165k" posts 165000; saving only changed details posts just
    those, and a cleared one `null`; the API's refusal shows on its field; "Saving…" while
    waiting; saving and Cancel go back to the opportunity; 409 shows the reload message.
  - **Remove**: asks first, saying the history goes too; Cancel changes nothing; confirming
    sends `X-Confirm-Delete` and the section shows "Add offer" again.
- [X] T007 [US1] Make T006 pass:
  - **`packages/web/src/api/hooks.ts`**: `useOfferFields`, `useSaveOffer`, `useRemoveOffer`,
    refreshing the opportunity and the lists.
  - **`packages/web/src/components/OfferForm.tsx`** (+css, new): native inputs (`inputmode`
    for amounts and the bonus, `type="date"` for dates, a `<select>` for the arrangement),
    labels from `offers.ts`, checks mirrored from the shared schema.
  - **`packages/web/src/pages/EditOffer.tsx`** (new) and its route in
    **`packages/web/src/App.tsx`**.
  - **`packages/web/src/components/OfferSection.tsx`** (+css, new), with the remove
    confirmation (the existing dialog pattern and focus trap), in
    **`packages/web/src/pages/OpportunityDetail.tsx`** after the Interviews section.

**Checkpoint**: offers are recorded, edited and removed. Commit and push.

---

## Phase 4: User Story 2 - Keep the offer's history (Priority: P1)

**Goal**: the offer's history on its section.

**Independent Test**: spec.md US2: 160,000 then 170,000 plus a 10,000 sign-on bonus shows
"Offer recorded" and the dated change.

- [X] T008 [P] [US2] Tests first in `packages/web/tests/offers.test.tsx`:
  - the history under the Offer section, newest first: "Offer recorded · {date}", then each
    change dated with one line per detail, "Base salary: 160,000 → 170,000", "Sign-on bonus
    added: 10,000", "Equity cleared (was …)"; "via Claude" on entries with `via`;
  - a custom field's entry shows its current name; a removed field's shows its last name
    with "(removed)", from the fields' `removed` list ("Commute (removed): 10 min → 20 min");
  - no edit or remove control on entries; no history list when there's none.
- [X] T009 [US2] Make T008 pass in `packages/web/src/components/OfferSection.tsx` (+css), with
  value formatting shared with the details (a small `formatOfferValue(field, value)` in the
  component, or in `offers.ts` if the MCP output needs it too).
- [X] T010 [US2] `e2e/offers.spec.ts` (`{ tag: ['@offer', '@responsive'] }`), with an
  `addOffer` helper in `e2e/fixtures.ts` that patches through the API:
  - add an offer from the section with base, bonus, PTO and respond-by; the section shows them
    and the salary range is unchanged;
  - edit the base and add a sign-on bonus; the history shows both entries; save unchanged and
    no entry is added;
  - remove it after confirming;
  - axe on the form page and the section, in light and dark.

**Checkpoint**: offers and their history work in the web app. Commit and push.

---

## Phase 5: User Story 3 - Compare up to three offers (Priority: P1)

**Goal**: the Offers page, the board's checkboxes, and the comparison page.

**Independent Test**: spec.md US3: tick two of three on Offers, Compare, reload; the same two.

- [X] T011 [P] [US3] Tests first in `packages/web/tests/offers.test.tsx` and
  `packages/web/tests/overview-board.test.tsx` (`overview` too):
  - **Navigation**: "Offers" before "Archive".
  - **The Offers page** `/offers`: every open and closed opportunity with `isOffer`, each with a
    checkbox labelled by company and title, company, title, base salary, respond-by date, stage
    and overall; "No details yet" with "Add offer" for one without details; an empty state when
    there are none.
  - **Ticking**: Compare hidden with 0–1 ticked; "Compare 2", "Compare 3"; at 3 the rest are
    disabled and "You can compare up to 3 offers" shows; Compare opens
    `/offers/compare?ids=a,b` in the ticked order.
  - **The board**: each Offer-column card (and Offer tab on phones) has the checkbox; no other
    column has one; the column header shows "Compare N" at 2–3; ticks aren't shared with the
    Offers page and clear on leaving.
  - **The comparison** `/offers/compare?ids=…`: offers as columns (company and title, linking
    to the opportunity), the details of FR-002 then the custom fields as rows, in that order,
    blanks shown as "—"; an id that's gone is left out with "1 offer is no longer available";
    fewer than 2 left says so with a link to Offers; an Offer-stage opportunity without
    details shows "Add offer" in its column.
- [X] T012 [US3] Make T011 pass:
  - **`packages/web/src/components/Layout.tsx`**: Offers before Archive.
  - **`packages/web/src/pages/Offers.tsx`** (+css, new), from the open and closed lists the
    board already loads.
  - **`packages/web/src/components/OpportunityCard.tsx`** (+css) and
    **`packages/web/src/components/StageBoard.tsx`** (+css): the checkbox inside its label
    (44px target), and "Compare N" in the Offer column header.
  - **`packages/web/src/pages/CompareOffers.tsx`** (+css, new): a `<table>` with `<th
    scope="row">` detail names in a sticky first column, inside a frame that scrolls
    sideways on phones; and both routes in **`packages/web/src/App.tsx`**.
- [X] T013 [US3] `e2e/offers.spec.ts`: with three offers, tick two on Offers, Compare, reload
  and see the same two; tick on the board's Offer column, a fourth can't be ticked; axe on
  Offers and the comparison, in light and dark; on iPhone the comparison scrolls inside its
  frame with the detail names in view, and the page doesn't scroll sideways.

**Checkpoint**: offers can be compared. Commit and push.

---

## Phase 6: User Story 4 - Score each detail (Priority: P1)

**Goal**: score drop-downs, accessible colors, the overall row and the legend.

**Independent Test**: spec.md US4: score three details of each of two offers; colors, the
overall average, and the scores after a reload.

- [X] T014 [P] [US4] Tests first:
  - **`packages/web/tests/score-colors.test.ts`** (`offer`, `theme`): read
    `packages/web/src/styles/global.css`, take `--score-0`…`--score-5` and `--color-text` for
    the light theme, the dark media query and `[data-theme="dark"]`, and check every pair is at
    least 4.5:1 by the WCAG formula; and that all six differ.
  - **`packages/web/tests/offers.test.tsx`**:
    - **`ScoreCell`**: a `<select>` labelled "Score {detail} for {company}" with "Not
      scored" and 0–5 as "{n} · {word}"; showing a score adds the `score-{n}` class and the
      text "{n} · {word}"; choosing posts `{ scores: { key: n } }`, "Not scored" posts `null`;
      a failed save shows the error and the old value.
    - **The comparison**: a cell per detail and custom field per offer (a blank detail stays
      unscored); the overall row "Overall" with "{x.x}" in the tone of its rounded score, or
      "Not scored"; it updates when a score changes; the legend lists 0–5 with their words and
      colors.
    - **The Offer section** shows the overall too.
- [X] T015 [US4] Make T014 pass:
  - **`packages/web/src/styles/global.css`**: `--score-0`…`--score-5` for light and dark (both
    dark selectors), tinted grey, red, orange, yellow, light green and green, each ≥ 4.5:1 with
    `--color-text`; `.score-0`…`.score-5` classes.
  - **`packages/web/src/components/ScoreCell.tsx`** (+css, new) and `useSetOfferScore` in
    **`packages/web/src/api/hooks.ts`** (optimistic, rolled back on error).
  - **`packages/web/src/pages/CompareOffers.tsx`**: the score cells, the overall row and the
    legend; **`OfferSection.tsx`**: the overall.
- [X] T016 [US4] `e2e/offers.spec.ts`: score base salary 5 and 4 and equity 0 and 3; the cells
  show number, word and color; the overall row shows 2.5 and 3.5; reload and they're kept; axe
  with scores, in light and dark.

**Checkpoint**: the P1 stories are done. Commit and push.

---

## Phase 7: User Story 5 - Custom fields (Priority: P2)

**Goal**: add, rename, reorder and remove the shared custom fields.

**Independent Test**: spec.md US5: "Commute" on every form and comparison; renamed; removed.

- [X] T017 [P] [US5] Tests first in `packages/web/tests/offers.test.tsx`:
  - **`OfferFields`** ("Fields to compare" on Offers, and "Add field" on the comparison): add
    with a name; refusals shown on the field (blank, 61, duplicate, 21st); rename in place;
    move up and down ("Move {name} up"); remove asks first, saying how many offers have a value
    for it, and sends `X-Confirm-Delete`; a 409 shows the reload message; each change puts the
    whole list with `expectedVersion`.
  - a new field is a row on the comparison after the built-in details and an input on the form;
    renamed, both show the new name and keep the value and score; removed, it's gone from both
    and from the overall.
- [X] T018 [US5] Make T017 pass in **`packages/web/src/components/OfferFields.tsx`** (+css, new),
  `useSaveOfferFields` in **`packages/web/src/api/hooks.ts`**, and its place in
  **`Offers.tsx`** and **`CompareOffers.tsx`**.
- [X] T019 [US5] `e2e/offers.spec.ts`: add "Commute" on the comparison, fill and score it on two
  offers, rename it, remove it on Offers after confirming; axe on "Fields to compare".

**Checkpoint**: custom fields work. Commit and push.

---

## Phase 8: User Story 6 - Respond-by dates (Priority: P3)

**Goal**: "Respond by" on board cards and the Offers page.

**Independent Test**: spec.md US6: due in two days shows in the warning color; past says it
was due.

- [X] T020 [P] [US6] Tests first in `packages/web/tests/offers.test.tsx` and the card tests
  (`overview` too): a card and an Offers row with a respond-by date show `respondByText`'s text,
  in the warning style within 3 days for an open opportunity, plain once passed or when closed;
  nothing without a date; the warning has text, not color alone.
- [X] T021 [US6] Make T020 pass in **`OpportunityCard.tsx`** (+css) and **`Offers.tsx`**, using
  the device's date as the follow-up flag does. Extend `e2e/offers.spec.ts` with a respond-by
  two days ahead on the card and the Offers page.

**Checkpoint**: deadlines are visible. Commit and push.

---

## Phase 9: User Story 7 - Claude works with offers (Priority: P3)

**Goal**: Claude reads, records and scores offers, and adds or renames fields.

**Independent Test**: spec.md US7, through the MCP tests.

- [X] T022 [P] [US7] Tests first in `packages/api/tests/integration/mcp-read-tools.test.ts` and
  `mcp-write-tools.test.ts` (blocks tagged `offer` and `mcp`):
  - **`get_opportunity`**: `offer`, `offerScores`, `offerOverall` and `offerHistory`, with
    custom values and score keys under the field names.
  - **`list_offers`**: the fields by name, and every `isOffer` opportunity, open first, with its
    offer, scores and overall.
  - **`update_offer`**: snake_case details, "170k" amounts, custom values by name ("Unknown
    custom field" for a missing name), `null` clears; adds the offer when there's none; the
    history entry has `via: CLAUDE`.
  - **`score_offer`**: by detail name or custom field name, 0–5 or null; refusals as the API's.
  - **`add_offer_field`**, **`rename_offer_field`**: by name; the limits and duplicate message;
    an unknown name for rename.
  - **The limit**: each change tool takes one change from the per-minute limit; there's no tool
    that removes an offer or a field.
  - **Descriptions**: each says 0 means "not offered" and that removing happens in the web app.

  Then make them pass in **`packages/api/src/mcp/tools.ts`**, sharing the repos and rules with
  the routes. Update the tests that pin the tool list and schemas.
- [X] T023 [US7] Contracts: `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml` (the
  five routes, `Offer`, `OfferChange`, `offerScores`, the offer fields) and
  `specs/003-mcp-server/contracts/mcp-tools.md` (the changed and new tools). Check the YAML
  parses.

**Checkpoint**: everything in the spec works. Commit and push.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T024 [P] Docs:
  - **README**: offers, their history, the Offers page, comparing and scoring, custom fields
    and respond-by dates among what the app does; Claude's offer tools.
  - **`specs/001-job-opportunity-tracker/data-model.md`**: a line saying feature 013 adds the
    offer, its history and the custom fields.

  Check the README's diagrams: the system diagram is unchanged (no new service or store); its
  data note mentions offers.
- [X] T025 [P] Create `specs/013-offer-comparison/checklists/validation.md`:
  - automated results;
  - the **architecture diagrams** checked (FR-018), with a note on whether they changed, and
    the data-model diagram checked to draw;
  - the contrast results for the six score colors in light and dark;
  - the owner's checks (quickstart.md "By hand"), still open.
- [X] T026 Full local check, then record the results in validation.md, commit and push:
  - lint, typecheck and build;
  - all unit tests, with coverage ≥ 80%;
  - the full e2e suite, desktop and iPhone;
  - mutation testing on every file (the shared schemas changed), ≥ 95%.
- [x] T027 **Only when the owner says so**: open the pull request, merge when every check is
  green, and confirm the deploy and its smoke test.
- [ ] T028 **After the deploy**: the owner's checks (quickstart.md "By hand"). Claude's
  connector may need reconnecting to see the new tools.

---

## Dependencies & Execution Order

- **Setup (T001)**, then **Foundational (T002–T005)**: every story needs the rules and the API.
- **US1 (T006–T007)** first: the form and the section.
- **US2 (T008–T010)** extends the section.
- **US3 (T011–T013)** needs offers to exist (US1); **US4 (T014–T016)** needs the comparison.
- **US5 (T017–T019)** needs the form (US1) and the comparison (US3).
- **US6 (T020–T021)** needs the Offers page (US3).
- **US7 (T022–T023)** needs only the API, so it can run beside US1–US6.
- **Polish (T024–T026)** comes last. T027 and T028 wait for the owner.

## Parallel Opportunities

- **Foundational**: T004's API tests can be written beside T003.
- **Stories**: Claude's tools (T022) beside any web phase; the color test (T014's
  `score-colors.test.ts`) beside US3.
- **Polish**: T024 and T025.

## Implementation Strategy

- **MVP**: Foundational plus US1–US4: offers recorded with their history, compared and scored.
- **Then**: US5 adds custom fields, US6 respond-by dates, US7 Claude.
- **One PR** when the owner says to merge.
