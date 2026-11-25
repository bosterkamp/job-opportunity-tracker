# Research: Offer Details and Comparison

## 1. Where the offer is stored

- **Decision**: the offer is a map attribute, `offer`, on the opportunity item, with its scores
  in a second map, `offerScores`, beside it. The board's lists and `GET /opportunities/{id}`
  return them with the opportunity.
- **Rationale**: the board needs to know which cards have an offer and when to respond, and the
  Offers page shows each offer's base salary and respond-by date, from the two lists it already
  loads (open and closed). Keeping the offer on the opportunity means no new index, no extra
  request, and one write per change. Its size is bounded: 15 details and 20 custom values of at
  most 500 characters are under 20 KB, far below DynamoDB's 400 KB item limit.
- **Alternatives**: an `OFFER` item in the opportunity's partition (the board couldn't see it
  without a second index or a query per card); a table of offers (more infrastructure for one
  offer per opportunity).

## 2. The offer's history

- **Decision**: each saved change is an `OFFERCHANGE#<seq>` item in the opportunity's partition,
  as stage changes are `CHANGE#<seq>`. The route reads the opportunity, works out what changed,
  and writes the new offer and the entry in one transaction, conditional on the offer's
  `offerVersion` being what it read; a race returns `CONFLICT` with the reload message stage
  changes use. A save that changes nothing writes nothing. `GET /opportunities/{id}` returns the
  entries as `offerHistory`, oldest first; the lists don't.
- **Entry**: `{ seq, at, kind: 'RECORDED' | 'CHANGED', changes: [{ field, from, to }], via? }`.
  `field` is a detail's name or `custom:<fieldId>`; `from` and `to` are the values (`null` for
  none). The first save is `RECORDED`, listing every value set.
- **Removing the offer** deletes the offer, its scores and its history items, after
  `X-Confirm-Delete: true`, in the same batches as deleting an opportunity (feature 001).
- **Rationale**: Principle II's pattern, applied to the offer; the version condition keeps every
  change in the history even if two saves race.
- **Alternatives**: storing every earlier version whole (more data, and the change itself is what
  the owner reads); a history list inside the item (grows without bound inside a 400 KB item).

## 3. Scores

- **Decision**: `offerScores` maps a detail's name (or `custom:<fieldId>`) to a whole number 0–5.
  `PATCH /opportunities/{id}/offer/scores` takes `{ scores: { key: 0–5 | null } }`, setting or
  removing each with `SET offerScores.#k` / `REMOVE offerScores.#k`, conditional on the offer
  existing. Adding an offer starts `offerScores` as an empty map. Scores don't add history
  entries (spec Edge Cases).
- **Scoring needs an offer**: an Offer-stage opportunity with no details yet shows an empty
  column with "Add offer", and no score controls.
- **Overall**: a shared helper, `offerOverall(offer, scores, fields)`, averages the scores of the
  current details and custom fields, 0s included, to one decimal place, or returns undefined.
  Scores for a custom field that's been removed are ignored.
- **Rationale**: one score per click, each written on its own, so quick changes can't overwrite
  each other.

## 4. Custom fields

- **Decision**: one settings item, `PK = SETTINGS`, `SK = OFFER_FIELDS`, holds the list
  `[{ id, name }]` in display order and a `version`. `GET /offer-fields` reads it;
  `PATCH /offer-fields` replaces it (`{ fields: [{ id?, name }], expectedVersion }`), giving new
  fields an id. A list that drops a field needs `X-Confirm-Delete: true`. Names are trimmed,
  1–60 characters, unique regardless of case; at most 20.
- **Removing a field** changes only the list; the field moves to the item's `removed` list with
  its last name, so history entries that mention it show "{name} (removed)" (owner,
  2026-11-21). Each offer's value and score for it are ignored
  from then on, and dropped the next time that offer is saved. The confirmation's count of
  offers with a value comes from the lists the page already has.
- **Rationale**: one small item, one conditional write for add, rename, reorder and remove; no
  write to every offer, so removing can't half-fail.
- **Alternatives**: a field per offer (the owner chose shared fields); rewriting every offer on
  remove (up to 200 writes that could stop part way).

## 5. The details and their rules

- **Decision**: details are `baseSalary`, `signOnBonus` (whole amounts 0–10,000,000, as the salary
  range, typed as "165k" or "165,000" through the existing `parseAmount`), `bonusPercent` (0–100,
  one decimal), `equity`, `retirement` (401k), `insurance`, `location`, `role`, `pto`,
  `leadership`, `culture` (text, up to 500), `title` (up to 200), `workArrangement` (the existing
  on-site, hybrid, remote values), `startDate` and `respondBy` (calendar dates), and `custom`
  (field id to text, up to 500 each).
- **Rationale**: spec FR-002 and Edge Cases; the amounts and arrangement reuse the opportunity's
  own rules and form helpers.

## 6. Score colors (WCAG 2.1 AA)

- **Decision**: six background tokens per theme, `--score-0` … `--score-5`, each with text in
  `--color-text`, chosen so every pair is at least 4.5:1 in light and dark (1.4.3), checked by a
  unit test that computes the WCAG ratio from the tokens in `global.css`, and by axe in the
  browser tests. Every scored cell shows its number and word ("0 · Not offered", "1 · Worst",
  "2 · Poor", "3 · Okay", "4 · Good", "5 · Best"), and a legend shows the scale (1.4.1). The
  overall uses the color of its rounded score.
- **Rationale**: text on tinted cells is the readable form in both themes; the words make red
  and green distinguishable without color vision.
- **Alternatives**: saturated fills with white text (hard to keep 4.5:1 for yellow and light
  green); color-only cells (fails 1.4.1).

## 7. Picking offers and the comparison page

- **Decision**:
  - **Offers page** `/offers`, in the navigation before Archive: every opportunity, open or
    closed, with an offer or in the Offer stage, each with a checkbox, company, title, base
    salary, respond-by date, stage and overall score. Below it, "Fields to compare" manages the
    custom fields.
  - **Board**: each card in the Offer column (the Offer tab on phones) gets a checkbox; the
    column's header shows "Compare N" once 2 or 3 are ticked.
  - **Comparison** `/offers/compare?ids=a,b,c`: loads each opportunity (at most 3 requests),
    offers as columns and details as rows, a score drop-down in each cell, the overall row, the
    legend, and "Add field". On phones the table scrolls inside its frame with the detail names
    in a sticky first column.
  - **Offer form** on its own page, `/opportunities/{id}/offer`, as interviews have theirs.
- **Rationale**: the address keeps a comparison reloadable (spec story 3); a page of its own
  suits a form with 15 details and custom fields on phones.

## 8. Respond-by dates

- **Decision**: the card and the Offers page show "Respond by {date}", in the warning color
  within 3 days (by the device's date, as follow-ups are) for an open opportunity, and "Response
  was due {date}" once passed. A shared helper, `respondByText(respondBy, today, status)`, gives
  the text and its kind.

## 9. Claude's tools

- **Decision**:
  - `get_opportunity` returns the offer, its scores, its overall score and its history.
  - `list_offers` (new) lists every opportunity with an offer or in the Offer stage, with each
    offer, its scores and overall, and the custom fields by name.
  - `update_offer` (new) takes any details, and custom values by field name; it adds the offer
    if there's none.
  - `score_offer` (new) takes scores by detail name or custom field name, 0–5 or null.
  - `add_offer_field` and `rename_offer_field` (new). No tool removes an offer or a field.
- **Rationale**: spec FR-014; custom fields by name are what the owner says to Claude.
