# Implementation Plan: Offer Weights and a Settings Page

**Branch**: `014-offer-weights` | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-offer-weights/spec.md`

## Summary

Each offer detail and custom field gets an importance from 0 to 3, shared by every offer, and
the overall score becomes the weighted average everywhere. A new Settings page sets the
importances and takes over managing the custom fields.

- **Storage**: a `weights` map on feature 013's custom-fields item. Normal is left out, so old
  items need no migration, and one version covers fields and weights (research §1).
- **The API**: `GET /offer-fields` returns `weights`, and a new `PATCH /offer-weights` merges
  importances, conditional on the version. Removing a field drops its weight. No infrastructure
  change: the route goes through the API's catch-all route (research §2).
- **The rule**: `offerOverall` weighs each score by its importance. It's one shared function,
  equal to the plain average when everything is Normal (research §3).
- **The web app**: a `/settings` page in the navigation after Archive, where each select saves
  on its own through a one-at-a-time queue, with the custom fields moved there. The Offers page
  and the comparison link to it, and the comparison shows non-Normal importances by each row
  (research §4–§6).
- **Claude**: `set_offer_weights`; `list_offers` returns `importance`; every overall is weighted
  (research §7).

## Technical Context

**Language/Version**: TypeScript 6.0, as in features 001–013

**Primary Dependencies**: No new dependencies

**Storage**: DynamoDB, the existing table: `weights` on the `SETTINGS`/`OFFER_FIELDS` item

**Testing**:
- **Vitest**:
  - **Shared**:
    - the weights patch schema (0–3, at least one key, the key formats);
    - `weightOf` and `importanceText`;
    - the weighted `offerOverall`: weights 0–3, 0 scores counted, Ignored left out, all Ignored
      gives undefined, removed fields ignored, rounding;
    - with every weight 1, the same result as feature 013's average over generated score sets.
  - **API integration**:
    - `PATCH /offer-weights`: merging, 1 removing a key, unknown details and fields, values
      outside 0–3, an empty patch, a stale version, two saves racing;
    - the `GET` returning `weights` (and `{}` for an old item);
    - `PATCH /offer-fields` dropping a removed field's weight;
    - no opportunity or offer history touched.
  - **MCP integration**:
    - `set_offer_weights` by detail and field name, unknown names, and the change limit;
    - `list_offers`' `importance` and weighted `overall`;
    - `get_opportunity`'s weighted `offerOverall`.
  - **Web**:
    - the Settings page: every detail listed with its importance, a save per change, "Saved",
      a failure restoring the value, and two quick changes queued with the right versions;
    - the custom fields on Settings;
    - the Offers page and the comparison without field controls, with their links;
    - the comparison's row labels;
    - the weighted overall on the comparison, the Offers page and the Offer section;
    - the navigation with Settings.
- **Playwright** (`@offer`, with `@responsive` where the layout matters):
  - set importances on Settings and see the overall change on the comparison and the Offers
    page;
  - add, weigh and remove a custom field on Settings;
  - axe on Settings in light and dark;
  - on the iPhone, five links in the bottom bar with nothing drawn over them, and no sideways
    scrolling.
- **Quality gates**: coverage of at least 80% and a mutation score of at least 95%.

**Target Platform**: Current desktop browsers and iOS 16.4+ (Safari and the installed app); the
AWS Lambda API and MCP server

**Project Type**: Web application (React SPA, Lambda API, MCP server)

**Performance Goals**: No new requests on the board, the Offers page or the comparison; they
already load the settings item. Settings loads that item and the open and closed lists, to
count each field's values before removing it.

**Constraints**:
- WCAG 2.1 AA: importances shown as text, every control labeled, axe clean in light and dark.
- Every overall score unchanged until the owner sets a weight (SC-002).
- Items stored before this feature work with no migration.

**Scale/Scope**: one new attribute, one new route, one new tool and three changed tools, one
new page and changes to the comparison, the Offers page and the navigation; about 15 source
files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Weights never touch stages. | PASS |
| II. History is never lost | Weights aren't offer data; offer and stage histories are untouched (FR-012). Removing a field still asks for confirmation. | PASS |
| III. Fast capture, progressive detail | Nothing new is required; every detail starts at Normal. | PASS |
| IV. Data privacy & ownership | Weights are stored with the owner's data behind the same sign-in. Claude can set weights but still can't remove a field or an offer. | PASS |
| V. Simplicity (YAGNI) | One attribute on an existing item, one route, one page. No settings framework: Settings has one section, headed so others can join. Existing paths are kept rather than renamed. | PASS |
| VI. Test the rules | The weighting rule, the merge and its validation, and the version check are unit- and integration-tested; the flows end to end. | PASS |
| VII. Automated quality gates | Same pipeline and the existing `offer` tag. Pushed after each commit; the PR and merge happen when the owner says so. | PASS |
| Workflow: diagrams | The system diagram is unchanged (same API, Lambda and table). The README's "What's stored" diagram shows the settings item with `weights`, in Mermaid, checked to draw. | PASS |

**Scope & Data Constraints**: an opportunity still needs only a company and a title.

**Post-design re-check (after Phase 1)**: PASS. One optional attribute on an existing item, read
as "all Normal" when absent, and no new infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/014-offer-weights/
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
├── schemas.ts                     # (changed) `weights` on OfferFields; OfferWeightsPatchSchema
└── offers.ts                      # (changed) importance words, weightOf, importanceText,
                                   #   weighted offerOverall, messages

packages/api/src/
├── repo/offerFieldsRepo.ts        # (unchanged API) the item now carries `weights`
├── routes/offers.ts               # (changed) PATCH /offer-weights; fields drop removed weights
└── mcp/tools.ts                   # (changed) set_offer_weights; importance; weighted overalls

packages/web/src/
├── App.tsx                        # (changed) /settings
├── api/hooks.ts                   # (changed) useSaveOfferWeights, one save at a time
├── components/Layout.tsx          # (changed) Settings after Archive
├── components/OfferFields.tsx     # (changed) on Settings only
├── components/OfferWeights.tsx (+css)   # (new) every detail with its importance select
├── components/OfferSection.tsx    # (changed) weighted overall
├── pages/Settings.tsx (+css)      # (new) "Offer comparison": weights and custom fields
├── pages/Offers.tsx               # (changed) weighted overall; link to Settings
└── pages/CompareOffers.tsx (+css) # (changed) weighted overall; row importances; link

e2e/offers.spec.ts, e2e/settings.spec.ts, e2e/accessibility.spec.ts   # (changed, new)
scripts/test-tags.mjs              # (changed) the new files under `offer`
specs/001…/contracts/api.openapi.yaml, specs/003…/contracts/mcp-tools.md
                                   # (changed) per contracts/changes.md
README.md                          # (changed) weights, Settings, Claude's tool, the diagram
```

**Coverage and mutation exclusions**: none new.

**Structure Decision**: Weights are part of the offer settings item; Settings is a page of its
own that reuses the custom-field component, with the importance list as a new component beside
it.

## Complexity Tracking

No constitution violations to justify.
