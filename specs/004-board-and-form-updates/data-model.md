# Data Model: Board and Form Updates

These changes are additive to feature 001's [data model](../001-job-opportunity-tracker/data-model.md).
The table, keys, and indexes are unchanged.

## Opportunity (OPP item): new and changed fields

| Field | Type | Rules | Notes |
|---|---|---|---|
| `salaryMin` | integer, optional | 0 to 10,000,000. When `salaryMax` is also set, `salaryMin` ≤ `salaryMax`. | New. No currency or period. |
| `salaryMax` | integer, optional | 0 to 10,000,000 | New |
| `compensation` | string, optional, ≤ 500 | Unchanged | Shown as **"Pay notes"**. Same attribute, no migration. |
| `createdAt` | ISO date-time | Settable on create and edit. Not more than 60 s in the future. On edit, not after the first stage change. | Shown as **"Date added"** (a calendar date) |

**Validation messages** (shared schema and API):

- An amount that isn't a whole number, or is out of range: "Enter a whole number, like 150000"
- `salaryMin` greater than `salaryMax`: "The minimum can't be more than the maximum" (field
  `salaryMin`)
- A date added in the future: "The date can't be in the future" (field `createdAt`)
- A date added after the first stage change: "The date added can't be after the first stage
  change" (field `createdAt`)

**On create** with `createdAt = D`:

- `createdAt`, `lastStageChangeAt`, `GSI1SK` (`D#id`), and `CHANGE#000001.changedAt` all equal
  D.
- `updatedAt` and `CHANGE#000001.recordedAt` are the real time.

**On edit** of the date added to D, in one transaction:

| Item | Change | Condition |
|---|---|---|
| OPP | `createdAt = D`, `updatedAt = now`. Also, only when `changeCount = 1` (never moved): `lastStageChangeAt = D`, `GSI1SK = D#id`. | `changeCount = :read` (otherwise CONFLICT) |
| `CHANGE#000001` | `changedAt = D` | Exists |

## Derived values (web and MCP, not stored)

- **Salary reach**: `salaryMax ?? salaryMin`, or none. Used by the "Salary at least" filter.
- **Range text**: "$150k–$180k", "$150k+", or "Up to $180k". Values under 1,000 are shown in
  full.

## PostingDetails (import result, not stored)

Gains `salaryMin` and `salaryMax` (optional integers, same limits), taken from the posting's
pay: rounded, and ordered low to high. `compensation` keeps the pay as text with its currency
and period.

## Board groups (web, not stored)

| Group | Holds | Label | Empty text |
|---|---|---|---|
| One per open stage | Open opportunities in that stage | The stage name | "Nothing in {stage}" |
| `CLOSED` (last) | Every opportunity in an outcome stage | "Closed" | "Nothing closed yet" |

## List parameters (page address)

| Parameter | Values | Default |
|---|---|---|
| `stage` | `ALL`, any open stage, `CLOSED` | `ALL` |
| `sort` | `recent`, `stale`, `interest`, `added`, `salary-min`, `salary-max` | `recent` |
| `salary` | `50000`, `75000`, `100000`, `125000`, `150000`, `175000`, `200000`, `250000`, `300000` | Not set (any) |
| `q` | Text | Empty |

Unknown values fall back to the default.
