# Claude's Tools: Changes

These are changes to feature 003's [tool contract](../../003-mcp-server/contracts/mcp-tools.md).
The web API validates every value, so refusals carry the web app's messages.

## add_opportunity and update_opportunity

New input fields. On update, null clears a field, except `createdAt`.

| Field | Type | Description shown to Claude |
|---|---|---|
| `salaryMin` | integer | `Lowest salary as a whole number, like 150000 (no currency or pay period)` |
| `salaryMax` | integer | `Highest salary as a whole number, like 180000 (no currency or pay period)` |
| `createdAt` | string | `Date added: an ISO date-time, not in the future; defaults to now` |

- The `compensation` description becomes `Pay notes: bonus, equity, currency, or pay period`.
- `createdAt` is offered on `update_opportunity` too, with the extra rule "not after the first
  stage change".

## list_opportunities and find_opportunities

Each summary gains `salaryMin` and `salaryMax` (number or null), so Claude can answer questions
like "which pay at least 150k?".

## read_posting

The result gains `salaryMin` and `salaryMax` when the posting states pay.
