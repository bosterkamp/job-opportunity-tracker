# Validation: Offer Weights and a Settings Page

**Purpose**: Record that feature 014 works, locally and once deployed, before calling it done.
**Started**: 2026-11-25

## Automated (local, 2026-11-25)

- [x] Lint (including the test-tag check), typecheck, and build (all packages, CDK synth) pass
- [x] All unit tests pass: 1,866. Coverage: 99.54% of lines, 99.51% of statements, 99.52% of
  functions, 98.20% of branches (the gate is 80%). They cover:
  - **The rules**:
    - importances are whole numbers 0–3 on a detail or `custom:<id>`, and at least one is
      named;
    - a missing `weights` reads as everything Normal;
    - `weightOf` defaults to 1;
    - the words ("0 · Ignore" to "3 · Critical").
  - **The weighted overall**:
    - the spec's example ((3×5 + 1×2) ÷ 4 shows 4.3);
    - 0 scores counted with their weight, and Ignored details left out;
    - only Ignored details scored gives "Not scored";
    - removed fields' scores and weights left out;
    - rounding;
    - exactly the plain average when every detail is Normal, over 500 generated score sets
      (SC-002).
  - **The API** (`PATCH /offer-weights`):
    - merging, 1 removing a key, and unknown details or fields (including a removed one)
      refused;
    - values outside 0–3 and an empty patch refused;
    - a stale version and two racing saves (one wins, 409 for the other);
    - one version shared with the custom fields, a removed field's weight dropped and a
      renamed one's kept;
    - an item stored before weights read as `{}`;
    - no opportunity, offer, score or history touched (FR-012).
  - **The web app**:
    - Settings lists every detail and custom field with its importance, saves each change on
      its own with "Saved", sends quick changes one after another with the version the last
      returned, puts the stored value back with the reason on a failure, and says when
      nothing counts;
    - the weighted overall on the comparison, the Offers page and the Offer section, and the
      Offers page waiting for the settings so nothing shows unweighted;
    - the comparison's row importances ("Base salary · Critical", "Ignored, doesn't count") and
      its link to Settings;
    - the custom fields on Settings, with no field controls left on the Offers page or the
      comparison;
    - Settings in the navigation after Archive.
  - **Claude's tools**:
    - `set_offer_weights` by detail or field name, with an unknown name refused with the names
      that exist, and the change limit;
    - `list_offers`' `importance`, and the weighted `overall` and `offerOverall`;
    - every description and hint pinned, and still no tool that removes a field or an offer.
- [x] End-to-end: the full suite passes on desktop and iPhone (125 runs, 9 skipped by design).
  - **One flake**: the bottom-navigation test timed out once on the iPhone, with the
    comparison still loading near the end of the long run. It passed 6 of 6 when rerun.
  - **New or changed in `e2e/settings.spec.ts` and `e2e/offers.spec.ts`**:
    - an importance saved on its own and kept after a reload, with no sideways scrolling on
      the iPhone;
    - the overall following a weight set on Settings, on the comparison and the Offers page;
    - a custom field added on Settings, weighed, filled, scored, renamed (keeping its weight)
      and removed (taking its weight);
    - five links in the bottom bar with nothing drawn over them, Settings included.
  - **Accessibility**: axe finds nothing on Settings in light and dark, and every tap target is
    at least 44 px on the iPhone.
- [x] Mutation testing, every file (the shared schemas changed): 97.99% (the gate is 95%).
  - **Survivors in the new code**, worked through after the run:
    - tests now check that Settings says nothing is saved before a change, names its section,
      marks a failed select invalid, reloads the settings after a conflict, and labels each
      select with its detail's name;
    - two checks that can't change a result were removed: an Ignored weight adds 0 to both
      sums in the overall, and only an opportunity with an offer can have a custom value.
  - **A forced run** of `OfferWeights.tsx` and `Settings.tsx` then killed every mutant (100%).
  - **Stale entries**: the other survivors listed in the offer files are the stale incremental
    entries feature 013 recorded (module-level strings in `mcp/tools.ts` and the detail
    labels), and code from before this feature.

- [x] **Architecture diagrams** (constitution, FR-014):
  - **System diagram**: unchanged. It shows services and route groups, and weights use the same
    API Lambda, catch-all route and table. Its data note now says the settings item also holds
    how much each detail counts.
  - **"What's stored" diagram** (README): its settings entity is now `OFFER_SETTINGS`, with
    `weights` and `version`.
  - **[data-model.md](../data-model.md)**: has the settings item's diagram.
  - **Checked**: both, and every other diagram in the README, drawn with Mermaid 11 in a
    browser without errors.

## Deployed (needs the owner, after deploy; quickstart.md "By hand")

- [ ] **Nothing changes until a weight is set** (step 1)
- [ ] **Weigh what matters** (step 2) and **the overall follows** (step 3)
- [ ] **Custom fields live on Settings** (step 4)
- [ ] **Two places at once** (step 5)
- [ ] **Claude** (step 6). (The connector may need reconnecting to see `set_offer_weights`.)
- [ ] **iPhone** (step 7)

## Deployed

- [ ] Merged when the owner says so
- [ ] The deploy's smoke test passes
