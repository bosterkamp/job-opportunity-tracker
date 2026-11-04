import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { buildApp } from '../lib/build-app.js';

// Thin entry point: reads settings from the environment and CDK context, then builds the
// stacks. The CDK CLI synthesizes the app when this process exits.
const app = new App();

buildApp(app, {
  webDistPath: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  budgetEmail: process.env.BUDGET_EMAIL,
  includeCiStack: app.node.tryGetContext('ci') === 'true',
  existingOidcProviderArn: process.env.GITHUB_OIDC_PROVIDER_ARN,
});
