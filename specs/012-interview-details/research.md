# Research: Interview Details

## 1. The new fields and their values

- **Decision**: the interview item gains optional attributes:
  - `kind`: `HR` (HR / talent advisor), `HIRING_MANAGER`, `BUSINESS`, `ENGINEERING`, `OTHER`;
  - `panel`: boolean, false when missing;
  - `format`: `PHONE`, `VIDEO`, `IN_PERSON`;
  - `outcome` ("how it went"): `WENT_WELL`, `NOT_SURE`, `WENT_BADLY`;
  - `nextSteps`: trimmed text, at most 500 characters;
  - `interviewers`: a list of up to 10 `{ name, title?, email?, phone?, linkedin? }`.

  Labels live in `@jot/shared` next to the values, as stage labels do, so the web app and
  Claude's tools name them the same way.
- **Rationale**: enums keep the drop-downs and Claude's input checked against one list. `kind`
  rather than `type`, because `type` is a reserved word in places (DynamoDB expressions,
  TypeScript type positions), which makes the code harder to read.
- **Alternatives**: free-text type (no drop-down, can't be filtered later); `panel` as a type
  value (the owner asked for it separately: a hiring-manager interview can be a panel).

## 2. The board card needs past count and next time, without loading interviews

- **Decision**: the opportunity item keeps a map, `interviewTimes`, from each interview's id to
  its `heldAt`. It changes in the same transaction as the interview: `SET interviewTimes.#iid`
  on add and on a date change, `REMOVE interviewTimes.#iid` on remove. The API returns it as
  `interviewTimes: string[]`, sorted. A shared helper, `interviewSummary(o, now)`, gives the
  card and Claude's tools the number held (times at or before now) and the next upcoming time.
  - **Older opportunities** have `interviewCount` but no map. Every one of their interviews is
    past, because future dates weren't allowed before this feature, so the helper counts
    `interviewCount` minus the map's size as held.
  - **Starting the map**: before an interview change on an opportunity without the map, the
    repository writes the whole map, built from the opportunity's interviews, with the
    condition `attribute_not_exists(interviewTimes)`, and ignores that condition failing. Every
    interview change does this first, so the map always exists before any change to one of its
    entries, and the first successful write always comes from a complete read.
- **Rationale**: the board stays one query; time passing needs no job or stored "upcoming"
  flag, because the split is computed at the moment it's shown. Six timestamps add almost
  nothing to each item.
- **Alternatives**:
  - Putting interview items in the board's index partition (as lead notes are in the leads
    partition): up to 1,200 extra items on a full board, with interviewers' contact details the
    board doesn't show.
  - Storing `pastCount` and `nextInterviewAt`: they go stale as time passes and would need a
    scheduled job to update.
  - Rewriting the whole map on every change, with a version number: works, but two changes at
    once would conflict and one would have to be retried.

## 3. `interviewCount` and the limit

- **Decision**: `interviewCount` keeps counting every interview, past and upcoming, and still
  holds the limit of 6 in the add transaction (spec FR-009). The card badge no longer reads it
  directly; it reads `interviewSummary`'s held count (FR-004).
- **Rationale**: no change to the limit's transaction or to older items.

## 4. The date rules

- **Decision**: `interviewDateProblem` changes from "not in the future" to "not more than one
  year ahead" ("An interview can't be more than a year ahead"). "An interview can't be before the
  date added" stays, and so does "The date added can't be after the first interview" on
  opportunity edits. Past or upcoming is `heldAt <= now`.
- **Rationale**: spec FR-003 and Edge Cases. The year limit stops typos such as 2062.

## 5. Interviewers

- **Decision**: stored as a list on the interview item, in the order given. A patch's
  `interviewers` replaces the whole list; `[]` or `null` clears it. Each interviewer:
  - `name` required, at most 100 characters;
  - `title` at most 100;
  - `email` checked as a lead's email is (feature 010), at most 254;
  - `phone` at most 50, as a lead's phone;
  - `linkedin` at most 300, an `https` address on `linkedin.com` or a subdomain of it, with a
    path starting `/in/`. A value without `https://` gets it added; anything else is refused
    with "Enter a LinkedIn profile address".
- **Rationale**: at most 10 people of a few short fields fit easily in one item. Replacing the
  list keeps the form, the API and Claude simple: there's no id per interviewer to track.
- **Alternatives**: one item per interviewer (more writes, nothing gained at 10); links to
  networking leads (out of scope, spec Assumptions).
- **Spec note**: the spec said 40 characters for a phone; 50 matches leads, so the spec is
  updated to 50.

## 6. The API

- **Decision**: the existing routes take the new fields: `POST /opportunities/{id}/interviews`
  and `PATCH /opportunities/{id}/interviews/{interviewId}`. No new route: the interview page
  reads the interview from `GET /opportunities/{id}`, which already returns every interview.
  Opportunity responses gain `interviewTimes`.
- **Rationale**: one opportunity has at most 6 interviews; one request serves the opportunity
  page and the interview page alike, and the cache is shared between them.

## 7. The web app

- **Decision**:
  - **Routes**: `opportunities/:id/interviews/new` (the add form) and
    `opportunities/:id/interviews/:interviewId` (the interview's page, with Edit and Remove).
    Editing happens on the interview's page with the same form.
  - **The opportunity page**: an Interviews section after the details: "Add interview", then
    upcoming (soonest first) under "Upcoming", then past (newest first), each a link.
  - **The history**: each past interview is one line, a link to its page; the inline edit and
    remove move to the interview's page.
  - **The card**: the badge counts held interviews; a line "Next interview: Thu, Nov 12,
    2:00 PM" when one is upcoming.
  - **The form**: date and time, type, panel, format, how it went (only when the date and time
    have passed), next steps, note, and the interviewers, each with Remove, plus "Add
    interviewer".
- **Rationale**: the form has outgrown the inline history editor; its own page works better on
  phones and can be reloaded or linked to (spec story 3, scenario 7).

## 8. Claude's tools

- **Decision**:
  - `get_opportunity`: each interview gains every new field, its interviewers, and
    `upcoming: true|false`.
  - `list_opportunities` and `find_opportunities`: `interviewCount` becomes the held count, and
    each summary gains `nextInterviewAt` (or null).
  - `add_interview` and `update_interview`: take `kind`, `panel`, `format`, `outcome`,
    `next_steps`, and `interviewers`, and `held_at` may be up to a year ahead. Their
    descriptions list the values.
  - There's still no tool to remove an interview.
- **Rationale**: spec FR-012 and story 5.

## 9. "How it went" on an upcoming interview

- **Decision**: the API accepts `outcome` whatever the date, and the web form offers it only
  for past interviews and hides a stored one while the interview is upcoming. Claude's tool
  descriptions say to set it only after the interview.
- **Rationale**: the date can move in either direction after the outcome is set (spec Edge
  Cases), so refusing it in the API would make a date change fail for a reason unrelated to the
  date.
