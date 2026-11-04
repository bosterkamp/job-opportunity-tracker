# Contract changes: Posting Deadline

All changes add an optional field; nothing existing changes, so older clients keep working.

## Web API (`specs/001-job-opportunity-tracker/contracts/api.openapi.yaml`)

- `OpportunityInput` (POST `/opportunities`) and `OpportunityPatch` (PATCH
  `/opportunities/{id}`): `postedUntil: { type: [string, 'null'], format: date }`. Blank or
  `null` means none; on PATCH, `null` clears it. Invalid: 400 with "Use a date like
  2026-11-03" for `postedUntil`.
- `Opportunity` (every response): `postedUntil`, a date, present only when set.

## Fill from link (`specs/002-import-job-from-link/contracts/`)

- `PostingDetails` (POST `/imports`): `postedUntil: { type: string, format: date }`, present
  only when the posting's `validThrough` gives a date.

## Claude's tools (`specs/003-mcp-server/contracts/mcp-tools.md`)

- `add_opportunity`, `update_opportunity`: an optional `postedUntil` (`YYYY-MM-DD`, "the date the
  posting is up until"); on update, `null` clears it.
- `list_opportunities`, `find_opportunities`: each summary adds `postedUntil` (or `null`).
- `get_opportunity`: returns it with the other details.
- `read_posting`: returns it when the posting states it; its description mentions the closing
  date.

## The overview's URL

- No `sort` means "Closing soonest" on the overview, and "Recently changed" on the archive.
- `?sort=closing` is accepted on both. `?sort=recent` is now written on the overview when
  "Recently changed" is chosen. Every other sort value is unchanged.
