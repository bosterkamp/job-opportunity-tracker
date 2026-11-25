# Validation: Offer Details and Comparison

**Purpose**: Record that feature 013 works, locally and once deployed, before calling it done.
**Started**: 2026-11-21

## Automated (local, 2026-11-22)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,797. Coverage: 99.35% of lines, 99.29% of statements, 99.11% of
  functions, 98.08% of branches (the gate is 80%). They cover:
  - the rules: every detail optional; amounts whole from 0 to 10,000,000 ("165k" read on the
    form and through Claude); the bonus 0–100 with one decimal; the title up to 200 and other
    text up to 500; calendar dates; custom values only for current fields; scores whole 0–5 on
    a detail or `custom:<id>`; custom field names trimmed, 1–60, unique regardless of case, at
    most 20
  - the history diff (changed, added, cleared, nothing), `offerOverall` (0s counted, removed
    fields left out, one decimal), the score words and tones, `respondByText`, `isOffer`, and a
    removed field named "{name} (removed)"
  - the API: adding, changing and clearing the offer with its history; a save that changes
    nothing writing nothing; two racing saves (one wins, the other is 409, no change lost);
    scores set one at a time, two at once both kept, none without an offer; removing the offer
    with all its history (over 100 entries, across transactions), after confirming; the
    custom fields (add, rename, reorder, remove with the header, the limits, a race); removed
    fields' values and scores dropped on the next save; the stage and "last change" untouched
  - the web app: the Offer section with its scores, overall and history; the offer page (the
    opportunity's title, location and arrangement to start, only changes sent, each problem on
    its field); the Offers page; ticking 2–3 on it and on the board's Offer column (and tab),
    never a fourth; the comparison (rows, columns, blanks, a gone offer, fewer than 2, a
    failed load); scoring and clearing, with the old score kept when a save fails; the legend;
    the custom fields; respond-by dates on cards and the Offers page
  - **the score colors**: `tests/score-colors.test.ts` reads `global.css` and checks each of
    the six tints against the text by the WCAG formula. Light: 13.89, 11.67, 13.02, 14.94,
    14.14, 10.80; dark: 10.39, 9.64, 8.02, 7.38, 6.85, 6.95 (0 to 5; AA needs 4.5)
  - Claude's tools: `list_offers`, `update_offer`, `score_offer`, `add_offer_field` and
    `rename_offer_field`, custom fields by name, `get_opportunity`'s offer, "via Claude" in the
    history, the change limit, and no tool that removes an offer or a field
- [x] End-to-end: the full suite passes on desktop and iPhone (109 runs, 9 skipped by design),
  including in `e2e/offers.spec.ts`:
  - record an offer, change it and see both history entries, save unchanged with no entry,
    remove it after confirming
  - pick offers on the Offers page and on the board's Offer column, compare, reload
  - score details and see their colors and the overall row; reload and they stay; on the
    iPhone the comparison scrolls inside its frame with the detail names in view, and the page
    doesn't scroll sideways
  - add, fill, score, rename and remove a custom field
  - a respond-by date two days away in the warning color
  - axe finds nothing on the Offer section and its history, the offer page, Offers with its
    fields, and the comparison with every score, in light and dark; every tap target is at
    least 44 px on the iPhone
- [x] Mutation testing, every file (the shared schemas changed): 98.30% (the gate is 95%), up
  from 95.71% on the first run. The survivors in the new files were worked through: tests now
  pin Claude's offer tool descriptions and hints, the Offers page's and the comparison's
  loading, failure and retry, the offer form's fields and what it sends, the custom fields'
  headings, hints and remove confirmation, the route messages, and the fields item's reads and
  conditional writes. Checks that can't change behavior were removed (a selection that can't
  reach four, a filter on ids never in both lists). The loading state shared by the Offers page
  and the comparison is now one tested helper (`combineQueries`). It also fixed a bug: renaming
  an earlier field to a later field's name wasn't caught on the form. A forced run of
  `mcp/tools.ts` kills every mutant; the incremental report still lists some module-level
  strings there and in the labels as survived from the earlier run.

- [x] **Architecture diagrams** (constitution, FR-018): checked. The README's system diagram
  shows services and route groups; offers use the same REST routes, the same Lambdas and the
  same table, so it's unchanged (its data note now mentions the offer, its history and the
  custom fields). The relationship diagram in [data-model.md](../data-model.md) adds the offer,
  its history and the custom fields; it's Mermaid `erDiagram`, reviewed by hand against its
  syntax (no Mermaid renderer is installed locally), in the same forms as features 010–012.

## Deployed (needs the owner, after deploy; quickstart.md "By hand")

2026-11-23: the owner checked the deployed site and reports that everything they tried worked.
The boxes below are ticked only for the steps the owner named.

- [ ] **Record** (step 1) and **history** (step 2)
- [ ] **Pick and compare** (step 3), and **score** (step 4), in light and dark
- [ ] **Custom fields** (step 5) and **respond by** (step 6)
- [ ] **Remove** (step 7)
- [ ] **Claude** (step 8). (The connector may need reconnecting to see the new tools.)
- [ ] **iPhone** (step 9)

## Deployed

- [x] Merged when the owner says so (PR #40, 2026-11-22, after ci, e2e and mutation passed)
- [x] The deploy's smoke test passes (Deploy run 45084806058)
