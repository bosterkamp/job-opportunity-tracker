# Contract: MCP tools

**Feature**: [spec.md](../spec.md) | **Server**: `https://<api>/mcp` (Streamable HTTP, no
sessions, JSON responses)

Every tool needs a valid token ([oauth-metadata.md](./oauth-metadata.md)). Inputs are checked
with zod schemas published as each tool's `inputSchema`. A tool that fails returns an MCP tool
result with `isError: true`, and text `"<CODE>: <message>"` with the web API's message, so
Claude can explain it. Results are JSON text (`structuredContent` and a text copy).

Annotations follow MCP's tool hints: the read tools are `readOnlyHint: true`; the write tools
are `destructiveHint: false` (nothing is deleted) and `idempotentHint: false`.

| Tool | Purpose | Spec |
|---|---|---|
| `list_opportunities` | Open, one stage, archive, or follow-ups due | US2, FR-006, FR-007 |
| `find_opportunities` | Search by company or title text | US2, FR-008 |
| `get_opportunity` | One opportunity with its full history | US2, FR-008 |
| `read_posting` | Read a posting link into proposed details (nothing saved) | US3, FR-010 |
| `add_opportunity` | Add, with the duplicate warning | US3, FR-009, FR-012 |
| `update_opportunity` | Edit details | US3, FR-009 |
| `move_opportunity` | Change stage with a note and an optional earlier date | US3, FR-009, FR-013 |
| `list_leads` | Networking leads, with their opportunities (feature 010) | 010 FR-009 |
| `add_lead`, `update_lead` | Add or change a networking lead (feature 010) | 010 FR-009 |
| `add_lead_note`, `update_lead_note` | Add or change a note on a lead (feature 011) | 011 FR-006 |

There is deliberately no delete tool (FR-014).

## `list_opportunities`

| Input | Type | Default |
|---|---|---|
| `view` | `"open"` \| `"archive"` \| `"follow_up_due"` | `"open"` |
| `stage` | a stage id, only with `view: "open"` | all open stages |
| `limit` | 1–100 | 25 |
| `offset` | ≥ 0 | 0 |

Output: `{ total, offset, items: [{ id, company, title, stage, interest, salaryMin, salaryMax, interviewCount,
lastStageChangeAt, followUpDate, postedUntil }] }` (salary added in feature 004, the interview count in 005, the date the posting is up until in 009), most recent stage change first. `follow_up_due` is open opportunities with
`followUpDate` on or before today (UTC date, the server has no browser time zone; noted in the
description).

## `find_opportunities`

| Input | Type |
|---|---|
| `query` | 1–200 characters, matched case-insensitively against company and title, open and closed |
| `limit` | 1–50, default 10 |

Output: the same item shape, plus `status`.

## `get_opportunity`

| Input | Type |
|---|---|
| `id` | the opportunity id |

Output: the web API's opportunity with history (`GET /opportunities/{id}`), including each
entry's `via`. Feature 010 adds `lead`: `{ id, name, email, phone }` (`null` for a missing email
or phone) for the networking lead it's linked to, or `null`; a link to a lead that's gone reads
as `null`. Errors: `NOT_FOUND`.

## `read_posting`

| Input | Type |
|---|---|
| `url` | an http or https link |

Output: feature 002's `PostingDetails`, with `postedUntil` when the posting states it (feature
009). Errors: feature 002's import codes and messages
(`SIGN_IN_REQUIRED`, `NO_JOB_DETAILS`, `MULTIPLE_JOBS`, `UNREACHABLE`, `URL_NOT_ALLOWED`).
Nothing is saved; the description tells Claude to show the details before adding.

## `add_opportunity`

| Input | Type |
|---|---|
| the web API's `OpportunityInput` fields | `company` and `title` required; everything else optional. Feature 004 adds `salaryMin`, `salaryMax`, and `createdAt` (see [004's changes](../../004-board-and-form-updates/contracts/mcp-tools-changes.md)); feature 009 adds `postedUntil` (`YYYY-MM-DD`, described to Claude as "the date the job posting is up until"); feature 010 adds `leadId` (an id from `list_leads`; an unknown one is refused with "That lead doesn't exist") |
| `add_anyway` | boolean, default `false` |

- When an open opportunity has the same company and title (`findPossibleDuplicate`) and
  `add_anyway` is false: nothing is added, and the result is
  `{ duplicateOf: { id, company, title, stage } }` with text asking Claude to confirm with the
  owner.
- Otherwise: `POST /opportunities` with `via: CLAUDE`. Output: the created opportunity.
- Errors: `VALIDATION_ERROR` (with the web app's messages), `RATE_LIMITED`.

## `update_opportunity`

| Input | Type |
|---|---|
| `id` | the opportunity id |
| the web API's `OpportunityPatch` fields | only the fields to change; `null` clears an optional field, and `leadId: null` unlinks the lead (feature 010) |

`PATCH /opportunities/{id}` with `via: CLAUDE` (sets `detailsEditedViaClaudeAt`). Errors:
`VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`.

## `move_opportunity`

| Input | Type |
|---|---|
| `id` | the opportunity id |
| `to_stage` | a stage id |
| `note` | optional, up to 2,000 characters |
| `changed_at` | optional ISO date or date-time, not in the future |
| `expected_change_count` | the `changeCount` from the last `get_opportunity` |

`POST /opportunities/{id}/stage-changes` with `via: CLAUDE`. Errors: `SAME_STAGE`,
`FUTURE_DATE`, `CONFLICT` (changed since read: the description tells Claude to get it again),
`NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`.

## `add_interview` and `update_interview` (feature 005)

Log an interview the owner has had, or change one's date or note, through
`POST /opportunities/{id}/interviews` and `PATCH /opportunities/{id}/interviews/{interviewId}`
with `via: CLAUDE`. Each takes one from the change limit. There is no tool to remove an
interview: that's deleting data, which only the web app does. Inputs, descriptions, and errors
are in [feature 005's changes](../../005-interview-count/contracts/mcp-tools-changes.md).

## Networking leads (feature 010)

A lead is a name, an email and a phone, nothing else
([feature 010's changes](../../010-networking-leads/contracts/changes.md)). The change tools
take one each from the change limit. There is no tool to delete a lead: only the web app does.

| Tool | Input | Output |
|---|---|---|
| `list_leads` (read) | none | `{ leads: [{ id, name, email, phone, opportunities: [{ id, company, title, stage }] }] }`, by name, with `null` for a missing email or phone |
| `add_lead` | `name`, `email?`, `phone?` | the lead (`POST /leads`) |
| `update_lead` | `id`, then any of `name`, `email`, `phone` (`null` clears email or phone) | the lead (`PATCH /leads/{id}`) |

Errors: `VALIDATION_ERROR` (the web app's messages), `NOT_FOUND` ("Lead not found"),
`RATE_LIMITED`.

## Notes on leads (feature 011)

A dated note for each conversation with a lead
([feature 011's changes](../../011-lead-notes/contracts/changes.md)). `list_leads` returns
each lead's `notes: [{ id, heldAt, text }]`, newest first. The change tools take one each from
the change limit. There is no tool to delete a note: only the web app does.

| Tool | Input | Output |
|---|---|---|
| `add_lead_note` | `lead_id`, `text`, `held_at?` (an ISO date-time, not in the future; defaults to now) | the note (`POST /leads/{id}/notes`) |
| `update_lead_note` | `lead_id`, `note_id`, then `text?` and `held_at?` | the note (`PATCH /leads/{id}/notes/{noteId}`) |

Errors: `VALIDATION_ERROR` ("Write a note", "A note can't be dated in the future", the limit of
200), `NOT_FOUND` ("Lead not found", "Note not found"), `RATE_LIMITED`.
