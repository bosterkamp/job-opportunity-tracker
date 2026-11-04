# Feature Specification: Interview Count

**Feature Branch**: `005-interview-count`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Count interviews per opportunity (owner request, 2026-10-26). The owner is starting to have interviews and wants each overview card to show, top right, how many interviews they've had for that opportunity: the total completed, since they don't know how many there will be. Decided with the owner: (1) Each interview is logged on the opportunity with an "Add interview" action: a date (defaults to today, can't be in the future) and an optional note such as "Hiring manager" or "Panel". Logged interviews appear in the opportunity's history and can be edited or removed. Claude's tools can log them too. (2) The badge (for example "2 interviews", "1 interview") appears at the top right of a card only once it has at least one interview, in any column including Closed; cards without interviews look as they do today."

## Clarifications

### Session 2026-10-26

- Q: How should an interview be recorded so it can be counted? → A: Log each interview on the
  opportunity with a date (today by default, never in the future) and an optional note. Each
  appears in the history and can be edited or removed. Claude can log them too.
- Q: Which cards show the badge? → A: Only cards with at least one interview, in any column
  including Closed.
- Q: How many interviews can an opportunity have? → A: Up to 6.
- Q: Can Claude change interviews it or the owner logged? → A: Yes, Claude can edit them (date
  and note), but not remove them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log an interview (Priority: P1)

After an interview, I open the opportunity and choose "Add interview". The date is today unless
I change it, and I can add a short note such as "Hiring manager" or "Panel". The interview then
appears in the opportunity's history with its date and note.

**Why this priority**: Nothing can be counted until interviews are recorded.

**Independent Test**: Log two interviews on one opportunity, one today and one last week with a
note, and check that both appear in its history in date order.

**Acceptance Scenarios**:

1. **Given** an opportunity, **When** I choose "Add interview" and save without changes,
   **Then** an interview dated today is recorded and appears in the history as
   "Interview · {date}".
2. **Given** I enter the note "Hiring manager" and an earlier date, **When** I save, **Then**
   the history shows "Interview · {that date} · Hiring manager", in date order among the stage
   changes.
3. **Given** I choose a future date, **When** I save, **Then** I see "The date can't be in the
   future" and nothing is recorded.
4. **Given** I choose a date before the opportunity was added, **When** I save, **Then** I see
   "An interview can't be before the date added" and nothing is recorded.
5. **Given** logging an interview, **When** it's saved, **Then** the opportunity's stage and its
   "last change" are unchanged.

---

### User Story 2 - See the interview count on the board (Priority: P1)

On the board, each card for an opportunity I've interviewed for shows, at its top right, how
many interviews I've had, so I can see at a glance how far along each one is.

**Why this priority**: This is what the owner asked for; it's the reason to log interviews.

**Independent Test**: With one opportunity with no interviews, one with one, and one with three
(one of them closed), check each card on the board and in the Archive.

**Acceptance Scenarios**:

1. **Given** an opportunity with 1 interview, **When** I view the board, **Then** its card shows
   "1 interview" at the top right.
2. **Given** an opportunity with 3 interviews, **When** I view the board, **Then** its card shows
   "3 interviews".
3. **Given** an opportunity with no interviews, **When** I view the board, **Then** its card has
   no interview badge and looks as it does today.
4. **Given** a closed opportunity with interviews, **When** I view the Closed column or the
   Archive, **Then** its card shows the count too.
5. **Given** I log, edit, or remove an interview, **When** I return to the board, **Then** the
   count is up to date.

---

### User Story 3 - Correct or remove an interview (Priority: P2)

If I logged an interview with the wrong date or note, or logged one by mistake, I can change it
or remove it from the opportunity's history.

**Why this priority**: Mistakes happen, but the count is useful without this.

**Independent Test**: Edit an interview's date and note, then remove another, and check the
history and the badge.

**Acceptance Scenarios**:

1. **Given** a logged interview, **When** I change its date or note and save, **Then** the
   history shows the new values, with the same rules as when adding.
2. **Given** a logged interview, **When** I choose to remove it and confirm, **Then** it's gone
   from the history and the count goes down by one.
3. **Given** I choose to remove it but cancel, **When** I look at the history, **Then** it's
   still there.

---

### User Story 4 - Log interviews through Claude (Priority: P3)

I can tell Claude "I had a panel interview with Farmers today" and it logs the interview on that
opportunity, marked as done through Claude. I can also ask Claude to correct one ("that Farmers
interview was yesterday").

**Why this priority**: Convenient, but the web app covers the need.

**Independent Test**: Ask Claude to log an interview, then to change its date, and check the
history (marked "via Claude") and the badge.

**Acceptance Scenarios**:

1. **Given** an opportunity, **When** Claude logs an interview with a note, **Then** it appears
   in the history marked "via Claude", and the count goes up.
2. **Given** Claude gives a future date, **When** it tries to log it, **Then** it's refused with
   the same message as in the web app.
3. **Given** Claude reads an opportunity, **When** it gets the details, **Then** it sees the
   interviews and their count.
4. **Given** a logged interview, **When** Claude changes its date or note, **Then** the history
   shows the new values, marked as changed through Claude, with the same rules as the web app.
5. **Given** a logged interview, **When** Claude is asked to remove it, **Then** it can't; it
   says to remove it in the web app.

---

### Edge Cases

- **Several on one day**: Any number of interviews can be logged on the same day; each counts.
- **Note length**: The note is optional, up to 200 characters, and kept as typed (trimmed).
- **Stage independence**: Logging an interview never moves the opportunity; an opportunity can
  have interviews in any stage, including after it's closed (for example, logged late).
- **Ordering**: In the history, interviews and stage changes are shown together in date order.
- **Changing the date added**: The date added can't be moved after the earliest interview, the
  same way it can't be moved after the first stage change.
- **Deleting the opportunity**: Permanently deleting an opportunity removes its interviews too.
- **The limit**: Up to 6 interviews per opportunity. When it has 6, "Add interview" says "This
  opportunity already has 6 interviews, the most it can have" instead of opening the form.
- **Through Claude**: Claude can log and edit interviews but can't remove them (removing is
  deleting data, which only the web app does).

## Requirements *(mandatory)*

### Functional Requirements

**Logging**

- **FR-001**: The opportunity's page MUST offer "Add interview", taking a date (defaulting to
  today in the device's time zone) and an optional note of up to 200 characters.
- **FR-002**: An interview's date MUST NOT be in the future, and MUST NOT be before the
  opportunity's date added.
- **FR-003**: Logging, editing, or removing an interview MUST NOT change the opportunity's stage,
  status, or "last change".
- **FR-004**: An opportunity MUST allow at most 6 interviews; adding a 7th MUST be refused with
  the message "This opportunity already has 6 interviews, the most it can have".

**History**

- **FR-005**: Each interview MUST appear in the opportunity's history as "Interview · {date}",
  followed by its note when there is one, in date order with the stage changes.
- **FR-006**: Each interview MUST be editable (date and note) with the same rules as adding.
- **FR-007**: Each interview MUST be removable through a deliberate, confirmed action.

**Count**

- **FR-008**: A card for an opportunity with at least one interview MUST show the count at its
  top right: "1 interview" or "{n} interviews". A card with none MUST show no badge.
- **FR-009**: The badge MUST appear wherever the card appears: every column of the board,
  including Closed, and the Archive.
- **FR-010**: The count MUST be up to date after any interview is logged, edited, or removed.

**Claude**

- **FR-011**: Claude's tools MUST be able to log an interview and edit one (date and note, with
  the same rules), marked as made through Claude, and MUST return interviews and their count
  when reading an opportunity. Claude MUST NOT be able to remove interviews.

**Date added**

- **FR-012**: The date added MUST NOT be changed to after the opportunity's earliest interview.

### Key Entities

- **Interview**: belongs to one opportunity (at most 6 each); has a date, an optional note, when
  it was recorded, and whether it was logged or last changed through Claude.
- **Opportunity**: gains its interviews (in its history) and an interview count shown on cards.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Logging an interview takes under 15 seconds from the opportunity's page.
- **SC-002**: 100% of cards for opportunities with interviews show the correct count, and 0% of
  cards without interviews show a badge.
- **SC-003**: With 200 opportunities, the board still shows its counts in under 1 second, like
  today.
- **SC-004**: After any change to an opportunity's interviews, the board shows the new count the
  next time it's viewed, without a manual refresh.

## Assumptions

- **"Completed" means logged**: An interview is logged after it happens, so every logged
  interview counts. Scheduling future interviews is out of scope.
- **Removing interviews**: The owner decided interviews can be removed. They're notes about the
  search, not stage changes, so Principle II (history is never lost) still holds for stage
  changes; removal is deliberate and confirmed, like deleting an opportunity.
- **No interview types**: The note is free text; there's no fixed list of interview kinds.
- **Logging doesn't suggest a stage move**: The owner moves the opportunity to Interviewing
  themselves, as today.
- **Claude**: Claude logs and edits interviews within the existing per-minute change limit.
