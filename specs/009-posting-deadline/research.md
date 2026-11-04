# Research: Posting Deadline

## 1. Storing the date

- **Decision**: A new optional field on the opportunity, `postedUntil`: a calendar date,
  `YYYY-MM-DD`, validated like `followUpDate` (`z.iso.date`). On create, blank means none. On
  PATCH, `null` or blank clears it, as for every clearable field.
  - **No migration**: the repository writes and reads the opportunity's fields as given, so
    older items simply have no `postedUntil`.
  - **Any date**: past dates are allowed (spec Edge Cases); nothing compares it to today on the
    server.
  - **No history entry**: like every other detail, it's an edit, not a stage change (FR-009).
- **Rationale**: the same shape as `followUpDate` means the same validation, the same form
  input, the same formatting and the same clear-on-edit rules, with no new code paths.
- **Alternatives considered**: a timestamp with a time zone. Postings that give a time are rare,
  and the owner acts on days, not hours.

## 2. Reading it from a posting

- **Decision**: `mapJobPosting` reads schema.org `validThrough`. It keeps the first ten
  characters when they're a real `YYYY-MM-DD` date, so `2026-11-30`,
  `2026-11-30T23:59:59-05:00` and `2026-11-30T00:00:00Z` all become `2026-11-30`, the date as the
  posting states it. Anything else is left out, and the rest still fills in.
  - **Greenhouse**: its Job Board API has no closing date, so Greenhouse links leave it empty.
  - **Fill rules**: `postedUntil` joins the fillable fields ("Posted until"). It fills only an
    empty field, and is listed in "Filled in" or "Kept what you typed for", like the others.
  - **Claude**: `read_posting` returns `PostingDetails`, so it gets the date with no change to
    the tool; its description adds "the closing date".
- **Rationale**: `validThrough` is the standard's own field for this, and the rest of fill from
  link already relies on the same JSON-LD. Taking the stated date, not converting time zones,
  keeps the posting's own day (spec Edge Cases).
- **Alternatives considered**: searching the description for phrases like "applications close".
  Unreliable, and the spec rules it out.

## 3. What the card shows

- **Decision**: one pure helper, `postingDeadline(postedUntil, today)`, gives the card's label
  and its kind:
  - more than 7 days ahead: `open`, "Open until Nov 14";
  - 0 to 7 days ahead: `soon`, "Closes today", "Closes tomorrow" or "Closes in N days";
  - before today: `ended`, "Posting ended Nov 2".

  The card puts it in its line of details, after the salary. `soon` on an open opportunity uses
  the warning colour, as the follow-up badge does; `ended` uses the muted text colour. A closed
  opportunity shows the same words without the warning colour (spec FR-005). "Today" is
  `localDate()`, the device's date, as for follow-ups. The day count is the difference between
  the two calendar dates, so it never shifts with time zones.
  - **Short dates on the card**: "Nov 14", or "Nov 14, 2027" when it's not this year. The detail
    page uses the existing medium date ("Nov 14, 2026").
- **Rationale**: one helper keeps the wording, the sort (§4) and the tests on the same
  boundaries. Both colours already pass WCAG AA on cards in light and dark (feature 008's token
  test), so no new colours are needed.
- **Alternatives considered**: a separate badge row. It makes every dated card taller; the line
  of details already wraps on phones.

## 4. The "Closing soonest" sort

- **Decision**: a new sort key, `closing`, labelled "Closing soonest". It ranks each opportunity
  into three groups, then orders within them:
  1. a date today or later: soonest first;
  2. no date: most recent stage change first;
  3. a date before today: most recently ended first.

  Ties go to the most recent stage change. The comparator needs today, so `sortBy` takes it, with
  the device's date as the default.
- **Default per page**: `readListParams` and `writeListParams` take the page's defaults. The
  overview's sort default becomes `closing`; the archive passes its own defaults with `recent`.
  So `/` means "Closing soonest" on the overview, `?sort=recent` is now written for "Recently
  changed" there, and the archive's links are unchanged (FR-007, FR-008). The overview's "Clear
  filters" button resets to the overview's defaults.
- **Rationale**: ended postings can't be applied to, so they're least urgent; undated ones keep
  today's order, so a board with no dates looks as it does now.
- **Alternatives considered**: sorting ended postings first, as overdue. They need no action,
  unlike a follow-up that's due.

## 5. Claude's tools

- **Decision**: `postedUntil` joins the detail fields of `add_opportunity` and
  `update_opportunity` (`YYYY-MM-DD`; null clears it on update), and the summary that
  `list_opportunities` and `find_opportunities` return. `get_opportunity` already returns every
  field. The web API validates it, so refusals carry the web app's message.
- **Rationale**: the tools mirror the web API's fields (feature 003), and the owner's job-search
  routine saves postings through Claude.

## 6. Test tags

- **Decision**: a new tag, `deadline` (feature 009), for the new tests. The source files with
  deadline logic add `deadline` to their tags: `overviewModel.ts`, `listParams.ts`,
  `OpportunityCard*` and `import/jobPosting.ts`. The schemas, the form and the tools are `core`,
  `capture`/`edit`/`import` and `mcp` already, and their tests gain the new cases.
- **Rationale**: the tag check needs every test tagged, and a change to the deadline code then
  runs its own tests too.
