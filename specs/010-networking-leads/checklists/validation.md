# Validation: Networking Leads

**Purpose**: Record that feature 010 works, locally and once deployed, before calling it done.
**Started**: 2026-10-31

## Automated (local, 2026-10-31)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,493 in 72 files. Coverage: 99.6% of statements, lines and
  functions, 99% of branches (the gate is 80%). They cover:
  - the lead's rules: a name (required, up to 200 characters), an optional email and phone
    checked like the contact's, and nothing else; clearing on edit; `leadId` on the opportunity
  - the API: add, list by name with each lead's opportunities (open and closed), edit, the
    confirmed delete that unlinks every linked opportunity and changes nothing else about them,
    beyond 99 linked opportunities, and a lead that doesn't exist refused when linking
  - the Networking leads page: the empty state, the list with email and phone as plain text
    (no links), adding and editing in a dialog with the shared rules, deleting after confirming,
    with the number of opportunities that will be unlinked, focus and Escape
  - the navigation: "Networking leads", shown as "Leads" where space is short
  - the opportunity form's "Lead" choice (same-name leads told apart), and the lead on the
    opportunity's page, including a link to a lead that's gone
  - Claude's tools: `list_leads`, `add_lead`, `update_lead`, linking through `add_opportunity`
    and `update_opportunity`, the lead in `get_opportunity`, the change limit, and no tool that
    deletes a lead
- [x] End-to-end: the full suite passes on desktop and iPhone (87 runs, 9 skipped by design),
  including `e2e/leads.spec.ts`:
  - add a lead from the Networking leads page; its email and phone aren't links
  - link an opportunity when adding it; both sides show it; the lead's link opens it
  - unlink it, link it again, then delete the lead: the dialog says 1 opportunity stays, and it
    does, without a lead
  - axe finds nothing on the page and the add and delete dialogs, in light and dark
  - on the iPhone, the bottom bar reads "Leads" and the page doesn't scroll sideways
- [x] Mutation testing, every file (the shared schemas changed, so all of them run): 3,341
  killed of 3,342 (99.97%; the gate is 95%). The first run left 37 alive, all in this feature's
  code; new tests now catch each one:
  - Claude's lead tools: their titles and descriptions, and `get_opportunity` finding the right
    lead among several
  - the API: sorting by name ignoring case, clearing email and phone together, the field named
    when a delete isn't confirmed, and two full delete transactions with no empty third one
  - the web app: "Saving…" and "Deleting…" while waiting, Save and Delete working again after a
    failure, earlier field errors cleared, the form's own submit, Tab kept inside the delete
    dialog, only the leads (and, after a delete, the opportunities) reloaded, and the empty
    state and the list never shown together
  - The one left, the text describing `leadId` to Claude, is set when the module loads; run on
    its own, the test that checks it kills it.

- [x] **API test timeout**: the API's tests now allow 20 seconds each (the infra tests already
  allow 30). They share one DynamoDB Local, and with the extra tests, a few that make many calls
  in a row ran past the default 5 seconds in the full run with coverage, a different one each
  time. Nothing about them was wrong, and each passed on its own.

- [x] **Architecture diagrams** (constitution, FR-012): checked. The README's system diagram
  shows services and route groups; the lead routes are more REST routes on the same API and
  table, so it's unchanged. The sign-in sequence is unchanged. The new relationship diagram in
  [data-model.md](../data-model.md) is Mermaid and draws without errors.

## Deployed (needs the owner, after deploy; quickstart.md)

- [ ] **iPhone**: open Leads, add a lead, and link an opportunity to it
- [x] **Claude**: ask Claude to add a lead and link an opportunity to it; the web app shows both.
  Ask it to list your leads, then to show that opportunity; its lead comes back. (The connector
  may need reconnecting to see the new tools.) The owner checked it on 2026-11-01.

## Deployed

- [x] Merged when the owner says so (PR #34, 2026-11-01)
- [x] The deploy's smoke test passes (2026-11-01)
