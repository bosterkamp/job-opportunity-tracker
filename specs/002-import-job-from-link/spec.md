# Feature Specification: Import Job Details from a Posting Link

**Feature Branch**: `002-import-job-from-link`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Import job details from a posting URL. On the "Add opportunity" page, the job posting link moves to the top of the form, with a button next to it (for example "Fill from link") that fetches the posting and pre-fills the form: company, job title, job description, location, work arrangement, compensation, and where it was found. The user reviews and edits the pre-filled values before saving; nothing is saved automatically. Fields the user has already typed should not be silently overwritten. If the page can't be read (blocked, requires sign-in like LinkedIn, not a job posting, network error), the user sees a clear message and can still fill in the form by hand. Adding an opportunity without a link must keep working exactly as today, with only company and title required."

## Clarifications

### Session 2026-10-19

- Q: When a page doesn't publish its details in a standard, machine-readable form, may its public
  text be sent to an outside AI service to extract them? → A: No. Extraction is built in, and
  nothing is sent to an outside service. AI extraction may be considered as a later feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fill the form from a posting link (Priority: P1)

When I find a job online, I paste its link at the top of the "Add opportunity" page and choose
"Fill from link". The form fills in with what the posting says: the company, the job title, the
job description, the location, whether it's remote, hybrid, or on-site, the pay, and the site I
found it on. The link itself is kept as the job posting link. I check the values, change
anything that's wrong, add my own details such as my interest level, and save as usual.

**Why this priority**: Copying each detail from a posting by hand is the slowest part of adding
an opportunity, and the job description is long. This story is the feature.

**Independent Test**: Paste the link to a public job posting, choose "Fill from link", and check
that the company, title, and description match the posting. Save, and confirm the opportunity
is stored with those values and the link.

**Acceptance Scenarios**:

1. **Given** the "Add opportunity" page, **When** I open it, **Then** the job posting link field
   is the first field on the form, with a "Fill from link" button beside it.
2. **Given** a link to a public job posting, **When** I choose "Fill from link", **Then** within a
   few seconds the form shows the posting's company, job title, and job description, and any
   location, work arrangement, pay, and source the posting states.
3. **Given** the form has been filled from a link, **When** I look at it, **Then** nothing has
   been saved yet, and I can edit any value before saving.
4. **Given** the form has been filled from a link, **When** I save, **Then** the opportunity is
   saved with the values shown on the form, exactly as if I had typed them.
5. **Given** the details are being fetched, **When** I wait, **Then** I can see that it is
   working, and I can't start a second fetch at the same time.

---

### User Story 2 - Keep what I typed, and fail clearly (Priority: P1)

Sometimes I start typing before I fill from the link, or the link can't be read. The tracker
never replaces what I typed without telling me, and when it can't read a page, it says why in
plain words and leaves me free to fill in the form myself.

**Why this priority**: A fill that silently overwrites my notes, or fails without explanation,
is worse than no feature. Many links (for example LinkedIn) can't be read without signing in,
so the failure path will be common.

**Independent Test**: Type a company name, then fill from a link to a posting for a different
company, and confirm the typed name is kept and the other fields fill in. Then try a LinkedIn
link and a link to a page that isn't a job posting, and confirm each shows a clear message and
the form still works.

**Acceptance Scenarios**:

1. **Given** I have already typed a value in a field, **When** I fill from a link whose posting
   has a different value for that field, **Then** my value is kept, and I'm told which fields
   were left as I typed them.
2. **Given** a field is empty, **When** I fill from a link, **Then** that field gets the
   posting's value.
3. **Given** a link to a page that requires signing in (for example LinkedIn), **When** I choose
   "Fill from link", **Then** I see a message saying the site doesn't allow its postings to be
   read and suggesting I fill in the details by hand, and the form is unchanged.
4. **Given** a link to a page that isn't a job posting, or a posting with no details the tracker
   can read, **When** I choose "Fill from link", **Then** I see a message saying no job details
   were found, and the form is unchanged.
5. **Given** the site can't be reached or takes too long, **When** I choose "Fill from link",
   **Then** I see a message saying the page couldn't be loaded, and I can try again.
6. **Given** some details were found but others weren't (for example no pay), **When** the fill
   finishes, **Then** the found details are filled in and I'm told which ones were found.
7. **Given** an invalid link (not a web address), **When** I choose "Fill from link", **Then** I
   see the form's existing link message ("Must be an http or https link"), and nothing is fetched.

---

### User Story 3 - Adding without a link is unchanged (Priority: P1)

When I don't have a link, I add an opportunity exactly as I do today: only the company and job
title are required, and everything else is optional.

**Why this priority**: Fast capture is a core principle of the tracker. Moving the link to the
top must not make it feel required.

**Independent Test**: Add an opportunity with only a company and title, leaving the link empty,
and confirm it saves as before.

**Acceptance Scenarios**:

1. **Given** the "Add opportunity" page, **When** I leave the link empty and enter only a company
   and title, **Then** the opportunity saves as it does today.
2. **Given** the link field is empty, **When** I look at the "Fill from link" button, **Then** it
   can't be used until a link is entered.
3. **Given** I fill from a link and the result matches one of my open opportunities, **When** I
   save, **Then** I get the same duplicate warning as when I type the details.

---

### Edge Cases

- **Long descriptions**: A description longer than the tracker's limit (20,000 characters) is
  cut at the limit, and I'm told it was shortened.
- **Formatting**: Descriptions are filled in as readable plain text with paragraph breaks and
  list items kept; page markup, scripts, and styling never appear in the form.
- **Redirects**: A shortened or tracking link that redirects to the posting works, and the
  original link I pasted is the one saved.
- **Several postings on one page**: If a page lists more than one job, nothing is filled in and
  I'm told the link should point to a single posting.
- **Pay**: Pay is filled in as readable text, for example "$150,000–$180,000 a year". A posting
  that doesn't state pay leaves the field empty.
- **Work arrangement**: Filled in only when the posting clearly says remote, hybrid, or on-site.
- **Filling twice**: Filling again from the same or another link follows the same rule: only
  empty fields change.
- **Huge or slow pages**: A page that is very large or slow to respond stops loading after a
  reasonable limit, with the "couldn't be loaded" message.
- **Unsafe links**: Links that aren't public web pages (for example addresses on a private
  network, or anything other than http and https) are refused with a message.
- **Not signed in**: Only the signed-in owner can use "Fill from link", like every other part
  of the tracker.

## Requirements *(mandatory)*

### Functional Requirements

**The form**

- **FR-001**: The "Add opportunity" form MUST show the job posting link as its first field,
  above the company and job title, with a "Fill from link" button beside it.
- **FR-002**: The link MUST stay optional. Company and job title MUST remain the only required
  fields.
- **FR-003**: The "Fill from link" button MUST be unavailable while the link field is empty or
  while a fill is in progress, and MUST show that a fill is in progress.
- **FR-004**: An invalid link MUST be rejected with the form's existing "Must be an http or https link"
  message, without fetching anything.

**Reading the posting**

- **FR-005**: The system MUST read the posting at the given link and extract, when the posting
  states them: company, job title, job description, location, work arrangement (remote, hybrid,
  or on-site), and pay. It MUST set "where you found it" to the name of the site the posting is
  on.
- **FR-006**: The system MUST read the posting only when I ask (by choosing "Fill from link"),
  and MUST NOT save anything as a result of reading it.
- **FR-007**: The system MUST follow redirects to reach the posting, and the form MUST keep the
  link I entered.
- **FR-008**: The job description MUST be plain text that keeps paragraph breaks and list
  items, with no markup, and MUST be cut to 20,000 characters with a notice when longer.
- **FR-009**: The system MUST give up on a page that doesn't respond within 10 seconds or is
  larger than a reasonable limit, and report it as "couldn't be loaded".
- **FR-010**: The system MUST refuse links that aren't public http or https web pages,
  including addresses on private or internal networks.
- **FR-011**: Details MUST be extracted by the tracker itself, from the job information a page
  publishes in a standard, machine-readable form, or from the hiring site's own public job
  data. The page and
  the link MUST NOT be sent to any outside service, including AI services (Constitution
  Principle IV). A page without such information gets the "no job details were found" message.

**Filling the form**

- **FR-012**: A fill MUST change only fields that are empty. Fields I have typed in MUST be
  kept.
- **FR-013**: After a fill, I MUST be told which fields were filled in, and which fields were
  kept as I typed them because the posting had a different value.
- **FR-014**: When nothing could be read, the form MUST be left unchanged, and I MUST see a
  message that says why, in plain words, in one of these cases: the site requires signing in or
  blocks reading; no job details were found; the page lists several jobs; the page couldn't be
  loaded; the link isn't allowed.
- **FR-015**: Saving a filled-in form MUST behave exactly like saving a typed one, including
  validation and the duplicate warning.

**Privacy and access**

- **FR-016**: Only the signed-in owner MUST be able to use "Fill from link".
- **FR-017**: The link and the page's content MUST NOT be stored, except for the values I choose
  to save with the opportunity.

### Key Entities

- **Posting details**: What was read from a link, shown to me before anything is saved:
  company, job title, job description, location, work arrangement, pay, the site's name, and
  whether the description was shortened. It is never stored on its own; it only fills the form.
- **Opportunity**: Unchanged from feature 001. The job posting link is the existing optional
  field, now placed first on the add form.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a readable posting link, I can add an opportunity with company, title, and
  full description in under 30 seconds, compared with about 2 minutes by hand.
- **SC-002**: A fill finishes, with details or with a message, within 10 seconds for 95% of
  links.
- **SC-003**: For postings on the common hiring sites that companies use for their careers pages
  (for example Greenhouse, Lever, Workday, and Ashby), company, title, and description are
  filled in correctly at least 90% of the time.
- **SC-004**: A value I typed is never replaced by a fill (0 cases in testing).
- **SC-005**: Every failed fill shows a message that names the reason; none fails silently.
- **SC-006**: Adding an opportunity without a link takes no more steps than before this feature.

## Assumptions

- **Add page only**: "Fill from link" is on the "Add opportunity" page. Editing an existing
  opportunity keeps the link field where it is today, without the button.
- **Sites that need a sign-in can't be read**: The tracker reads pages as a visitor who isn't
  signed in. Postings that only show to signed-in users (LinkedIn is the common case) can't be
  filled; the user fills those by hand.
- **Point of contact isn't filled**: Postings rarely name a contact, so the contact fields stay
  for the user to fill in.
- **Interest, follow-up date, and notes are the user's**: A fill never sets them.
- **Where it was found**: Set to the site's name (for example "Greenhouse" or "acme.com"),
  which the user can change, for example to "Referral".
- **Accuracy is best effort**: The user reviews every value before saving; the tracker doesn't
  promise the posting's details are right.
- **Respectful reading**: The tracker reads one page per click, as a normal visitor would, and
  identifies itself honestly. It does not get around sign-in walls or bot protection.
- **Not every site can be filled**: Pages that don't publish standard job information (some
  custom careers pages) show "no job details were found". Extracting from free text with an AI
  service is out of scope for this feature.
- **One user, low volume**: A few fills a day, so cost and rate limits aren't a concern.
