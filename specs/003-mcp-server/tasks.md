---

description: "Task list for using the tracker from Claude (MCP server)"
---

# Tasks: Use the Tracker from Claude

**Input**: Design documents from `specs/003-mcp-server/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/mcp-tools.md](./contracts/mcp-tools.md),
[contracts/oauth-metadata.md](./contracts/oauth-metadata.md), [quickstart.md](./quickstart.md)

**Tests**: Required (Constitution Principle VI: tests for the rules, coverage at or above 80%,
and zero surviving mutants). Within each story, write the tests first and see them fail.

**Organization**: By user story (spec.md US1–US4). **US1 and US2 ship first, as their own PR**:
the real connection from the Claude app proves the sign-in design (research.md §2, Risk), with
read-only tools to try it on, before any tool can change data. (Changed during implementation:
an MCP server with no tools can't even answer `tools/list`, so US1 alone had nothing to test.)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are from the repository root

## Conventions that apply to every task

- Tag every new test file `// @module-tag mcp` (Vitest), or wrap the spec in
  `test.describe(..., { tag: '@mcp' })` (Playwright). `npm run lint` checks it.
- Build handlers, servers, and fixtures inside each test, not at module load or in hooks
  (Stryker issue #6234).
- Never log tokens, `Authorization` headers, or tool arguments. Log only the tool name, the
  outcome code, and the opportunity id.
- Pin new dependencies to a release at least two weeks old, with `~`.

---

## Phase 1: Setup

- [X] T001 Add `@modelcontextprotocol/sdk@~1.32.1` and `aws-jwt-verify@~5.2.1` to `packages/api/package.json` with `npm install -w @jot/api`. Confirm in `node_modules` that the SDK exports `WebStandardStreamableHTTPServerTransport` and `McpServer`, and accepts zod 4
- [X] T002 [P] Add the `mcp` tag to `scripts/test-tags.mjs`:
  - `{ name: 'mcp', description: 'Using the tracker from Claude: the MCP server (feature 003)' }` in `TAGS`
  - `'mcp'` in `E2E_FEATURES`
  - add each `SOURCE_TAGS` entry when its files exist: `packages/api/src/mcp/**` and `packages/api/src/mcpHandler.ts` → `['mcp']`; `packages/shared/src/changeSource.ts` → `['mcp']`
  - add the `mcp` row to the README's "Test tags" table

---

## Phase 2: Foundational (blocks every story)

**Purpose**: The `via` mark through the shared schemas, the repository, and the API handler, so
every later change through Claude can be traced

- [X] T003 [P] Write `packages/shared/tests/unit/changeSource.test.ts` and extend `packages/shared/tests/unit/schemas.test.ts`:
  - `VIA` is `['CLAUDE']`
  - `StageChangeSchema` accepts an entry with `via: 'CLAUDE'`, and one without `via` (old data); it rejects any other `via`
  - `OpportunitySchema` accepts `detailsEditedViaClaudeAt` as an ISO date-time, `null`, or absent
- [X] T004 Create `packages/shared/src/changeSource.ts` (`VIA = ['CLAUDE'] as const`, `type Via`) and export it. Add the optional `via` to `StageChangeSchema` and the optional, nullable `detailsEditedViaClaudeAt` to `OpportunitySchema` in `packages/shared/src/schemas.ts` (data-model.md). Make T003 pass
- [X] T005 [P] Write tests in `packages/api/tests/integration/via.test.ts`, through `createHandler(config, { via: 'CLAUDE' })` against DynamoDB Local:
  - creating writes `via: 'CLAUDE'` on `CHANGE#000001`
  - a stage change writes `via: 'CLAUDE'` on its entry
  - a details edit sets `detailsEditedViaClaudeAt` to the clock's time
  - the default handler (web) writes no `via`, and a web edit removes `detailsEditedViaClaudeAt`
  - a stage move leaves `detailsEditedViaClaudeAt` unchanged
  - `GET /opportunities/{id}` returns both fields
- [X] T006 Add the `via` dependency, so T005 passes:
  - `HandlerDeps.via?: Via` in `packages/api/src/handler.ts`, absent for the web
  - pass it through `packages/api/src/routes/opportunities.ts` and `routes/stageChanges.ts` to `create`, `changeStage`, and `updateDetails` in `packages/api/src/repo/opportunityRepo.ts`
  - `updateDetails` SETs `detailsEditedViaClaudeAt` when `via` is `CLAUDE`, and REMOVEs it otherwise
  - `toStageChange` and `toOpportunity` map the new attributes

**Checkpoint**: Changes can carry `via`. The web app's behavior is unchanged (the existing
tests pass)

---

## Phase 3: User Story 1 - Connect Claude to my tracker, securely (Priority: P1) 🎯 MVP

**Goal**: Claude can add the tracker as a custom connector, sign in with the owner's account,
and reach an authenticated MCP endpoint; everyone else is refused (spec US1, FR-001–FR-005)

**Independent Test**: After deploy, add the connector in Claude with the client ID and secret,
sign in, and see the tracker's tools listed; a request without a token is refused
(quickstart.md, "Connect Claude")

### Tests for User Story 1

- [X] T007 [P] [US1] Write `packages/api/tests/unit/mcp/auth.test.ts` for `verifyAccessToken` and `unauthorized`. Use an RSA key pair generated in the test, and an injected JWKS through `aws-jwt-verify`'s `JwtRsaVerifier` with `jwksCache` or `cacheJwks`. Check:
  - **Accepted**: a token with every value in data-model.md's "Access token checks" table
  - **Refused with `invalid_token`**: the wrong `iss`, `aud`, `client_id`, or `token_use` (`id`); `scope` without `jot-mcp/tools`; expired; signed by another key; not a JWT
  - **Refused without an `error`**: no `Authorization` header, or not `Bearer`
  - **The 401**: `unauthorized()` returns 401, the exact `WWW-Authenticate` value from contracts/oauth-metadata.md (with and without `error="invalid_token"`), and the body `{"error":"unauthorized"}`
- [X] T008 [P] [US1] Write `packages/api/tests/unit/mcp/metadata.test.ts`: the Protected Resource Metadata and the authorization server metadata equal contracts/oauth-metadata.md exactly for a given `<api>` and `<cognito>`, with `Cache-Control: max-age=300` and `Content-Type: application/json`
- [X] T009 [P] [US1] Write `packages/api/tests/integration/mcpHandler.test.ts`, through `createMcpHandler(config, { verify })` with a fake verifier:
  - **Without a token**: `POST /mcp` answers 401 with the header; so do `GET` and `DELETE`
  - **With a token**: `initialize` answers with the server info (`name: 'job-opportunity-tracker'`) and the tools capability; then `tools/list`; JSON responses; no `mcp-session-id` header
  - **`GET /mcp` and `DELETE /mcp`**: answer 405
  - **Metadata**: `GET /.well-known/oauth-protected-resource/mcp` and `GET /.well-known/oauth-authorization-server` answer without a token
  - **Unknown paths**: answer 404
  - **Base64 bodies**: an API Gateway event with `isBase64Encoded` is decoded
  - **Logging**: nothing logged contains the token
- [X] T010 [P] [US1] Add tests to `packages/infra/tests/stacks.test.ts`:
  - **The Cognito client**: in the Auth stack, a `claude-connector` app client with a secret, the authorization code flow only, the scope `jot-mcp/tools`, both Claude callback URLs, a one-hour access token, and a 30-day refresh token
  - **Cognito's other resources**: a `jot-mcp` resource server with scope `tools`, and a managed login branding resource for the new client
  - **The Lambda**: in the API stack, an `McpFunction` (Node 24, ARM, 512 MB, 10 s) with the environment from T014. Its role reads and writes the table, and may invoke `ImportFunction` only
  - **Routes**: `POST`, `GET`, and `DELETE /mcp` and the two `/.well-known/...` routes, **without** an authorizer; every other route keeps the JWT authorizer
  - **Throttling**: on `POST /mcp`, a rate of 5 and a burst of 10
  - **The data stack**: a TTL attribute `expiresAt`

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement `packages/api/src/mcp/auth.ts`:
  - `createVerifier({ userPoolId, clientId, resource })` using `aws-jwt-verify`'s `JwtRsaVerifier`. It checks the issuer, the audience (the resource), the `client_id`, `token_use`, and the scope, and caches the JWKS across invocations
  - `verifyAccessToken(header, verifier)`, returning `{ ok: true, sub }` or `{ ok: false, error?: 'invalid_token' }`
  - `unauthorized(resourceMetadataUrl, error?)`, building the contract's 401
  Make T007 pass
- [X] T012 [P] [US1] Implement `packages/api/src/mcp/metadata.ts` (`protectedResourceMetadata(apiUrl)`, `authorizationServerMetadata(apiUrl, cognitoDomainUrl)`, and JSON responses with the cache header). Make T008 pass
- [X] T013 [US1] Implement:
  - **`packages/api/src/mcp/server.ts`**: `createMcpServer(deps)`, a new `McpServer({ name: 'job-opportunity-tracker', version })` per request, with no tools yet; US2 and US3 register them
  - **`packages/api/src/mcpHandler.ts`**:
    - `createMcpHandler(config, overrides)`, which converts the API Gateway v2 event to a web `Request` (the method, the `https://<host><rawPath>` URL, headers, and the body, base64-decoded when needed)
    - it routes the metadata paths, checks the token for `/mcp`, answers `GET` and `DELETE` with 405, and gives `POST` to a new `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` connected to the server
    - it converts the `Response` back, and exports `handler`
    - `loadMcpConfig(env)` in `packages/api/src/config.ts` reads `TABLE_NAME`, `API_URL` (the MCP URL is `${API_URL}/mcp`), `USER_POOL_ID`, `MCP_CLIENT_ID`, `COGNITO_DOMAIN_URL`, and `IMPORT_FUNCTION_NAME`, and fails fast on any that is missing
  Make T009 pass
- [X] T014 [US1] Add the infrastructure. Make T010 pass:
  - **`packages/infra/lib/auth-stack.ts`**: the `jot-mcp` resource server (scope `tools`), the `claude-connector` client (contracts/oauth-metadata.md), and its `CfnManagedLoginBranding` with the same settings as the web client's. Export the client as `connectorClient`
  - **`packages/infra/lib/data-stack.ts`**: `timeToLiveAttribute: 'expiresAt'`
  - **`packages/infra/lib/api-stack.ts`**:
    - `McpFunction` for `packages/api/src/mcpHandler.ts`, with the environment from T013 (`API_URL` = `api.apiEndpoint`, `COGNITO_DOMAIN_URL` = the user pool domain's base URL)
    - `table.grantReadWriteData`, and `importFunction.grantInvoke`
    - the routes without an authorizer, and the route throttling through the default stage's `routeSettings` (or `CfnStage` overrides), rate 5 and burst 10 for `POST /mcp`
  - **`packages/infra/lib/build-app.ts`**: pass `auth.connectorClient` to the API stack
- [X] T015 [US1] Add to `e2e/deployed-smoke.spec.ts`:
  - `POST <api>/mcp` without a token answers 401, with `WWW-Authenticate` containing `resource_metadata="<api>/.well-known/oauth-protected-resource/mcp"`
  - both metadata documents answer 200 with the contract's `resource` and `issuer`
- [ ] T016 [US1] Ship US1 together with US2 (do this after T018):
  - run lint, typecheck, the affected tests, and mutation testing on the changed files
  - open a PR, merge once every check passes, and confirm the deploy and its smoke test
  - then get the client ID and secret (quickstart.md, step 1), and **ask the owner to connect Claude** (steps 2–3)
  - record the result in `specs/003-mcp-server/checklists/validation.md`
  - if Claude refuses the metadata, switch to the fallback in research.md §2 (a registration endpoint that returns the pre-created client) before US2

**Checkpoint**: Claude connects and signs in as the owner; the endpoint refuses everything else

---

## Phase 4: User Story 2 - Ask about my opportunities (Priority: P1)

**Goal**: Read tools that answer from the owner's real data (spec US2, FR-006–FR-008)

**Independent Test**: In Claude: "what's in Interviewing?", "which follow-ups are due?", "show
me Acme's history"; compare with the web app (quickstart.md, "Check by hand" step 1)

### Tests for User Story 2

- [X] T017 [P] [US2] Write `packages/api/tests/integration/mcp-read-tools.test.ts`, with the SDK's `Client` connected through `InMemoryTransport.createLinkedPair()` to `createMcpServer` over a DynamoDB Local table seeded in each test:
  - **`list_opportunities`**: defaults to open, newest stage change first, with the contract's item shape. `stage` filters. `view: 'archive'` lists closed ones. `view: 'follow_up_due'` lists open ones due today or earlier, and not later ones or closed ones. `limit` and `offset` page through, and `total` counts all
  - **`find_opportunities`**: matches company or title text case-insensitively, open and closed; `limit` applies
  - **`get_opportunity`**: returns every detail and the history (with `via`); an unknown id gives an `isError` result with `NOT_FOUND: Opportunity not found`
  - **Annotations**: all three are `readOnlyHint: true`
  - **Invalid input**: a stage name that isn't a stage, `limit: 0`, or `stage` with `view: 'archive'` are rejected
  - **Agreement**: every result matches the web API's answer for the same data (SC-002)

### Implementation for User Story 2

- [X] T018 [US2] Implement the read tools in `packages/api/src/mcp/tools.ts` (`registerReadTools(server, api)`):
  - `api` calls the API router in process, through `createHandler(config, { via: 'CLAUDE' })`, with synthetic events that carry the owner's verified `sub` as API Gateway's authorizer would
  - the zod input schemas, the descriptions from contracts/mcp-tools.md, and the annotations
  - results as `structuredContent` plus a JSON text copy, and errors as `isError` with `"<CODE>: <message>"`
  - for `follow_up_due`, use the shared `isFollowUpDue` with today's UTC date
  Register them in `createMcpServer`. Make T017 pass

**Checkpoint**: Claude can answer questions about the job search

---

## Phase 5: User Story 3 - Add and update opportunities through Claude (Priority: P1)

**Goal**: Write tools with the web app's rules and messages, the duplicate warning, posting
links, and the change limit (spec US3, FR-009–FR-014, FR-017)

**Independent Test**: In Claude: add "Acme, Senior Engineer, 4 stars", add it again (warned),
add one from a posting link, move it with a note dated yesterday, change its location, and ask
to delete it (refused). Check each in the web app (quickstart.md, steps 2–6)

### Tests for User Story 3

- [X] T019 [P] [US3] Write `packages/api/tests/integration/mcp-rate-limit.test.ts` against DynamoDB Local, with an injected clock:
  - `takeChange(now)` allows 20 changes in a minute and refuses the 21st with `RATE_LIMITED`
  - the next minute starts again from 0
  - the counter item has `PK = RATE#mcp`, `SK = <minute>`, and `expiresAt` one hour later
  - counter items never appear in `list_opportunities`
- [X] T020 [P] [US3] Write `packages/api/tests/integration/mcp-write-tools.test.ts`, with the in-memory client over DynamoDB Local and a fake import client:
  - **`add_opportunity`**:
    - creates the opportunity in Considering, with history `via: 'CLAUDE'`
    - a missing company or title gives the web API's `VALIDATION_ERROR` message
    - a matching open opportunity returns `duplicateOf` and adds nothing; with `add_anyway: true` it adds
  - **`update_opportunity`**:
    - changes only the given fields, and `null` clears an optional one
    - clearing the company gives the web API's message
    - sets `detailsEditedViaClaudeAt`
    - an unknown id gives `NOT_FOUND`
  - **`move_opportunity`**:
    - records the move with the note and date, `via: 'CLAUDE'`
    - the current stage gives `SAME_STAGE`, a future date `FUTURE_DATE`, and a stale `expected_change_count` `CONFLICT`, each with the web API's message (SC-005)
    - closing archives; reopening works
  - **`read_posting`**: returns the import client's details and saves nothing; each import failure code comes back with feature 002's message
  - **Every write tool**: counts toward the limit; the 21st change in a minute gives `RATE_LIMITED`; reads don't count
  - **Annotations**: the write tools are `destructiveHint: false`
  - **No delete**: `tools/list` has no delete tool
- [X] T021 [P] [US3] Write `packages/api/tests/unit/mcp/importClient.test.ts`:
  - `createImportClient(lambdaClient, functionName)` invokes the function with a `POST /imports` API Gateway event carrying the URL
  - a 200 payload returns the `PostingDetails`
  - a 422 payload throws with its code and message
  - a function error throws `UNREACHABLE`
  Use a fake Lambda client

### Implementation for User Story 3

- [X] T022 [P] [US3] Implement `packages/api/src/mcp/rateLimit.ts` (`takeChange(docs, tableName, now)`: an `UpdateCommand` with `ADD count :one`, `SET expiresAt`, and the condition `attribute_not_exists(count) OR count < :max`, where `max = 20`; a failed condition throws `ApiError('RATE_LIMITED', …)`). Add `RATE_LIMITED: 429` to `ERROR_STATUS` in `packages/api/src/http.ts`. Make T019 pass
- [X] T023 [P] [US3] Implement `packages/api/src/mcp/importClient.ts`, with `@aws-sdk/client-lambda` (already in the Lambda runtime, so marked external). Make T021 pass
- [X] T024 [US3] Implement the write tools in `packages/api/src/mcp/tools.ts` (`registerWriteTools`):
  - `read_posting`, `add_opportunity` (the duplicate check uses the shared `findPossibleDuplicate` on the open list), `update_opportunity`, and `move_opportunity`, from contracts/mcp-tools.md
  - each change calls `takeChange` first, then the API router with `via: 'CLAUDE'`
  - wire the import client and the rate limit into `createMcpServer` and `mcpHandler.ts`
  Make T020 pass

**Checkpoint**: Claude can capture and update the job search with the web app's rules

---

## Phase 6: User Story 4 - Tell Claude's changes apart from mine (Priority: P2)

**Goal**: The web app shows which changes came through Claude (spec US4, FR-015, FR-016)

**Independent Test**: An opportunity with one web stage change and one through Claude shows
"via Claude" on the second only; a Claude details edit shows its notice (quickstart.md, steps
2, 4, 5)

### Tests for User Story 4

- [X] T025 [P] [US4] Write `packages/web/tests/via-claude.test.tsx` (`@module-tag mcp`):
  - a history entry with `via: 'CLAUDE'` shows "· via Claude" after its date; entries without it don't
  - `detailsEditedViaClaudeAt` shows "Details last changed through Claude on <date>" in the browser's date format; absent or `null`, nothing
- [X] T026 [P] [US4] Write `e2e/mcp-marks.spec.ts` (`@mcp`, the first scenario also `@responsive`):
  - seed through the local API with a test-only header that sets `via` (see T027)
  - open the opportunity, and check both marks
  - edit the details in the web app; the "through Claude" notice is gone

### Implementation for User Story 4

- [X] T027 [US4] Show the marks in `packages/web/src/pages/OpportunityDetail.tsx` (with styles in `Page.module.css`). For the Playwright seed, let the **local** API only (`APP_ENV=local` with `ALLOW_TEST_RESET=true`) honor an `x-test-via: CLAUDE` header in `packages/api/scripts/local-api.ts`, never in AWS. Make T025 and T026 pass

**Checkpoint**: Every change through Claude is visible as such in the web app

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T028 [P] Update `README.md`:
  - **Architecture**: the diagram and summary gain the MCP Lambda, the connector's sign-in, and the "via Claude" marks
  - **A "Use from Claude" section**: connecting (quickstart.md), what Claude can and can't do, disconnecting, and that Claude Code isn't supported
- [X] T029 [P] Update `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml`: describe the `via` and `detailsEditedViaClaudeAt` fields, and reference this feature's contracts
- [ ] T030 Security review:
  - with the deployed stack, call `/mcp` with no token, a web app token (wrong `client_id` and no `aud`), a token from another user pool, and an expired token; each answers 401
  - confirm the McpFunction role (the table, invoking `ImportFunction`) and that the logs hold no tokens or arguments
  - confirm a refresh after the access token expires works from Claude
  - record the results in the validation checklist
- [X] T031 Run `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, and mutation testing on every changed file; fix every surviving mutant by adding a test or removing equivalent code
- [ ] T032 Complete `specs/003-mcp-server/checklists/validation.md`:
  - the automated results
  - the owner's checks from quickstart.md, "Check by hand" 1–7
  - the timings for SC-001 (under a minute to add or move from the phone) and SC-006 (connect in under 2 minutes; answers within 5 seconds)
- [X] T034 Remove the legacy Claude client and its `jot-mcp` resource server (and the
  `exportValue` that keeps its export) from `packages/infra/lib/auth-stack.ts`, once the deploy that
  moved the API stack to the new `claude` client has completed. Update the auth stack test
- [ ] T033 Open the PR for US2–US4 and the polish (linking the spec), merge once `changes`, `ci`, `e2e`, and `mutation` pass, and confirm the deploy and its smoke test

---

## Dependencies & Execution Order

- **Setup (Phase 1)**, then **Foundational (Phase 2)**: block everything else
- **US1 (Phase 3)** and **US2 (Phase 4)**: after Foundational; **merged and deployed together**
  (T016) so the owner can prove the connection with read-only tools
- **US3 (Phase 5)**: after the owner has connected
  (it extends `tools.ts` and uses `get_opportunity` for the change count)
- **US4 (Phase 6)**: after Foundational only; can be built alongside US2 and US3
- **Polish (Phase 7)**: after US2–US4

### Within Each User Story

- Tests first, failing; then the implementation that makes them pass
- In the API: `auth` and `metadata`, then `server` and `mcpHandler`; in US3, `rateLimit` and
  `importClient`, then the tools
- Infrastructure (T014) after the code it deploys (T013)

### Parallel Opportunities

- T002 alongside T001; T003 and T005 together
- In US1: T007–T010 together, then T011 and T012 together
- In US3: T019–T021 together, then T022 and T023 together
- US4 (T025–T027) alongside US2 and US3
- T028 and T029 together

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Token checks in packages/api/tests/unit/mcp/auth.test.ts"
Task: "Metadata documents in packages/api/tests/unit/mcp/metadata.test.ts"
Task: "MCP HTTP handling in packages/api/tests/integration/mcpHandler.test.ts"
Task: "Cognito client, McpFunction, and routes in packages/infra/tests/stacks.test.ts"

# Then, together:
Task: "verifyAccessToken and unauthorized in packages/api/src/mcp/auth.ts"
Task: "The metadata documents in packages/api/src/mcp/metadata.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 and 2)

1. Phases 1–2: the dependencies, the tag, and the `via` mark
2. Phase 3: the authenticated endpoint, metadata, Cognito client, and infrastructure
3. Phase 4: the read tools
4. **Stop**: merge, deploy, and have the owner connect Claude (T016). This proves the sign-in
   design before any tool can change data

### Incremental Delivery

1. US1 + US2 → PR → deploy → owner connects and reads
2. US3 (write) → US4 (marks) → polish → second PR → deploy → owner checks quickstart.md
   steps 1–7

---

## Notes

- Commit and push after each phase
- A PR touches common code (the shared schemas), so CI runs every test; allow about an hour for
  the mutation job
