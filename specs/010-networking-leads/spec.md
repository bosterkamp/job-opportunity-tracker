# Feature Specification: Networking Leads

**Feature Branch**: `010-networking-leads`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "A new concept called Networking leads, on its own new page. A lead
has only a name, email, and phone number; no other fields, nothing else is relevant. A
networking lead can link to job opportunities. Add an 'Add lead' button, like the 'Add
opportunity' button."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep a list of networking leads (Priority: P1)

Some people help me find jobs without there being a job yet: a former colleague, a recruiter
friend, someone passing my name around. I keep them on their own page, "Networking leads",
with just their name, email and phone number. I add one with an "Add lead" button, the way I
add an opportunity, and I can fix or remove one later.

**Why this priority**: The list is the feature; linking needs leads to exist.

**Independent Test**: Add a lead with a name, email and phone; see it on the Networking leads
page; edit its phone number; delete it after confirming.

**Acceptance Scenarios**:

1. **Given** any page, **When** I choose "Networking leads" in the site's navigation, **Then**
   the Networking leads page lists my leads by name, each with its email and phone number.
2. **Given** the Networking leads page, **When** I choose "Add lead" at its top, enter a name,
   and save, **Then** the lead appears in the list. Email and phone are optional.
3. **Given** a lead, **When** I edit its name, email or phone and save, **Then** the list shows
   the change.
4. **Given** a lead, **When** I delete it and confirm, **Then** it's gone from the list; when I
   cancel, nothing changes.
5. **Given** no leads yet, **When** I open the page, **Then** it says there are none and offers
   "Add lead".

---

### User Story 2 - Link a lead to the opportunities they helped with (Priority: P2)

When a lead turns up a job, I link the opportunity to them, so I remember who it came from and
can see everything each lead has sent my way.

**Why this priority**: It ties the leads to the job search; it needs story 1's leads.

**Independent Test**: Link two opportunities to one lead; the lead shows both, each
opportunity's page names the lead; unlink one and it's gone from the lead.

**Acceptance Scenarios**:

1. **Given** the add or edit form of an opportunity, **When** I pick a lead and save, **Then**
   the opportunity's page shows "Lead" with the lead's name, email and phone.
2. **Given** a lead with linked opportunities, **When** I look at it on the Networking leads
   page, **Then** it lists each linked opportunity (company and title, with its stage), and
   each one opens that opportunity.
3. **Given** a linked opportunity, **When** I clear its lead and save, **Then** it's no longer
   linked and the lead no longer lists it.
4. **Given** a lead linked to opportunities, **When** I delete the lead and confirm, **Then**
   the opportunities stay, unlinked, and the confirmation says how many are linked.
5. **Given** an opportunity that's closed (in the archive), **Then** it keeps its lead and the
   lead still lists it.

---

6. **Given** Claude, **When** I ask it to add a lead or link an opportunity to one, **Then**
   the web app shows the lead or the link, and Claude can list leads and see an
   opportunity's lead.

### Edge Cases

- **Two leads with the same name**: allowed; the email and phone tell them apart in the picker.
- **A lead with only a name**: allowed; the list and the opportunity's page show just the name.
- **Email and phone checks**: an email must look like one; a phone number allows digits,
  spaces, `+`, `-`, `.` and parentheses, as the opportunity's contact phone does today.
- **Long names**: wrap on phones; nothing scrolls sideways.
- **The opportunity's own contact** (its point of contact) stays as it is; a lead is separate.
- **Linking or unlinking** doesn't count as a stage change and adds no history entry.
- **Offline**: the page behaves like the overview does offline today (issue #30 covers offline
  editing).
- **Phones**: the bottom navigation gains the Networking leads page alongside Overview and
  Archive.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST have a Networking leads page, reached from the site's navigation on
  every page, on desktop and phones.
- **FR-002**: A lead MUST have a name (required, up to 200 characters) and MAY have an email
  and a phone number. A lead MUST NOT have any other fields.
- **FR-003**: The page MUST list every lead, sorted by name, showing its email and phone as
  plain text. They MUST NOT start an email or a call.
- **FR-004**: An "Add lead" button at the top of the Networking leads page MUST add a lead
  through a short form (name, email, phone), styled like "Add opportunity". The site header
  keeps only "Add opportunity".
- **FR-005**: The owner MUST be able to edit a lead's fields and delete a lead after
  confirming. Deleting a lead MUST NOT delete or change any opportunity except removing its
  link.
- **FR-006**: An opportunity MUST be able to link to at most one lead, chosen on its add and
  edit forms, and the link MUST be removable. A lead MAY be linked to any number of
  opportunities.
- **FR-007**: The opportunity's page MUST show its lead (name, email, phone). The lead MUST list
  its linked opportunities, open and closed, each opening that opportunity.
- **FR-008**: Linking, unlinking and editing leads MUST NOT add stage history entries or change
  an opportunity's stage, follow-up or sort order.
- **FR-009**: Claude's tools MUST be able to list leads, add and edit them, and link an
  opportunity to a lead or unlink it; reading an opportunity MUST return its lead. Claude MUST
  NOT be able to delete leads; that stays in the web app (constitution, Principle IV).
- **FR-010**: Leads MUST be private to the owner and stored with the rest of the owner's data
  (constitution, Principle IV).
- **FR-011**: Everything new MUST meet the site's accessibility checks (WCAG 2.1 AA), in light
  and dark, on desktop and phones.
- **FR-012**: The project's architecture diagrams MUST be updated to show leads, if they show
  the data or pages they touch, and the validation record MUST say whether they changed
  (constitution, Development Workflow).

### Key Entities

- **Networking lead**: a person who helps the owner find jobs. Name (required), email, phone.
  Nothing else: no stage, no history, no notes.
- **Opportunity**: gains an optional link to a lead. Nothing else changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can add a lead in under 30 seconds.
- **SC-002**: From a lead, the owner can see every opportunity it led to, with no searching.
- **SC-003**: From an opportunity, the owner can see its lead's email and phone without leaving
  its page.
- **SC-004**: All existing checks of pages, workflows and Claude's tools still pass.
- **SC-005**: The overview opens as quickly as before.

## Clarifications

### Session 2026-10-31

- Q: Can one opportunity link to more than one lead? → A: One lead per opportunity; a lead can
  have many opportunities.
- Q: Where does "Add lead" go? → A: On the Networking leads page; the header keeps only "Add
  opportunity".
- Q: Can Claude work with leads? → A: Yes: list, add, edit and link. Deleting stays in the web
  app.

## Assumptions

- "Networking leads" is the page's name; "Leads" is used where space is short (the phone's
  bottom navigation).
- A lead is a person, not a company; the company is on the opportunities it leads to.
- Email and phone are optional so a lead can be saved with just a name (Principle III, fast
  capture).
- There's no search or filtering on the leads page; one person's list of leads is short.
- Leads have no history, notes or archive; deleting one is the only way to remove it.
- Email and phone are shown as text only, at the owner's request; nothing starts an email or a
  call.
