import { Annotations, type App } from 'aws-cdk-lib';
import { ApiStack } from './api-stack.js';
import { AuthStack } from './auth-stack.js';
import { BudgetStack } from './budget-stack.js';
import { CiStack } from './ci-stack.js';
import { DataStack } from './data-stack.js';
import { WebContentStack } from './web-content-stack.js';
import { WebDistributionStack } from './web-distribution-stack.js';

export const STACK_PREFIX = 'Jot';

// GitHub's immutable OIDC subject for your repo (see CiStackProps.subjectPrefix): replace the
// placeholders with the prefix from
// `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`.
export const GITHUB_SUBJECT_PREFIX = 'repo:<owner>@<owner id>/job-opportunities@<repo id>';

export interface AppSettings {
  webDistPath: string;
  // Budget alerts go here. Without it, no budget is created (with a warning).
  budgetEmail?: string;
  // Adds the one-time CI stack (GitHub OIDC deploy role), only when deploying it by hand.
  includeCiStack?: boolean;
  existingOidcProviderArn?: string;
}

export interface JotStacks {
  data: DataStack;
  webDistribution: WebDistributionStack;
  auth: AuthStack;
  api: ApiStack;
  webContent: WebContentStack;
  budget?: BudgetStack;
  ci?: CiStack;
}

// Stack order: Data -> WebDistribution -> Auth -> Api -> WebContent, which keeps the
// references one-way (research.md). Budget and CI stand alone.
export function buildApp(app: App, settings: AppSettings): JotStacks {
  const data = new DataStack(app, `${STACK_PREFIX}-Data`);
  const webDistribution = new WebDistributionStack(app, `${STACK_PREFIX}-WebDistribution`);
  const { siteUrl } = webDistribution;

  const auth = new AuthStack(app, `${STACK_PREFIX}-Auth`, { siteUrl });
  const api = new ApiStack(app, `${STACK_PREFIX}-Api`, {
    table: data.table,
    userPool: auth.userPool,
    client: auth.client,
    siteUrl,
    cognitoDomainUrl: auth.domainUrl,
  });

  const webContent = new WebContentStack(app, `${STACK_PREFIX}-WebContent`, {
    bucket: webDistribution.bucket,
    distribution: webDistribution.distribution,
    siteUrl,
    webDistPath: settings.webDistPath,
    config: {
      appEnv: 'aws',
      apiUrl: api.apiUrl,
      cognitoAuthority: auth.userPool.userPoolProviderUrl,
      cognitoClientId: auth.client.userPoolClientId,
      redirectUri: auth.redirectUri,
    },
  });

  const stacks: JotStacks = { data, webDistribution, auth, api, webContent };

  if (settings.budgetEmail) {
    stacks.budget = new BudgetStack(app, `${STACK_PREFIX}-Budget`, { email: settings.budgetEmail });
  } else {
    Annotations.of(data).addWarningV2(
      'jot:no-budget',
      'BUDGET_EMAIL is not set, so no AWS Budgets cost alert is deployed.',
    );
  }

  if (settings.includeCiStack) {
    stacks.ci = new CiStack(app, `${STACK_PREFIX}-Ci`, {
      repository: 'bosterkamp/job-opportunities',
      subjectPrefix: GITHUB_SUBJECT_PREFIX,
      branch: 'master',
      existingOidcProviderArn: settings.existingOidcProviderArn,
    });
  }

  return stacks;
}
