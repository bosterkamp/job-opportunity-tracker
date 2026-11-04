# Data Model: Interview Count

These changes are additive to feature 001's [data model](../001-job-opportunity-tracker/data-model.md)
and feature 004's changes.

## Interview (new item)

| Attribute | Type | Rules |
|---|---|---|
| `PK` | `OPP#<opportunityId>` | The opportunity's partition |
| `SK` | `INTERVIEW#<interviewId>` | ULID, so ids sort by creation |
| `id` | string | The interview id |
| `heldAt` | ISO date-time (UTC) | Not more than 60 s in the future; not before the opportunity's `createdAt` |
| `note` | string or null | Trimmed. At most 200 characters. Blank means none |
| `recordedAt` | ISO date-time | When it was first logged; never changes |
| `via` | `'CLAUDE'`, optional | Set when logged or last edited through Claude; removed by a web edit |

## Opportunity (OPP item): new attribute

| Attribute | Type | Rules |
|---|---|---|
| `interviewCount` | integer, optional | 0–6. Missing means 0 (older items). Changed only in the same transaction as an add or remove |

Adding or removing an interview also sets `updatedAt`. It never changes `stage`, `status`,
`lastStageChangeAt`, `changeCount`, or the GSI1 keys.

## Rules and messages

| Rule | Message | Field |
|---|---|---|
| Interview date in the future | "The date can't be in the future" | `heldAt` |
| Interview date before the date added | "An interview can't be before the date added" | `heldAt` |
| A 7th interview | "This opportunity already has 6 interviews, the most it can have" | — |
| Date added moved after the first interview | "The date added can't be after the first interview" | `createdAt` |
| Note over 200 characters | "Must be 200 characters or fewer" | `note` |
| Unknown interview | "Interview not found" (404) | — |

## Transactions

| Action | Items | Conditions |
|---|---|---|
| Add | Put `INTERVIEW#<iid>`; Update OPP `interviewCount + 1`, `updatedAt` | Interview doesn't exist; OPP exists and `interviewCount < 6` (or is missing) |
| Edit | Update `INTERVIEW#<iid>` (`heldAt`, `note`, `via`) | Interview exists |
| Remove | Delete `INTERVIEW#<iid>`; Update OPP `interviewCount - 1`, `updatedAt` | Interview exists; `interviewCount > 0` |

## Derived values (not stored)

- **Count text**: "1 interview", "{n} interviews", or nothing for 0.
- **Timeline**: stage changes and interviews together, oldest first by date (`changedAt` or
  `heldAt`), then by `recordedAt`.
