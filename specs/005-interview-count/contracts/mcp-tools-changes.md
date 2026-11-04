# Claude's Tools: Changes

These are changes to feature 003's [tool contract](../../003-mcp-server/contracts/mcp-tools.md).
The web API validates every value, so refusals carry the web app's messages.

## add_interview (new)

| Input | Type | Description shown to Claude |
|---|---|---|
| `opportunity_id` | string | The opportunity's id |
| `held_at` | string, optional | `When the interview happened: an ISO date-time, not in the future; defaults to now` |
| `note` | string, optional | `Optional note, such as the interviewer or the kind of interview` |

- **Description**: "Logs an interview the owner has had for an opportunity (at most 6 each). It
  doesn't change the stage: use move_opportunity for that."
- **Output**: the opportunity with its history and interviews.
- **Annotations**: same as the other changes, and it takes one from the change limit.

## update_interview (new)

| Input | Type | Description shown to Claude |
|---|---|---|
| `opportunity_id` | string | The opportunity's id |
| `interview_id` | string | `The interview's id, from get_opportunity` |
| `held_at` | string, optional | As above |
| `note` | string or null, optional | `null clears the note` |

- **Description**: "Changes an interview's date or note. Interviews can be removed only in the web
  app."
- **Output**: as above.

## Read tools

- `get_opportunity` returns `interviews` (from the API).
- List and find summaries gain `interviewCount` (a number, 0 when none).
- No remove tool exists.
