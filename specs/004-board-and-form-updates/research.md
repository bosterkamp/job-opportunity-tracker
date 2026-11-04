# Research: Board and Form Updates

## 1. Keep `compensation` as the stored name for "Pay notes"

- **Decision**: The stored attribute and the API field stay `compensation`. The app labels it
  "Pay notes", and Claude's tool description says what it's for.
- **Rationale**: SC-002 requires every existing value to show unchanged. Not renaming means
  there's nothing to migrate, and nothing breaks for an old client or an old item.
- **Alternatives**: Renaming to `payNotes` with a migration script, or reading both names.
  Either adds a migration and dual-read code for a label change.

## 2. Salary as two whole numbers, parsed leniently in the form

- **Decision**: `salaryMin` and `salaryMax` are optional integers from 0 to 10,000,000. The API
  accepts only numbers. The web form's text inputs (`inputMode="numeric"`) go through a shared
  `parseAmount`:
  - It accepts digits with optional `$`, commas, and spaces.
  - A trailing `k` multiplies by 1,000, so "150k", "$150,000", and "150000" are all 150,000,
    and "152.5k" is 152,500.
  - Anything else stays as text, so the schema reports "Enter a whole number, like 150000".
- **Range rule**: when both are present, min ≤ max ("The minimum can't be more than the
  maximum", reported on `salaryMin`).
  - On create, the schema checks it.
  - On PATCH, a request may change just one end, so the route merges the patch with the stored
    values and checks the result. The edit form sends both anyway.
- **Rationale**: The API stays strict and simple, and the owner can type the forms they
  naturally write. Putting the parser in the shared package lets the same rule be tested once.
- **Alternatives**: `<input type="number">` rejects "150k" and commas, and its spinner is
  awkward for six-digit values. Accepting strings in the API would let other callers rely on
  lenient parsing.

## 3. Showing a range

- **Decision**: `formatSalaryRange(min, max)`:
  - Both ends: "$150k–$180k". Only a minimum: "$150k+". Only a maximum: "Up to $180k".
    Neither: nothing.
  - Values of 1,000 or more are shown in thousands with at most one decimal ("$152.5k").
    Smaller values are shown in full ("$45–$60"), so hourly rates read sensibly.
  - Equal ends show one number.
- **Rationale**: It's short enough for a card, and it matches the owner's example.
- **Alternatives**: `Intl.NumberFormat` compact notation gives "$150K" and switches to "M" for
  millions. The fixed rule is easier to test and consistent.

## 4. Sort and filter

- **Decision**:
  - **Sorts**: "Salary (minimum)" (`salary-min`) and "Salary (maximum)" (`salary-max`) are new
    `SortKey`s. They sort high to low, put missing values last, and break ties by newest change,
    as "Interest" does.
  - **Filter**: "Salary at least" is a select with Any, $50k, $75k, $100k, $125k, $150k, $175k,
    $200k, $250k, and $300k, kept as `?salary=150000`. An opportunity passes when its "reach" is
    at least the amount. The reach is the maximum, or the minimum when there's no maximum.
    Opportunities with no salary are hidden while the filter is on, and the board says
    "n hidden because they have no salary".
  - **Address**: an unknown `salary` value is ignored, like other bad parameters.
- **Rationale**: A select fits the existing toolbar, works well on phones, and keeps links
  valid. Using the reach answers "could this pay at least X?", which is how the owner phrased
  it.
- **Alternatives**: A free number input would need its own validation and debounce. Filtering
  on the minimum alone would hide a $140k–$190k role from a "$150k" filter.

## 5. Fill from link and the posting's pay

- **Decision**: Both extractors already build a `Pay` value (currency, min, max, unit).
  - A new `payAmounts(pay)` rounds min and max to whole numbers, drops non-positive or
    out-of-range values, and orders them low to high. `PostingDetails` gains `salaryMin` and
    `salaryMax`.
  - `compensation` (shown as "Pay notes") keeps the formatted text with its currency and period
    (FR-007).
  - `fillForm` fills the two fields only when they're empty, like every other field.
- **Rationale**: The data is already parsed, so this is a small change, and the text keeps
  what the numbers can't say (currency and period).
- **Alternatives**: Converting hourly pay to yearly guesses at hours worked, and the owner chose
  not to record a pay period.

## 6. Setting the date added

- **Decision**: The input field is `createdAt` (an ISO date-time with offset), on both
  `POST /opportunities` and `PATCH /opportunities/{id}`.
  - **Web**: the form shows a date. It sends `createdAt` only when the date differs from the
    current value: today on the add form, the stored date on the edit form.
    - The value is noon local time on the chosen day, so the stored date shows the same day in
      the owner's time zone.
    - Choosing today sends the current time instead, so today's additions keep their real
      order.
  - **Create**: `createdAt`, `lastStageChangeAt`, the GSI1 sort key, and the first entry's
    `changedAt` all use the given date. `updatedAt` and `recordedAt` stay the real time.
  - **Edit**: the route reads the opportunity with its history and checks the rules:
    - not in the future, with the existing 60-second skew allowance;
    - not after the earliest `changedAt` among later entries (seq > 1).

    Then the repo's new `changeDateAdded` runs one transaction:
    - **OPP item**: set `createdAt` and `updatedAt`. If the opportunity has never moved
      (`changeCount = 1`), also set `lastStageChangeAt` and `GSI1SK`, since its only stage
      change is the first. The update has the condition `changeCount = :read`.
    - **`CHANGE#000001`**: set `changedAt`.

    A stage move in between fails the condition and returns the existing CONFLICT message.
    Other detail fields in the same PATCH go through the existing `updateDetails` after it.
- **Rationale**: This reuses the timestamp format and the future-date rule that backdated stage
  changes already use. The transaction keeps the opportunity and its first history entry in
  step (Principle II). `recordedAt` still shows when the entry was really written.
- **Alternatives**:
  - A separate `dateAdded` (YYYY-MM-DD) attribute would leave `createdAt` and the history
    disagreeing.
  - Letting the first entry's date drift from `createdAt` would break "the first history entry
    uses it" (FR-010).
  - Allowing dates after the first move would put the history out of order.

## 7. The Closed column

- **Decision**:
  - **Loading**: the overview runs `useOpportunities('CLOSED')` (the archive's query, so the
    cache is shared) alongside the open list.
  - **Grouping**: a `BoardGroup` is keyed by a stage or `'CLOSED'`. The closed group holds every
    outcome stage and is labelled "Closed". Its empty text is "Nothing closed yet".
  - **Toolbar**: search, sort, and the salary filter apply to both lists. The stage filter gains
    "Closed", kept as `?stage=CLOSED`. An open stage shows only that column, and "Closed" shows
    only the closed one.
  - **Cards**: closed cards use `showStage` (the outcome badge) without `showMove`.
  - **Empty board**: "No opportunities yet" shows only when both lists are empty.
- **Rationale**: There's no API change, and the archive keeps its own page (FR-016).
- **Alternatives**:
  - One column per outcome would add six mostly empty columns.
  - Folding closed items into a single open request would change the API for no gain.

## 8. Editing without "More details"

- **Decision**: In edit mode the form renders the detail fields in a plain container, with the
  same order and layout. The `<details>` element, its state, and the "open on error" logic
  apply only to create mode. "Date added" sits after "Follow-up date" in both modes.
- **Rationale**: This is the smallest change that meets FR-017 and FR-018. Focus-on-error
  already works, because the field is visible.
- **Alternatives**: A second form component would duplicate the field list.
