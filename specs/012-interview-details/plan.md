# Implementation Plan: Interview Details

**Branch**: `012-interview-details` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-interview-details/spec.md`

## Summary

Interviews become full records: a type, a panel yes/no, a format, how it went, next steps, and
the interviewers' contact details. They can be added ahead of time, and each has its own page.

- **The fields**: optional attributes on the existing interview item, with the interviewers as
  a list inside it (research §1, §5).
- **Upcoming and past**: computed from `heldAt` and now when shown, never stored. Dates may be
  up to a year ahead (research §4).
- **The board**: each opportunity keeps a small map of its interviews' times, so a card can show
  how many have happened and when the next one is without loading interviews (research §2).
  The limit of 6 counts upcoming ones too (research §3).
- **The API**: the existing interview routes take the new fields; opportunities return
  `interviewTimes` (research §6). No new route, table or index.
- **The web app**: an Interviews section on the opportunity page, an add page and a page per
  interview with Edit and Remove; one-line, linked history entries; "Next interview" on cards
  (research §7).
- **Claude**: the new fields on `get_opportunity`, `add_interview` and `update_interview`; the
  held count and next interview time in summaries. Still no tool to remove one (research §8).

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–011

**Primary Dependencies**: No new dependencies

**Storage**: DynamoDB, the existing table. New attributes on the `INTERVIEW#` item, and the
`interviewTimes` map on the opportunity item

**Testing**:
- **Vitest**:
  - **Shared**: the new schemas (enums, lengths, interviewers, the LinkedIn rule), the year-ahead
    rule, `interviewSummary` (including older items without the map), the section order, and the
    timeline leaving out upcoming interviews.
  - **API integration**: add and edit with every field, clearing, the map kept in step with
    adds, date changes and removes, starting the map on an older item (including two changes at
    once), the limit counting upcoming interviews, and the stage and "last change" untouched.
  - **MCP integration**: the new inputs and outputs, `upcoming`, `nextInterviewAt`, the held
    count, the change limit, and no remove.
  - **Web**: the form (every field, interviewers added and removed, "how it went" only when
    past), the Interviews section's order, the interview page (reload, not found, edit, remove),
    the history lines, and the card's badge and next interview.
- **Playwright** (`@interview @responsive`): add a past and an upcoming interview with
  interviewers, open its page from the section and from the history, edit and remove it, the
  card's next interview, and axe in light and dark, on desktop and iPhone.
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%.

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app); the
AWS Lambda API and MCP server

**Project Type**: Web application (React SPA, Lambda API, MCP server)

**Performance Goals**: The board stays one request and its items grow by at most six timestamps
each; the opportunity and interview pages share one request

**Constraints**:
- WCAG 2.1 AA (FR-015), using the existing tokens, form and dialog styles.
- Nothing scrolls sideways on phones; long names, emails and links wrap.
- Opportunities and interviews stored before this feature keep working with no migration.
- Times show in the browser's time zone and are stored in UTC, as today.

**Scale/Scope**: new attributes on two item types, two changed routes, three changed tools, two
new pages and a bigger form; about 20 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Interviews still never change an opportunity's stage or its "last change". | PASS |
| II. History is never lost | Stage history is untouched; past interviews stay in the timeline. Removing an interview still needs confirming. | PASS |
| III. Fast capture, progressive detail | Only the date and time are needed; every new field is optional. | PASS |
| IV. Data privacy & ownership | Interviewers' details are stored with the owner's data behind the same sign-in. Claude still can't remove interviews. | PASS |
| V. Simplicity (YAGNI) | No new item type, table, index or job; upcoming is computed, not stored; interviewers aren't linked to leads. | PASS |
| VI. Test the rules | The new rules, the summary and the map's transactions are unit- and integration-tested; the flows end to end. | PASS |
| VII. Automated quality gates | Same pipeline and `interview` tag. Pushed after each commit; the PR and merge happen when the owner says so. | PASS |
| Workflow: diagrams | The system diagram is unchanged (no new service or store). The data-model diagram gains interviewers, Mermaid, checked to draw. | PASS |

**Scope & Data Constraints**: an opportunity still needs only a company and a title.

**Post-design re-check (after Phase 1)**: PASS. New attributes only, no new infrastructure, and
older items read correctly without a migration (research §2).

## Project Structure

### Documentation (this feature)

```text
specs/012-interview-details/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── changes.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas.ts                     # (changed) the new interview fields, Interviewer, interviewTimes
└── interviews.ts                  # (changed) labels, the year-ahead rule, interviewSummary,
                                   #   the section order, the timeline without upcoming ones

packages/api/src/
├── repo/opportunityRepo.ts        # (changed) the new fields; interviewTimes kept in step
├── routes/interviews.ts           # (changed) the new fields and date rule
└── mcp/tools.ts                   # (changed) new fields, upcoming, nextInterviewAt, held count

packages/web/src/
├── App.tsx                        # (changed) the two interview routes
├── api/hooks.ts                   # (changed) the new fields
├── components/InterviewForm.tsx (+css)   # (changed) every field and the interviewers
├── components/InterviewList.tsx (+css)   # (new) the Interviews section
├── components/OpportunityCard.tsx (+css) # (changed) held count, next interview
├── pages/OpportunityDetail.tsx    # (changed) the section; one-line history entries
├── pages/NewInterview.tsx         # (new) the add page
└── pages/InterviewDetail.tsx (+css)      # (new) the interview's page, Edit and Remove

e2e/interviews.spec.ts, e2e/fixtures.ts   # (changed) the new flows
scripts/test-tags.mjs              # (changed) tags for the new files
specs/001…/contracts/api.openapi.yaml, specs/003…/contracts/mcp-tools.md
                                   # (changed) per contracts/changes.md
specs/005…/data-model.md           # (changed) points to 012
README.md                          # (changed) interviews and Claude's tools
```

**Coverage and mutation exclusions**: none new.

**Structure Decision**: Interviews stay part of the opportunity: the same item, routes and
repository, with two web pages under the opportunity's address.

## Complexity Tracking

No constitution violations to justify.
