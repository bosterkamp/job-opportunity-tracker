# Quickstart: Job Opportunity Tracker

How to run, check, and deploy the feature. Field rules are in [data-model.md](./data-model.md),
and endpoints are in [contracts/api.openapi.yaml](./contracts/api.openapi.yaml).

## Prerequisites

- Node.js 24 LTS and npm 10+
- Docker Desktop, for DynamoDB Local
- For deploying only:
  - an AWS account
  - the AWS CLI v2, configured with an admin profile for the one-time bootstrap
  - the GitHub CLI (`gh`)

## Daily commands (Constitution Principle VII)

| Command | What it does |
|---|---|
| `npm ci` | Install all workspaces |
| `npm run dev` | Start DynamoDB Local, create the table, run the API on `:3001` and the web app on `:5173` |
| `npm run lint` | ESLint + Prettier check, all packages |
| `npm run typecheck` | `tsc --build`, all packages |
| `npm test` | Unit + integration tests. Starts DynamoDB Local automatically if it isn't running |
| `npm run test:coverage` | Tests plus the 80% coverage gate; HTML report in `coverage/` |
| `npm run test:mutation` | Stryker mutation testing; fails on any surviving mutant. HTML report in `reports/mutation/` |
| `npm run test:e2e` | Playwright end-to-end tests: every scenario on desktop Chrome, `@responsive` ones also on iPhone and Pixel. Starts its own copy of the local stack. Add `-- --ui` for interactive mode |
| `npm run build` | Production build of web, API bundles, and `cdk synth` |

CI (`.github/workflows/ci.yml`) runs three jobs on every push and PR:
- `ci`: `lint`, `typecheck`, `test:coverage`, and `build`
- `e2e`: Playwright
- `mutation`: Stryker

Merge to `master` only through a PR where all three have passed. This is enforced by process, not
branch protection, because the repo is private on GitHub Free. The first time, run
`npx playwright install` to download the browsers.

## Check the feature locally

Run `npm run dev` and open http://localhost:5173. In local mode you are signed in
automatically as the dev user. Then check each user story:

1. **Capture (US1)**:
   - Add "Acme" / "Senior Engineer" with no other fields. It appears under **Considering**.
   - Try to save with an empty title. You see a "Job title is required" message and nothing is
     saved.
   - Add a second opportunity with every field filled in, including 4 stars. Reload the page:
     all values are still there.
2. **Pipeline (US2)**:
   - Move Acme to **Applied** with a note and a date three days ago. The history shows the entry
     with that date.
   - Move it directly to **Interviewing**, then back to **Contacted**. Both moves are allowed and
     recorded.
   - Move it to **Rejected**. It leaves the overview and appears in the **Archive**.
   - Reopen it into **Applied**. It returns to the overview, and the reopening is in its history.
   - Check that choosing the current stage isn't offered, and that a future date is rejected.
3. **Overview (US3)**:
   - **Desktop width**: one column per open stage.
   - **Phone width (≤ 400 px, browser device toolbar)**: stage tabs, and "Move to…" opens a
     bottom sheet.
   - Filter by one stage, sort by interest (unrated items last), and search by company.
4. **Edit (US4)**:
   - Change the stars from 3 to 5.
   - Set the follow-up date to today. The card is highlighted.
   - Clear the company name. Saving is blocked and the original value is kept.

Automated equivalents:
- the Playwright specs `e2e/us1-capture.spec.ts` through `e2e/us4-edit.spec.ts`, which
  automate the checks above on desktop and mobile
- the rule tests in `packages/shared/tests/unit`
- the repository and transaction tests in `packages/api/tests/integration`
- the component tests in `packages/web/tests`

## First deployment (one-time manual bootstrap)

1. Run `npx cdk bootstrap aws://<account>/<region>` from `packages/infra`, with your admin
   profile.
2. Run `npm run deploy:ci-role -w @jot/infra`. This creates the GitHub OIDC provider and a
   deploy role that only `bosterkamp/job-opportunities` on `master` can assume. The role's ARN
   is printed as the `DeployRoleArn` output.
   - If the account already has a GitHub OIDC provider (only one is allowed), set
     `GITHUB_OIDC_PROVIDER_ARN=<its arn>` first so the stack reuses it.
   - The role trusts GitHub's OIDC `sub` claim. This repo uses GitHub's **immutable subject**
     format (`repo:owner@id/repo@id:ref:...`). If GitHub shows a different prefix in
     `gh api repos/bosterkamp/job-opportunities/actions/oidc/customization/sub`, update
     `GITHUB_SUBJECT_PREFIX` in `packages/infra/lib/build-app.ts` and redeploy this stack.
3. Set the GitHub variables that `deploy.yml` reads:
   - `gh variable set AWS_DEPLOY_ROLE_ARN --body <DeployRoleArn>`
   - `gh variable set AWS_REGION --body <region>`
   - `gh variable set BUDGET_EMAIL --body <your email>` (where the cost alert goes)

   Until `AWS_DEPLOY_ROLE_ARN` is set, the deploy job is skipped.
4. (Skipped: branch protection needs GitHub Pro for a private repo. Merge to `master` only
   through PRs whose `ci`, `e2e`, and `mutation` checks have passed.)
5. Merge to `master`. After CI passes, `deploy.yml` runs `npm run build` and
   `cdk deploy --all`. The outputs are printed in the job log:
   - the CloudFront URL
   - the Cognito managed-login domain
   - the API URL
6. Create your user:
   `aws cognito-idp admin-create-user --user-pool-id <id> --username <your email>`. Then sign in
   at the CloudFront URL and set your password.

## Check the deployed app

- `deploy.yml` runs `e2e/deployed-smoke.spec.ts` against the CloudFront URL automatically.
  Locally, run it with
  `E2E_BASE_URL=<cloudfront url> E2E_API_URL=<api url> npx playwright test --grep @deployed`.
- Repeat the local checks on the CloudFront URL, on both desktop and phone.
- Calling the API without a token returns `401`.
- In the DynamoDB console, an opportunity's partition holds its `OPP` item and one `CHANGE#`
  item for each stage change.
- In the console, the AWS Budgets alarm exists.
