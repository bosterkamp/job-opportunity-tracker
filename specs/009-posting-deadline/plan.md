# Implementation Plan: Posting Deadline

**Branch**: `009-posting-deadline` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-posting-deadline/spec.md`

## Summary

Opportunities gain an optional "Posted until" date, the overview's cards show it, and the
overview sorts by it by default.

- **The field**: `postedUntil`, a `YYYY-MM-DD` date, validated and cleared like `followUpDate`
  in the shared schemas. The repository stores fields as given, so there's no migration
  (research §1).
- **Filled from a link**: the JSON-LD mapper reads schema.org `validThrough` and keeps its date.
  "Posted until" joins the fields the form fills (research §2).
- **Claude**: the add and update tools take it, and the list summaries return it (research §5).
- **On the card**: a pure helper, `postingDeadline`, gives "Open until Nov 14", "Closes in 3
  days" (warning colour, open opportunities only) or "Posting ended Nov 2" (muted), using the
  device's date (research §3).
- **The sort**: a new key, `closing` ("Closing soonest"): upcoming dates soonest first, then
  undated by most recent change, then ended. It's the overview's default; the archive keeps
  "Recently changed", so the URL helpers take each page's defaults (research §4).

Nothing changes in the infrastructure, the stage rules, or the history.

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–008

**Primary Dependencies**: No new dependencies (zod, React, TanStack Query, the MCP SDK, as now)

**Storage**: DynamoDB, unchanged. One more optional attribute on the opportunity item

**Testing**:
- **Vitest**:
  - **shared `schemas.test.ts`**: `postedUntil` on create, edit (clear with null or blank), and
    in responses; invalid dates refused.
  - **API integration**: create, edit and clear through the web API; the MCP tools set, clear
    and list it.
  - **`jobPosting` mapping**: `validThrough` as a date, a date-time with an offset, UTC,
    malformed and missing.
  - **web**: `postingDeadline` at each boundary (−1, 0, 1, 2, 7, 8 days; this year and next);
    the `closing` comparator's three groups and ties; the URL helpers' per-page defaults; the
    card's text and classes; the form field; fill from link; the detail page.
- **Playwright** (`@deadline`): add with a date, see each kind of card text, and the default
  order on the overview (desktop and iPhone); the archive's default unchanged.
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app); the
AWS Lambda API

**Project Type**: Web application (React SPA, Lambda API, MCP server)

**Performance Goals**: The overview is no slower (SC-005): the sort and labels are a pass over
the already-loaded list

**Constraints**: WCAG 2.1 AA (FR-010), using the existing warning and muted tokens; older items
and clients keep working

**Scale/Scope**: One new field, one sort, one card line; about 15 source files, mostly one or two
lines each

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | The board stays grouped by stage; only the order inside each column changes. | PASS |
| II. History is never lost | The date is a detail; it adds no history entry and stage changes keep it. | PASS |
| III. Fast capture, progressive detail | Optional, and filled from the link when the posting states it. | PASS |
| IV. Data privacy & ownership | Read only from the posting the owner links; nothing new leaves the app. | PASS |
| V. Simplicity (YAGNI) | Same shape and rules as the follow-up date; no reminders (issue #1). | PASS |
| VI. Test the rules | The boundaries (7 days, today, ended), the sort groups and the date parsing are unit-tested; the default order end to end. | PASS |
| VII. Automated quality gates | Same pipeline, a new `deadline` tag. Pushed after each commit; the PR and merge when the owner says so. | PASS |
| Workflow: diagrams | No diagram shows fields or sorting. The validation record will say whether they changed. | PASS |

**Post-design re-check (after Phase 1)**: PASS. One optional attribute, no new endpoints or
infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/009-posting-deadline/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── changes.md       # the API, fill-from-link, tool and URL changes
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas.ts                     # (changed) postedUntil on input, patch and response
└── imports.ts                     # (changed) postedUntil in PostingDetails

packages/api/src/
├── import/jobPosting.ts           # (changed) validThrough → postedUntil
└── mcp/tools.ts                   # (changed) tool inputs, summaries, read_posting description

packages/web/src/
├── features/overview/overviewModel.ts   # (changed) postingDeadline, the `closing` sort
├── features/overview/listParams.ts      # (changed) per-page defaults; overview: closing
├── features/import/fillForm.ts          # (changed) "Posted until" is fillable
├── components/OpportunityForm.tsx       # (changed) the date field
├── components/OpportunityCard.tsx       # (changed) the deadline text
├── components/OpportunityCard.module.css  # (changed) soon and ended styles
├── pages/OpportunityDetail.tsx          # (changed) shows the date
├── pages/Overview.tsx, pages/Archive.tsx  # (changed) their defaults; today for the sort
└── format.ts                            # (changed) the short card date

e2e/deadline.spec.ts               # (new) @deadline
scripts/test-tags.mjs              # (changed) the `deadline` tag and its files
specs/001…/contracts/api.openapi.yaml, specs/002…/contracts/, specs/003…/contracts/mcp-tools.md
                                   # (changed) the field, per contracts/changes.md
README.md                          # (changed) the field, the default sort, the tag
```

**Coverage and mutation exclusions**: none new.

**Structure Decision**: The field follows `followUpDate`'s path through every layer. The
deadline wording and the sort share one helper in `overviewModel.ts`, beside the existing sorts
and `sinceLabel`.

## Complexity Tracking

No constitution violations to justify.
