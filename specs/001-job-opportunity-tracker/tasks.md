---

description: "Task list for the Job Opportunity Tracker feature"
---

# Tasks: Job Opportunity Tracker

**Input**: Design documents from `specs/001-job-opportunity-tracker/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.openapi.yaml](./contracts/api.openapi.yaml),
[quickstart.md](./quickstart.md)

**Tests**: Included where Constitution Principle VI requires them: stage-change rules, field
validation, history recording, and the DynamoDB transactions that persist them. Key UI flows get
component tests. Each user story also has a **Playwright** end-to-end spec in `e2e/`, run on
desktop Chrome, with device-dependent scenarios tagged `@responsive` to also run on both phones
(research.md, combinatorial split). Write rule tests and the story's e2e spec first, and confirm they
fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be built and tested on its
own. Commit and push after each task or logical group, per the project's commit workflow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US4)

## Path Conventions

An npm-workspaces monorepo (see the plan.md Project Structure):
- `packages/shared` holds the pure domain rules
- `packages/api` holds the Lambda code
- `packages/web` holds the React SPA
- `packages/infra` holds the CDK app

---

## Phase 1: Setup — Dev Pipeline First (Constitution Principle VII)

**Purpose**: Build, lint, typecheck, test, and CI working on an empty skeleton before any feature
code is written.

- [X] T001 Create root `package.json`:
  - npm workspaces `packages/*`, `"engines": { "node": ">=24" }`, and `.nvmrc` containing `24`
  - Root scripts `build`, `lint`, `typecheck`, `test`, and `dev`, each delegating to the
    workspaces
  - Note: `dev` is wired in T030
- [X] T002 [P] Add `.gitattributes` (`* text=auto eol=lf`) and `.editorconfig` (LF, 2-space
  indent, UTF-8) at the repo root. Extend `.gitignore` with `node_modules/`, `dist/`,
  `cdk.out/`, `coverage/`, `.env*.local`, and `*.tsbuildinfo`
- [X] T003 [P] Create `tsconfig.base.json`:
  - `strict`, `ES2023`, `moduleResolution: bundler`, `composite: true`
  - Root `tsconfig.json` with project references to all four packages
- [X] T004 [P] Configure ESLint 9 in `eslint.config.js`:
  - flat config with typescript-eslint (type-checked) and eslint-plugin-react-hooks for
    `packages/web`
  - Prettier in `.prettierrc.json` and `.prettierignore`, with `eslint-config-prettier`
- [X] T005 [P] Scaffold `packages/shared`:
  - `package.json` (name `@jot/shared`, scripts `build`/`typecheck`/`test`/`lint`) and
    `tsconfig.json`
  - `src/index.ts` exporting nothing yet
  - a placeholder test in `tests/unit/smoke.test.ts`
- [X] T006 [P] Scaffold `packages/api`:
  - `package.json` (name `@jot/api`, depends on `@jot/shared`) and `tsconfig.json`
  - esbuild bundle script that writes `dist/handler.mjs` (ESM)
  - `src/handler.ts` returning 200 `{ ok: true }`
  - `tests/unit/smoke.test.ts`
- [X] T007 [P] Scaffold `packages/web`:
  - Vite + React 19 + TypeScript in `packages/web/` (`index.html`, `src/main.tsx`, `src/App.tsx`)
  - Vitest with jsdom and React Testing Library in `vite.config.ts`
  - `tests/App.test.tsx` rendering the app title
- [X] T008 [P] Scaffold `packages/infra`:
  - CDK v2 app in `packages/infra/` (`bin/app.ts`, `cdk.json`, `package.json` with `synth` and
    `deploy` scripts)
  - an empty `lib/` folder
  - `tests/smoke.test.ts` asserting that the app synthesizes
- [X] T009 Add a root `vitest.config.ts` with `test.projects: ['packages/*']` (Vitest 5 replaced
  workspace files with projects), then verify that
  `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass locally on the
  skeleton
- [X] T010 Create `.github/workflows/ci.yml`:
  - workflow `name: CI`
  - trigger on push and pull_request
  - Node 24 with npm cache
  - steps `npm ci` → `lint` → `typecheck` → `test` → `build`
  - job name `ci`
- [X] T011 Set up Playwright at the repo root:
  - add `@playwright/test` as a root devDependency
  - `playwright.config.ts` with `testDir: 'e2e'`, `baseURL` from `E2E_BASE_URL` (default
    `http://localhost:5173`), and `trace: 'retain-on-failure'`
  - projects `desktop-chromium` (`devices['Desktop Chrome']`), `mobile-webkit`
    (`devices['iPhone 14']`), and `mobile-chromium` (`devices['Pixel 7']`)
  - `webServer` runs `npm run dev -w @jot/web` (switched to the full stack in T030), reusing an
    existing server and skipped when `E2E_BASE_URL` is set
  - root script `test:e2e` (`playwright test --grep-invert @deployed`)
  - add `playwright-report/` and `test-results/` to `.gitignore`
  - `e2e/smoke.spec.ts` asserting that the app title renders
- [X] T012 Add an `e2e` job to `.github/workflows/ci.yml`:
  - runs in parallel with `ci`
  - `npm ci`, then `npx playwright install --with-deps`, then `npm run test:e2e`
  - uploads `playwright-report/` as an artifact when a test fails
- [X] T013 [P] Create `README.md`: project summary, prerequisites (Node 24, Docker Desktop), and
  the command table from [quickstart.md](./quickstart.md) "Daily commands"
- [X] T014 Push the branch and confirm the `ci` and `e2e` jobs pass on GitHub (run 39034810180:
  both green). Branch protection was attempted but isn't available on a private repo with
  GitHub Free (HTTP 403). The owner chose to enforce the merge gate by process instead: merge
  only through a PR after both checks pass, recorded in plan.md Complexity Tracking
- [X] T015 Add the coverage gate (Constitution v1.1.0, Principle VI):
  - `@vitest/coverage-v8`, configured in the root `vitest.config.ts`
  - `include` covers `packages/*/src/**` and `packages/infra/lib/**`; `exclude` covers
    `packages/web/src/main.tsx`
  - thresholds of 80 for lines, branches, functions, and statements
  - root script `test:coverage`; the `ci` job runs it instead of `npm test`
- [X] T016 Add mutation testing (Constitution v1.1.0, Principle VI):
  - `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, and
    `@stryker-mutator/typescript-checker` in `stryker.config.json`
  - the `mutate` scope matches coverage
  - `coverageAnalysis: perTest`, `thresholds.break: 100`, incremental file
    `reports/stryker-incremental.json`
  - root script `test:mutation`
  - pin `vitest` and `@vitest/coverage-v8` to `~4.1.12` (stryker-js#6210, see research.md)
  - ignore `reports/` and `.stryker-tmp/` in git, ESLint, and Prettier
  - the first run found two surviving mutants (an untested `content-type` header), fixed in
    `packages/api/tests/unit/smoke.test.ts`
- [X] T017 Add a `mutation` job to `.github/workflows/ci.yml`: it caches the incremental file
  with `actions/cache`, runs `npm run test:mutation`, and always uploads `reports/mutation/` as
  an artifact. Merging now requires `ci`, `e2e`, and `mutation` to pass

**Checkpoint**: The pipeline is green on an empty skeleton, including the 80% coverage gate and
zero surviving mutants. Every later commit is checked by CI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain rules, data access, API plumbing, local dev, web shell, and cloud deployment
that every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Shared domain (tests first)

- [X] T018 [P] Write unit tests for the stage definitions in
  `packages/shared/tests/unit/stages.test.ts`:
  - the 10 stages in this display order: `CONSIDERING, APPLIED, CONTACTED, INTERVIEWING, OFFER`
    (open), then `ACCEPTED, DECLINED, REJECTED, NO_LONGER_AVAILABLE, WITHDRAWN, NO_RESPONSE`
    (outcome; `NO_LONGER_AVAILABLE` added by T097)
  - `isOutcome()`
  - `statusForStage()` returns `CLOSED` for outcome stages, otherwise `OPEN`
- [X] T019 Implement `packages/shared/src/stages.ts`: the `Stage` union, `STAGES` (ordered, with
  category and display label), `OPEN_STAGES`, `OUTCOME_STAGES`, `isOutcome()`, and
  `statusForStage()`. Make T018 pass
- [X] T020 [P] Write unit tests for the schemas in `packages/shared/tests/unit/schemas.test.ts`.
  Cover every constraint from data-model.md:
  - `company` and `title`: "Trimmed, 1–200 characters", required
  - `description` and `notes`: "Up to 20,000 characters, line breaks kept"
  - `interest`: "integer 1–5 or null"
  - `postingUrl`: "Must be `http` or `https`"
  - `location` and `source`: up to 200 characters
  - `compensation`: up to 500 characters
  - `workArrangement`: "`ONSITE`, `HYBRID`, `REMOTE`"
  - `followUpDate`: YYYY-MM-DD or null
  - contact `name` and `role`: up to 200 characters; `email`: "Valid email format if given";
    `phone`: up to 50 characters
  - a contact with every field empty is treated as absent
  - stage-change `note`: up to 2,000 characters
  - the patch schema rejects an empty `company` or `title`
- [X] T021 Implement `packages/shared/src/schemas.ts`: zod schemas `OpportunityInput`,
  `OpportunityPatch`, `Contact`, `StageChangeInput`, `Opportunity`, `StageChange`, and
  `OpportunityWithHistory`, matching
  [contracts/api.openapi.yaml](./contracts/api.openapi.yaml), plus inferred TypeScript types.
  Make T020 pass
- [X] T022 Export the stages and schemas from `packages/shared/src/index.ts`

### API plumbing

- [X] T023 [P] Create `packages/api/src/config.ts`: read `TABLE_NAME`, `APP_ENV`
  (`local` or `aws`), `DYNAMO_ENDPOINT` (local only), and `AWS_REGION`, failing fast on
  missing values
- [X] T024 [P] Create `packages/api/src/http.ts`:
  - JSON response helpers
  - an `ApiError` class with codes `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT`
    (409), `SAME_STAGE`/`FUTURE_DATE` (422), and `UNAUTHORIZED` (401)
  - mapping from zod errors to `{ code, message, fields }`
  - structured JSON logging of errors to `console.error`
- [X] T025 Create `packages/api/src/router.ts` and update `packages/api/src/handler.ts`:
  - a small method + path router for API Gateway HTTP API v2 events
  - read the caller's identity from `event.requestContext.authorizer.jwt.claims.sub`, or use the
    fixed dev user when `APP_ENV=local`
  - unknown route → 404
  - add unit tests in `packages/api/tests/unit/router.test.ts`
- [X] T026 [P] Create `packages/api/src/repo/client.ts`, a DynamoDB Document Client that uses
  `DYNAMO_ENDPOINT` when it is set. Create `packages/api/src/repo/keys.ts` with key builders per
  data-model.md:
  - opportunity: `PK=OPP#<id>`, `SK=OPP`, `GSI1PK=STATUS#OPEN|STATUS#CLOSED`,
    `GSI1SK=<lastStageChangeAt>#<id>`
  - stage change: `SK=CHANGE#<seq zero-padded to 6>`
- [X] T027 Set up DynamoDB Local:
  - create `docker-compose.yml` with `amazon/dynamodb-local` on port 8000
  - create `scripts/ensure-dynamodb-local.mjs`: if `http://localhost:8000` already responds, do
    nothing; otherwise run `docker compose up -d` and wait until it responds (30 s timeout, with
    a clear error if Docker isn't running)
  - create `packages/api/scripts/create-local-table.ts`, which creates the `JobTracker` table
    with PK/SK and GSI1 (GSI1PK/GSI1SK) and does nothing if the table already exists
- [X] T028 Create `packages/api/tests/integration/setup.ts`. Vitest global setup that:
  - runs `scripts/ensure-dynamodb-local.mjs`, so `npm test` starts DynamoDB Local when needed,
    both locally and in CI (Docker is available on GitHub's `ubuntu-latest` runners, so no
    service container is used)
  - creates a uniquely named table for each test run
  - deletes the table on teardown
  - tags integration tests so `npm test` runs them
- [X] T029 Create `packages/api/src/local-server.ts`: a Node `http` server on `:3001` that turns
  requests into HTTP API v2 events, calls `handler`, adds CORS for `http://localhost:5173`, and
  sets `APP_ENV=local`
- [X] T030 Wire the root `npm run dev` script (with `concurrently`) to do these in order:
  1. `node scripts/ensure-dynamodb-local.mjs`
  2. the create-local-table script
  3. the API local server
  4. `vite` for `packages/web`

  Document it in `README.md`. Switch the `webServer` in `playwright.config.ts` to `npm run dev`
  (full stack). The `e2e` CI job needs no service container, because `npm run dev` starts
  DynamoDB Local itself
- [X] T031 Create the Playwright fixtures:
  - add a `POST /__test/reset` route to `packages/api/src/local-server.ts` only (never in the
    Lambda handler; only when `APP_ENV=local`) that deletes all items from the local table
  - create `e2e/fixtures.ts`: an auto fixture that calls the reset before each test (retrying
    while the local API starts; skipped against a deployed site)
  - set `workers: 1` in `playwright.config.ts`, because tests share one local table
  - the page helpers (`addOpportunity`, `openOpportunity`, `seedOpportunities`, `moveTo`) are
    written with the UI they drive, in the US1 and US2 Playwright tasks, so they use real labels

### Web shell

- [X] T032 Create the runtime config and auth:
  - `packages/web/src/config.ts`: `loadConfig()` returns
    `{ appEnv, apiUrl, cognitoAuthority, cognitoClientId, redirectUri }`
  - when `import.meta.env.VITE_APP_ENV === 'local'`, build it from `VITE_*` variables
    (`VITE_API_URL=http://localhost:3001`); otherwise fetch `/config.json` at startup, which is
    written by the web-content stack (T039)
  - `packages/web/src/main.tsx` awaits `loadConfig()` before rendering and provides it through
    a `ConfigContext`
  - `packages/web/src/auth/AuthProvider.tsx`: `react-oidc-context` configured from that config,
    authorization code + PKCE
  - when `appEnv` is `local`, skip sign-in and provide a fixed dev user
  - export a `useAccessToken()` hook
- [X] T033 Create `packages/web/src/api/client.ts`, a typed fetch wrapper that:
  - uses `apiUrl` from `ConfigContext` and adds the Bearer token
  - parses the `{ code, message, fields }` errors into a typed `ApiError`
  - validates responses with `@jot/shared` schemas
  - add a TanStack Query `QueryClientProvider` in `packages/web/src/main.tsx`
- [X] T034 Create `packages/web/src/App.tsx` and `packages/web/src/components/Layout.tsx`:
  - React Router routes `/` (Overview), `/archive`, `/opportunities/new`,
    `/opportunities/:id`, and `/export`, with placeholder pages (`/export` removed with US5)
  - a mobile-first layout with a header and nav, collapsing to a bottom nav below 640 px
  - global styles in `packages/web/src/styles/global.css`, with tokens for spacing, colors, and
    a breakpoint at 1024 px

### Cloud infrastructure & deployment (Constitution Principle VII)

- [X] T035 [P] Create `packages/infra/lib/data-stack.ts`:
  - DynamoDB table `JobTracker` with PK/SK (strings) and GSI1 (GSI1PK/GSI1SK, projection ALL)
  - `PAY_PER_REQUEST` billing, `pointInTimeRecoverySpecification` enabled
  - `RemovalPolicy.RETAIN`
- [X] T036 [P] Create `packages/infra/lib/web-distribution-stack.ts`:
  - a private S3 site bucket (block all public access)
  - a CloudFront distribution with Origin Access Control and HTTPS redirect
  - SPA fallback: 403/404 → `/index.html` with status 200
  - export the bucket, the distribution, and its domain
  - **no** dependency on the auth or API stacks, which breaks the stack cycle
- [X] T037 Create `packages/infra/lib/auth-stack.ts`:
  - a Cognito user pool with `selfSignUpEnabled: false` and email sign-in
  - a managed-login domain
  - a public app client using the authorization-code grant with PKCE, with callback and sign-out
    URLs for `https://<distribution domain>` (from T036) and `http://localhost:5173`
- [X] T038 Create `packages/infra/lib/api-stack.ts`:
  - a `NodejsFunction` from `packages/api/src/handler.ts` on the Node 24 runtime (fall back to
    22 if needed), 512 MB, 10 s timeout
  - grant the function read/write on the table only
  - an HTTP API with an `HttpJwtAuthorizer` (Cognito issuer and audience) on every route
  - CORS limited to `https://<distribution domain>` (from T036) and `http://localhost:5173`
  - output the API URL
- [X] T039 Create `packages/infra/lib/web-content-stack.ts`:
  - a `BucketDeployment` of `packages/web/dist` into the site bucket from T036
  - add `config.json` to the same deployment with `Source.jsonData('config.json', { appEnv: 'aws',
    apiUrl, cognitoAuthority, cognitoClientId, redirectUri })`, using values from the API and
    auth stacks
  - invalidate the distribution (`/*`) after each deploy
  - output the CloudFront URL
- [X] T040 [P] Add an AWS Budgets monthly cost budget (default $5, configurable) with an email
  alert at 80%, in `packages/infra/lib/budget-stack.ts`
- [X] T041 [P] Create `packages/infra/lib/ci-stack.ts`: a GitHub OIDC provider and an IAM role
  that only `repo:bosterkamp/job-opportunities:ref:refs/heads/master` can assume, with
  permission to run `cdk deploy`. Add an npm script `deploy:ci-role` that deploys only this
  stack
- [X] T042 Wire all stacks in `packages/infra/bin/app.ts` in this order: Data → WebDistribution
  → Auth → Api → WebContent. Budget and CI are independent. Add CDK assertion tests in
  `packages/infra/tests/stacks.test.ts`:
  - the whole app synthesizes with no cyclic references between stacks
  - point-in-time recovery is on and the table is retained
  - self sign-up is disabled
  - every route has the JWT authorizer
  - the bucket blocks public access
  - the content deployment includes `config.json` with all five keys
  - switch the `build` script in `packages/infra/package.json` from `tsc --build` to
    `cdk synth --quiet`. `cdk synth` fails while the app has no stacks, so Phase 1 only
    type-checks
- [X] T043 Create `.github/workflows/deploy.yml`:
  - runs on `workflow_run` of the workflow named `CI` (the `ci`, `e2e`, and `mutation` jobs), only for
    `master` and only when the whole workflow succeeds
  - assumes `${{ vars.AWS_DEPLOY_ROLE_ARN }}` through OIDC
  - runs `npm ci`, `npm run build`, and `cdk deploy --all --require-approval never`
- [X] T044 Run the one-time bootstrap from [quickstart.md](./quickstart.md) "First deployment"
  steps 1–3: `cdk bootstrap`, `deploy:ci-role`, and the `gh variable set` commands. The user
  runs this with their AWS admin profile. Record the outputs in `README.md` → "Deployment".
  This is the only manual infrastructure step, an accepted exception to Principle VII recorded
  in plan.md Complexity Tracking. After it, every deploy goes through `deploy.yml`

**Checkpoint**: The foundation is ready. `npm run dev` serves an empty app shell; CI is green; the
infrastructure synthesizes. User stories can begin.

---

## Phase 3: User Story 1 — Capture a new opportunity (Priority: P1) 🎯 MVP

**Goal**: Record an opportunity with only a company and title, or with every detail, and see it
saved.

**Independent Test**: Add an opportunity with only a company and title and another with every
field. Reload: both are saved exactly as entered, in Considering, with today's date added
(spec US1 scenarios 1–4).

### Tests for User Story 1

- [X] T045 [P] [US1] Write integration tests in
  `packages/api/tests/integration/create-opportunity.test.ts`. Test that:
  - `POST /opportunities` with only `company` and `title` returns 201 with
    `stage=CONSIDERING`, `status=OPEN`, `changeCount=1`, and history
    `[{ seq: 1, fromStage: null, toStage: CONSIDERING }]`
  - a missing or blank `company` or `title` → 400 `VALIDATION_ERROR`, with `fields` naming the
    field, and nothing written
  - every optional field round-trips through `GET /opportunities/{id}`
  - an unknown id → 404
- [X] T046 [P] [US1] Write a component test in `packages/web/tests/OpportunityForm.test.tsx`:
  - only Company and Job title are shown at first, with the rest under "More details"
  - an empty required field shows "Company is required" or "Job title is required" and does not
    submit
  - the star rating can be set and cleared, where cleared means not rated
- [X] T047 [P] [US1] Write the Playwright spec `e2e/us1-capture.spec.ts`, following
  [quickstart.md](./quickstart.md) step 1. First add these helpers to `e2e/fixtures.ts`:
  `addOpportunity(page, fields)`, `openOpportunity(page, company)`, and
  `seedOpportunities(request, n, overrides?)`, which creates opportunities directly through the
  local API. Then test:
  - add "Acme" / "Senior Engineer" with no other fields → it appears in Considering with
    today's date added
  - submitting with an empty Job title shows "Job title is required" and saves nothing
  - add a second opportunity with every field, including 4 stars → after `page.reload()`, every
    value is shown
  - the empty overview shows the add button

### Implementation for User Story 1

- [X] T048 [US1] Implement `createOpportunity` and `getOpportunityWithHistory` in
  `packages/api/src/repo/opportunityRepo.ts`:
  - **create**: `TransactWriteItems` putting the `OPP` item (condition
    `attribute_not_exists(PK)`) and `CHANGE#000001`, with `createdAt`, `updatedAt`, and
    `lastStageChangeAt` all set to now
  - **get**: Query `PK = OPP#<id>`, mapping the `OPP` item and the `CHANGE#` items, with
    history sorted by `changedAt` then `seq` (access patterns A3, A4)
- [X] T049 [US1] Implement the `POST /opportunities` and `GET /opportunities/{id}` routes in
  `packages/api/src/routes/opportunities.ts`, validating with `OpportunityInput`:
  - trim strings
  - treat an all-empty contact as absent
  - generate the ULID id
  - once the handler imports the AWS SDK, add a check to the real-bundle test in
    `packages/infra/tests/bundling.test.ts` that the bundle imports `@aws-sdk/client-dynamodb`
    from the runtime
- [X] T050 [US1] Implement `GET /opportunities?status=OPEN|CLOSED` (default `OPEN`) in
  `packages/api/src/routes/opportunities.ts` and `listByStatus` in
  `packages/api/src/repo/opportunityRepo.ts`: Query GSI1 with `GSI1PK = STATUS#<status>`,
  without history (access patterns A1, A2)
- [X] T051 [P] [US1] Create `packages/web/src/components/StarRating.tsx`: 1–5 selectable stars
  with a "clear" action. When unset, show "Not rated" (not zero stars). Keyboard and touch
  accessible, with `aria-label` "Interest: N of 5"
- [X] T052 [US1] Create `packages/web/src/components/OpportunityForm.tsx`:
  - required Company and Job title fields
  - a collapsible "More details" section: contact name/role/email/phone, job description
    (textarea, keeping line breaks), StarRating, posting URL, location, work arrangement
    select, compensation, source, follow-up date, notes
  - client-side validation with the `@jot/shared` schemas
- [X] T053 [US1] Create `packages/web/src/pages/NewOpportunity.tsx`, using the
  `useCreateOpportunity` mutation in `packages/web/src/api/hooks.ts`. When it succeeds, go to
  `/opportunities/:id`
- [X] T054 [US1] Create `packages/web/src/pages/OpportunityDetail.tsx`, using
  `useOpportunity(id)`. Show every field: the description with line breaks kept, "Not rated"
  when there's no interest, the date added, the current stage, and the history list
- [X] T055 [US1] Create a simple list on `packages/web/src/pages/Overview.tsx`, using
  `useOpportunities('OPEN')`. Show company, title, and stage, link each row to its detail page,
  and add an "Add opportunity" button. Include an empty state with an add button (spec edge
  case: empty states)

**Checkpoint**: The MVP works locally. Opportunities can be captured and viewed. Deployable via
`master`.

---

## Phase 4: User Story 2 — Move an opportunity through the pipeline (Priority: P1)

**Goal**: A one-action stage change with a note and an optional earlier date, recorded in the
history. Closing archives the opportunity; reopening restores it.

**Independent Test**: Move one opportunity through every stage to an outcome, then reopen it.
Check the current stage after each move and that each move appears in the history with its date
and note (spec US2 scenarios 1–5).

### Tests for User Story 2

- [X] T056 [P] [US2] Write unit tests in `packages/shared/tests/unit/transitions.test.ts` for
  `validateStageChange(current, input, now)`:
  - any stage → any other stage is allowed, including skipping stages and moving backward
  - `toStage == current` → `SAME_STAGE`
  - `changedAt` more than 1 minute after `now` → `FUTURE_DATE`
  - `changedAt` defaults to `now`
  - an outcome stage gives `CLOSED`, and outcome → open reopens with `OPEN`
  - `lastStageChangeAt` = the maximum `changedAt` across the existing history plus the new entry
- [X] T057 [P] [US2] Write integration tests in
  `packages/api/tests/integration/stage-change.test.ts`:
  - `POST /opportunities/{id}/stage-changes` updates the `OPP` item and writes `CHANGE#<n+1>` in
    one transaction
  - the response has the new stage and the history entry, including its note
  - a backdated `changedAt` is stored, the stage still becomes `toStage`, and `lastStageChangeAt`
    stays the latest date
  - a stale `expectedChangeCount` → 409 `CONFLICT`, with nothing written
  - `SAME_STAGE` and `FUTURE_DATE` → 422, with nothing written
  - an outcome stage moves the item to `GSI1PK=STATUS#CLOSED`; reopening moves it back to
    `STATUS#OPEN`
  - an unknown id → 404
- [X] T058 [P] [US2] Write the Playwright spec `e2e/us2-pipeline.spec.ts`, following
  [quickstart.md](./quickstart.md) step 2. First add `moveTo(page, stage, { note?, when? })` to
  `e2e/fixtures.ts`, using the visible "Move to…" control on both desktop and mobile. Then test:
  - move to Applied with a note and a date three days ago → the history shows that date and the
    note
  - move directly to Interviewing, then back to Contacted → both are allowed and recorded
  - move to Rejected → it leaves the overview and appears in the Archive
  - reopen to Applied → it is back in the overview, and the reopening is in the history
  - the current stage is not offered in "Move to…", and a future date is rejected
  - on mobile projects, "Move to…" opens as a bottom sheet

### Implementation for User Story 2

- [X] T059 [US2] Implement `packages/shared/src/transitions.ts` (`validateStageChange`,
  returning the new stage, status, `changedAt`, and `lastStageChangeAt`, or a rule error) and
  export it from `packages/shared/src/index.ts`. Make T056 pass
- [X] T060 [US2] Implement `changeStage` in `packages/api/src/repo/opportunityRepo.ts` (access
  pattern A5):
  - `TransactWriteItems` updating the `OPP` item's `stage`, `status`, `GSI1PK`, `GSI1SK`,
    `lastStageChangeAt`, `updatedAt`, and `changeCount = :n + 1`, with the condition
    `changeCount = :n`
  - put `CHANGE#<n+1>` with `fromStage`, `toStage`, `changedAt`, `note`, and
    `recordedAt = now`
  - turn a `ConditionalCheckFailed` cancellation into `CONFLICT`
- [X] T061 [US2] Implement the `POST /opportunities/{id}/stage-changes` route in
  `packages/api/src/routes/stageChanges.ts`: validate with `StageChangeInput` (`note` up to
  2,000 characters), load the current item, apply `validateStageChange`, call `changeStage`, and
  return `OpportunityWithHistory`. Make T057 pass
- [X] T062 [P] [US2] Create `packages/web/src/components/MoveStageMenu.tsx`:
  - a "Move to…" control listing every stage except the current one, grouped into open stages
    and outcomes
  - an optional note and an optional "When?" date-time that defaults to now and can't be in the
    future
  - a centered dialog on desktop (a popover ran off-screen; see the e2e check) and a bottom
    sheet below 640 px
  - add a component test in `packages/web/tests/MoveStageMenu.test.tsx`: the current stage is
    not offered, and a future date is blocked
- [X] T063 [US2] Add the `useChangeStage` mutation in `packages/web/src/api/hooks.ts`:
  - send `expectedChangeCount`
  - on success, invalidate the open list, the closed list, and the detail query
  - on 409, refetch and show "This opportunity changed. Please try again."
- [X] T064 [US2] Add `MoveStageMenu` and a history timeline (stage, date, note) to
  `packages/web/src/pages/OpportunityDetail.tsx`, and a MoveStageMenu on each row of
  `packages/web/src/pages/Overview.tsx`
- [X] T065 [US2] Create a minimal `packages/web/src/pages/Archive.tsx`, using
  `useOpportunities('CLOSED')`. Show company, title, and outcome stage, link each row to its
  detail page (where "Move to…" can reopen it), and include an empty state

**Checkpoint**: US1 and US2 work. The full pipeline and history are working.

---

## Phase 5: User Story 3 — See all opportunities and where they stand (Priority: P1)

**Goal**: A responsive overview organized by stage, with filtering, sorting, and search, plus a
complete archive.

**Independent Test**: With opportunities in several stages, each appears under the correct stage
with company, title, stars, and time since the last change. Filter, sort (unrated last), and
search work. Closed opportunities appear only in the archive (spec US3 scenarios 1–4).

### Tests for User Story 3

- [X] T066 [P] [US3] Write unit tests in `packages/web/tests/overviewModel.test.ts` for the pure
  helpers:
  - grouping by stage in display order
  - filtering by stage
  - sorting by interest (high to low, unrated last), date added, and time since last change
  - case-insensitive search on company and title
  - a "time since last change" label such as "3 days ago"
  - a dataset of 200 opportunities processed in under 50 ms (supports SC-004)
- [X] T067 [P] [US3] Write the Playwright spec `e2e/us3-overview.spec.ts`, following
  [quickstart.md](./quickstart.md) step 3. Set up opportunities in several stages through the
  fixtures, then check:
  - on `desktop-chromium`, there is one column per open stage with correct counts
  - on mobile projects, there are stage tabs, and selecting a tab shows only that stage's cards
  - the stage filter works
  - sorting by interest puts unrated opportunities last
  - search by company is case-insensitive
  - closed opportunities appear only in the Archive
  - each card shows company, title, stars, and the time since the last change
  - performance (SC-004), on `desktop-chromium` only: seed 200 opportunities with
    `seedOpportunities`, then navigate to `/`. The board shows all 200 cards within 1 s, and
    typing in search updates the results within 1 s

### Implementation for User Story 3

- [X] T068 [US3] Implement `packages/web/src/features/overview/overviewModel.ts`
  (`groupByStage`, `filterByStage`, `sortBy`, `search`, `sinceLabel`). Make T066 pass
- [X] T069 [P] [US3] Create `packages/web/src/components/OpportunityCard.tsx` showing company,
  job title, StarRating (read-only), and the time since the last change, with MoveStageMenu.
  The whole card links to the detail page
- [X] T070 [US3] Create `packages/web/src/components/StageBoard.tsx`:
  - at 1024 px and wider, one column per open stage with a count and an empty-column message
  - below 1024 px, stage tabs with counts and a card list for the selected stage
- [X] T071 [US3] Rebuild `packages/web/src/pages/Overview.tsx` with StageBoard and a toolbar for
  stage filter, sort select, and search box. Keep the toolbar state in the URL query string and
  keep the empty state
- [X] T072 [US3] Upgrade `packages/web/src/pages/Archive.tsx` to use OpportunityCard, show the
  outcome stage as a badge, and offer the same sort and search

**Checkpoint**: All P1 stories work. This is the core product.

---

## Phase 6: User Story 4 — Update details over time (Priority: P2)

**Goal**: Edit any field later. Follow-up dates highlight due opportunities. Duplicate warning on
create. Permanent delete with confirmation.

**Independent Test**: Edit each field on an existing opportunity and reload: all changes are
saved. Clearing the company or title is rejected. A follow-up date of today highlights the card
(spec US4 scenarios 1–3).

### Tests for User Story 4

- [X] T073 [P] [US4] Write unit tests in `packages/shared/tests/unit/duplicates.test.ts`:
  - matches an **open** opportunity with the same `company` and `title`, case-insensitive with
    whitespace collapsed
  - ignores closed opportunities
  - test `isFollowUpDue(followUpDate, today)`: true when the date is today or earlier
- [X] T074 [P] [US4] Write integration tests in
  `packages/api/tests/integration/edit-delete.test.ts`:
  - `PATCH /opportunities/{id}` updates only the given fields and `updatedAt`, and never changes
    `stage`, `status`, `changeCount`, or the history
  - an empty `company` or `title` → 400, with the original kept
  - `DELETE` without `X-Confirm-Delete: true` → 400
  - `DELETE` with the header removes the `OPP` item and every `CHANGE#` item
  - an unknown id → 404 for both
- [X] T075 [P] [US4] Write the Playwright spec `e2e/us4-edit.spec.ts`, following
  [quickstart.md](./quickstart.md) step 4:
  - change the stars from 3 to 5 → shown on the card and the detail page after a reload
  - set the follow-up date to today → the card shows the "Follow up" badge
  - clearing the company shows the required error, and the original value is kept
  - adding a duplicate shows the warning, and "Add anyway" creates it
  - "Delete permanently" requires typing the company name, and afterwards the opportunity is
    gone from both the overview and the Archive

### Implementation for User Story 4

- [X] T076 [US4] Implement `packages/shared/src/duplicates.ts` (`findPossibleDuplicate`,
  `isFollowUpDue`) and export it. Make T073 pass
- [X] T077 [US4] Implement `updateDetails` (access pattern A6: `UpdateItem` with condition
  `attribute_exists(PK)`, never touching the stage fields) and `deletePermanently` (access
  pattern A7: Query the partition, then delete in transactions of up to 100 items, which fail
  loudly instead of silently leaving items behind like a batch write can) in
  `packages/api/src/repo/opportunityRepo.ts`
- [X] T078 [US4] Implement the `PATCH /opportunities/{id}` (validated with `OpportunityPatch`)
  and `DELETE /opportunities/{id}` (requires `X-Confirm-Delete: true`) routes in
  `packages/api/src/routes/opportunities.ts`. Make T074 pass
- [X] T079 [US4] Add an Edit mode to `packages/web/src/pages/OpportunityDetail.tsx`:
  - reuse OpportunityForm, pre-filled, with the `useUpdateOpportunity` mutation in
    `packages/web/src/api/hooks.ts`
  - a "Delete permanently" action that opens a dialog requiring the user to type the company
    name, then sends `X-Confirm-Delete: true`
  - after deleting, go to `/`
- [X] T080 [US4] Show a duplicate warning in `packages/web/src/pages/NewOpportunity.tsx` using
  `findPossibleDuplicate` against the cached open list, with the choices "Open existing" and
  "Add anyway"
- [X] T081 [US4] Highlight cards whose follow-up is due (`isFollowUpDue`, where "today" is the
  browser's local date) in
  `packages/web/src/components/OpportunityCard.tsx`: a "Follow up" badge and an accent border.
  Show the follow-up date on the detail page

**Checkpoint**: All user stories work.

---

## Phase 7: User Story 5 — Export my data (removed)

Removed on 2026-10-18: export isn't needed (constitution 2.0.0 dropped the export requirement).
Tasks T082–T088 were deleted, and their IDs are not reused.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T089 [P] Do an accessibility pass across `packages/web/src/components/`: labeled form
  controls, visible focus, 44 px touch targets, color contrast AA, and dialog/bottom-sheet focus
  trapping
- [X] T090 [P] Add a loading skeleton, an error banner with retry, and an offline message for
  failed fetches in `packages/web/src/components/QueryState.tsx`, and use it on every page
- [X] T091 [P] Review every `// Stryker disable` comment in the codebase: each must name the
  mutator and give a reason that shows the mutant is equivalent. Remove any that a test could
  kill instead. Confirm that the coverage and mutation exclusions still match the list in
  plan.md
- [X] T092 Review the IAM security of `packages/infra/lib/*.ts`:
  - the Lambda role can only access the table and its index
  - the deploy role is limited to the repo and `master`
  - CloudFront uses HTTPS-only with security headers (HSTS, `X-Content-Type-Options`, CSP
    allowing only self, the API, and the Cognito domains)
- [X] T093 Write `e2e/deployed-smoke.spec.ts`, tagged `@deployed`, and run it in
  `.github/workflows/deploy.yml` after `cdk deploy`, with `E2E_BASE_URL` and `E2E_API_URL` read
  from the stack outputs. It checks that:
  - the CloudFront URL loads and redirects to the Cognito managed-login page
  - `GET <api>/opportunities` without a token returns 401
  - a CORS preflight (`OPTIONS <api>/opportunities` with `Origin: <site>`) returns 2xx with
    `access-control-allow-origin: <site>`, not 401. The first deploy shipped with preflights
    blocked by the authorizer, which local tests can't catch
  - a deep link like `/archive` loads (SPA fallback)
- [X] T094 Update `README.md` with an architecture summary (link to `research.md`), deployment
  steps, and how to create the Cognito user
- [ ] T095 (automated part done; the signed-in checks on desktop and phone are the owner's) Confirm that `npm run test:e2e` passes for all projects. Then check the deployed
  CloudFront URL by hand, signed in, on desktop and on a real phone, using
  [quickstart.md](./quickstart.md). Playwright covers local; the deployed check needs a real
  sign-in. Include the timing goals by hand: SC-001 (quick add under 30 s, full add under 2 min)
  and SC-002 (stage move under 10 s). Record the results in
  `specs/001-job-opportunity-tracker/checklists/validation.md`
- [X] T096 Open a PR from `001-job-opportunity-tracker` to `master` with `gh pr create`,
  summarizing the stories delivered and linking the spec. Merge once `ci`, `e2e`, and
  `mutation` pass, which triggers `deploy.yml`. Done as one PR per story instead (PRs #3–#12)

---

## Amendment (2026-10-19): "No Longer Available" outcome

**Why**: A job can close without rejecting me, for example when someone else was hired. None of
the existing outcomes says that.

- [X] T097 [US2] Add the outcome stage `NO_LONGER_AVAILABLE` ("No Longer Available") after
  Rejected in `packages/shared/src/stages.ts` (spec FR-008). Validation, "Move to…", the board,
  and the archive pick it up from the stage list. Update the stage tests, the "Move to…" option
  list, the archive's empty-state text, an API test that closing with it archives the
  opportunity, and data-model.md and the API contract. Existing data needs no migration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Start immediately. Must be green in CI before Phase 2.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories. T035–T044
  (infrastructure) can run in parallel with T023–T034 (API and web shell). T044 needs the user's
  AWS credentials.
- **US1 (Phase 3)**: Depends on Foundational. This is the MVP.
- **US2 (Phase 4)**: Depends on Foundational. Its UI tasks (T064, T065) attach to pages created
  in US1 (T054, T055).
- **US3 (Phase 5)**: Depends on US1's list endpoint (T050) and reuses US2's MoveStageMenu (T062)
  on cards.
- **US4 (Phase 6)**: Depends on US1's form and detail page (T052, T054). Its API work (T074,
  T077, T078) is independent.
- **Polish (Phase 8)**: After the desired stories are done.

### Within Each User Story

- Rule tests, integration tests, and the story's Playwright spec are written first and must fail
  before implementation (Principle VI). The story is done when its Playwright spec passes on every
  project it runs on (all scenarios on desktop, `@responsive` ones on both phones), coverage stays at or above 80%, and mutation testing reports zero surviving
  mutants (Principle VI).
- Shared rules come before the repo, the repo before routes, and routes before UI.
- Commit and push at each checkpoint at minimum.

### Parallel Opportunities

- **Phase 1**: T002–T008 and T013 run in parallel after T001.
- **Phase 2**: T018 and T020 (tests) run together. T023, T024, and T026 run together. T032
  comes before T033, because the client reads the config. The infrastructure stack tasks T035,
  T036, T040, and T041 run together. T037 → T038 → T039 follow the stack order.
- **Each story**: the [P] test tasks run together (for example T056 and T057, or T073 and T074).
  [P] UI components (T051, T062, T069) can be built while the API work for the same story is in
  progress.

---

## Parallel Example: User Story 2

```bash
# Tests first, together:
Task: "Unit tests for validateStageChange in packages/shared/tests/unit/transitions.test.ts"
Task: "Integration tests for POST /opportunities/{id}/stage-changes in packages/api/tests/integration/stage-change.test.ts"

# Then, while T059–T061 (rules → repo → route) proceed in sequence:
Task: "MoveStageMenu component + test in packages/web/src/components/MoveStageMenu.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: the pipeline is green in CI and `master` is protected.
2. Phase 2: the foundation is ready, and the infrastructure deploys an empty shell.
3. Phase 3 (US1): capture and view opportunities.
4. **Stop and check** with the US1 steps in quickstart.md. Merge to `master` if you want the MVP
   deployed early.

### Incremental Delivery

1. US1 → US2 → US3 delivers the full P1 core: capture, pipeline, and overview.
2. US4 adds editing, follow-up highlights, duplicate warnings, and deletion.
3. After each story: its Playwright spec passes, `npm run test:coverage` and
   `npm run test:mutation` pass, then commit and push, and CI (`ci` + `e2e` + `mutation`) is
   green.

### Out of scope here (tracked separately)

- Follow-up reminders with Step Functions + SES: GitHub issue #1, a future feature.

---

## Notes

- [P] tasks touch different files and don't depend on incomplete tasks.
- Field constraints are quoted from data-model.md. Keep the zod schemas in `packages/shared` as
  the single source of truth for both API and web.
- Never bypass CI or branch protection. Fix failures instead.
