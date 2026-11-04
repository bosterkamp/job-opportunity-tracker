# Data Model: Posting Deadline

## Opportunity (changed)

| Field | Type | Rules |
|---|---|---|
| `postedUntil` | calendar date, `YYYY-MM-DD`, optional | Any real date, past or future ("Use a date like 2026-11-03" otherwise). Create: blank or missing means none. Edit (PATCH): missing leaves it, `null` or blank clears it. |

- **Older opportunities** have no `postedUntil`: none is stored, and none is returned.
- **Not history**: setting, changing or clearing it is an edit; it adds no stage-history entry,
  and doesn't change `lastStageChangeAt` or `changeCount`. Moving stage or closing keeps it.
- **Through Claude**: an add or update that sets it marks the details as edited via Claude, as
  any other detail does.

## PostingDetails (changed; filling the form, never stored)

| Field | Type | Rules |
|---|---|---|
| `postedUntil` | `YYYY-MM-DD`, optional | From schema.org `validThrough`: its first ten characters when they're a real date; otherwise left out. |

## Derived on the card (not stored)

`postingDeadline(postedUntil, today)`, where `today` is the device's date and `days` is the
calendar-day difference:

| Days until | Kind | Text |
|---|---|---|
| more than 7 | `open` | "Open until Nov 14" |
| 0 | `soon` | "Closes today" |
| 1 | `soon` | "Closes tomorrow" |
| 2 to 7 | `soon` | "Closes in N days" |
| less than 0 | `ended` | "Posting ended Nov 2" |

`soon` is in the warning colour only on open opportunities.

## Sort key `closing` ("Closing soonest")

Groups, in order: dates today or later (soonest first), no date (most recent stage change
first), dates before today (most recently ended first). Ties: most recent stage change.
