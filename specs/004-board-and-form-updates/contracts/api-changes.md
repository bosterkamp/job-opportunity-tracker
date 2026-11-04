# API Changes

These are additive changes to feature 001's [API contract](../../001-job-opportunity-tracker/contracts/api.openapi.yaml).
That file is updated in the same change, and every existing request keeps working.

## Opportunity (all responses)

New optional properties:

```yaml
salaryMin: { type: integer, minimum: 0, maximum: 10000000 }
salaryMax: { type: integer, minimum: 0, maximum: 10000000 }
```

`compensation` is unchanged. Its description becomes "Pay notes: anything about pay beyond the
range (bonus, equity, currency, pay period)".

## POST /opportunities

The request gains these optional fields:

| Field | Type | Rules |
|---|---|---|
| `salaryMin` | integer or null | 0 to 10,000,000 |
| `salaryMax` | integer or null | 0 to 10,000,000; when both are set, `salaryMin` ≤ `salaryMax` |
| `createdAt` | ISO date-time with offset | Not more than 60 s in the future. Defaults to now. |

When `createdAt` is given, the first history entry's `changedAt` and the opportunity's
`lastStageChangeAt` equal it.

## PATCH /opportunities/{id}

The request gains these fields:

| Field | Type | Meaning |
|---|---|---|
| `salaryMin`, `salaryMax` | integer, or null to clear | The stored values merged with the patch must keep min ≤ max |
| `createdAt` | ISO date-time with offset | Moves the date added and the first history entry. It can't be cleared. |

The response is the updated opportunity. The new errors:

| Status | Code | Message | `fields` |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Enter a whole number, like 150000 | `salaryMin` or `salaryMax` |
| 400 | `VALIDATION_ERROR` | The minimum can't be more than the maximum | `salaryMin` |
| 400 | `VALIDATION_ERROR` | The date can't be in the future | `createdAt` |
| 400 | `VALIDATION_ERROR` | The date added can't be after the first stage change | `createdAt` |
| 409 | `CONFLICT` | This opportunity changed since you loaded it. Reload and try again. | — |

The 409 is returned when a stage change lands between the read and the write.

## POST /imports

`PostingDetails` gains optional `salaryMin` and `salaryMax` (integers, same limits).
