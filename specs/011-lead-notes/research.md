# Research: Notes on Networking Leads

## 1. A note's date

- **Decision**: A note stores `heldAt`, an ISO timestamp in UTC, as an interview does
  (feature 005). The web form picks a day; `dayToTimestamp` turns today into now and an earlier
  day into noon that day, so today's notes keep the order they were added in. The page shows
  the day only.
  - **Never in the future**: refused past the clock skew a stage change allows, with "A note
    can't be dated in the future". There's no earliest date: conversations often happened
    before the lead was entered.
  - **Default**: now, when no date is given (from the web and from Claude).
- **Rationale**: the same rule, helpers and Claude field (`held_at`) as interviews, so nothing
  new about time zones. A bare `YYYY-MM-DD` would need the server to know the owner's time zone
  to default to "today" for Claude.
- **Alternatives considered**: a calendar date (`YYYY-MM-DD`) with the server checking it
  against "today somewhere on Earth": a looser future check, and Claude's default would be the
  UTC day, which is tomorrow on a US evening.

## 2. Storing notes

- **Decision**: One item per note, in its lead's partition:
  - **Key**: `PK = LEAD#<leadId>`, `SK = NOTE#<noteId>`.
  - **Listing**: also in GSI1's `LEADS` partition, with `GSI1SK = <leadId>#NOTE#<noteId>`, so
    the one query that lists leads also brings back every note. Each lead's own item keeps
    `GSI1SK = <leadId>`, and the repository tells them apart by `SK`.
  - **Attributes**: `id`, `leadId`, `heldAt`, `text`, `createdAt`, `updatedAt`.
  - **The limit of 200**: the lead item counts its notes (`noteCount`). Adding a note puts it
    and raises the count in one transaction, conditional on the lead existing and the count
    being under 200, as interviews hold their limit of 6. Deleting one lowers it the same way.
- **Rationale**: the leads page stays one request (SC-005), with no new index or
  infrastructure. The count can't be beaten by two adds at once.
- **Alternatives considered**:
  - Notes inside the lead item, as a list: one item would grow towards DynamoDB's 400 KB limit
    (200 notes × 5,000 characters is about 1 MB), and every edit rewrites all of them.
  - Querying each lead's partition for its notes: one request per lead.

## 3. The API

- **Decision**:
  - `GET /leads` returns each lead with `notes` (newest `heldAt` first, then newest
    `createdAt`) beside its `opportunities`.
  - `POST /leads/:id/notes` (`{ text, heldAt? }`) answers 201 with the note; 404 "Lead not
    found"; at the limit, `VALIDATION_ERROR` "This lead already has 200 notes, the most it can
    have".
  - `PATCH /leads/:id/notes/:noteId` (`{ text?, heldAt? }`) answers 200 with the note; 404
    "Note not found".
  - `DELETE /leads/:id/notes/:noteId` needs `X-Confirm-Delete: true`, answers 204; 404 "Note
    not found".
  - `DELETE /leads/:id` also deletes the lead's notes, in the batches that already unlink its
    opportunities, with the lead's own item last.
  - Note changes touch only the note and the lead's `noteCount`: not the lead's `updatedAt`, its
    fields, or any opportunity (FR-008).
- **Rationale**: the same shape as the interview routes, under the lead.

## 4. The web app

- **Decision**: On each lead's card, under its opportunities:
  - **Notes**: the newest note (its day, then its text with line breaks kept), and a "Show all N
    notes" button (`aria-expanded`) that lists the rest below it, newest first. With one note,
    there's no button; with none, there's no notes area.
  - **Add note** beside Edit and Delete. Each note has its own Edit and Delete, labelled for
    screen readers with the lead and the day ("Edit the note on Oct 30, 2026 with Dana Ruiz").
  - **NoteDialog** (new): a date (max today, as the interview form) and the note text, with the
    shared rules and per-field errors, like LeadDialog. Title "Add a note for Dana Ruiz" or
    "Edit note".
  - **Deleting a note**: a confirmation like removing an interview.
  - **Deleting a lead**: the confirmation also says " N notes will be deleted." when it has any.
- **Rationale**: the notes stay with the lead (spec assumptions), the page stays short with one
  note showing per lead, and the dialogs follow the existing ones.

## 5. Claude

- **Decision**:
  - `list_leads` returns each lead's `notes`: `[{ id, heldAt, text }]`, newest first. Its
    description says so.
  - `add_lead_note`: `lead_id`, `text`, `held_at?` (ISO date-time, not in the future, defaults
    to now).
  - `update_lead_note`: `lead_id`, `note_id`, then `text?` and `held_at?`.
  - Both take one change from the per-minute limit. No tool deletes a note (FR-006).
- **Rationale**: one list call answers "what have I talked about with Dana", and the names match
  the interview tools.
- **Alternatives considered**: a separate `get_lead_notes` tool: another call for Claude to
  learn, for a list one person's network keeps short.
