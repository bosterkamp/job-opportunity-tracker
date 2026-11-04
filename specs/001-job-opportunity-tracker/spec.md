# Feature Specification: Job Opportunity Tracker

**Feature Branch**: `001-job-opportunity-tracker`

**Created**: 2026-10-17

**Status**: Ready for implementation

**Input**: User description: "A personal job opportunity tracker. I want to keep track of the potential job opportunities I have and move each one through a workflow that mirrors how I actually go through the hiring process: e.g., I'm considering it, I have applied, I have been contacted, I have an interview, etc., through to an outcome. For each opportunity I need to track company name, point of contact, job title, job description, my interest level (1-5 stars), and similar details. I want to see all my opportunities and where each one stands, update details over time, and advance opportunities through the stages as I progress."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a new opportunity (Priority: P1)

When I come across a job I might want, I record it quickly. At minimum I enter the company name
and job title. If I have them, I can also add the point of contact, job description, interest
level (1–5 stars), and other details. The new opportunity starts in the "Considering" stage.

**Why this priority**: Without a way to record opportunities, nothing else in the tracker has
any value. This is the smallest useful version of the product.

**Independent Test**: Add an opportunity with only a company and title, and another with every
field filled in. Close and reopen the tracker and confirm both were saved exactly as entered.

**Acceptance Scenarios**:

1. **Given** an empty tracker, **When** I add an opportunity with company "Acme" and title
   "Senior Engineer", **Then** it is saved in the "Considering" stage with today's date as its
   date added.
2. **Given** I am adding an opportunity, **When** I leave the company name or job title blank,
   **Then** it is not saved and I am told which required field is missing.
3. **Given** I am adding an opportunity, **When** I set the interest level to 4 stars,
   **Then** the saved opportunity shows 4 out of 5 stars.
4. **Given** a saved opportunity, **When** I later add a point of contact and job description,
   **Then** those details are saved and shown with the opportunity.

---

### User Story 2 - Move an opportunity through the pipeline (Priority: P1)

As my search progresses, I move each opportunity to the stage that reflects what is happening
(for example, Considering → Applied → Contacted → Interviewing → Offer), and eventually to an
outcome such as Accepted, Declined, Rejected, No Longer Available, Withdrawn, or No Response. Each move is a single
step, and I can add a note about what happened.

**Why this priority**: Tracking where each opportunity stands is the main reason the tracker
exists (Constitution Principle I).

**Independent Test**: Move one opportunity through every stage to an outcome and confirm that
its current stage is correct after each move and that every move appears in its history with a
date.

**Acceptance Scenarios**:

1. **Given** an opportunity in "Considering", **When** I move it to "Applied" with the note
   "Applied via company site", **Then** its current stage is "Applied" and the history shows the
   move, the date and time, and the note.
2. **Given** an opportunity in "Applied", **When** I move it straight to "Interviewing",
   **Then** the move is allowed and recorded. Stages do not have to be visited in order.
3. **Given** an opportunity in "Interviewing", **When** I move it back to "Contacted",
   **Then** the move is allowed and recorded.
4. **Given** an opportunity in any open stage, **When** I move it to an outcome stage,
   **Then** it is marked closed, leaves the active list, and stays available in the archive.
5. **Given** a closed opportunity, **When** I reopen it into an open stage, **Then** it returns
   to the active list and the reopening is recorded in its history.

---

### User Story 3 - See all opportunities and where they stand (Priority: P1)

I can see all my active opportunities at once, grouped or filterable by stage, with the
company, job title, current stage, interest level, and how long since the last change visible
at a glance. I can open any opportunity to see its full details and history.

**Why this priority**: Recording and moving opportunities is only useful if I can review my
whole search at a glance.

**Independent Test**: With opportunities in several stages, open the overview and confirm that
each one appears under the correct stage with its key details, and that opening one shows its
full details and history.

**Acceptance Scenarios**:

1. **Given** opportunities in several stages, **When** I open the overview, **Then** I see every
   active opportunity organized by its current stage.
2. **Given** the overview, **When** I filter to a single stage, **Then** only opportunities in
   that stage are shown.
3. **Given** the overview, **When** I sort by interest level, **Then** opportunities are listed
   from highest to lowest star rating, with unrated ones last.
4. **Given** closed opportunities exist, **When** I view the archive, **Then** I see closed
   opportunities with their outcomes, and they do not appear in the active overview.

---

### User Story 4 - Update details over time (Priority: P2)

As I learn more about an opportunity, I edit its details: a new contact, an updated
description, a changed interest level, notes from a call, or the date of my next follow-up.

**Why this priority**: Details change throughout a job search, but recording opportunities and
moving them through stages already provides value on its own.

**Independent Test**: Edit each field on an existing opportunity and confirm every change is
saved and shown.

**Acceptance Scenarios**:

1. **Given** an opportunity rated 3 stars, **When** I change it to 5 stars, **Then** it shows
   5 stars everywhere it appears.
2. **Given** an opportunity, **When** I set a next follow-up date, **Then** the date is shown on
   the opportunity and opportunities with follow-ups due today or earlier are highlighted in the
   overview.
3. **Given** an opportunity, **When** I try to clear the company name or job title,
   **Then** the change is rejected and the original value is kept.

---

### Edge Cases

- **Duplicates**: When I add an opportunity whose company and job title match an existing active
  opportunity, I am warned and can either continue or open the existing one.
- **Long descriptions**: Job descriptions pasted from postings (up to at least 20,000
  characters) are saved in full, keeping line breaks.
- **No rating**: Interest level is optional. An unrated opportunity shows "not rated", not
  zero stars.
- **Same-stage move**: Moving an opportunity to the stage it is already in is not recorded as a
  stage change.
- **Permanent deletion**: Deleting an opportunity permanently requires an explicit confirmation.
  Otherwise, closing archives it (Constitution Principle II).
- **Backdating**: When I record a move that actually happened earlier (for example, "I applied
  last Tuesday"), I can set the date of the move. The date cannot be in the future.
- **Empty states**: An empty overview, stage, or archive tells me so and offers a way to add an
  opportunity.

## Requirements *(mandatory)*

### Functional Requirements

**Opportunities**

- **FR-001**: Users MUST be able to create an opportunity with only a company name and job title.
- **FR-002**: The system MUST reject an opportunity that has no company name or job title and
  MUST say which field is missing.
- **FR-003**: Each opportunity MUST support these optional fields: point of contact (name, role,
  email, phone), job description, interest level (1–5 whole stars, or unrated), job posting link,
  location, work arrangement (on-site, hybrid, remote), compensation notes, source (where I found
  it), next follow-up date, and free-form notes.
- **FR-004**: The system MUST record the date each opportunity was added.
- **FR-005**: Users MUST be able to edit any field of an opportunity at any time, subject to
  FR-002.
- **FR-006**: The system MUST warn when a new opportunity's company and job title match an
  existing active opportunity, and MUST let the user continue anyway.

**Pipeline**

- **FR-007**: Every opportunity MUST be in exactly one stage at any time.
- **FR-008**: The system MUST provide these stages, in this display order. Open stages:
  Considering, Applied, Contacted, Interviewing, Offer. Outcome stages: Accepted, Declined,
  Rejected, No Longer Available, Withdrawn, No Response. "No Longer Available" is for a job
  that closed without rejecting me, for example because someone else was hired (added
  2026-10-19).
- **FR-009**: New opportunities MUST start in the "Considering" stage.
- **FR-010**: Users MUST be able to move an opportunity to any other stage in a single action,
  including skipping stages and moving backward.
- **FR-011**: Moving an opportunity to an outcome stage MUST close it and move it to the archive.
  Users MUST be able to reopen a closed opportunity into any open stage.
- **FR-012**: Interviews MUST be tracked through the "Interviewing" stage, stage-change notes,
  and the opportunity's free-form notes. Individual interview records are out of scope for this
  feature.

**History**

- **FR-013**: The system MUST record every stage change with the previous stage, the new stage,
  the date and time, and an optional note.
- **FR-014**: Users MUST be able to set an earlier date on a stage change. Future dates MUST be
  rejected.
- **FR-015**: Users MUST be able to view an opportunity's full stage history in date order.
- **FR-016**: Closing an opportunity MUST NOT delete it or its history. Permanent deletion MUST
  require explicit confirmation.

**Viewing**

- **FR-017**: The system MUST show all active opportunities organized by current stage, showing
  company, job title, current stage, interest level, and time since the last stage change.
- **FR-018**: Users MUST be able to filter the overview by stage and sort it by interest level,
  date added, and time since last change.
- **FR-019**: Users MUST be able to search opportunities by company name and job title.
- **FR-020**: The system MUST highlight active opportunities whose next follow-up date is today
  or earlier.
- **FR-021**: The system MUST provide an archive view of closed opportunities and their outcomes.

**Data ownership**

- **FR-023**: Opportunity data MUST be accessible only to its owner and MUST NOT be sent to
  third parties.

### Key Entities

- **Opportunity**: A potential job. Has a company name and job title (required), the optional
  details listed in FR-003, the date added, a current stage, and an open or closed status.
- **Stage**: A step in the job-search pipeline. Either an open stage (the search is ongoing) or
  an outcome stage (the opportunity is closed). Stages have a fixed display order.
- **Stage Change**: One entry in an opportunity's history: the previous stage, the new stage, the
  date and time, and an optional note. Each opportunity has an ordered list of stage changes.
- **Contact**: The point of contact for an opportunity: name, role, email, and phone, all
  optional. Stored as part of the opportunity for now.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: I can add a new opportunity with company and job title in under 30 seconds, and a
  fully detailed one in under 2 minutes.
- **SC-002**: I can move an opportunity to a new stage in under 10 seconds from the overview.
- **SC-003**: From the overview, I can tell the current stage of any active opportunity
  without opening it.
- **SC-004**: With 200 opportunities stored, the overview, filters, and search show results
  in under 1 second.
- **SC-005**: 100% of stage changes appear in history with correct dates. No opportunity or
  history entry is lost when an opportunity is closed.
- **SC-007**: After a month of use, I rely on the tracker instead of a spreadsheet or notes to
  know where each opportunity stands.

## Assumptions

- There is one user: me. No sign-up, sharing, or multi-user features are in scope.
- Stages are a fixed list in this version. Adding or renaming stages is out of scope.
- One point of contact per opportunity is enough for now. Several contacts per opportunity, or a
  shared contact list across companies, are out of scope.
- Follow-up dates are highlighted in the app. Email or push reminders are out of scope.
- Logging individual interviews (date, type, interviewers) is out of scope. It may become a
  later feature.
- Attaching files (resumes, cover letters) is out of scope for this version.
- Importing from other job sites or spreadsheets is out of scope for this version.
- Where the tracker runs and how it is hosted are decided in the implementation plan.
