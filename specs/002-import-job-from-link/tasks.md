---

description: "Task list for importing job details from a posting link"
---

# Tasks: Import Job Details from a Posting Link

**Input**: Design documents from `specs/002-import-job-from-link/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/imports.openapi.yaml](./contracts/imports.openapi.yaml),
[quickstart.md](./quickstart.md)

**Tests**: Required. Constitution Principle VI requires automated tests for validation rules,
at least 80% coverage, and zero surviving mutants. Within each story, write the tests first and
see them fail.

**Organization**: Tasks are grouped by user story (spec.md US1–US3), so each story can be built
and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1, US2, US3)
- Paths are from the repository root. Packages: `packages/shared`, `packages/api`,
  `packages/web`, `packages/infra`; end-to-end tests in `e2e/`

## Conventions that apply to every task

- Tag every new test file with the feature tag (`// @module-tag import` for Vitest, a
  `test.describe(..., { tag: '@import' })` wrapper for Playwright). `npm run lint` checks it.
- Build handlers and fixtures inside each test, not at module load or in hooks, so Stryker links
  code to tests (feature 001 lesson; Stryker issue #6234).
- Fixture pages are synthetic, modeled on the shapes in research.md §1. Never copy a real
  posting's text.
- Logs from the import code record only the host and the outcome code, never the page or the
  full URL (spec FR-017).

---

## Phase 1: Setup

**Purpose**: The dependency and the test tag the rest of the work uses

- [X] T001 Add `htmlparser2` to `packages/api/package.json` with `npm install -w @jot/api htmlparser2@<version>`, choosing the newest release that is at least two weeks old (check `npm view htmlparser2 time --json`), pinned with `~`
- [X] T002 [P] Add the `import` tag to `scripts/test-tags.mjs`:
  - add `{ name: 'import', description: 'Filling the add form from a job posting link (feature 002)' }` to `TAGS`
  - add `'import'` to `E2E_FEATURES`
  - add `SOURCE_TAGS` entries before the catch-alls: `packages/shared/src/imports.ts` → `['import']`, `packages/api/src/import/**` → `['import']`, `packages/api/src/routes/imports.ts` → `['import']`, `packages/api/src/importHandler.ts` → `['import']`, `packages/web/src/features/import/**` → `['import']`
  - add `'import'` to the existing `OpportunityForm*` entry (`['capture', 'edit', 'import']`) and the `NewOpportunity.tsx` entry (`['capture', 'edit', 'import']`)
  - add the `import` row to the "Test tags" table in `README.md`

---

## Phase 2: Foundational (blocks every story)

**Purpose**: The shared request and response schemas, and the guarded fetcher every import uses

**⚠️ CRITICAL**: No story work starts until this phase is done

- [X] T003 [P] Write `packages/shared/tests/unit/imports.test.ts` for the schemas in T004. Check:
  - every limit, accepted at the limit and rejected one character over
  - `title` is required
  - `workArrangement` accepts only `REMOTE`, `HYBRID`, or `ONSITE`
  - `url` rejects `ftp:`, `javascript:`, and a URL over 2,000 characters
  - every code in `IMPORT_ERROR_CODES` has a message in `IMPORT_MESSAGES`
- [X] T004 Create `packages/shared/src/imports.ts` and export it from `packages/shared/src/index.ts`:
  - `ImportRequestSchema`: `url`, "A valid `http` or `https` URL (the same rule as the opportunity's `postingUrl`), and at most 2,000 characters"
  - `PostingDetailsSchema`, strict, with these fields (data-model.md):
    - `company`: optional, "At most 200 characters"
    - `title`: "Required in a success … At most 200 characters"
    - `description`: optional, "Plain text. At most 20,000 characters"
    - `descriptionTruncated`: optional boolean
    - `location`: optional, "At most 200 characters"
    - `workArrangement`: optional, `REMOTE` | `HYBRID` | `ONSITE` (reuse `WORK_ARRANGEMENTS`)
    - `compensation`: optional, "At most 500 characters"
    - `source`: required, at most 200 characters
  - `IMPORT_ERROR_CODES = ['SIGN_IN_REQUIRED', 'NO_JOB_DETAILS', 'MULTIPLE_JOBS', 'UNREACHABLE', 'URL_NOT_ALLOWED'] as const`
  - `IMPORT_MESSAGES`, holding the exact texts from research.md §4
- [X] T005 [P] Write `packages/api/tests/unit/import/addressGuard.test.ts`:
  - `isPublicAddress` returns `false` for every range in research.md §4: `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.1.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `224.0.0.1`, `255.255.255.255`, `::1`, `fc00::1`, `fd12::1`, `fe80::1`, `::ffff:127.0.0.1`, and `::ffff:10.0.0.1`
  - it returns `true` for public addresses: `8.8.8.8`, `172.15.0.1`, `172.32.0.1`, `100.63.255.255`, and `2606:4700::1111`
  - it returns `false` for a string that isn't an IP address
- [X] T006 Implement `packages/api/src/import/addressGuard.ts` (`isPublicAddress(ip: string): boolean`) with `node:net`'s `BlockList`, covering every range in research.md §4. Make T005 pass
- [X] T007 [P] Write `packages/api/tests/integration/fetchPage.test.ts` against a local `node:http` server started inside each test, with an injected `isAllowedAddress` that permits `127.0.0.1`:
  - returns the body and the final URL for `text/html`, and for `application/json` when JSON is asked for
  - follows up to 5 redirects; the sixth is `UNREACHABLE`
  - checks the address on every redirect hop: a redirect to a refused address is `URL_NOT_ALLOWED`
  - decompresses `gzip`, `deflate`, and `br`
  - more than 2 MB after decompression is `UNREACHABLE`, without reading the rest
  - no response within the time limit (inject a short one) is `UNREACHABLE`
  - a non-HTML content type is `UNREACHABLE`
  - connection refused or a DNS failure is `UNREACHABLE`
  - sends the tracker's `User-Agent` and `Accept-Language: en`
  - rejects `ftp:`, credentials in the URL, and ports other than the default, 80, 443, 8080, and 8443 with `URL_NOT_ALLOWED`, before connecting
  - with the default (production) address check, `http://127.0.0.1:<port>` is `URL_NOT_ALLOWED`
- [X] T008 Implement `packages/api/src/import/fetchPage.ts`:
  - `fetchPage(url, { accept: 'html' | 'json', timeoutMs = 10_000, maxBytes = 2_000_000, isAllowedAddress = isPublicAddress })`
  - returns `{ status, finalUrl, body }`, or throws an `ImportFailure(code)`
  - use `node:http`/`node:https` with a custom `lookup` that resolves with `node:dns` and refuses any address `isAllowedAddress` rejects; IP-literal hosts go through the same check
  - follow redirects by hand (at most 5), checking the scheme, port, and address on each hop
  - one deadline for the whole fetch; stop reading at `maxBytes`; decompress with `node:zlib`
  - HTTP status codes are returned for the caller to classify, except for redirects
  - log only the host and the outcome
  - make T007 pass

**Checkpoint**: The schemas and the guarded fetcher work and are tested

---

## Phase 3: User Story 1 - Fill the form from a posting link (Priority: P1) 🎯 MVP

**Goal**: Paste a link at the top of "Add opportunity", choose "Fill from link", and the form
fills with the posting's details, without saving (spec US1, FR-001, FR-003, FR-005–FR-008,
FR-011, FR-015, FR-016)

**Independent Test**: With a fixture posting served locally, fill from its link and see the
company, title, and description in the form. Save, and the opportunity has those values and the
link (quickstart.md, local steps 1–2)

### Tests for User Story 1

- [X] T009 [P] [US1] Write synthetic fixture pages in `packages/api/tests/fixtures/postings/`:
  - `lever.html`: `JobPosting` with `hiringOrganization` and `jobLocation.address`
  - `ashby.html`: `baseSalary` with `minValue`/`maxValue`/`unitText: YEAR` in EUR, and `jobLocationType: TELECOMMUTE`
  - `workday.html`: a company with a legal-entity prefix; `addressLocality` holding the whole location
  - `graph.html`: `JobPosting` inside an `@graph`, with `@type` as an array
  - `array.html`: a top-level JSON-LD array, plus one malformed JSON-LD script that must be skipped
  - `greenhouse.json`: the Job Board API shape, with doubly escaped `content`, `pay_input_ranges` in cents, and the "Location Type" metadata
  - descriptions containing paragraphs, `<br>`, nested lists, entities, `<script>`, and `<style>`
- [X] T010 [P] [US1] Write `packages/api/tests/unit/import/htmlToText.test.ts`:
  - paragraphs are separated by a blank line, and `<br>` starts a new line
  - list items start with "• "
  - entities are decoded, and `script`/`style` content is dropped
  - runs of whitespace collapse, and there are no leading or trailing blank lines
  - text longer than 20,000 characters is cut at a word boundary to at most 20,000, with `truncated: true`
  - text at exactly 20,000 characters is kept whole, with `truncated: false`
- [X] T011 [P] [US1] Write `packages/api/tests/unit/import/format.test.ts`:
  - **pay**: `formatPay` gives "$150,000–$180,000 a year" (USD, min–max, `YEAR`), "€110,000–€185,000 a year", "$45 an hour" (a single `value`, `HOUR`), "a month", "a week", and "a day"; no unit leaves the unit off; no amount gives `undefined`
  - **location**: `formatLocation` joins the locality, region, and country with ", ", skips empty parts, joins distinct places with "; ", and caps the result at 200 characters
  - **work arrangement**: `workArrangementFrom` gives `REMOTE` for `TELECOMMUTE`, `HYBRID` and `ONSITE` from text that clearly says "hybrid", "on-site", "onsite", or "in office", and `undefined` otherwise
  - **site name**: `siteName` gives each known host in research.md §2, including subdomains (`job-boards.greenhouse.io`, `nvidia.wd5.myworkdayjobs.com`), and otherwise the host without `www.`
- [X] T012 [P] [US1] Write `packages/api/tests/unit/import/jobPosting.test.ts`:
  - `extractJobPostings(html)` finds the `JobPosting` in each fixture from T009
  - `mapJobPosting` gives the expected `PostingDetails` for each: `company` from an object or a string `hiringOrganization`, plus `title`, `description`, `location`, `workArrangement`, `compensation`, and `source`
  - empty strings are treated as missing
  - every field is capped at its data-model.md limit
- [X] T013 [P] [US1] Write `packages/api/tests/unit/import/greenhouse.test.ts`:
  - `greenhouseApiUrl` recognizes `job-boards.greenhouse.io/{board}/jobs/{id}` and `boards.greenhouse.io/{board}/jobs/{id}` (with or without a query string), and returns `https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?pay_transparency=true`
  - it returns `undefined` for other links, including `?gh_jid=` links on company sites
  - `mapGreenhouse(json)` gives the expected `PostingDetails` from `greenhouse.json`, with `source` "Greenhouse"
- [X] T014 [P] [US1] Write `packages/api/tests/unit/import/importPosting.test.ts` with an injected fake `fetchPage`:
  - a `JobPosting` page gives its details
  - a Greenhouse link fetches the API URL as JSON, not the page
  - the result always passes `PostingDetailsSchema`
- [X] T015 [P] [US1] Write `packages/api/tests/integration/imports.test.ts`. Through `createHandler`, with a local fixture server allowed by config:
  - `POST /imports` with a fixture link returns 200 and the details
  - a body without `url` returns 400 `VALIDATION_ERROR`
  - nothing can be written: the import handler has no table at all (it needs only `APP_ENV`)
- [X] T016 [P] [US1] Write `packages/web/tests/import-fill.test.tsx`:
  - **fillForm**: fills each empty mapped field and lists it in `filled`; never changes `postingUrl`, interest, contact, follow-up date, or notes
  - **the add form**:
    - the link field is the first field, with "Fill from link" beside it
    - choosing it sends `POST /imports` with the link
    - while the request is in flight the button reads "Filling…" and is disabled, and Save stays enabled
    - afterwards the fields show the details, "More details" is open when a detail inside it was filled, and a status message lists the filled fields and the shortened description when `descriptionTruncated`
    - saving sends exactly the form's values
    - no request is made to `POST /opportunities` until Save is chosen
- [X] T017 [P] [US1] Write `e2e/import-from-link.spec.ts` (`@import`, with the fill scenario also `@responsive`):
  - fill from a fixture posting served locally; the company, title, description, location, and pay appear
  - the success message lists the filled fields
  - save, then reload the detail page; the values and the link are kept

### Implementation for User Story 1

- [X] T018 [P] [US1] Implement `packages/api/src/import/htmlToText.ts` with `htmlparser2`'s `Parser` (research.md §3). Make T010 pass
- [X] T019 [P] [US1] Implement `packages/api/src/import/format.ts` (`formatPay` with `Intl.NumberFormat` and no decimals, `formatLocation`, `workArrangementFrom`, `siteName` with the known-host list). Make T011 pass
- [X] T020 [US1] Implement `packages/api/src/import/jobPosting.ts`:
  - `extractJobPostings` finds every `application/ld+json` script with `htmlparser2`, parses each with `JSON.parse` in a try/catch, and flattens arrays and `@graph`
  - `mapJobPosting` uses `htmlToText` and `format`
  - make T012 pass
- [X] T021 [P] [US1] Implement `packages/api/src/import/greenhouse.ts` (`greenhouseApiUrl`, `mapGreenhouse`: unescape `content` once, then `htmlToText`). Make T013 pass
- [X] T022 [US1] Implement `packages/api/src/import/importPosting.ts` (`importPosting(url, deps)`):
  1. validate the request
  2. use the Greenhouse API URL if there is one, otherwise the page
  3. fetch with `fetchPage`
  4. extract and map the details
  5. return `PostingDetails`, parsed through the schema
  Make T014 pass
- [X] T023 [US1] Add `IMPORT_ALLOW_LOCAL_HOSTS` to `packages/api/src/config.ts`: a comma-separated list of `host:port` values allowed despite the address guard, honored only when `APP_ENV` is `local` and ignored in AWS. Add unit tests to `packages/api/tests/unit/config.test.ts`
- [X] T024 [US1] Implement `packages/api/src/routes/imports.ts` (`POST /imports`):
  - validate with `ImportRequestSchema`
  - call `importPosting`, and return 200 with the details, or 422 with `{ code, message }` from `IMPORT_MESSAGES` for an `ImportFailure`
  Create `packages/api/src/importHandler.ts` (the Lambda entry serving only the imports route), and add the route to the local server in `packages/api/src/local/server.ts` and to `createHandler`'s local mode. Make T015 pass
- [X] T025 [US1] Add `useImportPosting()` to `packages/web/src/api/hooks.ts`: a mutation that posts to `/imports` and parses the result with `PostingDetailsSchema`
- [X] T026 [P] [US1] Implement `packages/web/src/features/import/fillForm.ts` (`fillForm(values: FormValues, details: PostingDetails): { values, filled: (keyof FormValues)[], kept: (keyof FormValues)[] }`), following the rules in data-model.md
- [X] T027 [US1] Change `packages/web/src/components/OpportunityForm.tsx` in create mode only:
  - move the job posting link out of "More details" to be the first field
  - add the "Fill from link" button: disabled while the link is empty or a fill is running, reading "Filling…" while it runs
  - apply `fillForm`, open "More details" when a filled field is inside it, and show a `role="status"` message listing the filled fields, plus "The description was shortened to fit." when truncated
  Keep edit mode's layout unchanged. Wire the mutation from `packages/web/src/pages/NewOpportunity.tsx`. Make T016 pass
- [X] T028 [US1] Add `ImportFunction` to `packages/infra/lib/api-stack.ts`:
  - `NodejsFunction` for `packages/api/src/importHandler.ts`, Node 24, ARM, 256 MB, 15 s timeout, one-month log retention, `APP_ENV=aws`
  - **no** table grant and no other permissions
  - an explicit `POST /imports` route with the same JWT authorizer
  Add tests to `packages/infra/tests/stacks.test.ts`:
  - the function's role has no DynamoDB statement
  - the route exists with the authorizer
  - the main API route is unchanged
- [X] T029 [US1] Serve the fixture postings for Playwright:
  - add a small static server, `e2e/fixtures/posting-server.mjs`, on port 5175, serving `e2e/fixtures/postings/`, as a second `webServer` entry in `playwright.config.ts`
  - pass `IMPORT_ALLOW_LOCAL_HOSTS=localhost:5175,127.0.0.1:5175` to the e2e API
  Make T017 pass

**Checkpoint**: US1 works on its own. Filling from a readable link fills the form, and saving
works as before

---

## Phase 4: User Story 2 - Keep what I typed, and fail clearly (Priority: P1)

**Goal**: A fill never overwrites typed values, and every failure says why, leaving the form
unchanged (spec US2, FR-004, FR-009, FR-010, FR-012–FR-014)

**Independent Test**: Type a company, fill from a posting for another company, and the typed
name stays. A LinkedIn link, a page with no job data, and a local address each show their
message, and the form is unchanged (quickstart.md, local steps 3–4)

### Tests for User Story 2

- [X] T030 [P] [US2] Add failure-classification cases to `packages/api/tests/unit/import/importPosting.test.ts`:
  - **`SIGN_IN_REQUIRED`**: a `linkedin.com` host (no fetch made), HTTP 401, 403, 407, 429, and 999, and a final URL with `login`, `signin`, or `authwall` in its path
  - **`NO_JOB_DETAILS`**: no `JobPosting`, or a `JobPosting` without a title
  - **`MULTIPLE_JOBS`**: two `JobPosting` objects
  - **`UNREACHABLE`**: HTTP 404, 500, and 503, and fetch failures passed through
  - **`URL_NOT_ALLOWED`**: passed through from `fetchPage`
- [X] T031 [P] [US2] Add to `packages/api/tests/integration/imports.test.ts`: each failure returns 422 with the matching code and the exact message from `IMPORT_MESSAGES`, and a private address in production config returns `URL_NOT_ALLOWED`
- [X] T032 [P] [US2] Add to `packages/web/tests/import-fill.test.tsx`:
  - **fillForm**: a typed value that differs from the posting's is kept and listed in `kept`; the same value is in neither list; filling twice only fills fields still empty
  - **the form**:
    - the status message names the kept fields ("Kept what you typed for: Company")
    - each 422 code shows its message in a `role="alert"` and leaves every field unchanged
    - an invalid link shows "Must be an http or https link" without a request
    - after a failure, the button can be used again
- [X] T033 [P] [US2] Add to `e2e/import-from-link.spec.ts`:
  - a typed company is kept
  - a fixture page with no job data shows "No job details were found…"
  - a fixture page with two postings shows "That page lists several jobs…"
  - `http://localhost:3101/health` (not allowed) shows "That link can't be used…"
  - in every case, the form keeps its values

### Implementation for User Story 2

- [X] T034 [US2] Add the failure classification from research.md §4 to `packages/api/src/import/importPosting.ts`, and the kept rule to `packages/web/src/features/import/fillForm.ts`. Make T030 and the fillForm cases in T032 pass
- [X] T035 [US2] Show the outcomes in `packages/web/src/components/OpportunityForm.tsx`:
  - kept fields in the status message
  - errors in a `role="alert"` using the server's `message`
  - check the link with the form's existing link rule before sending
  Make T031–T033 pass

**Checkpoint**: US1 and US2 work. Typed values are safe, and every failure has a message

---

## Phase 5: User Story 3 - Adding without a link is unchanged (Priority: P1)

**Goal**: Fast capture is untouched. The link is optional, and saving with only a company and
title works as before, including the duplicate warning (spec US3, FR-002, FR-015, SC-006)

**Independent Test**: Add an opportunity with only a company and title and an empty link; it
saves as before (quickstart.md, local step 5)

### Tests for User Story 3

- [X] T036 [P] [US3] Add to `packages/web/tests/import-fill.test.tsx`:
  - with an empty link, "Fill from link" is disabled, and saving with only a company and title posts exactly `{ company, title, interest: null }` as today
  - after a fill whose company and title match an open opportunity, saving shows the existing duplicate warning
- [X] T037 [P] [US3] Add to `e2e/import-from-link.spec.ts`: add with only a company and title, link empty, and it saves in Considering. Confirm `e2e/us1-capture.spec.ts` still passes unchanged

### Implementation for User Story 3

- [X] T038 [US3] Fix anything T036–T037 find in `packages/web/src/components/OpportunityForm.tsx` or `packages/web/src/pages/NewOpportunity.tsx`, so the form's validation and submit path are the same with or without a fill

**Checkpoint**: All three stories work, and feature 001's add flow is unchanged

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T039 [P] Add a check to `e2e/deployed-smoke.spec.ts`: `POST <api>/imports` without a token returns 401
- [X] T040 [P] Extend `e2e/accessibility.spec.ts` (`@import`): axe passes on the add form after a successful fill and after a failed one, and the link field and "Fill from link" button meet the 44 px touch-target check on phones
- [X] T041 [P] Update `README.md`:
  - the architecture diagram and summary, with the import Lambda and why it has no table access
  - a short "Fill from link" section listing which sites work (research.md §1) and which don't (LinkedIn, Greenhouse boards embedded on company sites)
- [X] T042 [P] Update `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml` to reference the `/imports` contract, and confirm the coverage and mutation exclusions in `specs/001-job-opportunity-tracker/plan.md` still apply. `importHandler.ts` is a thin entry point; list it there if it isn't fully covered
- [X] T043 Security review of the import path:
  - try each blocked address class against the running local API with production config (`IMPORT_ALLOW_LOCAL_HOSTS` unset), and confirm the 422 `URL_NOT_ALLOWED`
  - confirm the ImportFunction role in the synthesized template has only CloudWatch Logs permissions
  - confirm logs contain no page content or full URLs
- [X] T044 Run `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, and `npm run test:mutation`. Fix every surviving mutant by adding a test or removing equivalent code
- [X] T045 Create `specs/002-import-job-from-link/checklists/validation.md` with:
  - the automated results
  - the deployed checks to do by hand: one real posting each from Lever, Ashby, Workday, and Greenhouse, and a LinkedIn link
  - the SC-001 timing (under 30 seconds from paste to save) and SC-003 (the company, title, and description correct)
- [X] T046 Open a PR from `002-import-job-from-link` to `master` with `gh pr create`, linking the spec. Merge only after `changes`, `ci`, `e2e`, and `mutation` pass. Confirm the deploy and its smoke test pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: After Setup; blocks every story. T004 before anything that imports
  the schemas; T006 before T008
- **US1 (Phase 3)**: After Foundational. The MVP
- **US2 (Phase 4)**: After US1, because it extends `importPosting.ts`, `fillForm.ts`, and the
  form built in US1
- **US3 (Phase 5)**: After US1, because it checks that the form US1 changed still saves without
  a link. It can run alongside US2
- **Polish (Phase 6)**: After the stories

### Within Each User Story

- Tests first, failing; then the implementation that makes them pass
- In the API: `htmlToText` and `format`, then `jobPosting` and `greenhouse`, then
  `importPosting`, then the route and handler
- In the web app: `fillForm`, then the form

### Parallel Opportunities

- T002 alongside T001
- T003, T005, and T007 (tests in different packages) together
- In US1: T009–T017 (all tests) together; then T018, T019, T021, and T026 together
- US2 and US3 can be built at the same time once US1 is done
- T039–T042 together in Polish

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Fixture postings in packages/api/tests/fixtures/postings/"
Task: "htmlToText tests in packages/api/tests/unit/import/htmlToText.test.ts"
Task: "format tests in packages/api/tests/unit/import/format.test.ts"
Task: "fillForm and form tests in packages/web/tests/import-fill.test.tsx"

# Then the independent pieces, together:
Task: "htmlToText in packages/api/src/import/htmlToText.ts"
Task: "format in packages/api/src/import/format.ts"
Task: "greenhouse in packages/api/src/import/greenhouse.ts"
Task: "fillForm in packages/web/src/features/import/fillForm.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 and Phase 2: the schemas and the guarded fetcher
2. Phase 3: fill from a readable link
3. **Stop and check** with quickstart.md, local steps 1–2

### Incremental Delivery

1. US1: fill from a link, and the form and deploy pieces
2. US2: keep typed values and every failure message, which completes the safe behavior the
   spec requires
3. US3: confirm that capture without a link is unchanged
4. Polish, then one PR. The three stories are all P1 and ship together; US1 alone would fill
   forms but could overwrite typed values, which the spec forbids

---

## Notes

- Commit and push after each phase. Don't open the PR until Phase 6
- The constitution's quality gates apply: coverage at or above 80%, no surviving mutants, and
  every test tagged
