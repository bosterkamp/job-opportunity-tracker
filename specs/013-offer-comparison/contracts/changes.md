# Contract Changes: Offer Details and Comparison

These change [the API contract](../../001-job-opportunity-tracker/contracts/api.openapi.yaml)
and [Claude's tools](../../003-mcp-server/contracts/mcp-tools.md); both are updated with the
feature.

## API

| Route | Body | Answers |
|---|---|---|
| `GET /opportunities`, `GET /opportunities/{id}` and every route answering with an opportunity (changed) | | the opportunity gains `offer` and `offerScores` when it has an offer; `GET /opportunities/{id}` also gains `offerHistory`, oldest first |
| `PATCH /opportunities/{id}/offer` (new) | any details; `custom: { fieldId: text \| null }`; `null` clears | 200 the opportunity; adds the offer if there's none; 400 `VALIDATION_ERROR`; 404; 409 `CONFLICT` |
| `DELETE /opportunities/{id}/offer` (new) | header `X-Confirm-Delete: true` | 200 the opportunity without its offer, scores or history; 400 without the header; 404 "No offer to remove" |
| `PATCH /opportunities/{id}/offer/scores` (new) | `{ scores: { key: 0–5 \| null } }` | 200 the opportunity; 400 `VALIDATION_ERROR`, including "Add the offer before scoring it" |
| `GET /offer-fields` (new) | | `{ fields: [{ id, name }], removed: [{ id, name }], version }` (empty lists and version 0 at first) |
| `PATCH /offer-fields` (new) | `{ fields: [{ id?, name }], expectedVersion }`; `X-Confirm-Delete: true` when a field is dropped | 200 the new list; 400; 409 `CONFLICT` |

`Offer`: the details in the [data model](../data-model.md#offer-inside-the-opportunity).
`OfferChange`: `{ seq, at, kind, changes: [{ field, from, to }], via? }`.

Refusals are listed in the [data model](../data-model.md#rules-and-messages). Any other field is
refused, as for every strict body.

## Claude's tools

| Tool | Input | Output |
|---|---|---|
| `get_opportunity` (changed) | unchanged | gains `offer`, `offerScores`, `offerOverall`, and `offerHistory` |
| `list_offers` (new) | none | `{ fields: [{ id, name }], items: [{ id, company, title, stage, status, offer, scores, overall }] }`, open first, then closed |
| `update_offer` (new) | `opportunity_id`, any details (snake_case), `custom: { name: text \| null }` | the opportunity; adds the offer if there's none |
| `score_offer` (new) | `opportunity_id`, `scores: { detail or custom field name: 0–5 \| null }` | the opportunity |
| `add_offer_field` (new) | `name` | the fields |
| `rename_offer_field` (new) | `name`, `new_name` | the fields |

Each change tool takes one change from the per-minute limit. There's no tool to remove an offer
or a custom field. Changes through Claude are marked `via: CLAUDE` in the offer's history.

## Web app

- `/offers` (new, in the navigation before Archive): offers with checkboxes and Compare, and
  "Fields to compare".
- `/offers/compare?ids=a,b,c` (new): the comparison, with scores, the overall row and a legend.
- `/opportunities/{id}/offer` (new): the offer form.
- `/opportunities/{id}`: an Offer section with the details, scores and history, and "Add offer",
  "Edit offer" and "Remove offer".
- The board: a checkbox on each Offer-column card, "Compare N" in that column's header, and
  "Respond by {date}" on cards with an offer.
