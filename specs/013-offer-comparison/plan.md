# Implementation Plan: Offer Details and Comparison

**Branch**: `013-offer-comparison` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-offer-comparison/spec.md`

## Summary

An Offer section on each opportunity with its history, shared custom fields, an Offers page and
board checkboxes to pick up to three, and a comparison page with 0–5 scores in accessible
colors and an overall average.

- **Storage**: the offer and its scores are maps on the opportunity item, so the board and the
  Offers page see them with no new index or request (research §1). Each saved change is an
  `OFFERCHANGE#<seq>` item in the opportunity's partition, written in the same transaction as the
  offer, conditional on its version (research §2). Scores are set one by one, with no history
  (research §3). Custom fields are one settings item (research §4). No infrastructure change:
  the routes go through the API's catch-all route.
- **The API**: `PATCH` and confirmed `DELETE` on `/opportunities/{id}/offer`, `PATCH
  /opportunities/{id}/offer/scores`, and `GET`/`PATCH /offer-fields`. Opportunities return `offer`
  and `offerScores`; the detail route also returns `offerHistory`.
- **The web app**: the Offer section and its form page; the Offers page with "Fields to
  compare"; board checkboxes and "Compare N"; the comparison page with score drop-downs, the
  overall row and a legend; "Respond by" on cards (research §7, §8).
- **Colors**: six tinted score tokens per theme with the site's text color, each at least 4.5:1,
  checked by a unit test and by axe; every score also shown as a number and a word (research §6).
- **Claude**: the offer on `get_opportunity`; `list_offers`, `update_offer`, `score_offer`,
  `add_offer_field` and `rename_offer_field`. No tool removes an offer or a field (research §9).

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–012

**Primary Dependencies**: No new dependencies

**Storage**: DynamoDB, the existing table. `offer`, `offerScores` and `offerVersion` on the
opportunity item; `OFFERCHANGE#` items in its partition; one `SETTINGS`/`OFFER_FIELDS` item

**Testing**:
- **Vitest**:
  - **Shared**: the offer schemas (amounts, the bonus, lengths, dates, custom values, clearing),
    the score and field-list schemas, the history diff (what changed, added, cleared; nothing),
    `offerOverall` (0s included, removed fields ignored, rounding), score labels and colors,
    `respondByText`, and which opportunities are offers.
  - **API integration**: adding, changing and clearing an offer and its history (including two
    saves racing, and a save that changes nothing), removing it with its history, scores (set,
    clear, without an offer), the custom fields (add, rename, reorder, remove with the header,
    limits, a race), dropped values on the next save, and the stage and history untouched.
  - **MCP integration**: the five new tools, `get_opportunity`'s offer, custom fields by name,
    the change limit, "via Claude" in the history, and no remove tools.
  - **Web**: the offer form and page, the Offer section and its history, the Offers page and
    its ticks (2–3, the fourth refused), the board's checkboxes and "Compare N", the comparison
    (rows, columns, blanks, scores, overall, legend, reload, a missing offer), custom field
    management, "Respond by" on cards, and the score colors' contrast from `global.css`.
- **Playwright** (`@offer @responsive`): record and edit an offer and see its history; pick
  offers on the Offers page and the board and compare; score and see the colors; add, rename
  and remove a custom field; axe in light and dark on every new page; on iPhone, the comparison
  scrolls inside its table and the page doesn't scroll sideways.
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%.

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app); the
AWS Lambda API and MCP server

**Project Type**: Web application (React SPA, Lambda API, MCP server)

**Performance Goals**: The board and Offers page stay two requests (open and closed); a
comparison is at most three detail requests and the fields

**Constraints**:
- WCAG 2.1 AA (FR-010, FR-017): every score color at least 4.5:1 with its text, in light and
  dark, and never the only cue.
- Nothing scrolls sideways on phones except the comparison table inside its own frame.
- Opportunities stored before this feature (no `offer`) keep working with no migration.

**Scale/Scope**: three new attributes, two new item types, five new routes, five new tools and
one changed tool, three new pages and changes to the board, the card and the opportunity page;
about 25 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Offers never change the stage; the Offer column is where comparing starts. | PASS |
| II. History is never lost | Every offer change is kept, dated, in the offer's history; it goes only with the offer, after a confirmation that says so. Stage history is untouched. | PASS |
| III. Fast capture, progressive detail | Every offer detail is optional; an offer can be one number. | PASS |
| IV. Data privacy & ownership | Offers, scores and fields are stored with the owner's data behind the same sign-in. Claude can't remove an offer or a field. | PASS |
| V. Simplicity (YAGNI) | One offer per opportunity, no new table, index or job; removing a field changes one item. No saved comparisons. | PASS |
| VI. Test the rules | The schemas, the history diff, the overall, the colors' contrast and the transactions are unit- and integration-tested; the flows end to end. | PASS |
| VII. Automated quality gates | Same pipeline; a new `offer` tag. Pushed after each commit; the PR and merge happen when the owner says so. | PASS |
| Workflow: diagrams | The system diagram is unchanged (same API, Lambda and table; its data note mentions offers). The data-model diagram gains the offer, its history and custom fields, Mermaid, checked to draw. | PASS |

**Scope & Data Constraints**: an opportunity still needs only a company and a title.

**Post-design re-check (after Phase 1)**: PASS. New attributes and items in the existing table,
no new infrastructure, and older opportunities read correctly without a migration.

## Project Structure

### Documentation (this feature)

```text
specs/013-offer-comparison/
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
├── schemas.ts                     # (changed) Offer, its patch, scores, fields; on the opportunity
└── offers.ts                      # (new) details and labels, the history diff, offerOverall,
                                   #   score labels, respondByText, isOffer, messages, limits

packages/api/src/
├── repo/keys.ts                   # (changed) OFFERCHANGE# and the settings keys
├── repo/opportunityRepo.ts        # (changed) the offer, its history and scores
├── repo/offerFieldsRepo.ts        # (new) the custom fields item
├── routes/offers.ts               # (new) the offer, scores and fields routes
├── handler.ts                     # (changed) registers them
└── mcp/tools.ts                   # (changed) the offer on get_opportunity; five new tools

packages/web/src/
├── App.tsx                        # (changed) /offers, /offers/compare, /opportunities/:id/offer
├── api/hooks.ts                   # (changed) offer, scores and fields hooks
├── components/Layout.tsx          # (changed) Offers before Archive
├── components/OfferSection.tsx (+css)    # (new) on the opportunity page, with its history
├── components/OfferForm.tsx (+css)       # (new)
├── components/ScoreCell.tsx (+css)       # (new) the score drop-down, number, word and color
├── components/OfferFields.tsx (+css)     # (new) add, rename, reorder, remove custom fields
├── components/OpportunityCard.tsx (+css) # (changed) the checkbox, "Respond by"
├── components/StageBoard.tsx (+css)      # (changed) "Compare N" on the Offer column
├── pages/OpportunityDetail.tsx    # (changed) the Offer section
├── pages/EditOffer.tsx            # (new) the form page
├── pages/Offers.tsx (+css)        # (new)
├── pages/CompareOffers.tsx (+css) # (new)
└── styles/global.css              # (changed) the score tokens, light and dark

e2e/offers.spec.ts, e2e/fixtures.ts, e2e/accessibility.spec.ts   # (new, changed)
scripts/test-tags.mjs              # (changed) the offer tag and its files
specs/001…/contracts/api.openapi.yaml, specs/003…/contracts/mcp-tools.md
                                   # (changed) per contracts/changes.md
specs/001…/data-model.md           # (changed) points to 013
README.md                          # (changed) offers, the comparison, Claude's tools
```

**Coverage and mutation exclusions**: none new.

**Structure Decision**: The offer is part of the opportunity, with its own routes and pages;
custom fields are a small settings item of their own.

## Complexity Tracking

No constitution violations to justify.
