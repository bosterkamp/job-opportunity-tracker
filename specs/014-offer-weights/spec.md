# Feature Specification: Offer Weights and a Settings Page

**Feature Branch**: `014-offer-weights`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: "I want to add a feature to the private site to weight each element
on the comparison so they don't all have the same weight in the scoring." Decided with the owner
(2026-11-25): each detail gets an importance from 0 to 3 (0 Ignore, 1 Normal, 2 Important,
3 Critical); the overall score everywhere is the weighted one only; and "a configuration type
page to manage all configurations, like weights for each question", with the adding and
removing of custom fields moved to that page too.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Say how much each detail matters (Priority: P1)

Not every part of an offer matters equally to me. The base salary and working remotely matter a
lot; the title hardly at all. On a new Settings page I give each detail an importance: Ignore,
Normal, Important or Critical. Every detail starts at Normal.

**Why this priority**: Without weights there's nothing to score by; it's the heart of the
request.

**Independent Test**: Open Settings, set Base salary to Critical and Title to Ignore, reload the
page, and see both kept, with every other detail still at Normal.

**Acceptance Scenarios**:

1. **Given** Settings, **Then** it lists every offer detail (the 15 built-in ones, then each
   custom field in its order), each with its importance, and every one starts at "1 · Normal".
2. **Given** a detail, **When** I choose another importance, **Then** it's saved without a
   separate save button, and I'm told it was saved.
3. **Given** saved importances, **When** I reload or come back later, on this device or
   another, **Then** they're as I left them.
4. **Given** the importances, **Then** each is shown as its number and its word ("3 · Critical"),
   never by color alone.

---

### User Story 2 - The overall score follows what matters (Priority: P1)

Once I've said what matters, each offer's overall score weighs its scores by those importances:
a Critical detail counts three times a Normal one, an Important one twice, and an Ignored one not
at all. The offer that's strongest where it counts comes out on top.

**Why this priority**: The weighted score is what the owner asked for.

**Independent Test**: With Base salary Critical, Commute Normal and Title Ignored, an offer scored
5 on base salary, 2 on commute and 1 on title has an overall of 4.3 ((3×5 + 1×2) ÷ 4 = 4.25),
on the comparison, the Offers page and the opportunity's Offer section.

**Acceptance Scenarios**:

1. **Given** an offer's scores, **Then** its overall score is each scored detail's score times
   its weight, added up, divided by the total weight of those scored details, to one decimal
   place, colored by the same scale as today (rounded to the nearest whole score).
2. **Given** every detail at Normal, **Then** every offer's overall score is exactly what it is
   today, the plain average of its scores.
3. **Given** a detail scored 0 (not offered), **Then** it still counts, as 0 times its weight;
   an Ignored detail doesn't count, whatever its score.
4. **Given** an offer whose only scores are on Ignored details, or with no scores, **Then** its
   overall says "Not scored".
5. **Given** I change an importance, **Then** every offer's overall score reflects it the next
   time I see it, on every page, without rescoring anything.
6. **Given** the overall score, **Then** only the weighted score is shown, not the plain average
   beside it.

---

### User Story 3 - See the importances on the comparison (Priority: P2)

When I'm comparing offers, I want to see how much each row counts without leaving the page, and
to get to the place where I change it.

**Why this priority**: The scores only make sense with the weights in view; changing them stays
on Settings.

**Independent Test**: With Base salary Critical and Title Ignored, the comparison shows "Critical"
by Base salary and "Ignored" by Title, and a link to Settings.

**Acceptance Scenarios**:

1. **Given** the comparison, **Then** each detail's name shows its importance unless it's Normal
   ("Base salary · Critical"), and an Ignored detail's row says it doesn't count.
2. **Given** the comparison, **Then** it links to Settings ("Change what each detail counts").
3. **Given** an Ignored detail, **Then** I can still score it; the score is kept, and counts if I
   change its importance later.

---

### User Story 4 - Manage custom fields on Settings (Priority: P2)

Settings is where configuration lives, so the custom fields move there: adding, renaming,
reordering and removing them happens on Settings, not on the Offers page or the comparison.

**Why this priority**: The owner asked for one page for configuration; the behavior of custom
fields doesn't change, only where they're managed.

**Independent Test**: On Settings, add "Commute"; it's in every offer's form and a row on the
comparison, at Normal; rename it, move it, set it to Important, then remove it and confirm, and
it's gone with its importance. The Offers page and the comparison no longer have field controls.

**Acceptance Scenarios**:

1. **Given** Settings, **Then** it has the custom fields with everything the comparison and the
   Offers page have today: add, rename, move up and down, and remove after confirming, with the
   same rules and messages (feature 013).
2. **Given** a new custom field, **Then** it starts at Normal, and is listed with its importance
   after the built-in details.
3. **Given** a removed custom field, **Then** its importance goes with it; adding a field of the
   same name later starts at Normal.
4. **Given** the Offers page and the comparison, **Then** they no longer offer to add, rename,
   move or remove custom fields; each says where that's done, with a link to Settings.
5. **Given** an offer's form, **Then** it still has a box for each custom field, as today.

---

### User Story 5 - Find Settings (Priority: P2)

Settings is in the main navigation, on desktop and on phones, so I can get there from anywhere.

**Why this priority**: The page is only useful if it's easy to reach.

**Independent Test**: From the overview, on desktop and on an iPhone, open Settings from the
main navigation in one tap.

**Acceptance Scenarios**:

1. **Given** any page, **Then** the main navigation reads Overview, Networking leads, Offers,
   Archive, Settings, and Settings opens the Settings page.
2. **Given** a phone, **Then** Settings is in the bottom bar with the others, each still at least
   the minimum touch size, and nothing on the page is drawn over the bar.
3. **Given** Settings, **Then** its sections are headed so more kinds of settings can join them
   later ("Offer comparison").

---

### User Story 6 - Claude knows and sets the weights (Priority: P3)

When I ask Claude how my offers compare, it uses the same weighted overall scores I see, and
knows the importances. I can tell it "make the commute critical" and the web app follows.

**Why this priority**: Saves a trip to Settings; needs stories 1 and 2.

**Independent Test**: Ask Claude to set Base salary to Critical; Settings shows it, and Claude's
reading of an offer gives the same overall score as the web app.

**Acceptance Scenarios**:

1. **Given** Claude, **When** I ask about my offers, **Then** it reads each detail's importance,
   and each offer's overall score is the weighted one, the same as the web app's.
2. **Given** Claude, **When** I ask it to set one or more importances, **Then** Settings shows
   them.
3. **Given** Claude, **Then** it still can't remove a custom field (constitution, Principle IV);
   setting a detail to Ignore isn't removing anything and is allowed.

### Edge Cases

- **Importances**: whole numbers 0 to 3 only; anything else is refused with the allowed values.
- **Defaults**: a detail with no importance set is Normal (1), so every existing offer's overall
  score is unchanged until the owner sets one.
- **All Ignored**: if every detail is Ignored, every overall score says "Not scored", and
  Settings says nothing counts toward the overall score.
- **Rounding**: the overall is rounded to one decimal place after weighting, half up, as today
  (4.25 shows 4.3).
- **Two places at once**: if importances or custom fields were changed elsewhere (another device
  or Claude) since Settings was opened, the save is refused with "Settings changed since you
  loaded them. Reload and try again.", and nothing is overwritten.
- **History**: changing an importance isn't a change to any offer, so it adds no entry to an
  offer's history, as changing a score doesn't today.
- **Custom fields**: the limits of feature 013 stay: up to 20, names up to 60 characters, unique
  regardless of case.
- **No offers yet**: Settings works with no offers recorded.
- **Phones**: Settings works at phone width, every control at least the minimum touch size.
- **Offline**: as the rest of the app behaves offline today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each offer detail (the 15 built-in details of feature 013 and every custom field)
  MUST have an importance from 0 to 3: 0 Ignore, 1 Normal, 2 Important, 3 Critical. A detail
  with none set MUST count as Normal.
- **FR-002**: There MUST be one set of importances, shared by every offer.
- **FR-003**: Each offer's overall score MUST be the sum of each scored detail's score times its
  importance, divided by the sum of those details' importances, to one decimal place, colored by
  the existing scale rounded to the nearest whole score. Scores of 0 MUST count. Details with
  importance 0 MUST NOT count. With no scored detail of importance above 0, it MUST say "Not
  scored".
- **FR-004**: The overall score on the comparison, the Offers page, an opportunity's Offer
  section and through Claude MUST be the weighted one (FR-003), and only that one.
- **FR-005**: A Settings page MUST be in the main navigation, on desktop and phones, after
  Archive.
- **FR-006**: Settings MUST list every detail with its importance, built-in details first in the
  comparison's order, then custom fields in their order, and let the owner change each one; a
  change MUST be saved on its own, with a confirmation that it was saved. There is no "reset
  all" (owner, 2026-11-25): each importance is set back individually.
- **FR-007**: Adding, renaming, reordering and removing custom fields MUST be on Settings, with
  the rules and confirmations of feature 013, and MUST be removed from the Offers page and the
  comparison, each of which MUST link to Settings instead. A new custom field MUST start at
  Normal; a removed one's importance MUST be removed with it.
- **FR-008**: The comparison MUST show each detail's importance beside its name when it isn't
  Normal, MUST mark Ignored rows as not counting, and MUST link to Settings. Ignored details MUST
  stay scorable.
- **FR-009**: A save of importances or custom fields made against an older version than the one
  stored MUST be refused without changing anything, with a message asking to reload.
- **FR-010**: Importances MUST be shown as a number and a word, never by color alone, and
  everything new MUST meet the site's accessibility checks (WCAG 2.1 AA), in light and dark, on
  desktop and phones.
- **FR-011**: Claude's tools MUST be able to read every importance, report the weighted overall
  score (FR-003) for each offer, and set one or more importances. Each change MUST count toward
  Claude's change limit and be marked as made through Claude where changes are marked today.
  Claude MUST NOT be able to remove a custom field (constitution, Principle IV).
- **FR-012**: Changing an importance MUST NOT change any offer, its scores or its history, or any
  opportunity's stage, history or "last change".
- **FR-013**: Importances MUST be private to the owner and stored with the rest of the owner's
  data (constitution, Principle IV).
- **FR-014**: The project's architecture diagrams MUST be updated if they show what this touches
  (the "What's stored" diagram does), and the validation record MUST say so (constitution,
  Development Workflow).

### Key Entities

- **Detail importance**: how much one offer detail counts toward every offer's overall score,
  from 0 (Ignore) to 3 (Critical), default 1 (Normal). One per built-in detail and per custom
  field; shared by every offer.
- **Settings**: the owner's configuration, starting with the offer comparison's custom fields
  and detail importances; kept together and changed as one versioned whole, so two changes at
  once can't overwrite each other.
- **Offer**: unchanged; its overall score is now weighted by the detail importances.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can set the importance of 5 details in under a minute.
- **SC-002**: With every detail at Normal, every offer's overall score is identical to the one
  shown before this feature.
- **SC-003**: For any set of importances and scores, the overall score on the comparison, the
  Offers page, an opportunity's Offer section and through Claude is the same number.
- **SC-004**: From any page, the owner reaches Settings in one tap, on desktop and on a phone.
- **SC-005**: Every custom-field action available before (add, rename, reorder, remove) is
  available on Settings, and none is left on the Offers page or the comparison.
- **SC-006**: Every new page and control passes the site's automated WCAG 2.1 AA checks in light
  and dark.

## Assumptions

- Importances apply to the comparison's details and custom fields only; there are no other
  settings yet, but Settings is organized so others can join later.
- The importance levels are fixed (0 to 3); the owner chose named levels over free numbers or
  percentages (2026-11-25).
- Importances are kept with the custom fields as one settings record, because both describe how
  offers are compared and a new or removed field changes both.
- Importances aren't kept as a history of their own; only the current set matters.
- The plain average isn't shown anywhere once weights exist (owner, 2026-11-25); with every
  detail at Normal the weighted score equals it.
- The bottom navigation on phones has room for five links at the minimum touch size.
