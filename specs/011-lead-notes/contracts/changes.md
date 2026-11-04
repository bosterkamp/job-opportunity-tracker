# Contract Changes: Notes on Networking Leads

These change [the API contract](../../001-job-opportunity-tracker/contracts/api.openapi.yaml)
and [Claude's tools](../../003-mcp-server/contracts/mcp-tools.md); both are updated with the
feature.

## API

| Route | Body | Answers |
|---|---|---|
| `GET /leads` (changed) | | each lead gains `notes: LeadNote[]`, newest `heldAt` first, then newest `createdAt` |
| `POST /leads/{id}/notes` (new) | `{ text, heldAt? }` | 201 the note; 400 `VALIDATION_ERROR`; 404 "Lead not found" |
| `PATCH /leads/{id}/notes/{noteId}` (new) | `{ text?, heldAt? }` | 200 the note; 400; 404 "Note not found" |
| `DELETE /leads/{id}/notes/{noteId}` (new) | header `X-Confirm-Delete: true` | 204; 400 without the header; 404 "Note not found" |
| `DELETE /leads/{id}` (changed) | | also deletes the lead's notes |

`LeadNote`: `{ id, leadId, heldAt, text, createdAt, updatedAt }`.

Refusals (`VALIDATION_ERROR`, on the field named):

- `text` blank: "Write a note"; over 5,000 characters: the limit stated.
- `heldAt` in the future: "A note can't be dated in the future".
- The 201st note: "This lead already has 200 notes, the most it can have".
- Any other field: refused, as for every strict body.

## Claude's tools

| Tool | Input | Output |
|---|---|---|
| `list_leads` (changed) | none | each lead gains `notes: [{ id, heldAt, text }]`, newest first |
| `add_lead_note` (new) | `lead_id`, `text`, `held_at?` | the note |
| `update_lead_note` (new) | `lead_id`, `note_id`, `text?`, `held_at?` | the note |

Both new tools take one change from the per-minute limit. There's no tool to delete a note.

## Web app

- The Networking leads page: each lead's notes, "Add note", and each note's Edit and Delete.
- The navigation: Overview, Networking leads, Archive (Archive last), on desktop and phones.
