# Feature Specification: Offer Details and Comparison

**Feature Branch**: `013-offer-comparison`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Now that I am getting some offers, I want to improve the offer
portion. Let's keep the salary range, but add a new offer section that includes the specific
salary offer and details about the offer. I'd like a comparison page to compare offers (maybe
like a checkbox on the main offer page for each offer and allow me to check multiple and select
"compare" up to 3. Then, on the comparison page, include details such as base salary (not a
range), bonus %, 401k contribution, insurance benefits, location (including remote), title,
role, PTO, leadership, culture, etc. Let me score each one (1 being worst, 5 being best) and
color code it. Also allow for me to add additional custom fields to compare upon." Decided with
the owner: offers are picked both on a new Offers page and on the board's Offer column; each
detail is scored, with an overall average per offer; custom fields are shared by every offer;
and offers also have a sign-on bonus, equity, a start date and a respond-by date. After the
first draft (2026-11-21): "Keep offer history. Make sure the color coding is accessible and
follows WCAG 2.1 AA standards. If it isn't offered, the score should be a 0 because it isn't
applicable." The owner chose that a 0 counts in the overall average, and that blank details
aren't scored 0 automatically: the owner sets 0.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record an offer's details (Priority: P1)

When an offer comes in, I open the opportunity and fill in its Offer section: the base salary
they're offering, the bonus, sign-on bonus, equity, 401k, insurance, location and whether it's
remote, the title and role as offered, PTO, what I know of the leadership and the culture, when
I'd start, and when I have to answer by. The salary range I noted from the posting stays as it
was, so I can see how the offer compares with it.

**Why this priority**: Nothing can be compared until offers are recorded.

**Independent Test**: On an opportunity, record an offer with a base salary of 165,000, a 10%
bonus, "Remote", and a respond-by date next Friday; reopen it and see every detail as entered,
with the posting's salary range unchanged.

**Acceptance Scenarios**:

1. **Given** an opportunity without an offer, **When** I choose "Add offer", **Then** a form
   offers every offer detail (listed in FR-002) and every custom field; none is required.
2. **Given** I fill in details and save, **Then** the opportunity's Offer section shows each one
   as entered, and its salary range is unchanged.
3. **Given** an offer, **When** I edit any detail, or clear one, and save, **Then** the Offer
   section shows the change.
4. **Given** the offer's title and location, **When** I start a new offer, **Then** they start
   as the opportunity's own title, location and work arrangement, which I can change.
5. **Given** a base salary or sign-on bonus typed as "165k" or "165,000", **When** I save,
   **Then** it's stored as 165,000, as the salary range is today.
6. **Given** an offer, **When** I remove it and confirm, **Then** the Offer section is empty
   again, with its scores and history gone, and the opportunity is otherwise unchanged; the
   confirmation says the history goes too. When I cancel, nothing changes.

---

### User Story 2 - Keep the offer's history (Priority: P1)

Offers change: a recruiter comes back with a higher base, or a counteroffer adds a sign-on
bonus. Each time I change the offer, what it was before is kept, so I can see how the
negotiation went and what I was first offered.

**Why this priority**: The owner asked for it; negotiating depends on knowing earlier terms.

**Independent Test**: Record an offer with a base of 160,000; a day later change the base to
170,000 and add a 10,000 sign-on bonus; the offer's history shows the first offer, then the
change, dated, with 160,000 → 170,000 and the new sign-on bonus.

**Acceptance Scenarios**:

1. **Given** a new offer, **When** I save it, **Then** its history starts with "Offer recorded"
   and that day's date.
2. **Given** an offer, **When** I change details and save, **Then** its history gains one dated
   entry listing each changed detail with its old and new value ("Base salary: 160,000 →
   170,000"); a detail added or cleared shows as added or cleared.
3. **Given** a save that changes nothing, **Then** no history entry is added.
4. **Given** the history, **Then** it's on the opportunity's Offer section, newest first, and
   entries are never edited or removed on their own.
5. **Given** a change made through Claude, **Then** its entry is marked "via Claude".
6. **Given** a renamed custom field, **Then** earlier entries show it under its current name.
7. **Given** a removed custom field, **Then** earlier entries still show the name it had when
   it was removed, marked as removed ("Commute (removed)").

---

### User Story 3 - Compare up to three offers side by side (Priority: P1)

On the new Offers page, or on the board's Offer column, I tick the offers I'm weighing and
choose Compare. A comparison page shows them side by side: each detail is a row and each offer a
column, so I can read across and see how they differ.

**Why this priority**: Comparing is the point of the request.

**Independent Test**: With three offers recorded, tick two on the Offers page and choose
Compare; the comparison shows both, every detail in the same row order; reload it and it shows
the same two.

**Acceptance Scenarios**:

1. **Given** opportunities with offers, **When** I open the Offers page, **Then** it lists each
   one with its company, title, base salary, respond-by date and stage, and a checkbox.
2. **Given** the board, **Then** each card in the Offer column (the Offer tab on phones) has a
   checkbox too.
3. **Given** one offer ticked, **Then** Compare is not yet offered; **given** two or three,
   **Then** Compare is offered and says how many ("Compare 2").
4. **Given** three ticked, **Then** the rest can't be ticked, and I'm told three is the most.
5. **Given** I choose Compare, **Then** the comparison page shows the ticked offers as columns
   and every offer detail and custom field as rows, in the same order for each offer, with
   blanks where an offer has no value.
6. **Given** the comparison page, **When** I reload it or open its address later, **Then** it
   shows the same offers; an offer that's gone since is left out, and the page says so.
7. **Given** the comparison page on a phone, **Then** I can read every offer's details without
   the page itself scrolling sideways.

---

### User Story 4 - Score each detail and see which offer wins (Priority: P1)

On the comparison page I score each detail of each offer from 1 (worst) to 5 (best), or 0 when
it isn't offered at all. Each scored cell is colored from red (1) to green (5), with 0 in grey,
and each offer shows its overall score, the average of what I've scored, so the strongest offer
stands out. The colors are readable for everyone, in light and dark, and never the only way the
score is shown.

**Why this priority**: The owner asked for scores and colors; they turn a table into a decision.

**Independent Test**: On a comparison of two offers, score three details of each; the cells take
their colors, each offer's overall is the average of its three scores, and the scores are still
there after a reload and in a different comparison of the same offers.

**Acceptance Scenarios**:

1. **Given** a detail of an offer on the comparison page, **When** I give it a score from 0 to
   5, **Then** the cell shows the score and its color: 0 grey ("Not offered"), 1 red, 2 orange,
   3 yellow, 4 light green, 5 green.
2. **Given** a scored detail, **When** I change or clear its score, **Then** the cell and the
   overall update.
3. **Given** an offer with some details scored, **Then** its overall score is the average of the
   scored details, 0s included, to one decimal place, colored by the same scale (rounded to the
   nearest whole score); with none scored, it says "Not scored". Scores of 5, 4 and 0 average
   3.0.
4. **Given** a detail with nothing entered, **Then** it stays unscored until I score it; it
   isn't scored 0 for me.
5. **Given** scores, **Then** they belong to the offer: they show in any comparison that
   includes it, and on the offer's own section.
6. **Given** any scored cell, **Then** it shows its number and its meaning in words (for example
   "0 · Not offered", "5 · Best"), its text meets 4.5:1 contrast against its color in light and
   dark, and a legend on the page explains the scale, so no score depends on seeing color.

---

### User Story 5 - Add my own fields to compare on (Priority: P2)

Some things matter to me that aren't on the list, such as the commute or tuition support. I add
a custom field once, and every offer gets it: it's in each offer's form, and it's a row on every
comparison, scored like the rest.

**Why this priority**: The owner asked for it; the built-in details come first.

**Independent Test**: Add a custom field "Commute"; it appears on every offer's form and as a
row on the comparison; fill it in and score it for two offers; rename it; remove it and confirm,
and it's gone from every offer.

**Acceptance Scenarios**:

1. **Given** the comparison page or an offer's form, **When** I add a custom field with a name,
   **Then** every offer has it, empty, and it's a row on every comparison after the built-in
   details.
2. **Given** a custom field, **When** I fill it in for an offer and score it, **Then** it's
   saved with that offer and counts toward its overall score.
3. **Given** a custom field, **When** I rename it, **Then** every offer and comparison shows the
   new name, keeping each offer's value and score.
4. **Given** a custom field, **When** I remove it and confirm, **Then** it, and every offer's
   value and score for it, are gone; the confirmation says how many offers have a value for it.
5. **Given** custom fields, **When** I reorder them, **Then** the rows follow the new order.

---

### User Story 6 - Don't miss a respond-by date (Priority: P3)

Offers come with deadlines. When one is close, I see it without opening the offer.

**Why this priority**: Useful, but recording and comparing come first.

**Independent Test**: An offer due in two days shows "Respond by" in the warning color on its
board card and on the Offers page; one past its date shows it has passed.

**Acceptance Scenarios**:

1. **Given** an offer with a respond-by date, **Then** its board card and its row on the Offers
   page show "Respond by {date}".
2. **Given** the date is within 3 days, **Then** it's in the warning color, as a due follow-up
   is; **given** it has passed, **Then** it says "Response was due {date}", in plain text.
3. **Given** a closed opportunity (accepted, declined, or otherwise closed), **Then** its
   respond-by date isn't highlighted.

---

### User Story 7 - Claude works with offers (Priority: P3)

When I tell Claude about an offer ("Acme offered 170k base, 15% bonus, 25 days PTO, respond by
the 28th"), it records it on the right opportunity. When I ask how my offers compare, it can read
them, with their scores.

**Why this priority**: Saves typing; needs stories 1 to 5.

**Independent Test**: Ask Claude to record an offer; the web app shows it. Ask Claude to score a
detail; the comparison shows the score. Ask Claude to compare two offers; it reads both.

**Acceptance Scenarios**:

1. **Given** Claude, **When** I ask it to record or change an offer's details, including custom
   fields, **Then** the web app shows them.
2. **Given** Claude, **When** I ask it to score details, **Then** the web app shows the scores.
3. **Given** offers, **When** I ask Claude about them, **Then** it can read every offer with its
   details, custom fields, scores, overall score and history.
4. **Given** Claude, **When** I ask it to add or rename a custom field, **Then** every offer has
   it; **Then** it can't remove an offer or a custom field: that stays in the web app.

### Edge Cases

- **Which opportunities have an offer**: one with an Offer section recorded, in any stage, open
  or closed. An opportunity in the Offer stage without one shows on the Offers page as "No
  details yet" with "Add offer", and can still be ticked (its column is then blank).
- **Moving stages**: an offer stays when the opportunity moves, including to Accepted,
  Declined or the Archive; it's still on the Offers page, with its stage.
- **Numbers**: base salary and sign-on bonus are whole amounts from 0 to 10,000,000 with no
  currency, as the salary range is (feature 004). Bonus is a percentage from 0 to 100, with up to
  one decimal place.
- **Text**: equity, 401k, insurance, PTO, leadership, culture, role, location and each custom
  value are up to 500 characters; the title up to 200. Longer is refused with the limit stated.
- **Dates**: start and respond-by dates are calendar days. Either can be in the past.
- **Custom fields**: up to 20, each name up to 60 characters, unique regardless of case; a
  duplicate or blank name is refused with the reason.
- **Scores**: whole numbers 0 to 5 only; 0 means not offered or not applicable, and counts as
  0 in the overall. A detail without a value can be scored (for example, "no equity" scored 0).
- **History**: changing only scores doesn't add a history entry; scores are the owner's judgment,
  not part of the offer. Renaming or removing a custom field doesn't rewrite past entries, except
  that a renamed field shows its current name and a removed one its last name, marked
  "(removed)".
- **Ticking**: ticks on the board and on the Offers page are separate; leaving the page clears
  them. Comparing needs at least 2 offers.
- **Deleting an opportunity permanently**: removes its offer and scores with it.
- **Phones**: the Offers page, the offer form and the comparison work at phone width; the
  comparison's columns scroll inside the table, with the detail names kept in view.
- **Offline**: as the rest of the app behaves offline today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An opportunity MAY have one offer. Its salary range (feature 004) MUST stay as it
  is, separate from the offer.
- **FR-002**: An offer MAY have, all optional: base salary, bonus %, sign-on bonus, equity, 401k
  contribution, insurance benefits, location, work arrangement (on-site, hybrid, remote), title,
  role, PTO, leadership, culture, start date and respond-by date, with the limits in Edge Cases,
  plus a value for each custom field.
- **FR-003**: The owner MUST be able to add an offer to an opportunity, edit or clear any of its
  details, and remove the offer after confirming. A new offer's title, location and work
  arrangement MUST start as the opportunity's own.
- **FR-003a**: Every save that changes an offer's details MUST add a dated history entry listing
  each changed detail's old and new value; the first save MUST add "Offer recorded". The history
  MUST be shown on the Offer section, newest first, MUST NOT be editable, and MUST be removed
  only with the offer, after a confirmation that says so (constitution, Principle II). Changes
  through Claude MUST be marked "via Claude".
- **FR-004**: The opportunity page MUST show its offer's details in an Offer section, with each
  scored detail's score, and offer "Add offer" when it has none.
- **FR-005**: An Offers page MUST be in the navigation and list every opportunity with an offer
  and every one in the Offer stage, each with a checkbox, company, title, base salary,
  respond-by date and stage.
- **FR-006**: Each card in the board's Offer column (the Offer tab on phones) MUST have a
  checkbox for comparing.
- **FR-007**: On either page, ticking 2 or 3 offers MUST offer Compare; more than 3 MUST NOT be
  tickable, and the page MUST say three is the most.
- **FR-008**: The comparison page MUST show the chosen offers as columns and every offer detail
  and custom field as rows, in a fixed order, and its address MUST identify the offers so it can
  be reloaded or opened again.
- **FR-009**: The owner MUST be able to score each detail and custom field of each offer from 0
  to 5 on the comparison page, and change or clear a score; 0 means not offered or not
  applicable. Scores MUST be saved with the offer. Unscored details MUST stay unscored: nothing
  is scored automatically.
- **FR-010**: Each scored cell MUST be colored by its score (0 grey, 1 red, 2 orange, 3 yellow,
  4 light green, 5 green) and MUST meet WCAG 2.1 AA: its text at least 4.5:1 against its color
  in light and dark (1.4.3), its score shown as a number and in words, not by color alone
  (1.4.1), and a legend explaining the scale on the page.
- **FR-011**: Each offer MUST show an overall score: the average of its scored details, 0s
  included, to one decimal place, colored by the same scale rounded to the nearest whole score,
  or "Not scored".
- **FR-012**: The owner MUST be able to add, rename, reorder and (after confirming) remove custom
  fields. Every offer MUST have every custom field; removing one MUST remove its values and
  scores from every offer.
- **FR-013**: A board card and an Offers page row MUST show the respond-by date, in the warning
  color within 3 days for an open opportunity, and as passed once it is.
- **FR-014**: Claude's tools MUST be able to read every offer (details, custom fields, scores,
  overall score), record and change an offer's details and scores, and add or rename custom
  fields. Claude MUST NOT be able to remove an offer or a custom field (constitution, Principle
  IV). Each change MUST count toward Claude's change limit.
- **FR-015**: Recording, changing or removing an offer MUST NOT change the opportunity's stage,
  history or "last change".
- **FR-016**: Offers, scores and custom fields MUST be private to the owner and stored with the
  rest of the owner's data (constitution, Principle IV).
- **FR-017**: Everything new MUST meet the site's accessibility checks (WCAG 2.1 AA), in light
  and dark, on desktop and phones; the scores MUST NOT rely on color alone (FR-010).
- **FR-018**: The project's architecture diagrams MUST be updated if they show what offers
  touch, and the validation record MUST say whether they changed (constitution, Development
  Workflow).

### Key Entities

- **Offer**: the offer an opportunity has received: its details (FR-002), a value for each
  custom field, and a score from 0 to 5 for any detail or custom field. Belongs to exactly one
  opportunity.
- **Offer history entry**: one saved change to an offer: when, what changed (each detail's old
  and new value), and whether it was through Claude. Belongs to exactly one offer, oldest
  first.
- **Custom field**: a name the owner adds to compare on, shared by every offer, in an order the
  owner sets.
- **Opportunity**: gains its offer. Its salary range, stage and history are unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can record a new offer's base salary, bonus, PTO and respond-by date in
  under 2 minutes.
- **SC-002**: From the Offers page, the owner can open a side-by-side comparison of 3 offers in
  under 10 seconds (four taps).
- **SC-003**: On a comparison, the owner can tell which offer scores highest without reading
  every cell: the overall scores are colored and in one row.
- **SC-003a**: Every color pairing on the comparison passes an automated WCAG 2.1 AA contrast
  check in light and dark.
- **SC-003b**: After a negotiation, the owner can see the first terms offered and each change,
  with its date, on one page.
- **SC-004**: An offer told to Claude shows correctly in the web app on the right opportunity.
- **SC-005**: Every existing opportunity, salary range and check of pages, workflows and
  Claude's tools is unchanged.

## Assumptions

- One offer per opportunity: a revised offer is an edit, kept in the offer's history (owner,
  2026-11-21), not a second offer.
- Amounts have no currency, as the salary range doesn't (feature 004); the owner's offers are in
  one currency.
- The 401k contribution, insurance, PTO, equity, leadership and culture are free text, because
  offers describe them in many ways ("100% match up to 6%", "20 days plus holidays").
- Scores are the owner's own judgment; the app doesn't score anything itself, or suggest a
  winner beyond the overall averages.
- Custom field values are text.
- The comparison doesn't save named comparisons; its address is enough to come back to one.
- Respond-by dates don't send reminders; those are backlog issue #1.
- The board's existing salary display, sort and filters are unchanged.
