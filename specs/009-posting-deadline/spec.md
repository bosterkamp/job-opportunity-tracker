# Feature Specification: Posting Deadline

**Feature Branch**: `009-posting-deadline`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Add a field for when the posting will be up until, if it is
mentioned. Also, make the default sort to be by most urgent posting. Finally, add the posted
until date on the main page."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record when a posting closes (Priority: P1)

When I add or edit an opportunity, I can enter the date the posting is up until. If I fill the
form from the posting's link and the posting states a closing date, it's filled in for me.
Claude can set it too when it saves a posting for me. Many postings don't say, so the field is
optional.

**Why this priority**: The other two parts need the date to exist.

**Independent Test**: Add an opportunity with a "Posted until" date, reopen it, and see the date
on its detail page; edit it to another date and clear it; fill the form from a link whose
posting states a closing date and see it filled in.

**Acceptance Scenarios**:

1. **Given** the add or edit form, **When** I enter a "Posted until" date and save, **Then** the
   opportunity's detail page shows it.
2. **Given** an opportunity with a "Posted until" date, **When** I clear it and save, **Then**
   the date is gone and nothing else changes.
3. **Given** a link to a posting that states when it closes, **When** I fill the form from it,
   **Then** "Posted until" holds that date, and I can change or clear it before saving.
4. **Given** a link to a posting that doesn't state when it closes, **When** I fill the form
   from it, **Then** "Posted until" stays empty and everything else fills in as today.
5. **Given** Claude adds or updates an opportunity, **When** it gives a closing date, **Then**
   the opportunity has it, and when it reads a posting that states one, it gets the date back.

---

### User Story 2 - See the closing date on the board (Priority: P2)

On the overview, each card with a closing date shows it, so I can see at a glance which postings
are about to come down. A posting closing within a week stands out, and one that has already
closed says so.

**Why this priority**: It's the everyday use of the date; it needs story 1's data.

**Independent Test**: Give three opportunities a date next month, one in three days, and one
last week; the cards read "Open until" with the date, "Closes in 3 days" in the warning colour,
and "Posting ended" with the date. A card without a date looks as it does today.

**Acceptance Scenarios**:

1. **Given** a card whose posting closes more than 7 days from today, **When** the overview
   opens, **Then** the card shows "Open until" and the date (for example "Open until Nov 14").
2. **Given** a card whose posting closes today or in the next 7 days, **When** the overview
   opens, **Then** it shows "Closes today", "Closes tomorrow" or "Closes in N days", in the
   warning colour.
3. **Given** a card whose posting closed before today, **When** the overview opens, **Then** it
   shows "Posting ended" and the date, in a muted style.
4. **Given** a card with no closing date, **When** the overview opens, **Then** it looks as it
   does today.
5. **Given** the archive, **When** it opens, **Then** its cards show the date the same way.

---

### User Story 3 - The most urgent postings first (Priority: P3)

When I open the overview, each column lists the postings that close soonest first, so I act on
them before they come down. I can still pick any other order from "Sort by".

**Why this priority**: It changes the default view; the date has to be there and visible
first.

**Independent Test**: With opportunities closing in 2 days, in 20 days, last week, and with no
date, all in one column, open the overview without choosing a sort: the order is 2 days, 20
days, then those without a date, then the one that has ended.

**Acceptance Scenarios**:

1. **Given** the overview opened with no sort chosen, **When** it shows, **Then** "Sort by" reads
   "Closing soonest" and, in each column, open postings with a date come first, soonest first.
2. **Given** the same, **Then** opportunities without a date follow, most recently changed first
   (today's default order), and postings that have ended come last, most recently ended first.
3. **Given** two postings that close on the same day, **Then** the one changed most recently
   comes first.
4. **Given** I choose another sort, **When** I reload or share the link, **Then** that sort is
   kept, as today; choosing "Recently changed" still works.
5. **Given** the archive opened with no sort chosen, **Then** it keeps today's default order,
   "Recently changed", and "Closing soonest" is available there too.

---

### Edge Cases

- **A date in the past**: allowed when adding or editing (a posting may already have closed);
  it's shown as ended.
- **Postings that state a closing time or time zone**: only the calendar date in the posting's
  own statement is kept, with no time or time zone.
- **A stated closing date that can't be read** (malformed): left empty, and the rest of the
  form still fills in.
- **"Today"** is the device's own date, as for follow-ups.
- **Closed opportunities**: they keep their date and show it the same way; urgency doesn't
  colour them, since nothing more can be done (they show the plain "Open until" or "Posting
  ended" text).
- **Phones**: the date fits on the card's existing line of details and wraps with them; the
  tabs on phones sort the same way.
- **Older opportunities** have no date and sort with the undated ones.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An opportunity MUST have an optional "Posted until" date (a calendar date, no
  time), which the owner can set, change or clear when adding or editing, with any date
  allowed.
- **FR-002**: The opportunity's detail page MUST show the date when it's set.
- **FR-003**: Filling the form from a link MUST fill "Posted until" when the posting states when
  it closes, and leave it empty otherwise. The owner MUST be able to change it before saving.
- **FR-004**: Claude's tools MUST be able to set, change and clear the date when adding or
  updating, MUST return it when reading an opportunity, and reading a posting MUST return it
  when the posting states it.
- **FR-005**: Each card with a date, on the overview and the archive, MUST show it:
  - more than 7 days ahead: "Open until" and the date;
  - today to 7 days ahead, on an open opportunity: "Closes today", "Closes tomorrow" or
    "Closes in N days", in the warning colour;
  - before today: "Posting ended" and the date, muted.
  Closed opportunities MUST show the plain text without the warning colour. Cards without a
  date MUST look as they do today.
- **FR-006**: "Sort by" MUST offer "Closing soonest": open-posting dates soonest first, then no
  date by most recent change, then ended postings by most recently ended; ties by most recent
  change.
- **FR-007**: "Closing soonest" MUST be the overview's default sort, on the board and the phone
  tabs. The archive's default MUST stay "Recently changed".
- **FR-008**: A sort chosen in the URL or the toolbar MUST keep working as today, including
  "Recently changed" now that it isn't the overview's default.
- **FR-009**: The date MUST NOT count as a stage change, MUST NOT affect follow-ups, and MUST be
  kept, unchanged, when the opportunity moves stage or is closed.
- **FR-010**: Everything new MUST meet the site's accessibility checks (WCAG 2.1 AA), including
  the warning and muted text in light and dark.
- **FR-011**: The project's architecture diagrams MUST be checked, and the validation record
  MUST say whether they changed (constitution, Development Workflow).

### Key Entities

- **Opportunity**: gains "Posted until", an optional calendar date. Nothing else changes; no
  history entry records it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For postings that state a closing date in their standard job details, filling
  from the link fills "Posted until" correctly in 100% of the project's sample postings.
- **SC-002**: Opening the overview shows, without any clicks, each column's soonest-closing
  posting at the top.
- **SC-003**: The owner can tell, from the overview alone, which postings close within a week.
- **SC-004**: All existing checks of pages, workflows and Claude's tools pass, apart from those
  that test the overview's old default sort.
- **SC-005**: The overview opens as quickly as before (no more than a tenth of a second slower
  on the same connection).

## Assumptions

- "Most urgent posting" means the posting that comes down soonest, not the follow-up date (which
  already has its own highlight); the sort is named "Closing soonest".
- "The main page" is the overview board (and its tabs on phones); the archive shows the date
  too, for consistency.
- "Within a week" is today plus the next 7 days, matching how soon the owner can act.
- Postings state a closing date through their standard job details (schema.org
  `validThrough`), as used for the rest of fill from link; dates written only in the
  description text aren't read.
- The field is called "Posted until" in the form and the detail page, in the owner's words.
- No reminders are sent before a posting closes; that belongs with issue #1.
