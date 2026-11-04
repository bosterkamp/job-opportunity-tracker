# Implementation Plan: Networking Leads

**Branch**: `010-networking-leads` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-networking-leads/spec.md`

## Summary

A new record, the networking lead (a name, email and phone), on its own page, which an
opportunity can link to.

- **Storage**: one item per lead in the existing table, listed through the existing index. No
  infrastructure change (research §1).
- **The link**: one optional field on the opportunity, `leadId`, checked against the leads and
  cleared like any detail (research §2).
- **The API**:
  - new routes `GET`/`POST /leads` and `PATCH`/`DELETE /leads/:id`;
  - the list includes each lead's opportunities;
  - deleting a lead unlinks them in the same transaction (research §3, §4).
- **The web app**: a Networking leads page with "Add lead". Adding and editing a lead happen
  in a dialog. The opportunity form gains a "Lead" select, and the opportunity's page shows its
  lead (research §5).
- **Claude**: `list_leads`, `add_lead` and `update_lead`; `leadId` on the add and update tools;
  `get_opportunity` returns the lead. No tool deletes a lead (research §6).

Stages, history, sorting and the overview don't change.

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–009

**Primary Dependencies**: No new dependencies (zod, React, TanStack Query, React Router, the
MCP SDK, the AWS SDK)

**Storage**: DynamoDB, the existing table and GSI1. A new `LEAD#` item, and one more optional
attribute on the opportunity

**Testing**:
- **Vitest**:
  - **Shared `schemas.test.ts`**: the lead's fields and rules, and `leadId` on the opportunity.
  - **API integration**: the lead routes, linking, an unknown lead refused, the confirmed
    delete that unlinks, and the batched unlink beyond 99.
  - **MCP integration**: the new and changed tools; `get_opportunity`'s lead.
  - **Web**:
    - the leads page, its dialogs and the empty state;
    - the opportunity form's select (and same-name leads told apart);
    - the detail page;
    - the navigation's long and short labels.
- **Playwright** (`@leads @responsive`): add, link, unlink and delete, and axe in light and
  dark, on desktop and iPhone.
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%.

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app); the
AWS Lambda API and MCP server

**Project Type**: Web application (React SPA, Lambda API, MCP server)

**Performance Goals**: The leads page loads in one request. The overview is unchanged
(SC-005).

**Constraints**:
- WCAG 2.1 AA (FR-011), using the existing tokens and dialog styles.
- No horizontal scrolling on phones.
- Older items and clients keep working.

**Scale/Scope**:
- One new record type, four routes, three tools, one page and two dialogs.
- One new form field and one detail fact.
- About 25 source files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Leads aren't opportunities and have no stage. Every opportunity keeps exactly one stage, and moving it is unchanged. | PASS |
| II. History is never lost | Linking is a detail edit, so it adds no history entry. Deleting a lead needs confirming and never deletes an opportunity or its history. | PASS |
| III. Fast capture, progressive detail | A lead needs only a name. The link is optional, on add or later. | PASS |
| IV. Data privacy & ownership | Leads are stored with the owner's data behind the same sign-in. Claude can't delete leads. | PASS |
| V. Simplicity (YAGNI) | Three fields, as the owner asked. One link per opportunity, no new table or index, no search. | PASS |
| VI. Test the rules | The lead's validation, the link check and the unlink on delete are unit- and integration-tested. The flow is tested end to end. | PASS |
| VII. Automated quality gates | Same pipeline, with a new `leads` tag. Pushed after each commit; the PR and merge happen when the owner says so. | PASS |
| Workflow: diagrams | The system diagram is unchanged (no new service, route group or store). The new data-model diagram is Mermaid, checked to draw. | PASS |

**Scope & Data Constraints**: an opportunity still needs only a company and a title. A lead is
a separate record, not a field the opportunity requires.

**Post-design re-check (after Phase 1)**: PASS. One new item type in the existing table and
one optional attribute, with no new infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/010-networking-leads/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── changes.md       # the API, tool and route changes
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
└── schemas.ts                     # (changed) the lead schemas (beside the contact's rules);
                                   #   leadId on input, patch and response

packages/api/src/
├── repo/keys.ts                   # (changed) LEAD# keys, the LEADS partition
├── repo/leadRepo.ts               # (new) create, list, update, delete-with-unlink
├── routes/leads.ts                # (new) the four lead routes
├── routes/opportunities.ts        # (changed) leadId checked on create and patch
├── handler.ts                     # (changed) the lead repo and routes in createRoutes (MCP reuses it)
└── mcp/tools.ts                   # (changed) list_leads, add_lead, update_lead; leadId; lead

packages/web/src/
├── api/hooks.ts                   # (changed) useLeads and the lead mutations
├── pages/Leads.tsx                # (new) the Networking leads page
├── pages/Leads.module.css         # (new)
├── components/LeadDialog.tsx      # (new) add and edit
├── components/DeleteLead.tsx      # (new) the confirm dialog
├── components/Layout.tsx (+css)   # (changed) the nav item, long and short labels
├── components/OpportunityForm.tsx # (changed) the "Lead" select
├── pages/OpportunityDetail.tsx    # (changed) the "Lead" fact
└── App.tsx                        # (changed) the /leads route

e2e/leads.spec.ts                  # (new) @leads
e2e/fixtures.ts                    # (changed) a lead helper
scripts/test-tags.mjs              # (changed) the `leads` tag and its files
specs/001…/contracts/api.openapi.yaml, specs/003…/contracts/mcp-tools.md
                                   # (changed) per contracts/changes.md
README.md                          # (changed) the leads page, Claude's tools, the tag
```

**Coverage and mutation exclusions**: none new. The wiring in `handler.ts` is already covered
by the integration tests, as today.

**Structure Decision**: Leads get their own repository and routes, beside the opportunity
ones. Their schemas sit in `schemas.ts`, beside the contact's email and phone rules they reuse.
They share only the table and the key helpers with opportunities. The web app follows the
existing patterns: the page like Archive, the dialogs like "Move to…" and the delete confirm.

## Complexity Tracking

No constitution violations to justify.
