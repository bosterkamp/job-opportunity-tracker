# Implementation Plan: Interview Count

**Branch**: `005-interview-count` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-interview-count/spec.md`

## Summary

Interviews become their own items in an opportunity's DynamoDB partition (`INTERVIEW#<id>`),
next to its stage changes. The opportunity item keeps an `interviewCount`, so the board can show
the badge from the list it already loads.

Three new API routes add, edit, and remove interviews:

- **Adding** writes the interview and raises the count in one transaction, refused at 6.
- **Removing** deletes the interview and lowers the count in one transaction.
- **Editing** changes only the interview.

None of them touches the stage, the status, `lastStageChangeAt`, or `changeCount`, so a stage
move and an interview never conflict.

The detail page shows interviews in the history, in date order with the stage changes. It adds
"Add interview", with "Edit" and "Remove" on each interview. Cards show "1 interview" or
"{n} interviews" at the top right. Claude gains `add_interview` and `update_interview`, but no
remove. Details are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js 24, as in features 001–004

**Primary Dependencies**: No new dependencies

**Storage**: The existing single table. There are new `INTERVIEW#<id>` items in each
opportunity's partition, and a new `interviewCount` attribute on the OPP item. There are no new
indexes, and the GSI already projects every attribute

**Testing**:
- **Vitest unit tests**: the interview rules (dates, the limit, the count text, the merged
  history), and the date-added rule's new interview check
- **Vitest integration tests**: the three routes and the transactions against DynamoDB Local,
  and the MCP tools
- **React Testing Library**: the interview form, the history entries with Edit and Remove, and
  the card badge
- **Playwright**: `e2e/interviews.spec.ts` (`@interview`, with a `@responsive` scenario)
- **Quality gates**: coverage at or above 80%, and Stryker with no surviving mutants

**Target Platform**: Unchanged. The routes are served by the existing `/{proxy+}` API route
and API Lambda, so there are no infrastructure changes

**Project Type**: Web application (React SPA, serverless API, CDK)

**Performance Goals**: The board's counts come with the list it already loads (SC-003). Logging
an interview takes one request (SC-001)

**Constraints**:
- At most 6 interviews per opportunity, enforced in the transaction (not just checked before
  it)
- An interview's date is never in the future and never before the date added. The date added
  is never after the first interview
- Claude can't remove interviews (Principle IV)

**Scale/Scope**: One user; up to 6 interviews on each of about 200 opportunities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Interviews don't change the stage. Each opportunity stays in exactly one stage, and moving it is unchanged. | PASS |
| II. History is never lost | Stage changes are never removed. Interviews are a separate kind of history entry that the owner decided can be removed. Removal is a deliberate, confirmed action, like permanent deletion. Each interview keeps `recordedAt`, so a backdated one is still visible as such. | PASS (owner decision recorded in spec Assumptions) |
| III. Fast capture, progressive detail | Adding an opportunity is unchanged. An interview needs no input beyond one click: today's date, and no note. | PASS |
| IV. Data privacy & ownership | Interviews live in the owner's table. Claude can log and edit them under the same sign-in and change limit, but can't remove them. | PASS |
| V. Simplicity (YAGNI) | No new dependencies, tables, indexes, or infrastructure. There are no interview types or scheduling. The stored count avoids loading every partition for the board. | PASS |
| VI. Test the rules | The date rules, the limit, and the count are pure shared functions or transaction conditions, with unit and integration tests. Coverage and mutation gates apply unchanged. | PASS |
| VII. Automated quality gates | Same pipeline. A new `interview` test tag selects this feature's tests. Checked locally, and pushed only when the owner says so. | PASS |

**Post-design re-check (after Phase 1)**: PASS. The data model adds one item type and one
attribute. The API adds three routes and additive fields on existing responses.

## Project Structure

### Documentation (this feature)

```text
specs/005-interview-count/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-changes.md
│   └── mcp-tools-changes.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── interviews.ts            # (new) schemas, MAX_INTERVIEWS, messages, interviewDateProblem,
│                            #   interviewCountText, timeline (stage changes + interviews)
├── dateAdded.ts             # (changed) not after the first interview; day → timestamp helper
├── schemas.ts               # (changed) interviewCount on Opportunity; interviews on
│                            #   OpportunityWithHistory
└── index.ts                 # (changed) exports interviews.ts

packages/api/src/
├── routes/interviews.ts     # (new) POST / PATCH / DELETE /opportunities/{id}/interviews[/{iid}]
├── repo/keys.ts             # (changed) interviewKey, isInterviewItem
├── repo/opportunityRepo.ts  # (changed) addInterview, updateInterview, removeInterview;
│                            #   getWithHistory returns interviews
├── routes/opportunities.ts  # (changed) the date-added check includes interviews
├── handler.ts               # (changed) registers the interview routes
└── mcp/tools.ts             # (changed) add_interview, update_interview; interviewCount in
                             #   summaries

packages/web/src/
├── api/hooks.ts             # (changed) useAddInterview, useUpdateInterview, useRemoveInterview
├── components/InterviewForm.tsx      # (new) date + note, for adding and editing
├── components/OpportunityCard.tsx    # (changed) the count badge, top right
└── pages/OpportunityDetail.tsx       # (changed) "Add interview"; interviews in the history,
                                      #   with Edit and Remove

e2e/interviews.spec.ts       # @interview

scripts/test-tags.mjs        # (changed) the `interview` tag and its source patterns
```

**Structure Decision**: The existing monorepo. The interview rules live in the shared package,
because the web form, the API, and the MCP tools all apply them.

## Complexity Tracking

No constitution violations to justify.
