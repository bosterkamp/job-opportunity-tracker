# Implementation Plan: Board and Form Updates

**Branch**: `004-board-and-form-updates` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-board-and-form-updates/spec.md`

## Summary

Four changes to existing screens, each from a GitHub issue:

- **Salary (#16)**: opportunities gain two optional whole numbers, `salaryMin` and `salaryMax`.
  The free-text `compensation` field keeps its name in the data and the API, and is labelled
  "Pay notes" in the app, so nothing needs migrating. Board cards show the range. The toolbar
  gains two sorts and a "Salary at least" filter, kept in the address like the others. "Fill
  from link" fills the two numbers from the pay it already reads, and Claude's tools gain the
  fields.
- **Date added (#14)**: `createdAt` becomes settable when adding and editing. The add form
  sends it only when the owner picks a day other than today. Changing it also moves the first
  history entry, and, if the opportunity has never moved, its "last change" and its place in
  the board's order. Both writes happen in one DynamoDB transaction.
- **Closed column (#17)**: the overview also loads the closed list, which the archive already
  uses, and shows it as a last "Closed" group, a column on wide screens and a tab on phones.
  Its cards show their outcome badge and no "Move to…" button. No API change.
- **Full edit page (#18)**: in edit mode the form renders its detail fields directly, with no
  `<details>` wrapper. Create mode is unchanged.

Details and the alternatives considered are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js 24, as in features 001–003

**Primary Dependencies**: No new dependencies. React 19, TanStack Query, zod, AWS SDK v3
(DynamoDB document client), and the MCP SDK, as before

**Storage**: DynamoDB, the existing single table. There are two new optional attributes on the
OPP item (`salaryMin` and `salaryMax`) and no new items or indexes. Changing the date added
updates the OPP item and `CHANGE#000001` together

**Testing**:
- **Vitest unit tests**: salary parsing and display, the salary sort and filter, the closed
  grouping, the date-added rules, and pay extraction
- **Vitest integration tests**: the PATCH and POST routes against DynamoDB Local, including the
  transaction and the conflict case, and the MCP tools' new fields
- **React Testing Library**: the form (salary, date added, edit mode without "More details"),
  the toolbar, the board's Closed column and tab, and the cards
- **Playwright**: `e2e/board-and-form.spec.ts`, with `@responsive` scenarios for the Closed tab.
  Phone scenarios seed in Considering, or select the Closed tab first
- **Quality gates**: coverage at or above 80%, and Stryker with no surviving mutants

**Target Platform**: Unchanged (CloudFront SPA; API Gateway and Lambda in `us-east-1`)

**Project Type**: Web application (React SPA, serverless API, CDK)

**Performance Goals**: Sorting and filtering 200 opportunities in the browser within 1 second
(SC-001). This already holds for the other filters, and the new ones are the same kind of
filter. The overview makes one more request (the closed list), in parallel with the first

**Constraints**:
- Existing `compensation` values must show unchanged (SC-002), so the stored field is not
  renamed
- The date added can't be in the future (allowing the existing 60-second clock skew), and
  can't be after the first stage change
- Changing the date added must not race a stage move: the transaction checks `changeCount`

**Scale/Scope**: One user, about 200 opportunities. No infrastructure changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Stages are unchanged. The Closed column groups the outcome stages that already exist, and closed cards open the detail page, where reopening works as before. | PASS |
| II. History is never lost | Backdating changes when the first entry says the opportunity was added. It never removes an entry. `recordedAt` keeps the real time each entry was written, so a backdated entry can still be recognized as backdated. The date added can't be later than the first move, so the history stays in order. | PASS |
| III. Fast capture, progressive detail | Company and title stay the only required fields. Date added defaults to today, and the add form keeps "More details" closed (FR-018). The full edit page only changes editing (FR-017). | PASS |
| IV. Data privacy & ownership | Two new fields in the owner's own table. Claude's tools gain the fields under the same sign-in, the same change limit, and no delete. Nothing new is sent anywhere. | PASS |
| V. Simplicity (YAGNI) | No new dependencies, endpoints, tables, or indexes. Pay notes is a label change, not a migration. The closed list reuses the archive's existing request. | PASS |
| VI. Test the rules | The new field rules (whole numbers, the range, min ≤ max, date added not in the future and not after the first move) are in shared or route code with unit and integration tests. Coverage and mutation gates apply unchanged, and no new exclusions are planned. | PASS |
| VII. Automated quality gates | Same pipeline. The shared schema is `core`, so CI runs everything for this feature. The new `packages/shared/src/salary.ts` is mapped to the tags that use it. Everything is checked locally first, and nothing is pushed until the owner says so. | PASS |

**Post-design re-check (after Phase 1)**: PASS. The data model adds two optional attributes,
and the contract changes are additive: new optional fields on existing requests and responses.
Old clients and old data keep working.

## Project Structure

### Documentation (this feature)

```text
specs/004-board-and-form-updates/
├── plan.md              # This file
├── research.md          # Phase 0: the decisions and alternatives
├── data-model.md        # Phase 1: new fields, rules, and the date-added write
├── quickstart.md        # Phase 1: how to check the feature locally and deployed
├── contracts/
│   ├── api-changes.md   # Changes to POST/PATCH /opportunities and the responses
│   └── mcp-tools-changes.md   # Changes to Claude's tools
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── salary.ts                # parseAmount ("150k", "$150,000"), formatSalaryRange, salaryReach
├── schemas.ts               # (changed) salaryMin/salaryMax, min ≤ max, createdAt on input/patch
└── index.ts                 # (changed) exports salary.ts

packages/api/src/
├── routes/opportunities.ts  # (changed) POST takes createdAt; PATCH checks the merged range and
│                            #   the date-added rules, then calls the repo
├── repo/opportunityRepo.ts  # (changed) create uses createdAt; new changeDateAdded
│                            #   (transaction: OPP + CHANGE#000001, changeCount condition)
├── import/jobPosting.ts     # (changed) also returns salaryMin/salaryMax
├── import/greenhouse.ts     # (changed) the same for Greenhouse's pay ranges
├── import/format.ts         # (changed) payAmounts(): whole numbers from a Pay
└── mcp/tools.ts             # (changed) salary and createdAt fields; salary in summaries

packages/shared/src/imports.ts   # (changed) PostingDetails gains salaryMin/salaryMax

packages/web/src/
├── components/OpportunityForm.tsx   # (changed) salary min/max, "Pay notes", "Date added";
│                                    #   edit mode without "More details"
├── components/OpportunityCard.tsx   # (changed) salary range; outcome badge on closed cards
├── components/StageBoard.tsx        # (changed) groups keyed by stage or "CLOSED"
├── components/ListToolbar.tsx       # (changed) "Closed" stage option; "Salary at least"
├── features/overview/overviewModel.ts  # (changed) salary sorts and filter; closed group
├── features/overview/listParams.ts     # (changed) ?salary= and stage=CLOSED
├── features/import/fillForm.ts         # (changed) fills salary min/max
├── pages/Overview.tsx               # (changed) also loads closed; empty state counts both
└── pages/OpportunityDetail.tsx      # (changed) "Pay notes" label, salary shown, date added edit

e2e/
└── board-and-form.spec.ts           # @overview @capture @edit; @responsive for the Closed tab

scripts/test-tags.mjs                # (changed) salary.ts → capture, overview, edit, import, mcp
```

**Structure Decision**: The existing monorepo. The salary helpers go in the shared package,
because the web form, the board, and the MCP summaries all use the same parsing and display
rules.

## Complexity Tracking

No constitution violations to justify.
