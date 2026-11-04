# Research: Interview Count

## 1. Where interviews are stored

- **Decision**: Each interview is its own item in the opportunity's partition:
  `PK = OPP#<id>`, `SK = INTERVIEW#<interviewId>`, with a ULID id. The OPP item gets an
  `interviewCount`, kept in the same transaction as every add and remove.
- **Rationale**:
  - `getWithHistory` already reads the whole partition in one query, so interviews come with no
    extra request.
  - Permanent deletion already removes every item in the partition, interviews included.
  - The board lists only OPP items (through GSI1, which projects every attribute), so a stored
    count gives the badge without reading 200 partitions.
- **Alternatives**:
  - **A list attribute on the OPP item**: editing one entry means rewriting the list, and the
    history would come from two places in different ways.
  - **Counting at read time**: the board would need every partition.
  - **Interviews as stage changes**: they would bump `changeCount` and conflict with moves, and
    stage history must never be removed (Principle II).

## 2. The limit of 6, enforced in the transaction

- **Decision**: Adding is a `TransactWriteCommand` with two parts:
  - **Put** the interview, with `attribute_not_exists(PK)`.
  - **Update** the OPP item: `SET interviewCount = if_not_exists(interviewCount, :zero) + :one,
    updatedAt = :now`, with the condition
    `attribute_exists(PK) AND (attribute_not_exists(interviewCount) OR interviewCount < :max)`.

  A failed condition on the OPP item becomes either NOT_FOUND (no opportunity) or the limit
  message. The route reads the opportunity first, which tells the two apart; the condition then
  guards against a race. Removing deletes the interview, with `attribute_exists(PK)`, and lowers
  the count, with `interviewCount > :zero`.
- **Rationale**: The limit holds even if two adds race. The count can never drift from the
  items.
- **Alternatives**: Checking the count before a plain put leaves a race, small here, but the
  transaction costs nothing extra.

## 3. Interview dates

- **Decision**: An interview has `heldAt`, an ISO timestamp, like a stage change's `changedAt`,
  so the two sort together.
  - **Choosing a day**: the web form, like "Date added", sends:
    - now, for today;
    - noon local time, for another day;
    - never earlier than the date added, on the date added's own day.
  - **Rules** (shared `interviewDateProblem`):
    - not more than 60 s in the future: "The date can't be in the future";
    - not before `createdAt`: "An interview can't be before the date added".
  - **Date added**: the existing `dateAddedProblem` gains a third rule: not after the earliest
    interview, "The date added can't be after the first interview".
  - **The day helper**: `dateAddedTimestamp` is generalised to a helper that clamps a chosen day
    between a lower and an upper bound, so both forms use it.
- **Rationale**: This reuses feature 004's tested rules and display, and an interview on the day
  the opportunity was added is always allowed.

## 4. API shape

- **Decision**: There are three routes, all returning the updated opportunity with its history
  and interviews (`200`, or `201` for add), so the web app refreshes from one response:
  - `POST /opportunities/{id}/interviews`, with `{ heldAt?, note? }`
  - `PATCH /opportunities/{id}/interviews/{interviewId}`, with `{ heldAt?, note? }`, where null
    or blank clears the note
  - `DELETE /opportunities/{id}/interviews/{interviewId}`, which needs
    `X-Confirm-Delete: true`, like deleting an opportunity

  They are served by the existing API Lambda through the `/{proxy+}` route, so there's no
  infrastructure change.
- **Rationale**: This mirrors `POST /stage-changes`, which also returns the whole opportunity.
  The confirm header matches the existing deliberate-delete pattern.

## 5. "Via Claude"

- **Decision**:
  - **Through Claude**: adding or editing sets `via: 'CLAUDE'` on the interview. The history
    shows "· via Claude", as stage changes do.
  - **In the web app**: an edit removes the mark, as `detailsEditedViaClaudeAt` does for details.
  - **Updates**: the MCP router's `via` already flows to every route, so the interview routes
    take it like the others.
- **Rationale**: The rule is consistent with feature 003, and it shows who last shaped the entry.

## 6. The history view

- **Decision**: A shared `timeline(opportunity)` merges stage changes and interviews.
  - **Order**: oldest first by date, then by `recordedAt`.
  - **Interview entries**: they read "Interview · {date}", then "· via Claude" when marked, then
    "· {note}".
  - **Edit and Remove**: small buttons on each interview entry.
    - **Edit** swaps the entry for the same form, filled in.
    - **Remove** asks "Remove this interview? This can't be undone." before removing.
- **Rationale**: The owner sees one timeline. The form is reused for adding and editing.

## 7. The badge

- **Decision**: `interviewCountText(n)` gives "1 interview", "{n} interviews", or undefined for 0
  or a missing count (older items). The card shows it in a pill at its top right, beside the
  company name, wherever the card appears (board columns, Closed, and the Archive).
- **Rationale**: Hiding it at 0 keeps cards without interviews unchanged (FR-008).

## 8. Claude's tools

- **Decision**:
  - **New tools**:
    - `add_interview`, taking `opportunity_id`, `held_at?`, and `note?`;
    - `update_interview`, taking `opportunity_id`, `interview_id`, `held_at?`, and `note?`.
  - **Annotations**: like the other changes, with each call taking one from the change limit.
  - **No remove tool**: Claude can't remove interviews.
  - **Reading**: `get_opportunity` already returns the API's opportunity with history, so it gains
    `interviews` with no change. List and find summaries gain `interviewCount`.
- **Rationale**: This covers FR-011 with the existing patterns, and Principle IV still holds.

## 9. Test tag

- **Decision**: A new `interview` tag maps these source files to their tests:
  - `packages/shared/src/interviews.ts`
  - `packages/api/src/routes/interviews.ts`
  - `packages/web/src/components/InterviewForm*`

  The changed shared schema is `core`, so this feature runs everything anyway.
