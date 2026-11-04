# Feature Specification: Notes on Networking Leads

**Feature Branch**: `011-lead-notes`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Add a notes portion to the leads page so I can put the notes
there related to my conversations with my network." The owner chose dated entries (newest
first, like an opportunity's history) over one notes box, and chose that Claude can read and
add notes. Later the same day: "Move archive to the end of the navigation on both web and
phone." Then: "Remove the more details for everything. Just show the full list of data every
time."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Note each conversation with a lead (Priority: P1)

After a call or a coffee with someone in my network, I write down what we talked about on
their lead: who they'll introduce me to, what roles they think fit, when to check back. Each
conversation is its own dated note, newest first, so I can see how things have gone with that
person before I talk to them again.

**Why this priority**: The notes are the feature.

**Independent Test**: On a lead, add a note dated today and one dated last week; both show,
newest first, with their dates; edit one's text; delete the other after confirming.

**Acceptance Scenarios**:

1. **Given** a lead on the Networking leads page, **When** I choose "Add note" on it, write
   the note and save, **Then** the note shows on that lead with today's date, above any older
   notes.
2. **Given** the add-note form, **When** I set an earlier date and save, **Then** the note
   takes its place by that date among the lead's notes.
3. **Given** a note, **When** I edit its text or date and save, **Then** the lead shows the
   change and keeps the notes in date order.
4. **Given** a note, **When** I delete it and confirm, **Then** it's gone; when I cancel,
   nothing changes.
5. **Given** a lead with several notes, **When** I look at it, **Then** I see its newest note
   and how many notes it has, and I can open the rest without leaving the page.
6. **Given** a lead with no notes, **Then** it offers "Add note" and shows no empty notes area.

---

### User Story 2 - Claude works with a lead's notes (Priority: P2)

When I tell Claude about a conversation ("I just talked to Dana, she'll intro me to Acme's
platform lead"), it can add the note to Dana's lead, and when I ask what's happened with
someone, it can read their notes.

**Why this priority**: Saves typing; needs story 1's notes to exist.

**Independent Test**: Ask Claude to add a note to a lead; the web app shows it with the right
date. Ask Claude what notes a lead has; it lists them. Ask it to correct a note; the web app
shows the change.

**Acceptance Scenarios**:

1. **Given** Claude, **When** I ask it to add a note to a lead (optionally for an earlier
   date), **Then** the web app shows the note on that lead.
2. **Given** a lead with notes, **When** I ask Claude about the lead, **Then** it can read all
   of the lead's notes with their dates.
3. **Given** a note, **When** I ask Claude to change its text or date, **Then** the web app
   shows the change.
4. **Given** Claude, **Then** it can't delete a note; that stays in the web app.

### Edge Cases

- **Empty note**: refused with "Write a note"; nothing is saved.
- **Long note**: up to 5,000 characters; longer is refused with the limit stated. Line breaks
  are kept as typed. Long words and links wrap on phones; nothing scrolls sideways.
- **Future date**: refused, as for stage changes and interviews; the date can be today or
  earlier.
- **Same date**: notes on the same date show the most recently added first.
- **Many notes**: a lead can have up to 200 notes; the 201st is refused with the limit stated.
- **Deleting a lead with notes**: its notes are deleted with it, and the confirmation says how
  many notes will go.
- **Links in a note** show as plain text, as the lead's email and phone do.
- **Editing a lead** (name, email, phone) leaves its notes alone.
- **Offline**: as the rest of the Networking leads page behaves offline today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each networking lead MUST be able to hold dated notes. A note MUST have a date
  (today by default, never in the future) and text (required, up to 5,000 characters, line
  breaks kept). A lead MAY have up to 200 notes.
- **FR-002**: A lead's notes MUST be shown on the Networking leads page, newest date first (the
  most recently added first within a date). The lead MUST show its newest note and how many it
  has, and MUST let the owner see all of them without leaving the page.
- **FR-003**: The owner MUST be able to add a note to a lead, edit a note's text and date, and
  delete a note after confirming.
- **FR-004**: Deleting a lead MUST delete its notes, and the delete confirmation MUST say how
  many notes it has (as it already says how many opportunities stay).
- **FR-005**: Notes MUST show as plain text: nothing in them becomes a link.
- **FR-006**: Claude's tools MUST be able to read a lead's notes, add a note (with an optional
  earlier date), and change a note's text or date. Claude MUST NOT be able to delete notes
  (constitution, Principle IV). Adding or changing a note counts toward Claude's change limit.
- **FR-007**: Notes MUST be private to the owner and stored with the rest of the owner's data
  (constitution, Principle IV).
- **FR-008**: Adding, editing or deleting notes MUST NOT change the lead's other details or any
  linked opportunity.
- **FR-009**: Everything new MUST meet the site's accessibility checks (WCAG 2.1 AA), in light
  and dark, on desktop and phones.
- **FR-010**: The project's architecture diagrams MUST be updated if they show what notes
  touch, and the validation record MUST say whether they changed (constitution, Development
  Workflow).
- **FR-011**: The site's navigation MUST list Overview, Networking leads, then Archive last, on
  desktop and phones.
- **FR-012**: The add-opportunity form MUST show every field at once, as editing already does,
  with no folded "More details" section. Company and title stay the only required fields
  (constitution, Principle III).

### Key Entities

- **Lead note**: one conversation's note on a networking lead. Date, text, and when it was
  added and last changed. Belongs to exactly one lead.
- **Networking lead** (feature 010): gains its notes. Its name, email and phone are unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can add a note to a lead in under 30 seconds.
- **SC-002**: Before talking to a lead again, the owner can read every past note with them on
  one page, newest first, with no searching.
- **SC-003**: A note told to Claude shows in the web app on the right lead, with the right date.
- **SC-004**: All existing checks of pages, workflows and Claude's tools still pass.
- **SC-005**: The Networking leads page opens as quickly as before for leads with up to 50
  notes each.

## Assumptions

- This changes feature 010's rule that a lead has only a name, email and phone (its FR-002),
  at the owner's request: a lead now also has notes. Its own fields stay the same.
- A note's date is a day, not a time of day; conversations are remembered by the day.
- The notes live on the Networking leads page, on each lead's card; there's no separate page
  per lead.
- Notes have no title, tags or search; one person's notes with a lead are short enough to read.
- Opportunities keep their own Notes field; lead notes are separate and don't appear on
  opportunities.
- Deleting a note is permanent once confirmed; notes keep no history of their edits
  (Principle II covers stage changes, not notes).
