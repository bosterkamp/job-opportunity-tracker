# Validation: Interview Details

**Purpose**: Record that feature 012 works, locally and once deployed, before calling it done.
**Started**: 2026-11-10

## Automated (local, 2026-11-10)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,647. Coverage: 99.9% of lines, 99.9% of statements, 99.7% of
  functions, 99.2% of branches (the gate is 80%). They cover:
  - the rules: every new field optional; the type, format and outcome values; panel a yes/no;
    next steps up to 500 characters; at most 10 interviewers, each needing a name, with the
    lengths of their details; a valid email; LinkedIn only as an `https` profile on
    linkedin.com or a subdomain (`https://` added when left out; user names, ports, look-alike
    hosts, spaces and other paths refused); at most a year ahead, and not before the date
    added; clearing on a change
  - `interviewSummary` (held and next, older opportunities without times), the section's order,
    and the history leaving out upcoming interviews
  - the API: every detail stored and returned, cleared ones removed; the limit of 6 counting
    upcoming ones; the opportunity's interview times kept in step with adds, date changes and
    removes, and left alone otherwise; an older opportunity's times started on its first
    change, including two changes at once; the stage and "last change" never touched
  - the web app: the form (every field, "How it went" only once it's happened, the
    interviewers' rows, each problem on its field); the add page; the Interviews section; the
    interview's page (every detail, LinkedIn as the only link, upcoming, not found, edit,
    remove after confirming); the history's one-line links; the card's held count and next
    interview
  - Claude's tools: the new inputs on `add_interview` and `update_interview`, `upcoming` on
    each interview, the held count and `nextInterviewAt` in summaries, the web app's messages,
    the change limit, and still no tool that removes an interview
- [x] End-to-end: the full suite passes on desktop and iPhone (97 runs, 9 skipped by design),
  including in `e2e/interviews.spec.ts`:
  - add an interview with every detail and two interviewers on its own page; reload it; open
    it from the section and from the history; long emails and links wrap with no sideways
    scroll on the iPhone
  - edit it and remove it on its page, then land on the opportunity
  - a card counts held interviews and shows the next one; an upcoming interview moved to an
    hour ago is counted and appears in the history
  - axe finds nothing on the section, the add page with an interviewer, the interview's page,
    and its edit form, in light and dark; every tap target is at least 44 px on the iPhone
- [x] Mutation testing, every file (the shared schemas changed): 98.99% (the gate is 95%). The
  38 survivors are all handled:
  - missing tests, now added: the LinkedIn pattern's anchors and characters, a scheme typed in
    the path, `null` interviewers when adding, the LinkedIn placeholder, the trimmed name on
    "Remove", the interviewer limit's message only at 10, the section's "Upcoming" and "Past"
    headings, each interviewer detail on its own line, the date-and-time format, and (from the
    leads polish, PR #36) the leads page's button styles; the history key test now has two
    stage entries
  - code that couldn't change anything, now simpler: a second `trim`, a filter of undefined
    values, the new interviewer's focus check, the update expression's `trim`, and the
    selects' ids (they now sit inside their labels)
  - one equivalent, marked for Stryker: the form's row keys count down as uniquely as up
  - `leadId`'s description on Claude's tools, a load-time mutant that the existing test kills
    when it runs alone (as in feature 011)

  Run again on those lines: 466 killed, none survived.

- [x] **Architecture diagrams** (constitution, FR-016): checked. The README's system diagram
  shows services and route groups; interviews use the same REST routes, the same Lambda and the
  same table, so it's unchanged (its data note now mentions the interview times). The
  relationship diagram in [data-model.md](../data-model.md) adds the interviewers; it's Mermaid
  `erDiagram`, reviewed by hand against its syntax (no Mermaid renderer is installed locally),
  using the same forms as features 010 and 011.

## Deployed (needs the owner, after deploy; quickstart.md "By hand")

- [ ] **Details and interviewers** (steps 1–2): add a hiring-manager video panel with
  interviewers; its page shows everything; a LinkedIn address opens the profile
- [ ] **Section and page** (step 3): open it from the section and the history; remove it
- [ ] **Upcoming** (step 4): one for tomorrow shows on the card as the next interview, and
  counts once moved into the past
- [ ] **Older interviews** (step 5): they keep their dates, notes and counts
- [ ] **Claude** (step 7): add an upcoming panel with two interviewers, ask what's coming up, and
  record how it went. (The connector may need reconnecting to see the changed tools.)
- [ ] **iPhone** (step 8): steps 1 to 4 with nothing scrolling sideways

## Deployed

- [ ] Merged when the owner says so
- [ ] The deploy's smoke test passes
