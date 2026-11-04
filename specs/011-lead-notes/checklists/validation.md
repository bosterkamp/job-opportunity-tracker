# Validation: Notes on Networking Leads

**Purpose**: Record that feature 011 works, locally and once deployed, before calling it done.
**Started**: 2026-11-01

## Automated (local, 2026-11-01)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,550 in 75 files. Coverage: 99.7% of statements, lines and
  functions, 99.1% of branches (the gate is 80%). They cover:
  - the note's rules: text required ("Write a note"), up to 5,000 characters, line breaks kept;
    never dated in the future (with the stage change's clock skew), however far back; the order
    (newest date, then newest added); at most 200 a lead
  - the API: adding (dated now, or earlier), listing each lead's notes from the same query,
    changing, the confirmed delete, the limit held when two adds race, a lead stored before the
    feature, deleting a lead taking its notes (beyond one transaction), and notes never changing
    the lead or its opportunities
  - the leads page: no notes area without notes; the newest note with its day; "Show all N
    notes" and back; links as plain text; adding (today or an earlier day), editing only what
    changed, deleting after confirming; "Saving…" and "Deleting…"; refusals in the dialogs;
    focus and Escape; only the leads reloaded; the lead's delete counting notes
  - Claude's tools: notes in `list_leads`, `add_lead_note` and `update_lead_note` with the web
    app's messages, the change limit, and no tool that deletes a note
  - the add form showing every field, with no "More details"; the navigation order
- [x] End-to-end: the full suite passes on desktop and iPhone (91 runs, 9 skipped by design),
  including in `e2e/leads.spec.ts`:
  - add a note from the card, show all, edit the older one, delete it; deleting the lead says
    its note goes
  - axe finds nothing on the note dialog and the notes shown, in light and dark
  - a long note wraps; the page doesn't scroll sideways on the iPhone
  - a lead's Edit and Delete are the same size with or without opportunities
- [x] Mutation testing, every file (the shared schemas changed, so all of them run): 99.78%
  (the gate is 95%). Eight survived the full run; each is now handled:
  - three in the lead repository, where a database failure other than a failed condition must
    pass through (a 500, not the limit or "not found"): new unit tests in
    `packages/api/tests/unit/lead-notes-repo.test.ts`
  - two in the note dialog, for a cleared day: a test that a note is then dated now
  - one in the add form, now equivalent with "More details" gone (an undefined problem shows
    nothing either), marked for Stryker as the note dialog's same line already is
  - `leadId`'s description on Claude's tools, a load-time mutant that the existing test kills
    when it runs alone
  Run again on those lines: 22 killed, none survived.

- [x] **Architecture diagrams** (constitution, FR-010): checked. The README's system diagram
  shows services and route groups; the note routes are more REST routes on the same API (sent
  through its catch-all route, so no infrastructure change) and the same table, so it's
  unchanged. The relationship diagram in [data-model.md](../data-model.md) gains the note; it's
  Mermaid `erDiagram`, reviewed by hand against its syntax (no Mermaid renderer is installed
  locally), and it adds one relationship to feature 010's diagram, which uses the same forms.

## Deployed (needs the owner, after deploy; quickstart.md)

- [ ] **iPhone**: on a lead, add a note, open all its notes, and edit one
- [ ] **Claude**: ask Claude to add a note to a lead for yesterday; the web app shows it under
  yesterday. Ask what notes the lead has; Claude lists them. Ask it to fix a note's wording; the
  web app shows the change. (The connector may need reconnecting to see the new tools.)

## Deployed

- [ ] Merged when the owner says so
- [ ] The deploy's smoke test passes
