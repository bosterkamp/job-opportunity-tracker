# Implementation Plan: Notes on Networking Leads

**Branch**: `011-lead-notes` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-lead-notes/spec.md`

## Summary

Dated notes on each networking lead, for conversations with the owner's network, plus Archive
moved to the end of the navigation.

- **The date**: `heldAt`, a timestamp like an interview's, shown as its day; never in the
  future (research §1).
- **Storage**: one item per note in its lead's partition, also in the `LEADS` index partition so
  the leads page stays one query. The lead counts its notes to hold the limit of 200 (research
  §2). No infrastructure change.
- **The API**: `POST`, `PATCH` and confirmed `DELETE` under `/leads/:id/notes`; `GET /leads`
  returns each lead's notes; deleting a lead deletes them (research §3).
- **The web app**: on each lead's card, the newest note with "Show all N notes", "Add note", and
  each note's Edit and Delete; a NoteDialog; the lead's delete confirmation counts its notes
  (research §4).
- **Claude**: `list_leads` returns the notes; `add_lead_note` and `update_lead_note`. No tool
  deletes a note (research §5).
- **Navigation**: Overview, Networking leads, Archive, on desktop and phones (done).
- **The add form** (done): every field shows at once, as editing does; "More details" is gone.
- **Fix** (done): a lead's Edit and Delete kept their normal size on cards without
  opportunities.

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–010

**Primary Dependencies**: No new dependencies

**Storage**: DynamoDB, the existing table and GSI1. A new `NOTE#` item in each lead's partition,
and `noteCount` on the lead item

**Testing**:
- **Vitest**:
  - **Shared**: the note's rules (text required and its limit, the future check, the order).
  - **API integration**: the note routes, the limit (including two adds at once), the order,
    the confirmed delete, a lead's delete taking its notes (beyond one transaction), and notes
    never changing the lead or its opportunities.
  - **MCP integration**: `list_leads`' notes, the two new tools, the change limit, no delete.
  - **Web**: the card's notes (none, one, several, "Show all"), the dialog, the confirmations,
    focus, and the lead's delete counting notes.
- **Playwright** (`@leads @responsive`): add, show all, edit and delete a note, and axe in light
  and dark, on desktop and iPhone.
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%.

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app); the
AWS Lambda API and MCP server

**Project Type**: Web application (React SPA, Lambda API, MCP server)

**Performance Goals**: The leads page stays one request, with up to 50 notes a lead (SC-005)

**Constraints**:
- WCAG 2.1 AA (FR-009), using the existing tokens and dialog styles.
- Notes wrap on phones; nothing scrolls sideways.
- Leads stored before this feature (no `noteCount`) keep working.

**Scale/Scope**: one new item type, three routes, two tools, one dialog and one confirmation;
about 15 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Notes belong to leads, which have no stage; no opportunity's stage or workflow changes. | PASS |
| II. History is never lost | Stage history is untouched. Deleting a note, or a lead with its notes, needs confirming. | PASS |
| III. Fast capture, progressive detail | A note needs only its text; the date defaults to today. | PASS |
| IV. Data privacy & ownership | Notes are stored with the owner's data behind the same sign-in. Claude can't delete notes. | PASS |
| V. Simplicity (YAGNI) | Text and a date only; no titles, tags, search or edit history. No new table or index. | PASS |
| VI. Test the rules | The note's rules, the limit and the deletes are unit- and integration-tested; the flow end to end. | PASS |
| VII. Automated quality gates | Same pipeline and `leads` tag. Pushed after each commit; the PR and merge happen when the owner says so. | PASS |
| Workflow: diagrams | The system diagram is unchanged (no new service or store). The data-model diagram gains the note, Mermaid, checked to draw. | PASS |

**Scope & Data Constraints**: an opportunity still needs only a company and a title, and a lead
only a name.

**Post-design re-check (after Phase 1)**: PASS. One new item type in the existing table and
index partition, with no new infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/011-lead-notes/
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
├── schemas.ts                     # (changed) LeadNote, its input and patch; notes on the lead list
└── leadNotes.ts                   # (new) messages, the limit, the future check, the order

packages/api/src/
├── repo/keys.ts                   # (changed) NOTE# keys
├── repo/leadRepo.ts               # (changed) note add/update/delete; list with notes; delete takes notes
├── routes/leads.ts                # (changed) the note routes; GET /leads with notes
└── mcp/tools.ts                   # (changed) notes in list_leads; add_lead_note, update_lead_note

packages/web/src/
├── api/hooks.ts                   # (changed) note mutations
├── pages/Leads.tsx (+css)         # (changed) the card's notes, Add note
├── components/NoteDialog.tsx      # (new) add and edit
├── components/DeleteNote.tsx      # (new) the confirmation
├── components/DeleteLead.tsx      # (changed) counts notes
└── components/Layout.tsx          # (changed, done) Archive last

e2e/leads.spec.ts, e2e/fixtures.ts # (changed) notes
specs/001…/contracts/api.openapi.yaml, specs/003…/contracts/mcp-tools.md
                                   # (changed) per contracts/changes.md
specs/010…/data-model.md           # (changed) points to 011 for notes
README.md                          # (changed) notes and Claude's tools
```

**Coverage and mutation exclusions**: none new.

**Structure Decision**: Notes extend the lead's own repository, routes and page; they share the
interview's date rules and helpers.

## Complexity Tracking

No constitution violations to justify.
