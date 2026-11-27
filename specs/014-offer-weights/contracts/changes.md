# Contract Changes: Offer Weights and a Settings Page

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-25

Changes to the published contracts, applied to them during implementation:
- [specs/001-job-opportunity-tracker/contracts/api.openapi.yaml](../../001-job-opportunity-tracker/contracts/api.openapi.yaml)
- [specs/003-mcp-server/contracts/mcp-tools.md](../../003-mcp-server/contracts/mcp-tools.md)

## Web API

### `GET /offer-fields` (changed)

The response gains `weights`:

```json
{
  "fields": [{ "id": "f1", "name": "Commute" }],
  "removed": [],
  "weights": { "baseSalary": 3, "title": 0, "custom:f1": 2 },
  "version": 7
}
```

`weights` is always present (`{}` when everything is Normal) and never contains 1.

### `PATCH /offer-weights` (new)

Request:

```json
{ "weights": { "baseSalary": 3, "title": 0, "pto": 1 }, "expectedVersion": 7 }
```

- It merges: each named key is set to its value, a value of 1 removes the key (Normal), and
  keys not named are kept. At least one key is required.
- Each key MUST be an offer detail or `custom:<id>` of a current custom field.
- Each value MUST be a whole number from 0 to 3.

Responses:

| Status | When | Body |
|---|---|---|
| 200 | Saved | The whole settings item, as `GET /offer-fields`, with `version` + 1 |
| 400 `VALIDATION_ERROR` | A value isn't 0–3 ("Choose an importance from 0 to 3"); a key is unknown ("Unknown detail to weigh", `fields: ["weights.<key>"]`); no keys | `{ code, message, fields }` |
| 409 `CONFLICT` | `expectedVersion` isn't the stored version, or another save won the race | "Settings changed since you loaded them. Reload and try again." |

### `PATCH /offer-fields` (changed)

- Removing a field also removes its weight.
- The response includes `weights`.
- The conflict message becomes "Settings changed since you loaded them. Reload and try
  again."
- Nothing else changes.

### Opportunities

No change. Overall scores are computed by clients from `offerScores` and the settings.

## Claude's tools (MCP)

### `set_offer_weights` (new)

- **Title**: "Set how much offer details count".
- **Input**: `weights`, a record from a detail name (`base_salary`, `bonus_percent`, …, as in
  `score_offer`) or custom field name to an integer 0–3.
- **Effect**: `PATCH /offer-weights` with the version just read. It counts toward the change
  limit.
- **Result**: `{ importance }`, as in `list_offers`.
- **Errors**: an unknown name is refused with the names that exist.

### `list_offers` (changed)

- It adds `importance`: each detail and custom field name with `{ value, word }`, for example
  `{ "base_salary": { "value": 3, "word": "Critical" } }`. Every detail and field is listed,
  Normal included.
- `overall` is the weighted overall score, and the description says so.

### `get_opportunity`, `update_offer`, `score_offer` (changed)

- `offerOverall` is the weighted overall score.
- `score_offer`'s description says the overall is weighted by each detail's importance (see
  `set_offer_weights`).

### Unchanged

`add_offer_field` and `rename_offer_field` keep their behavior. A new field starts at Normal.
There is still no tool that removes a field or an offer.
