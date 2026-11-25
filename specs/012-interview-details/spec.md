# Feature Specification: Interview Details

**Feature Branch**: `012-interview-details`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "I'd like to put more focus into the interview part. I'd like to
expand the notes section to more fielded data. Add a type of interview drop down, which
includes HR talent advisor, hiring manager, business, engineering and maybe an indicator of
whether it was panel or not. Also, put another section with contact details. Also, make a
separate page (or at least section) with the interview details, not just added to the
history." Decided with the owner: the contacts are each interview's interviewers (a panel can
have several); an Interviews section on the opportunity page lists each interview, and each one
opens its own page; upcoming interviews can be added ahead of time; and interviews also get a
format, how it went, and next steps. The short note stays as it is.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record an interview's details (Priority: P1)

After an interview, I record what kind it was (HR / talent advisor, hiring manager, business,
or engineering), whether it was a panel, whether it was by phone, video or in person, how I
think it went, and what happens next. I can still add a short note. Later, I can tell at a
glance which conversations I've had and which are still ahead.

**Why this priority**: Fielded details are the core of the request; everything else shows or
uses them.

**Independent Test**: Log an interview as a hiring-manager video panel that went well, with the
next step "Decision by Friday"; open it again and see every field as entered; change the type
to engineering and see the change.

**Acceptance Scenarios**:

1. **Given** an opportunity, **When** I choose "Add interview", **Then** the form offers a date
   and time (now by default), a type drop-down (HR / talent advisor, hiring manager, business,
   engineering, other), a "Panel" yes/no, a format (phone, video, in person), how it went (went
   well, not sure, went badly), next steps, and the short note. Only the date and time are
   needed to save.
2. **Given** I fill in every field and save, **Then** the interview shows each of them exactly
   as entered.
3. **Given** I save with only the date, **Then** the interview is recorded with the other
   fields left empty, as an interview is today.
4. **Given** an interview, **When** I edit any field, or clear an optional one, and save,
   **Then** the interview shows the change.
5. **Given** an interview logged before this feature (a date and a note only), **Then** it shows
   its date and note, with the new fields empty and ready to fill.

---

### User Story 2 - Keep each interviewer's contact details (Priority: P1)

For each interview I list who I met: their name, title, email, phone and LinkedIn profile. A
panel can have several people. When it's time to send a thank-you note or follow up, I have
everyone's details on the interview itself.

**Why this priority**: The owner asked for a contact section; thank-you notes and follow-ups
depend on it.

**Independent Test**: On a panel interview, add three interviewers, one with only a name and
two with every detail; remove one; edit another's title; the interview shows the two remaining
people with their details.

**Acceptance Scenarios**:

1. **Given** an interview, **When** I add an interviewer with a name, **Then** they're listed on
   it; title, email, phone and LinkedIn are optional.
2. **Given** an interview, **When** I add several interviewers, **Then** all are listed in the
   order I added them.
3. **Given** an interviewer, **When** I change or clear any of their details, or remove them,
   **Then** the interview shows the change.
4. **Given** an invalid email address or a LinkedIn entry that isn't a LinkedIn profile
   address, **When** I save, **Then** I see what's wrong with that field and nothing is saved.
5. **Given** an interviewer with a LinkedIn profile, **Then** it's shown as a link that opens
   the profile; their email and phone show as plain text, as a networking lead's do.

---

### User Story 3 - See every interview in its own section and page (Priority: P1)

On an opportunity's page, an Interviews section lists its interviews, with upcoming ones first,
then past ones newest first. Each line shows the date and time, type, panel, and format at a
glance. Tapping one opens that interview's own page with all of its details and its
interviewers, where I can edit it or remove it. The history keeps a one-line entry for each
past interview, which also opens its page.

**Why this priority**: The owner asked for interview details away from the history; with more
fields, they no longer fit on one history line.

**Independent Test**: On an opportunity with one upcoming and two past interviews, the
Interviews section lists the upcoming one first, then the past ones newest first; tapping one
opens its page showing every detail; the history shows the two past ones as single lines that
open the same pages.

**Acceptance Scenarios**:

1. **Given** an opportunity with interviews, **When** I open it, **Then** an Interviews section
   lists them: upcoming first (soonest first), then past (newest first), each with its date and
   time, and its type, panel, and format when set.
2. **Given** the Interviews section, **When** I tap an interview, **Then** its own page opens
   with every field, its interviewers, and the opportunity it belongs to, with a way back to the
   opportunity.
3. **Given** an interview's page, **When** I edit it and save, **Then** the page and the
   Interviews section show the change.
4. **Given** an interview's page, **When** I remove the interview and confirm, **Then** it's
   gone from the section, the history, and the count, and I'm back on the opportunity; when I
   cancel, nothing changes.
5. **Given** a past interview, **Then** the history shows it as one line, such as
   "Interview · Nov 3, 2:00 PM · Hiring manager · Panel", which opens its page.
6. **Given** an opportunity with no interviews, **Then** the Interviews section offers "Add
   interview" and shows no empty list.
7. **Given** an interview's page address, **When** I open it directly or reload it, **Then** it
   shows that interview; an address for an interview that's gone says it wasn't found and
   offers the way back.

---

### User Story 4 - Add upcoming interviews ahead of time (Priority: P2)

When a recruiter schedules an interview, I add it right away with its future date and time,
type and interviewers, so I can prepare. It shows as upcoming. Once its time has passed, it
counts as one I've had, and I can record how it went.

**Why this priority**: Scheduling ahead helps preparation, but recording interviews (stories
1 to 3) is useful without it.

**Independent Test**: Add an interview for tomorrow; it's listed as upcoming, isn't in the
history, and doesn't change the card's interview count; once its time has passed, it moves to
the past interviews, appears in the history, and the card's count goes up by one.

**Acceptance Scenarios**:

1. **Given** the add-interview form, **When** I choose a future date and time and save,
   **Then** the interview is listed as "Upcoming" in the Interviews section.
2. **Given** an upcoming interview, **Then** it isn't in the history and doesn't count in the
   card's interview badge.
3. **Given** an upcoming interview whose time has passed, **When** I next look, **Then** it's
   listed with the past interviews, appears in the history, and counts in the badge, without my
   doing anything.
4. **Given** an upcoming interview, **Then** "how it went" isn't offered until its time has
   passed.
5. **Given** an opportunity with an upcoming interview, **Then** its card on the board shows the
   next interview's date and time.
6. **Given** an upcoming interview, **When** I move its date to another time, including into the
   past, **Then** it's listed, shown in the history and counted according to its new time.

---

### User Story 5 - Claude works with interview details (Priority: P2)

When I tell Claude about an interview ("I have a panel with Acme's engineering team Thursday at
2, with Priya Shah and Tom Lee"), it adds it with the right type, panel, time and interviewers.
Afterwards, when I say how it went, it records that. When I ask what's coming up or who I met
at Acme, it can tell me.

**Why this priority**: Saves typing; depends on stories 1, 2 and 4.

**Independent Test**: Ask Claude to add an upcoming panel interview with two interviewers; the
web app shows it with every detail. Ask Claude to record that it went well with a next step;
the web app shows that. Ask Claude about the opportunity; it lists the interviews with their
details.

**Acceptance Scenarios**:

1. **Given** Claude, **When** I ask it to add an interview, past or upcoming, with any of the
   new fields and interviewers, **Then** the web app shows the interview with those details.
2. **Given** an interview, **When** I ask Claude to change any of its fields or interviewers,
   **Then** the web app shows the change.
3. **Given** an opportunity with interviews, **When** I ask Claude about it, **Then** it can read
   every interview with all of its details and interviewers, and which are upcoming.
4. **Given** Claude, **Then** it can't remove an interview; that stays in the web app.

### Edge Cases

- **Date and time**: an interview has a date and a time, shown in the browser's time zone.
  Past interviews can't be before the opportunity's date added, as today. Upcoming ones can be
  at most one year ahead; later is refused with the limit stated.
- **Exactly now**: an interview whose time is now or earlier counts as past.
- **Limit**: an opportunity can have up to 6 interviews, past and upcoming together, as today;
  the 7th is refused with the limit stated.
- **Interviewers**: up to 10 per interview; the 11th is refused with the limit stated. A name is
  needed for each; an interviewer with no name isn't saved and the field says so.
- **Text lengths**: name and title up to 100 characters each, email up to 254, phone up to 50,
  LinkedIn up to 300, next steps up to 500, and the note stays at 200. Longer is refused with
  the limit stated.
- **Panel with one interviewer**: allowed; "Panel" is the owner's call, not counted from the
  list.
- **"How it went" on an interview later moved into the future**: it's kept but not shown until
  the time has passed again.
- **Closed opportunities**: their interviews and pages stay viewable and editable, as the rest
  of a closed opportunity does; adding an upcoming interview to a closed opportunity is allowed
  (it may be reopened).
- **Deleting an opportunity permanently**: removes its interviews and their interviewers with
  it.
- **Phones**: the Interviews section, the interview page, and the form work at phone width with
  nothing scrolling sideways; long names, emails and links wrap.
- **Offline**: as the rest of the opportunity page behaves offline today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An interview MUST have a date and time (now by default), and MAY have: a type
  (HR / talent advisor, hiring manager, business, engineering, other), a panel yes/no (no by
  default), a format (phone, video, in person), how it went (went well, not sure, went badly),
  next steps (up to 500 characters), and the existing note (up to 200 characters). Only the
  date and time are required (constitution, Principle III).
- **FR-002**: An interview MAY list up to 10 interviewers, kept in the order added. Each MUST
  have a name and MAY have a title, email, phone and LinkedIn profile address, with the lengths
  in Edge Cases. Emails MUST be valid addresses; LinkedIn entries MUST be linkedin.com profile
  addresses.
- **FR-003**: An interview MAY be dated up to one year in the future. An interview whose time
  has not yet come is upcoming; once it has, it is past, with no action by the owner.
- **FR-004**: Only past interviews MUST count in the card's interview badge (feature 005) and
  appear in the history. "How it went" MUST be offered only for past interviews.
- **FR-005**: A board card for an opportunity with an upcoming interview MUST show the next
  upcoming interview's date and time. Cards with no upcoming interviews look as they do today.
- **FR-006**: The opportunity page MUST have an Interviews section listing every interview,
  upcoming first (soonest first) then past (newest first), each showing its date and time and,
  when set, its type, panel and format, and offering "Add interview".
- **FR-007**: Each interview MUST have its own page, reachable from the Interviews section, from
  its history entry, and by its own address, showing every field, its interviewers, and the
  opportunity it belongs to, with a way back to the opportunity. The owner MUST be able to edit
  the interview there and remove it after confirming.
- **FR-008**: The history MUST show each past interview as one line with its date and time and,
  when set, its type and panel, opening the interview's page. The full details MUST NOT be
  repeated in the history.
- **FR-009**: An opportunity MAY have up to 6 interviews, past and upcoming together (the limit
  from feature 005, unchanged).
- **FR-010**: Interviews logged before this feature MUST keep their date, note and count, with
  the new fields empty.
- **FR-011**: A LinkedIn profile MUST show as a link that opens it; every other interviewer
  detail, next steps and the note MUST show as plain text.
- **FR-012**: Claude's tools MUST be able to read every interview's fields, interviewers and
  whether it's upcoming; add interviews, past or upcoming, with any of the new fields and
  interviewers; and change any field or interviewer. Claude MUST NOT be able to remove
  interviews (constitution, Principle IV). Adding or changing counts toward Claude's change
  limit, as today.
- **FR-013**: Adding, changing or removing an interview MUST NOT change the opportunity's stage
  or its "last change", as today (feature 005).
- **FR-014**: Interview details and interviewers' contact details MUST be private to the owner
  and stored with the rest of the owner's data (constitution, Principle IV).
- **FR-015**: Everything new MUST meet the site's accessibility checks (WCAG 2.1 AA), in light
  and dark, on desktop and phones.
- **FR-016**: The project's architecture diagrams MUST be updated if they show what interviews
  touch, and the validation record MUST say whether they changed (constitution, Development
  Workflow).

### Key Entities

- **Interview** (feature 005): one interview for an opportunity. Gains a type, panel, format,
  how it went, next steps and interviewers, alongside its date and time, note, and when it was
  recorded. Upcoming or past depending on its date and time. Belongs to exactly one
  opportunity.
- **Interviewer**: a person met in one interview. Name, and optionally title, email, phone and
  LinkedIn profile. Belongs to exactly one interview.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can record a past interview with its type, panel, format and one
  interviewer in under a minute.
- **SC-002**: From an opportunity's page, the owner can reach any interview's full details and
  interviewers' contact details in one tap.
- **SC-003**: Without opening anything, the owner can see on the board which opportunities have
  an interview coming up, and when.
- **SC-004**: An interview told to Claude, with its details and interviewers, shows correctly in
  the web app on the right opportunity.
- **SC-005**: All existing interviews keep their dates, notes and counts after the change.
- **SC-006**: All existing checks of pages, workflows and Claude's tools still pass.

## Assumptions

- "Other" is added to the owner's four interview types so an interview that fits none of them
  can still be typed; it can be removed if unwanted.
- "Panel" is a plain yes/no; the number of interviewers doesn't set it.
- Interviewers are recorded per interview and aren't linked to networking leads (feature 010);
  the same person met twice is entered twice. Linking them could come later.
- The interview limit stays at 6 per opportunity (owner's decision, 2026-11-10); upcoming
  interviews count toward it.
- Upcoming interviews don't create reminders or notifications; follow-up reminders are a
  separate backlog item (issue #1).
- An interview's time is the time it starts; there is no end time or duration.
- Removing an interview is permanent once confirmed, as today; interviews keep no history of
  their edits (Principle II covers stage changes).
- No search or list of interviews across all opportunities; each opportunity shows its own.
