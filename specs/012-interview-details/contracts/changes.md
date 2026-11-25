# Contract Changes: Interview Details

These change [the API contract](../../001-job-opportunity-tracker/contracts/api.openapi.yaml)
and [Claude's tools](../../003-mcp-server/contracts/mcp-tools.md); both are updated with the
feature.

## API

| Route | Body | Answers |
|---|---|---|
| `POST /opportunities/{id}/interviews` (changed) | `{ heldAt?, note?, kind?, panel?, format?, outcome?, nextSteps?, interviewers? }` | 201 the opportunity, as today; 400 `VALIDATION_ERROR` |
| `PATCH /opportunities/{id}/interviews/{interviewId}` (changed) | any of the same; `null` clears | 200 the opportunity, as today; 400; 404 "Interview not found" |
| `GET /opportunities`, `GET /opportunities/{id}` and every route answering with an opportunity (changed) | | the opportunity gains `interviewTimes: string[]`, sorted; each interview gains the new fields |

`Interview`: `{ id, heldAt, note, recordedAt, via?, kind?, panel?, format?, outcome?, nextSteps?,
interviewers? }`.

`Interviewer`: `{ name, title?, email?, phone?, linkedin? }`.

Refusals are listed in the [data model](../data-model.md#rules-and-messages). `heldAt` may now be
up to a year ahead. Any other field is refused, as for every strict body.

## Claude's tools

| Tool | Input | Output |
|---|---|---|
| `list_opportunities`, `find_opportunities` (changed) | unchanged | each summary's `interviewCount` is the number held so far; gains `nextInterviewAt` (or null) |
| `get_opportunity` (changed) | unchanged | each interview gains `kind`, `panel`, `format`, `outcome`, `nextSteps`, `interviewers`, and `upcoming` |
| `add_interview` (changed) | gains `kind?`, `panel?`, `format?`, `outcome?`, `next_steps?`, `interviewers?`; `held_at` may be up to a year ahead | the opportunity, as today |
| `update_interview` (changed) | gains the same, each clearable with `null`; `interviewers` replaces the list | the opportunity, as today |

Each still takes one change from the per-minute limit. There's still no tool to remove an
interview.

## Web app

- `/opportunities/{id}`: an Interviews section ("Add interview", upcoming, then past); the
  history shows each past interview as one line linking to its page.
- `/opportunities/{id}/interviews/new` (new): the add form.
- `/opportunities/{id}/interviews/{interviewId}` (new): the interview's page, with Edit and
  Remove.
- Board cards: the badge counts interviews held; "Next interview: {date and time}" when one is
  upcoming.
