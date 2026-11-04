# Implementation Plan: Job Opportunity Tracker

**Branch**: `001-job-opportunity-tracker` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-job-opportunity-tracker/spec.md`

## Summary

A single-user, responsive web app for tracking job opportunities through a fixed pipeline
(5 open stages, 5 outcome stages) with a complete, never-lost stage history. The UI is a React
single-page app served from S3 through CloudFront. It calls an API Gateway HTTP API, protected
by a Cognito user pool, which invokes a TypeScript Lambda. Opportunities and their stage history
are stored in one DynamoDB table. A stage change is written atomically with its history entry
in a DynamoDB transaction. All infrastructure is defined in AWS CDK. GitHub Actions runs build, lint, typecheck, and tests on every push and PR, and
deploys from `master` using GitHub OIDC (no stored AWS keys). Service choices and the
alternatives considered are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (Lambda `nodejs24.x`; `nodejs22.x` if 24 is unavailable in the chosen region)

**Primary Dependencies**:
- **Web**: React 19, Vite, React Router, TanStack Query, `react-oidc-context` (Cognito sign-in), CSS Modules
- **API**: AWS SDK v3 (DynamoDB Document Client), `zod`, `ulid`
- **Shared**: `zod` schemas and pure domain rules (stages, transitions, validation), used by web and API
- **Infrastructure**: AWS CDK v2 (TypeScript)

**Storage**: Amazon DynamoDB (single table, on-demand capacity, point-in-time recovery on); Amazon S3 for the web assets

**Testing**: Vitest 4.1 (unit and integration; pinned below 5 until Stryker's Vitest 5 fix ships, see research.md), V8 coverage with an 80% gate on lines, branches, functions, and statements, Stryker mutation testing with zero surviving mutants allowed, React Testing Library (components), DynamoDB Local in Docker (API integration tests), CDK assertions (infrastructure snapshot and rule tests), **Playwright** (end-to-end: one spec per user story; every scenario runs on desktop Chromium, and scenarios tagged `@responsive` also run on mobile WebKit and Chromium (a combinatorial split, see research.md); in CI on every push and PR; a smoke test also runs against the deployed site after each deploy)

**Target Platform**: Current desktop and mobile browsers (Chrome, Safari, Firefox, Edge; iOS Safari and Android Chrome); AWS serverless in one region

**Project Type**: Web application (React SPA + serverless API + infrastructure-as-code)

**Performance Goals**: Overview, filter, and search under 1 s with 200 opportunities (SC-004); stage move under 10 s end to end, including user interaction (SC-002)

**Constraints**: Single user; no self sign-up (data is not partitioned by user, so every Cognito user in the pool sees the same data, which is acceptable because the only user is created by an admin); all data in the owner's AWS account; no third-party data sharing; mobile-first layout from 360 px wide; idle cost close to $0 with a budget alarm

**Scale/Scope**: 1 user, up to ~1,000 opportunities, ~10k history entries; about 6 screens (overview, archive, opportunity detail, add/edit form, sign-in)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Exactly one `stage` per opportunity, from a fixed list in `packages/shared`. "Move to…" is a single action from both the overview card and the detail view. | PASS |
| II. History is never lost | Each stage change is a separate DynamoDB item, written in the same transaction as the stage update. Closing sets `status=CLOSED`; nothing is deleted. Permanent delete requires a typed confirmation. Point-in-time recovery is on. | PASS |
| III. Fast capture, progressive detail | The schema requires only `company` and `title`. The add form opens with only those two fields; the rest are under "More details". | PASS |
| IV. Data privacy & ownership | Cognito with self sign-up disabled, a JWT authorizer on every route, a DynamoDB table in the owner's account, no third-party SDKs or analytics. | PASS |
| V. Simplicity (YAGNI) | One Lambda for the API, one table, no custom domain, no WAF, no X-Ray. The four-package layout is justified in Complexity Tracking. | PASS (justified) |
| VI. Test the rules | Stage, transition, and validation rules are pure functions in `packages/shared` with unit tests. Repository and transaction behavior is tested against DynamoDB Local. `npm run test:coverage` fails below 80% on any coverage metric. `npm run test:mutation` (Stryker, `thresholds.break: 100`) fails on any surviving mutant. Exclusions are listed under "Coverage and mutation exclusions" below. | PASS |
| VII. Automated quality gates | Root scripts `npm run build`, `lint`, `test`, `test:coverage`, `test:mutation`, `test:e2e`, and `dev`. The GitHub Actions `ci` (including coverage), `e2e`, and `mutation` jobs must all pass before merging. Every test is tagged by functionality (`scripts/test-tags.mjs`): branch pushes and PRs run only the affected tags, a change to `core` runs everything, and every push to `master` runs the full suite with the coverage gate before deploying. This is enforced by process, because branch protection needs GitHub Pro (see Complexity Tracking). Deployment runs from `master` through the same workflow. The pipeline is the first task phase. | PASS |

**Post-design re-check (after Phase 1)**: PASS. The data model, contracts, and quickstart add no
new violations. Step Functions isn't needed in this feature. It is planned for follow-up
reminders in a later feature (see research.md). Data export was dropped on 2026-10-18 as not
needed (constitution 2.0.0).

## Project Structure

### Documentation (this feature)

```text
specs/001-job-opportunity-tracker/
├── plan.md              # This file
├── research.md          # Phase 0: service and tooling decisions
├── data-model.md        # Phase 1: entities, DynamoDB keys, rules
├── quickstart.md        # Phase 1: run and validation guide
├── contracts/
│   └── api.openapi.yaml     # REST API contract
└── tasks.md             # Phase 2 (/speckit-tasks; not created by /speckit-plan)
```

### Source Code (repository root)

```text
package.json                 # npm workspaces + root scripts: build, lint, typecheck, test, test:e2e, dev
docker-compose.yml           # DynamoDB Local for dev, integration, and e2e tests
playwright.config.ts         # Playwright projects: desktop-chromium, mobile-webkit, mobile-chromium
e2e/                         # Playwright end-to-end tests (one spec per user story)
├── fixtures.ts              # data reset between tests + page helpers (addOpportunity, moveTo, ...)
├── us1-capture.spec.ts … us4-edit.spec.ts
└── deployed-smoke.spec.ts   # @deployed: runs against the CloudFront URL after deploy
.github/workflows/
├── ci.yml                   # jobs: changes (which test tags), ci (lint, typecheck, test, build), e2e, mutation
└── deploy.yml               # cdk deploy on push to master (after CI passes) + deployed smoke test

packages/
├── shared/                  # pure TypeScript, no AWS dependencies
│   ├── src/
│   │   ├── stages.ts        # stage list, categories, display order
│   │   ├── transitions.ts   # stage-change rules (same-stage, dates, reopen)
│   │   ├── schemas.ts       # zod schemas for API input and output
│   │   └── duplicates.ts    # duplicate detection
│   └── tests/unit/
├── api/                     # Lambda code
│   ├── src/
│   │   ├── handler.ts       # HTTP API entry point + router
│   │   ├── routes/          # opportunities, stage-changes
│   │   ├── repo/            # DynamoDB access (single-table keys, transactions)
│   │   └── local-server.ts  # local adapter: runs the handler on http://localhost:3001
│   └── tests/
│       ├── unit/
│       └── integration/     # against DynamoDB Local
├── web/                     # React SPA
│   ├── src/
│   │   ├── pages/           # Overview, Archive, OpportunityDetail, NewOpportunity
│   │   ├── components/      # OpportunityCard, StageBoard, MoveStageMenu, StarRating, ...
│   │   ├── api/             # typed API client + TanStack Query hooks
│   │   └── auth/            # Cognito OIDC setup; dev-mode bypass
│   └── tests/
└── infra/                   # AWS CDK app
    ├── bin/app.ts
    ├── lib/
    │   ├── data-stack.ts    # DynamoDB table
    │   ├── auth-stack.ts    # Cognito user pool + app client
    │   ├── api-stack.ts     # HTTP API, Lambda, JWT authorizer
    │   ├── web-distribution-stack.ts  # S3 site bucket + CloudFront (no app dependencies)
    │   ├── web-content-stack.ts       # site files + runtime config.json (API URL, Cognito)
    │   ├── budget-stack.ts  # AWS Budgets cost alert
    │   └── ci-stack.ts      # GitHub OIDC provider + deploy role (deployed manually once)
    └── tests/
```

**Structure Decision**: An npm-workspaces monorepo with four packages, named `@jot/shared`,
`@jot/api`, `@jot/web`, and `@jot/infra` ("jot" = job opportunity tracker). `web`, `api`, and
`infra` are separate deployable units. `shared` holds the domain rules so that web and API enforce the
same behavior (Principle VI) without copying code. The Playwright tests live in a root `e2e/`
folder rather than a fifth package, because they test the whole app rather than any one
package.

## Coverage and mutation exclusions

Constitution Principle VI limits exclusions to tests, tool configuration, and thin entry
points, and requires them to be listed here. Coverage counts `packages/*/src/**` and
`packages/infra/lib/**`. Mutation testing uses the same scope (`stryker.config.json`
`mutate`). Everything below is outside that scope:

| Excluded | Why | Category |
|---|---|---|
| `packages/*/tests/**`, `e2e/**` | Test code | Tests |
| `*.config.ts`, `*.config.js`, `stryker.config.json`, `packages/infra/cdk.json` | Tool configuration | Tool config |
| `packages/api/build.mjs`, `scripts/**`, `packages/api/scripts/**` | Build, local-setup, and CI scripts (bundling, starting DynamoDB Local, creating the local table, picking tests by tag). They aren't shipped | Tool config |
| `packages/web/src/main.tsx` | Thin entry point: loads config and mounts `<App />`. Covered by Playwright | Entry point |
| `packages/infra/bin/app.ts` | Thin entry point: `new App()` + `buildApp(app)`. The stacks it wires are tested through `lib/` | Entry point |

**Equivalent mutants**: these are mutants that can't change behavior. A mutant may be
disabled only with an inline comment that gives the reason, for example
`// Stryker disable next-line StringLiteral: log label only, not observable`. Comments without
a reason are not allowed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| One-time manual bootstrap (Principle VII: "MUST NOT be done by hand") | Before the pipeline can deploy, two things must exist: the CDK bootstrap resources and the GitHub OIDC deploy role. They can't be created by the pipeline that depends on them. | Fully automated bootstrap would need long-lived AWS keys stored in GitHub, which is less secure. The exception covers only `cdk bootstrap` and the `ci-stack`. Every app deploy goes through `deploy.yml`. |
| Merge gate enforced by process, not branch protection (Principle VII: a PR "MUST NOT be merged to `master` unless all checks pass") | GitHub doesn't offer branch protection or rulesets for private repos on the Free plan. The owner chose to keep the repo private and free (2026-10-17). | Upgrading to GitHub Pro, or making the repo public, was declined. The process instead: code reaches `master` only through a PR merged after `ci` and `e2e` pass, with no direct pushes of code to `master`. `deploy.yml` deploys only when the `CI` workflow succeeds on `master`, so a broken push still can't be deployed. Revisit if the plan changes. |
| Four workspace packages | Web, API, and infrastructure deploy separately. Shared rules prevent duplicated validation. | A single package would mix browser, Lambda, and CDK dependencies and builds. Copying rules into web and API would let them drift apart. |
