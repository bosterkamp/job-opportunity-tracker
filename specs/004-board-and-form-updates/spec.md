# Feature Specification: Board and Form Updates

**Feature Branch**: `004-board-and-form-updates`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Four improvements from GitHub issues #14, #16, #17, #18, decided with the owner on 2026-10-20. (1) Salary range (#16): replace the single free-text Compensation with Salary min and Salary max (whole numbers, no currency or pay-period fields), shown on the board cards (for example "$150k–$180k"), and the board can be sorted by salary min or max and filtered by salary (for example "at least $150k"). Keep the existing free-text field, renamed "Pay notes", for things like bonus or equity. "Fill from link" fills min and max from the posting's pay where it can, and Claude's tools gain the same fields. (2) Backdating (#14): a "Date added" field on the add form (defaults to today, can't be in the future) that can also be edited later; the first history entry and the overview's "last change" use it, so opportunities from before the app existed can be entered with their real dates. (3) Closed on the main page (#17): a "Closed" column at the end of the board (a "Closed" tab on phones), each card showing its outcome; the Archive page stays. (4) Full edit page (#18): editing shows every field at once, without the "More details" section; the add form keeps "More details" so quick capture stays quick."

## Clarifications

### Session 2026-10-20

- Q: How should salary be recorded (#16)? → A: Separate minimum and maximum, without currency or
  pay-period fields; shown on the main page; the board can be sorted and filtered by them.
- Q: How should closed opportunities appear on the main page (#17)? → A: A "Closed" column at
  the end of the board (a "Closed" tab on phones), each card showing its outcome. The Archive
  page stays.
- Q: What happens to the free-text "Compensation" field (#16)? → A: It stays, renamed "Pay
  notes", for things like bonus or equity, next to the new minimum and maximum.
- Q: Where can the date added be backdated (#14)? → A: On the add form (defaulting to today)
  and later when editing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record and compare salary ranges (Priority: P1)

For each opportunity I record the salary range as a minimum and a maximum. The board shows the
range on each card, so I can compare opportunities at a glance, and I can sort the board by
salary or show only opportunities that pay at least an amount I choose. Anything else about pay
(a bonus, equity, an hourly rate's details) goes in "Pay notes".

**Why this priority**: Pay is one of the main ways the owner compares opportunities, and today
it's free text that can't be compared, sorted, or seen on the board (issue #16).

**Independent Test**: Give three opportunities different ranges (one with only a minimum, one
with none), check the cards, sort by salary minimum and by maximum, and filter by "at least
$150k".

**Acceptance Scenarios**:

1. **Given** an opportunity with a salary of 150,000 to 180,000, **When** I view the board,
   **Then** its card shows "$150k–$180k".
2. **Given** an opportunity with only a minimum of 150,000, **When** I view the board, **Then**
   its card shows "$150k+"; with only a maximum of 180,000, "Up to $180k"; with neither, no
   salary.
3. **Given** I enter a minimum higher than the maximum, **When** I save, **Then** I see "The
   minimum can't be more than the maximum" and nothing is saved.
4. **Given** several opportunities, **When** I sort by "Salary (minimum)" or "Salary
   (maximum)", **Then** they're ordered highest first, and opportunities without that value come
   last.
5. **Given** I filter by "at least $150k", **When** the board updates, **Then** it shows only
   opportunities whose range reaches $150k (the maximum, or the minimum when there's no
   maximum, is at least 150,000), and says how many are hidden for having no salary.
6. **Given** an existing opportunity with text in "Compensation", **When** I open it, **Then**
   that text is shown as "Pay notes", unchanged.
7. **Given** a posting that states pay, **When** I use "Fill from link", **Then** the minimum
   and maximum are filled, and "Pay notes" gets the posting's pay as text (for example "$45–$60
   an hour"), so a pay period isn't lost.
8. **Given** I ask Claude to record a salary range, **When** it updates the opportunity,
   **Then** the minimum and maximum are set with the same rules.

---

### User Story 2 - Enter opportunities with their real dates (Priority: P1)

When I add an opportunity I found before I started using the tracker, I set "Date added" to the
day I really found it. The history and the board's "last change" then reflect the real
timeline. I can correct the date later.

**Why this priority**: Without it, older opportunities all look new and the board's ordering
and "last change" are wrong (issue #14).

**Independent Test**: Add an opportunity dated three months ago, check its history and the
board's "last change", then change the date and check again.

**Acceptance Scenarios**:

1. **Given** the add form, **When** I open it, **Then** "Date added" shows today.
2. **Given** I set "Date added" to a past date, **When** I save, **Then** the opportunity's date
   added, its first history entry, and (until it moves) its "last change" all use that date.
3. **Given** I set "Date added" to a future date, **When** I save, **Then** I see "The date
   can't be in the future" and nothing is saved.
4. **Given** an existing opportunity, **When** I change its date added, **Then** its first
   history entry moves to that date too.
5. **Given** an opportunity that has moved since it was added, **When** I set its date added to
   after its first move, **Then** I see "The date added can't be after the first stage change"
   and nothing changes.

---

### User Story 3 - See closed opportunities on the main page (Priority: P2)

The board has a "Closed" column at its end (a "Closed" tab on phones) with every closed
opportunity, each card showing how it ended. I see the whole search in one place; the Archive
page still lists closed opportunities on their own.

**Why this priority**: Seeing outcomes next to open opportunities shows the search's full
picture (issue #17), but the board is usable without it.

**Independent Test**: With open and closed opportunities, check the Closed column on a wide
screen and the Closed tab on a phone, including the outcome on each card.

**Acceptance Scenarios**:

1. **Given** closed opportunities, **When** I view the board on a wide screen, **Then** a
   "Closed" column follows the open stages, with its count, newest outcome first.
2. **Given** the same on a phone, **When** I view the board, **Then** a "Closed (n)" tab follows
   the stage tabs.
3. **Given** a closed card, **When** I look at it, **Then** it shows its outcome (for example
   "Rejected") instead of a "Move to…" button for open stages; I can still open it to reopen it.
4. **Given** I search, sort, or filter by salary, **When** the board updates, **Then** the
   Closed column follows the same search, sort, and salary filter.
5. **Given** I filter the board by one open stage, **When** the board updates, **Then** only
   that stage shows; choosing "Closed" in the stage filter shows only the Closed column.
6. **Given** no closed opportunities, **When** I view the board, **Then** the Closed column says
   "Nothing closed yet".

---

### User Story 4 - Edit every detail at once (Priority: P2)

When I edit an opportunity, every field is visible straight away, so I can review and change
anything without opening a "More details" section. Adding stays quick: the add form still shows
only company and title until I open "More details".

**Why this priority**: Editing is usually about details that are hidden today (issue #18).

**Independent Test**: Open "Edit details" and check that every field is visible without any
extra click; open "Add opportunity" and check that only company, title, and the posting link
show first.

**Acceptance Scenarios**:

1. **Given** an opportunity, **When** I choose "Edit details", **Then** every field (including
   salary minimum and maximum, pay notes, and date added) is visible with no "More details"
   section.
2. **Given** the add form, **When** I open it, **Then** it shows the posting link, company, and
   title, with "More details" closed, as today.
3. **Given** a validation error on any field while editing, **When** I save, **Then** focus
   moves to that field, which is already visible.

---

### Edge Cases

- **Big and small numbers**: Salaries are whole numbers from 0 to 10,000,000. Values of 1,000
  or more show in thousands ("$152.5k"); smaller ones in full ("$45–$60"), since a pay period
  isn't recorded.
- **Only one end**: Either end of the range may be left empty.
- **Commas and symbols**: Typing "150,000" or "$150k" in a salary field is understood as
  150,000; anything else that isn't a whole number shows "Enter a whole number, like 150000".
- **Salary filter with no salary**: Opportunities without a salary are hidden while the filter
  is on, and the board says how many are hidden.
- **Many closed opportunities**: The Closed column scrolls like the others; the Archive page is
  still the place to browse them all with search.
- **Date added time of day**: Date added is a calendar date; the time of day isn't shown or
  edited.
- **Backdating with history**: The date added can't be later than the first stage change, and
  can't be in the future.
- **Through Claude**: Claude can set salary minimum and maximum, pay notes, and date added, with
  the same rules and messages.

## Requirements *(mandatory)*

### Functional Requirements

**Salary (issue #16)**

- **FR-001**: An opportunity MUST have optional "Salary minimum" and "Salary maximum" fields,
  each a whole number from 0 to 10,000,000.
- **FR-002**: When both are set, the minimum MUST NOT be more than the maximum.
- **FR-003**: The free-text "Compensation" field MUST be renamed "Pay notes", keeping every
  existing value unchanged.
- **FR-004**: Board cards MUST show the range: "$150k–$180k", "$150k+" (minimum only), "Up to
  $180k" (maximum only), or nothing when neither is set.
- **FR-005**: The board MUST offer sorting by salary minimum and by salary maximum, highest first,
  with opportunities missing the value last.
- **FR-006**: The board MUST offer a "Salary at least" filter that shows only opportunities whose
  maximum (or minimum, when there's no maximum) is at least the amount, and MUST say how many
  are hidden for having no salary. The filter MUST be kept in the page address, like the other
  filters.
- **FR-007**: "Fill from link" MUST fill the minimum and maximum from the posting's pay (in whole
  units of its currency), and MUST also fill "Pay notes" with the pay as text.
- **FR-008**: Claude's tools MUST accept and return salary minimum, salary maximum, and pay
  notes.

**Date added (issue #14)**

- **FR-009**: The add form MUST have a "Date added" field, defaulting to today in the browser's
  time zone, that MUST NOT be in the future.
- **FR-010**: The date added MUST be used for the opportunity's creation date, its first
  history entry, and its "last change" until its first stage move.
- **FR-011**: Editing MUST allow changing the date added, with the same rules, and MUST NOT allow
  a date after the opportunity's first stage change.
- **FR-012**: Claude's tools MUST accept a date added when adding and editing, with the same
  rules.

**Closed on the board (issue #17)**

- **FR-013**: The board MUST show a "Closed" column after the open stages on wide screens, and a
  "Closed (n)" tab after the stage tabs on phones, holding every closed opportunity, newest
  outcome first.
- **FR-014**: Closed cards MUST show their outcome, and MUST still open the opportunity.
- **FR-015**: Search, sort, and the salary filter MUST apply to the Closed column too; the stage
  filter MUST offer "Closed".
- **FR-016**: The Archive page MUST stay as it is.

**Full edit page (issue #18)**

- **FR-017**: The edit form MUST show every field without a "More details" section.
- **FR-018**: The add form MUST keep "More details" closed by default, as today.

### Key Entities

- **Opportunity**: gains `salaryMin` and `salaryMax` (optional whole numbers); `compensation` is
  shown as "Pay notes" (same data); the creation date becomes settable ("Date added").
- **Stage history**: the first entry's date follows the date added.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With 200 opportunities, sorting or filtering the board by salary shows results in
  under 1 second, like the other filters.
- **SC-002**: 100% of existing "Compensation" text is shown unchanged as "Pay notes" after the
  change.
- **SC-003**: An opportunity found months ago can be entered with its real date added in under
  30 seconds.
- **SC-004**: Every closed opportunity appears in the Closed column, and the counts match the
  Archive page.
- **SC-005**: Editing any field of an opportunity takes no extra click to reveal it.

## Assumptions

- **No currency or pay period**: As decided, salaries are plain numbers; the board shows them
  with "$". Postings in other currencies fill the numbers as stated, and "Pay notes" keeps the
  currency and period as text.
- **Existing data**: Opportunities saved before this feature have no minimum or maximum; their
  compensation text becomes pay notes with no conversion attempted.
- **Date added defaults to today**, so adding stays as fast as now for current opportunities.
- **The Archive page is unchanged** and its "reopen" flow still works.
- **Claude's list tool** includes salary in its summaries, so "which pay at least 150k?" can be
  answered.
