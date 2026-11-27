# Research: Offer Weights and a Settings Page

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-25

## 1. Where the importances are stored

**Decision**: a `weights` map on the existing custom-fields item (`SETTINGS` / `OFFER_FIELDS`,
feature 013 research §4). Each key is a detail (`baseSalary`) or a custom field (`custom:<id>`).
The value is 0, 2 or 3. A key with no entry is Normal (1), so Normal is never stored. The item
keeps its single `version`, which counts every change to fields or weights.

**Rationale**:
- The spec treats the importances and custom fields as one settings record (Key Entities,
  FR-009): adding or removing a field changes both, and Settings shows both.
- Leaving Normal out means items stored before this feature, which have no `weights`, already
  mean "everything Normal". No migration is needed, and SC-002 holds by construction.
- One version means a save of either kind can't overwrite a change of the other kind made
  elsewhere.

**Alternatives considered**:
- **A separate `OFFER_WEIGHTS` item**: it would need its own version, and removing a field would
  touch two items. Rejected.
- **Weights on each offer**: rejected; the spec has one set shared by every offer (FR-002).
- **Storing 1 explicitly**: rejected; it adds noise, and an old item would differ from a reset
  one.

## 2. The API for importances

**Decision**:
- `GET /offer-fields` also returns `weights`.
- A new `PATCH /offer-weights` takes `{ weights: { <key>: 0–3 }, expectedVersion }` and
  **merges**: keys it names are set (1 removes the key) and others are kept. It returns the whole
  settings item.
- An unknown key is refused: neither a detail nor a current custom field's `custom:<id>`.
- A stale `expectedVersion` gets the existing 409 `CONFLICT`, worded for both fields and weights
  ("Settings changed since you loaded them. Reload and try again.").
- `PATCH /offer-fields` drops the weights of the fields it removes.

**Rationale**:
- Merging lets Settings send one change per select, and lets Claude set a few weights by name,
  without either needing the whole map.
- Keeping it apart from `PATCH /offer-fields` leaves that route's replace-the-list rules and its
  removal confirmation as they are.
- The paths stay as they are: renaming `/offer-fields` to `/settings` would change a published
  contract and Claude's tools for no behavior (Principle V).

**Alternatives considered**:
- **Weights in the `PATCH /offer-fields` body**: it would mix a merge into a replace. Rejected.
- **One route per key** (`PUT /offer-weights/{key}`): custom keys contain `:`, and Claude often
  sets several at once. Rejected.

## 3. The weighted overall score

**Decision**: `offerOverall(scores, fields, weights)` becomes Σ(score × weight) ÷ Σ(weight).
- The sums run over scored keys that are a detail or a current custom field, with a weight
  above 0.
- It returns `undefined` ("Not scored") when nothing qualifies.
- Rounding is unchanged: `Math.round(x × 10) / 10`.
- The weight lookup (`weightOf(key, weights)`, default 1) is shared by the web app, the API and
  Claude's tools.

**Rationale**:
- With every weight 1, the formula is the plain average, computed in the same order, so the
  results are identical (SC-002); a unit test compares the two across many random score sets.
- One function used everywhere keeps the comparison, the Offers page, the Offer section and
  Claude on the same number (SC-003).

**Alternatives considered**:
- **Storing the overall on the offer**: every weight change would rewrite every offer. Rejected.
- **Normalizing weights to percentages**: rejected; the owner chose named levels.

## 4. Saving importances one select at a time

**Decision**: each select on Settings saves as soon as it changes.
- The save hook sends one save at a time; a change made while one is in flight waits for it,
  then goes with the version that save returned.
- A polite status ("Saved") confirms each change; a failure shows its reason by the select,
  which goes back to the stored value.

**Rationale**:
- Spec FR-006 asks for no separate save button.
- Without the queue, two quick changes would both carry the same version, and the second would
  be refused as a conflict.

**Alternatives considered**:
- **One form with a Save button**: rejected by FR-006.
- **Disabling every select while one saves**: it flickers and blocks quick edits. Rejected.

## 5. The Settings page and the navigation

**Decision**: a new `/settings` page, linked from the main navigation after Archive.
- It has one section today, "Offer comparison", with two parts:
  - "How much each detail counts": every detail with its importance select.
  - "Custom fields": the `OfferFields` component as the Offers page has it today, with add,
    rename, reorder and remove, and the count of offers with a value.
- The Offers page and the comparison lose `OfferFields`. Each gets a link instead: "Custom
  fields and what each detail counts are in Settings" on the Offers page, and "Change what each
  detail counts" on the comparison.
- On phones the bottom bar has five links. At 390 px wide each is 78 px, above the 44 px touch
  target. Feature 013's test, that nothing on a page covers the bar, gains Settings.

**Rationale**: the owner asked for one configuration page that the custom fields move to.

**Alternatives considered**: a settings menu under an icon; rejected, since one more link fits.

## 6. Showing importances

**Decision**:
- The words are 0 "Ignore", 1 "Normal", 2 "Important" and 3 "Critical". The select shows
  "3 · Critical".
- On the comparison, a row's header adds the word when the importance isn't Normal: "Base
  salary · Critical". An Ignored row reads "Title · Ignored, doesn't count", in muted text.
- No new colors. The importance is text, so nothing relies on color (FR-010).

**Rationale**: the same pattern as scores ("5 · Best"). Keeping the color scale for scores alone
avoids two meanings for one color.

## 7. Claude

**Decision**:
- `list_offers` and `get_opportunity` report the weighted overall.
- `list_offers` also returns `importance`: each detail's or custom field's name with its number
  and word, so Claude can explain a ranking.
- A new `set_offer_weights` tool takes `{ weights: { <detail or field name>: 0–3 } }`. It goes
  through `PATCH /offer-weights` with the version it just read, and counts toward the change
  limit.
- `score_offer` and `list_offers` describe the overall as weighted.
- There's no tool to remove a field (unchanged).

**Rationale**:
- FR-011.
- Names, not ids, match the other offer tools (feature 013 research §9).
- Setting a weight to 0 isn't deleting data, so it's allowed (Principle IV).

## 8. Tests and tags

**Decision**: everything new is tagged `offer`. The Settings page and the navigation change are
in `packages/web`, so the existing tag map grows by the page and its files; `Layout.tsx` is
already `core`.

- **Vitest**:
  - the weights schema;
  - `weightOf`;
  - the weighted `offerOverall`, including equality with the plain average when every weight
    is 1;
  - the `PATCH /offer-weights` route: merge, unknown keys, conflicts, and dropping weights with
    fields;
  - the MCP tool;
  - the Settings page and its save queue;
  - the comparison's labels;
  - the links that replace the field controls.
- **Playwright**:
  - set importances on Settings and see the overall change on the comparison and the Offers
    page;
  - manage a custom field on Settings;
  - axe on Settings in light and dark;
  - the bottom bar with five links on the iPhone.
