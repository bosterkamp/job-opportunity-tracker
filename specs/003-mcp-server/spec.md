# Feature Specification: Use the Tracker from Claude

**Feature Branch**: `003-mcp-server`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Use the job tracker from the Claude app on my phone (or Claude on desktop or web) by connecting Claude to the tracker as a custom connector. In a conversation I can ask Claude to: list my opportunities (all open ones, by stage, the archive, or ones whose follow-up is due), show one opportunity with its full stage history, add an opportunity (company and title required, everything else optional, including filling it from a posting link the way the add form does), edit an opportunity's details, and move an opportunity to another stage with an optional note and an optional earlier date. It must only ever act for me: the connector requires me to sign in with my existing tracker account, and nobody else can use it. Deleting opportunities is not available through Claude. Changes made through Claude follow exactly the same rules as the web app (validation, stage rules, duplicate warning, history), and each change made through Claude is recorded so I can tell it apart from changes I made in the web app."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Claude to my tracker, securely (Priority: P1)

I add the tracker to Claude once as a custom connector, sign in with my existing tracker
account, and from then on Claude can use my tracker in any conversation, on my phone, desktop,
or the web. Nobody else can connect to my tracker, and I can disconnect at any time.

**Why this priority**: Nothing else works without a secure connection, and a connector that
anyone could use would expose personal job search data (Constitution Principle IV).

**Independent Test**: Add the connector in Claude, sign in with the tracker account, and ask
"how many open opportunities do I have?". Then try to connect without signing in, and with a
wrong password, and confirm both are refused.

**Acceptance Scenarios**:

1. **Given** I add the tracker as a custom connector in Claude, **When** Claude connects,
   **Then** I'm asked to sign in on the tracker's own sign-in page, with the account I already
   use for the web app.
2. **Given** I've signed in, **When** I ask Claude about my opportunities in a new
   conversation, **Then** it can answer without asking me to sign in again, until my sign-in
   expires.
3. **Given** someone without my tracker account, **When** they try to connect or call the
   connector, **Then** they're refused and see none of my data.
4. **Given** I disconnect the connector in Claude, or my sign-in expires, **When** Claude tries
   to use it, **Then** it can't until I sign in again.

---

### User Story 2 - Ask about my opportunities (Priority: P1)

In a conversation, I ask Claude what's going on in my job search: what's open, what's in a
stage, what's in the archive, what needs a follow-up, or the full history of one opportunity.
Claude answers from my real data.

**Why this priority**: Checking where things stand from my phone is the most common use, and
it can't change anything, so it's the safest place to start.

**Independent Test**: With a few opportunities in different stages, ask Claude "what's in
Interviewing?", "which follow-ups are due?", and "show me the history for Acme", and compare
the answers with the web app.

**Acceptance Scenarios**:

1. **Given** open opportunities in several stages, **When** I ask for my open opportunities,
   **Then** Claude lists each one with its company, title, stage, interest, and when it last
   moved.
2. **Given** opportunities in several stages, **When** I ask for one stage, **Then** only those
   are listed.
3. **Given** closed opportunities, **When** I ask for the archive, **Then** Claude lists them
   with their outcomes.
4. **Given** opportunities with follow-up dates, **When** I ask which follow-ups are due,
   **Then** Claude lists the open ones whose follow-up date is today or earlier.
5. **Given** an opportunity, **When** I ask about it by company (or company and title),
   **Then** Claude shows all its details and its full stage history, oldest first, with dates
   and notes.
6. **Given** two opportunities that match what I said (for example two at Acme), **When** I ask
   about "Acme", **Then** Claude asks which one I mean instead of guessing.

---

### User Story 3 - Add and update opportunities through Claude (Priority: P1)

I tell Claude about a new opportunity, or about progress on one, and it records it: add an
opportunity (from what I say, or from a posting link), change its details, or move it to
another stage with a note and an optional earlier date. The same rules apply as in the web
app.

**Why this priority**: Capturing things the moment they happen, from my phone, without opening
the tracker, is the reason for the feature.

**Independent Test**: Through Claude, add "Acme, Senior Engineer, 4 stars", fill one from a
posting link, move it to Applied with a note dated yesterday, and change its location. Check
each result in the web app, including the history.

**Acceptance Scenarios**:

1. **Given** I ask Claude to add an opportunity with a company and title, **When** it's added,
   **Then** it's in Considering with the details I gave, exactly as if I had used the web app.
2. **Given** I ask Claude to add one without a company or title, **When** it tries, **Then**
   the tracker refuses with the same message the web app shows, and Claude asks me for it.
3. **Given** I give Claude a posting link, **When** I ask it to add the opportunity from the
   link, **Then** the details are read the same way as "Fill from link" in the web app, and
   Claude shows me what it found before adding it.
4. **Given** an open opportunity with the same company and title already exists, **When** I ask
   Claude to add it again, **Then** Claude tells me about the existing one and adds it only if I
   confirm.
5. **Given** an opportunity, **When** I ask Claude to move it to another stage with a note and
   an earlier date, **Then** the move is recorded in its history with that note and date,
   following the same stage rules as the web app (no move to the current stage, no future
   date, closing archives it, reopening is allowed).
6. **Given** an opportunity, **When** I ask Claude to change some details, **Then** only those
   details change, and required fields can't be cleared.
7. **Given** I ask Claude to delete an opportunity, **When** it looks for a way, **Then** there
   is none, and it tells me to delete it in the web app.
8. **Given** the opportunity changed in the web app since Claude last looked, **When** Claude
   tries to move it, **Then** the tracker refuses, and Claude reloads it and tells me what
   changed before trying again.

---

### User Story 4 - Tell Claude's changes apart from mine (Priority: P2)

When I look at an opportunity in the web app, I can see which changes were made through
Claude, so I can check them and trust the history.

**Why this priority**: This opens a second way to change my data. Knowing which changes came
from Claude makes mistakes easy to spot, but the tracker is useful without it.

**Independent Test**: Make one stage change in the web app and one through Claude, then open
the opportunity in the web app and confirm the history marks the second as made through
Claude.

**Acceptance Scenarios**:

1. **Given** an opportunity added through Claude, **When** I open it in the web app, **Then**
   its first history entry says it was added through Claude.
2. **Given** a stage change made through Claude, **When** I view the history, **Then** that
   entry says it was made through Claude, and entries I made in the web app don't.
3. **Given** details changed through Claude, **When** I open the opportunity, **Then** it shows
   that its details were last changed through Claude, and when.

---

### Edge Cases

- **Ambiguous names**: When what I said matches several opportunities, Claude asks which one;
  when it matches none, Claude says so and offers to search or list.
- **Many opportunities**: Lists stay usable with hundreds of opportunities: results come
  newest-moved first, and Claude can ask for the next part of a long list.
- **Rule violations**: Every refusal (a missing field, a future date, a move to the current
  stage, an invalid link) comes back with the same plain message the web app uses, so Claude
  can explain it.
- **Posting links that can't be read**: The same messages as "Fill from link" (needs a sign-in,
  no job details, several jobs, couldn't be loaded, link not allowed).
- **Expired sign-in**: Claude is told to sign in again; nothing is changed.
- **Too many requests**: If Claude sends an unusual burst of requests, the tracker slows it down
  instead of letting it change many records at once.
- **Deleted elsewhere**: If an opportunity was deleted in the web app, Claude is told it no
  longer exists.

## Requirements *(mandatory)*

### Functional Requirements

**Connecting**

- **FR-001**: The tracker MUST be usable from Claude (mobile, desktop, and web) as a custom
  connector that I add myself.
- **FR-002**: Connecting MUST require signing in with my existing tracker account on the
  tracker's own sign-in page. Claude MUST NOT see my password.
- **FR-003**: Every request from Claude MUST be checked for a valid, unexpired sign-in, and MUST
  be refused otherwise, with no data returned.
- **FR-004**: Only accounts that can use the web app MUST be able to connect, and self sign-up
  MUST remain disabled.
- **FR-005**: I MUST be able to stop Claude's access by disconnecting in Claude; access MUST
  also end when the sign-in expires.

**Reading**

- **FR-006**: Through Claude I MUST be able to list open opportunities, optionally one stage
  only; list closed opportunities; and list open opportunities whose follow-up is due (on or
  before today).
- **FR-007**: Lists MUST show company, title, stage, interest, and the date of the last stage
  change for each opportunity, ordered by most recent stage change first, and MUST support
  getting more results when there are many.
- **FR-008**: Through Claude I MUST be able to find opportunities by company or title text and
  get one opportunity with every detail and its full stage history.

**Changing**

- **FR-009**: Through Claude I MUST be able to add an opportunity, edit its details, and move it
  to another stage with an optional note and an optional earlier date.
- **FR-010**: Through Claude I MUST be able to read a posting link into proposed details, the
  same way as "Fill from link" (feature 002), without adding anything until I confirm.
- **FR-011**: Every change made through Claude MUST follow exactly the same validation and stage
  rules as the web app, and refusals MUST carry the web app's messages.
- **FR-012**: Adding through Claude MUST warn about an open opportunity with the same company
  and title (as the web app does), and MUST add it only when the request says to add it anyway.
- **FR-013**: A stage change through Claude MUST be refused if the opportunity changed since
  Claude read it (as in the web app).
- **FR-014**: Deleting MUST NOT be possible through Claude.

**Tracing changes**

- **FR-015**: Every opportunity added and every stage change made through Claude MUST be marked
  in its history as made through Claude, and the web app MUST show that mark.
- **FR-016**: When an opportunity's details are changed through Claude, the tracker MUST record
  that, and when, and the web app MUST show it.
- **FR-017**: The tracker MUST limit how many changes can be made through Claude in a short time,
  so a runaway conversation can't change many records at once.

**Privacy**

- **FR-018**: Through Claude, only the data needed to answer a request MUST be returned. Nothing
  is shared with anyone other than the Claude account I connect (see Assumptions).

### Key Entities

- **Connection**: My authorization for Claude to use the tracker on my behalf. Created when I
  sign in from Claude; ends when I disconnect or it expires. Not visible to anyone else.
- **Change source**: Where a change came from: the web app or Claude. Recorded on history
  entries, and for detail edits on the opportunity itself.
- **Opportunity and stage history**: Unchanged from feature 001, except for the change source.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Claude app on my phone, I can add an opportunity, or move one to a new
  stage with a note, in under 1 minute, without opening the tracker.
- **SC-002**: Answers to questions about my opportunities match the web app 100% of the time in
  testing (same opportunities, stages, dates, and history).
- **SC-003**: 100% of requests without a valid sign-in are refused, and none returns any data.
- **SC-004**: 100% of changes made through Claude are marked as such in the web app; 0 changes
  made in the web app are.
- **SC-005**: Every rule the web app enforces is enforced through Claude, with the same message,
  for 100% of the rule tests.
- **SC-006**: Connecting takes under 2 minutes the first time, and a typical question gets an
  answer within 5 seconds.

## Assumptions

- **Data goes to my Claude account**: Using the connector means Claude (Anthropic) reads the
  opportunities it needs to answer me. That is the purpose of the feature, so it needs a narrow
  amendment to Constitution Principle IV allowing data to go to an assistant service the owner
  connects and authorizes. It is proposed in the plan.
- **Claude asks before acting**: The Claude apps ask me to approve actions taken through a
  connector, so the tracker doesn't add a second confirmation step for ordinary changes. The
  duplicate warning is the exception, because it needs my answer.
- **One user**: As in feature 001, the tracker has one owner and every signed-in account sees
  the same data.
- **No deleting through Claude**: Deleting stays a deliberate step in the web app (Principle II).
- **Point of contact**: Claude can add and edit contact details like any other optional field.
- **The web app is unchanged except for showing the change source**.
- **Claude's own behavior** (how it phrases answers, when it asks me to confirm) is outside the
  tracker's control. The tracker's job is to provide clear tools, data, and messages.
