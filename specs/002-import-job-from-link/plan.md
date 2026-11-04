# Implementation Plan: Import Job Details from a Posting Link

**Branch**: `002-import-job-from-link` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-import-job-from-link/spec.md`

## Summary

The "Add opportunity" form gets the job posting link as its first field, with a "Fill from link"
button. The button calls a new authenticated endpoint, `POST /imports`, which fetches the
posting server side with strict safety limits, extracts the details, and returns them. Nothing is
stored. The details come from the schema.org `JobPosting` data that Lever, Ashby, Workday, and
most careers pages publish, or from Greenhouse's public job-board API. The browser then fills
only the empty fields and says which fields it filled and which it kept. The endpoint runs in its
own Lambda with no database access, because it handles untrusted pages. Details and the
alternatives considered are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js 24 (Lambda `nodejs24.x`), as in feature 001

**Primary Dependencies**:
- **Existing**: React 19, TanStack Query, zod, AWS CDK v2 (see feature 001's plan)
- **New**: `htmlparser2` (API package only) to find JSON-LD scripts and turn description HTML
  into text (research §3)
- **Built in**: Node's `http`, `https`, `dns`, `net`, and `zlib` for the guarded fetcher
  (research §4)

**Storage**: None. The import result is returned to the browser and never stored (spec FR-017)

**Testing**:
- **Vitest unit tests**: the extractors, against synthetic fixture pages; the address guard; and
  the web fill rules
- **Vitest integration tests**: the fetcher, against a local HTTP server; and the route, through
  the handler
- **React Testing Library**: the form changes
- **Playwright**: `e2e/import-from-link.spec.ts`, against fixture postings served locally
- **Quality gates**: coverage at or above 80%, and Stryker with no surviving mutants, as for
  feature 001

**Target Platform**: Same as feature 001. The fetch runs in AWS Lambda in `us-east-1`, outside
any VPC

**Project Type**: Web application (React SPA, serverless API, CDK)

**Performance Goals**: A fill finishes, with details or a message, within 10 seconds for 95% of
links (SC-002). The fetch is capped at 10 s, and the Lambda timeout is 15 s

**Constraints**:
- Never reach non-public addresses (spec FR-010)
- At most 5 redirects; at most 2 MB of page
- Send nothing to third parties beyond the request to the posting's own site (spec FR-011)
- Don't log page content or full URLs (spec FR-017): logs record the host and the outcome code
  only

**Scale/Scope**: One user, a few fills a day. One new endpoint, one new Lambda, and changes to
one form

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | No change. An imported opportunity starts in Considering like any other. | PASS |
| II. History is never lost | Nothing new is stored or deleted. Saving still creates the first history entry. | PASS |
| III. Fast capture, progressive detail | The link is optional. Company and title stay the only required fields (FR-002). The fill makes capture faster (SC-001). | PASS |
| IV. Data privacy & ownership | Extraction is built in. The only outside request goes to the posting's own site (or Greenhouse's public API for a Greenhouse posting), which the owner asked for by pasting its link. Nothing goes to AI or analytics services. Nothing is stored, and logs keep only the host and the outcome. The endpoint needs the owner's sign-in. | PASS |
| V. Simplicity (YAGNI) | One endpoint and one adapter (Greenhouse); no headless browser, no queue, no cache. A second Lambda and one new dependency are justified under Complexity Tracking. | PASS (justified) |
| VI. Test the rules | The extractors, the address guard, the fetch limits, and the fill rules are pure or injectable functions with unit tests. Coverage and mutation gates apply unchanged. | PASS |
| VII. Automated quality gates | Same pipeline. A new `import` test tag selects this feature's tests. The deployed smoke test checks that `/imports` requires a token. | PASS |

**Post-design re-check (after Phase 1)**: PASS. The data model adds no stored entities, and
the contract adds one authenticated endpoint that doesn't change existing behavior. Saving goes
through the existing `POST /opportunities` unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/002-import-job-from-link/
├── plan.md              # This file
├── research.md          # Phase 0: what the sites publish, parsing, safe fetching, where it runs
├── data-model.md        # Phase 1: PostingDetails, the import outcomes, the fill rules
├── quickstart.md        # Phase 1: how to check the feature locally and deployed
├── contracts/
│   └── imports.openapi.yaml   # POST /imports
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
└── imports.ts               # zod: ImportRequest, PostingDetails, ImportErrorCode; the messages

packages/api/src/
├── import/
│   ├── addressGuard.ts      # is this IP public? (pure)
│   ├── fetchPage.ts         # guarded fetch: schemes, ports, DNS check, redirects, limits
│   ├── htmlToText.ts        # description HTML → plain text, with truncation
│   ├── jobPosting.ts        # find and map schema.org JobPosting from a page
│   ├── greenhouse.ts        # recognize Greenhouse links; map its public API's JSON
│   ├── format.ts            # pay, location, work arrangement, site name
│   └── importPosting.ts     # orchestrates: validate → fetch → extract → PostingDetails or error
├── routes/imports.ts        # POST /imports
├── importHandler.ts         # Lambda entry for ImportFunction (imports route only)
└── local/server.ts          # (changed) also serves /imports locally

packages/web/src/
├── features/import/
│   └── fillForm.ts          # fill empty fields only; report filled and kept fields (pure)
├── api/hooks.ts             # (changed) useImportPosting mutation
└── components/OpportunityForm.tsx   # (changed) link first in create mode, "Fill from link",
                                     #   status and error messages

packages/infra/lib/
└── api-stack.ts             # (changed) ImportFunction + POST /imports route, no table access

e2e/
├── import-from-link.spec.ts # @import
└── fixtures/postings/       # synthetic posting pages served during the test

scripts/test-tags.mjs        # (changed) the `import` tag and its source patterns
```

**Structure Decision**: The existing four-package monorepo. The shared package holds only the
request and response schemas, because the browser and the API both need them. Fetching and
parsing stay in the API package and never reach the browser bundle.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A second Lambda (`ImportFunction`) | It fetches untrusted links and parses untrusted HTML, so it gets no table access and no secrets (least privilege). | A route in the existing API Lambda would give that code read and write access to every opportunity. |
| The `htmlparser2` dependency | Descriptions are untrusted, often malformed HTML. A real parser decodes entities and handles broken markup safely. | Regular expressions mishandle nested and malformed markup. `jsdom` or `cheerio` are several times larger for no benefit here. |
| A Greenhouse adapter | Greenhouse, the most common hiring site, publishes no job data in its page (research §1). | Reading only `JobPosting` would fail every Greenhouse link, missing SC-003. |
