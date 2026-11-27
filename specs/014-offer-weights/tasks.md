---

description: "Task list for offer weights and a Settings page (feature 014)"
---

# Tasks: Offer Weights and a Settings Page

**Input**: Design documents from `specs/014-offer-weights/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/changes.md](./contracts/changes.md),
[quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI). Within each phase, write the tests first and see
them fail.

**Organization**: setup, a foundational phase (the shared rule and the API), then one phase per
user story (spec.md US1–US6), then polish.

**Pushing**: commit after each phase and push the branch (free: no Actions run). Open the pull
request and merge only when the owner says so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US6 from spec.md

## Conventions that apply to every task

- **Tags**: tag new tests `offer` (Vitest `// @module-tag offer`; Playwright `{ tag: '@offer' }`).
  Claude's are also `mcp`; navigation tests are also `core`'s existing layout tests.
- **Edits**: write multi-line edits with Python script files in the scratchpad (`newline=''`).
  Never pipe a check through `tail` when its exit code matters; run lint before any commit.
- **Names**:
  - in code and data: `weights` (on the settings item), keys are the detail names or
    `custom:<fieldId>`; helpers `weightOf(key, weights)` (default 1), `importanceText(n)`
    ("3 · Critical"), `IMPORTANCE_VALUES` `[0, 1, 2, 3]`, `offerOverall(scores, fields, weights)`;
    `OfferWeightsPatchSchema`;
  - the route `PATCH /offer-weights` `{ weights, expectedVersion }`;
  - for Claude: `set_offer_weights` with `weights` (detail names as in `score_offer`, or custom
    field names, to 0–3); `importance` in `list_offers` as `{ value, word }`;
  - on screen: "Settings", "Offer comparison", "How much each detail counts", "Custom fields",
    the words 0 "Ignore", 1 "Normal", 2 "Important", 3 "Critical" shown as "{n} · {word}",
    "Saved", "{label} · Critical" / "{label} · Important" / "{label} · Ignored, doesn't count"
    on the comparison, "Change what each detail counts" (comparison) and "Custom fields and what
    each detail counts are in Settings" (Offers page), both linking to `/settings`.
- **The rules** (data-model.md): importances are whole numbers 0–3 ("Choose an importance from
  0 to 3"); a key must be a detail or a current field's `custom:<id>` ("Unknown detail to
  weigh"); a patch names at least one key; 1 is never stored (setting 1 removes the key); a
  missing `weights` reads as `{}`; one `version` for fields and weights; a stale or racing save
  is 409 "Settings changed since you loaded them. Reload and try again." (also for
  `PATCH /offer-fields` now); removing a field drops its weight.
- **The overall**: Σ(score × weight) ÷ Σ(weight) over scored details and current fields with a
  weight above 0, `Math.round(x × 10) / 10`, undefined when nothing counts. With every weight 1
  it MUST equal feature 013's average exactly.
- **Never changes offers**: weights leave every offer, its scores and history, and every
  opportunity's stage alone (FR-012).

---

## Phase 1: Setup

- [X] T001 In `scripts/test-tags.mjs`, add `SOURCE_TAGS` entries before the catch-alls:
  `packages/web/src/pages/Settings*` and `packages/web/src/components/OfferWeights*` →
  `['offer']`. Add each in the task that creates its file if the tag check needs the file to
  exist. Run `npm run lint`.

---

## Phase 2: Foundational (the rule and the API)

**Purpose**: the weighted overall and the stored weights every story needs.

- [X] T002 Tests first, in `packages/shared/tests/unit/offers.test.ts` and
  `packages/shared/tests/unit/schemas.test.ts` (or the offer schema test file):
  - **`OfferFieldsSchema`**: `weights` optional, read as `{}` when missing; values 0, 2, 3
    accepted.
  - **`OfferWeightsPatchSchema`**: strict; `weights` with at least one key; each value a whole
    number 0–3 (−1, 4, 1.5, "3" refused with "Choose an importance from 0 to 3"); keys a detail
    or `custom:<id>` by format; `expectedVersion` a whole number ≥ 0.
  - **`weightOf`**: the stored value, else 1. **`importanceText`**: "0 · Ignore" … "3 ·
    Critical".
  - **`offerOverall(scores, fields, weights)`**: the spec's example (base salary 3 × 5, commute
    1 × 2, title 0 × 1 → 4.3); 0 scores counted with their weight; Ignored left out whatever
    the score; all scored details Ignored → undefined; removed fields' scores and weights
    ignored; a field with a weight but no score not counted; rounding at .x5; **equality** with
    the plain average (feature 013's formula, kept as a test helper) for every weight at 1 over
    a few hundred generated score sets.

  Then make them pass in **`packages/shared/src/schemas.ts`** and
  **`packages/shared/src/offers.ts`** (`IMPORTANCE_VALUES`, the words, `weightOf`,
  `importanceText`, the messages `IMPORTANCE`, `WEIGHT_KEY`, `SETTINGS_CONFLICT`). Update every
  caller of `offerOverall` to pass `weights` (web pages and `mcp/tools.ts`) so the build stays
  green; with no weights stored nothing changes yet.
- [X] T003 Tests first, in `packages/api/tests/integration/offers.test.ts` (and
  `offer-fields-repo.test.ts` if the item shape matters there):
  - `GET /offer-fields` returns `weights: {}` for no item and for an item stored without it.
  - `PATCH /offer-weights`: sets keys and merges with the stored ones; 1 removes a key;
    `custom:<id>` of a current field accepted, of an unknown or removed field refused with
    "Unknown detail to weigh" and `fields: ['weights.<key>']`; an unknown detail refused;
    out-of-range values and an empty patch refused; `version` + 1; the response is the whole
    item.
  - A stale `expectedVersion`, and two saves racing, give 409 with the settings conflict
    message; nothing is overwritten.
  - `PATCH /offer-fields` removing a field (with the header) drops its weight; renaming keeps
    it; its conflict message is the new one.
  - No opportunity, offer, score or history changes.

  Then make them pass in **`packages/api/src/routes/offers.ts`** (the new route beside the
  fields routes, the same version check and `put`). Update the existing tests pinning the old
  conflict message.

**Checkpoint**: the rule and the API are done; nothing on screen has changed. Commit and push.

---

## Phase 3: User Story 1 - Say how much each detail matters (Priority: P1) 🎯 MVP

**Goal**: a Settings page where each detail's importance is set and saved on its own.

**Independent Test**: open `/settings`, set Base salary to Critical and Title to Ignore, reload;
both are kept and everything else is Normal.

- [X] T004 [US1] Tests first, in `packages/web/tests/settings.test.tsx` (new, `offer`):
  - the page's headings ("Settings", "Offer comparison", "How much each detail counts");
  - every built-in detail in comparison order, then each custom field in its order, each with
    a labeled select ("How much Base salary counts") showing "1 · Normal" by default and the
    stored value otherwise;
  - choosing a value sends `PATCH /offer-weights` `{ weights: { <key>: n }, expectedVersion }`
    and shows "Saved" in a polite status;
  - two quick changes are sent one after the other, the second with the version the first
    returned;
  - a failure shows its reason by that select and puts back the stored value;
  - a 409 shows the conflict message;
  - loading, error and "Try again" as other pages do.

  Then make them pass:
  - **`packages/web/src/api/hooks.ts`**: `useSaveOfferWeights`, which sends one save at a time
    and updates the fields query from each response.
  - **`packages/web/src/components/OfferWeights.tsx`** (+ `.module.css`): the list of details
    and selects.
  - **`packages/web/src/pages/Settings.tsx`** (+ `.module.css`): the page with its "Offer
    comparison" section.
  - **`packages/web/src/App.tsx`**: the `/settings` route.
- [X] T005 [US1] In `e2e/settings.spec.ts` (new, `@offer @responsive`): set two importances,
  reload, see them kept. In `e2e/accessibility.spec.ts`: axe on `/settings` in light and dark.

**Checkpoint**: importances can be set and are kept. Commit and push.

---

## Phase 4: User Story 2 - The overall score follows what matters (Priority: P1)

**Goal**: the weighted overall everywhere, and only that one.

**Independent Test**: with Base salary Critical, Commute Normal and Title Ignored, the offer
scored 5, 2 and 1 shows 4.3 on the comparison, the Offers page and its Offer section.

- [X] T006 [US2] Tests first: in `packages/web/tests/offer-compare.test.tsx`, `offers.test.tsx`
  and the Offer section's tests, the overall with stored weights (the 4.3 example, an all-Ignored
  offer reading "Not scored"), and unchanged with no weights. Then make them pass in
  `CompareOffers.tsx`, `Offers.tsx` and `OfferSection.tsx` (passing the settings' `weights`,
  already wired in T002, and fixing anything the tests find).
- [X] T007 [US2] In `e2e/offers.spec.ts`: set weights on Settings and see the overall change on
  the comparison and the Offers page.

**Checkpoint**: Commit and push.

---

## Phase 5: User Story 3 - See the importances on the comparison (Priority: P2)

**Goal**: each row shows its importance when it isn't Normal, with a link to Settings.

**Independent Test**: with Base salary Critical and Title Ignored, the comparison reads "Base
salary · Critical" and "Title · Ignored, doesn't count", and links to Settings.

- [X] T008 [US3] Tests first, in `packages/web/tests/offer-compare.test.tsx`: the row headers
  for Critical, Important, Normal (no suffix) and Ignored (muted, "doesn't count"); Ignored rows
  still scorable; the link "Change what each detail counts" to `/settings`. Then make them pass
  in `packages/web/src/pages/CompareOffers.tsx` (+ `.module.css`), keeping the sticky first
  column readable at phone width.

**Checkpoint**: Commit and push.

---

## Phase 6: User Story 4 - Manage custom fields on Settings (Priority: P2)

**Goal**: adding, renaming, reordering and removing fields happens on Settings only.

**Independent Test**: on Settings, add "Commute" (Normal), weigh it, rename, move and remove it;
the Offers page and the comparison have no field controls, only a link.

- [X] T009 [US4] Tests first:
  - **Move** `packages/web/tests/offer-fields.test.tsx` to render on `/settings`, keeping every
    case (add, rename, reorder, remove with the count of offers and the confirmation, problems,
    limits, conflict).
  - **New cases**: a new field is listed at "1 · Normal" in the importances; removing a field
    removes it from the importances.
  - **Offers page and comparison**: no "Add field" or field list; the Offers page's link "Custom
    fields and what each detail counts are in Settings".

  Then make them pass:
  - **`packages/web/src/pages/Settings.tsx`**: its "Custom fields" part, using `OfferFields`
    with `manage`, plus the open and closed offers for the count.
  - **`packages/web/src/pages/Offers.tsx`** and **`CompareOffers.tsx`**: remove `OfferFields`
    and add the links.
  - **`packages/web/src/components/OfferFields.tsx`**: drop the comparison-only mode if nothing
    uses it now.
- [X] T010 [US4] In `e2e/offers.spec.ts`, move the custom-field flow to Settings: add, fill on
  an offer, score on the comparison, weigh, rename, remove.

**Checkpoint**: Commit and push.

---

## Phase 7: User Story 5 - Find Settings (Priority: P2)

**Goal**: Settings in the main navigation after Archive, on desktop and phones.

**Independent Test**: from the overview, on desktop and an iPhone, one tap opens Settings.

- [X] T011 [US5] Tests first: in the layout tests (`packages/web/tests/`), the navigation reads
  Overview, Networking leads, Offers, Archive, Settings, and Settings is the current page on
  `/settings`. In `e2e/offers.spec.ts`, the test that nothing covers the main navigation expects
  5 links and also runs on `/settings`; each link is at least the touch target on the iPhone.
  Then make them pass in `packages/web/src/components/Layout.tsx` (+ the CSS if five links need
  it).

**Checkpoint**: Commit and push.

---

## Phase 8: User Story 6 - Claude knows and sets the weights (Priority: P3)

**Goal**: Claude reads and sets importances, and reports the weighted overall.

**Independent Test**: ask Claude to make Base salary Critical; Settings shows it, and Claude's
overall scores match the web app's.

- [X] T012 [US6] Tests first, in `packages/api/tests/integration/mcp-offers.test.ts` (`offer`,
  `mcp`):
  - `set_offer_weights` by detail name (`base_salary`) and custom field name (trimmed, any
    case); an unknown name refused with the names that exist; values outside 0–3 refused by
    the schema; one change from the per-minute limit; the result's `importance`.
  - `list_offers`: `importance` for every detail and field (`{ value, word }`, Normal
    included); `overall` weighted.
  - `get_opportunity`, `update_offer`, `score_offer`: `offerOverall` weighted.
  - The tool list and every description and input hint pinned; still no tool that removes a
    field or an offer.

  Then make them pass in **`packages/api/src/mcp/tools.ts`**.
- [X] T013 [US6] Contracts, per `contracts/changes.md`:
  `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml` (`weights` on the fields
  response, `PATCH /offer-weights`, the conflict message) and
  `specs/003-mcp-server/contracts/mcp-tools.md` (the new tool and the changed ones). Check the
  YAML parses.

**Checkpoint**: everything in the spec works. Commit and push.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T014 [P] Docs:
  - **README**:
    - what it does: importances and the weighted overall, the Settings page, and custom fields
      managed there;
    - Claude's tools: `set_offer_weights`;
    - the "What's stored" diagram: the settings item with `weights` (data-model.md), checked
      to draw.
  - **`specs/001-job-opportunity-tracker/data-model.md`**: a line saying feature 014 adds
    `weights` to the offer settings item.

  The system diagram is unchanged (no new service or store).
- [X] T015 [P] Create `specs/014-offer-weights/checklists/validation.md`:
  - automated results;
  - the architecture diagrams checked (FR-014): what changed and what didn't, each checked to
    draw;
  - the owner's checks (quickstart.md "By hand"), still open.
- [X] T016 Full local check, then record the results in validation.md, commit and push:
  - lint, typecheck and build;
  - all unit tests, with coverage ≥ 80%;
  - the full e2e suite, desktop and iPhone;
  - mutation testing on every file (the shared schemas changed), ≥ 95%.
- [ ] T017 **Only when the owner says so**: open the pull request, merge when every check is
  green, and confirm the deploy and its smoke test.
- [ ] T018 **After the deploy**: the owner's checks (quickstart.md "By hand"). Claude's
  connector may need reconnecting to see `set_offer_weights`.

---

## Dependencies & Execution Order

- **Setup (T001)**, then **Foundational (T002–T003)**: every story needs the rule and the API.
- **US1 (T004–T005)** first: the Settings page.
- **US2 (T006–T007)** needs weights to be settable (US1) for its end-to-end test.
- **US3 (T008)** needs only the foundational phase.
- **US4 (T009–T010)** needs the Settings page (US1).
- **US5 (T011)** needs the Settings page (US1).
- **US6 (T012–T013)** needs only the API, so it can run beside US1–US5.
- **Polish (T014–T016)** comes last. T017 and T018 wait for the owner.

## Parallel Opportunities

- **Foundational**: T003's API tests can be written beside T002.
- **Stories**: Claude's tools (T012) beside any web phase; US3 (T008) beside US1.
- **Polish**: T014 and T015.

## Implementation Strategy

- **MVP**: Foundational plus US1–US2: importances set on Settings and the weighted overall
  everywhere.
- **Then**: US3 shows the importances on the comparison, US4 moves the custom fields, US5 puts
  Settings in the navigation, US6 adds Claude.
- **One PR** when the owner says to merge.
