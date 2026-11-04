# API Changes

These changes are additive to feature 001's [API contract](../../001-job-opportunity-tracker/contracts/api.openapi.yaml),
which is updated in the same change. Every route needs the owner's token, as before.

## Opportunity (all responses)

| Field | Type | Notes |
|---|---|---|
| `interviewCount` | integer, optional | Missing means 0 |

`GET /opportunities/{id}` (and every route below) also returns
`interviews: Interview[]`, oldest first by `heldAt`.

```yaml
Interview:
  type: object
  required: [id, heldAt, note, recordedAt]
  properties:
    id: { type: string }
    heldAt: { type: string, format: date-time }
    note: { type: [string, 'null'], maxLength: 200 }
    recordedAt: { type: string, format: date-time }
    via: { type: string, enum: [CLAUDE] }
```

## POST /opportunities/{id}/interviews

Request: `{ heldAt?: date-time (default now), note?: string }`. Response: `201` with the
opportunity, its history, and its interviews.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | The date is in the future, or before the date added; the note is too long; or there's an unknown field |
| 400 | `VALIDATION_ERROR` | It would be the 7th interview: "This opportunity already has 6 interviews, the most it can have" |
| 404 | `NOT_FOUND` | No such opportunity |

## PATCH /opportunities/{id}/interviews/{interviewId}

Request: `{ heldAt?, note? }`. A null or blank note clears it. Response: `200` with the
opportunity, as above. The errors are the same as for adding, plus `404 NOT_FOUND` "Interview
not found".

## DELETE /opportunities/{id}/interviews/{interviewId}

This needs the header `X-Confirm-Delete: true` (otherwise `400`). Response: `200` with the
opportunity, as above. A `404` is returned for an unknown opportunity or interview.

## PATCH /opportunities/{id}

A new error for `createdAt`: `400 VALIDATION_ERROR` "The date added can't be after the first
interview".
