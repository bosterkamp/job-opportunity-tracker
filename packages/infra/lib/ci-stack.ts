import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
  type IOpenIdConnectProvider,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';
export const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

export interface CiStackProps extends StackProps {
  // owner/repo allowed to deploy, for example bosterkamp/job-opportunities (used in labels).
  repository: string;
  // The repository part of GitHub's OIDC `sub` claim. This repo uses GitHub's immutable
  // subject format, which names the owner and repo by name@id, for example
  // `repo:octo-org@1234567/job-opportunities@123456789`, so a different repo that later
  // takes the same name can't match. Check the current prefix with
  // `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`.
  subjectPrefix: string;
  branch: string;
  // An AWS account can have only one GitHub OIDC provider; reuse it if it already exists.
  existingOidcProviderArn?: string;
}

// Lets GitHub Actions deploy from master without stored AWS keys (research.md, CI/CD).
// Deployed by hand once (`npm run deploy:ci-role -w @jot/infra`); never by the pipeline.
export class CiStack extends Stack {
  readonly role: Role;

  constructor(scope: Construct, id: string, props: CiStackProps) {
    super(scope, id, props);

    const provider: IOpenIdConnectProvider = props.existingOidcProviderArn
      ? OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidc',
          props.existingOidcProviderArn,
        )
      : new OpenIdConnectProvider(this, 'GitHubOidc', {
          url: GITHUB_OIDC_URL,
          clientIds: ['sts.amazonaws.com'],
        });

    this.role = new Role(this, 'DeployRole', {
      description: `GitHub Actions deploys for ${props.repository} (${props.branch} only)`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: `${props.subjectPrefix}:ref:refs/heads/${props.branch}`,
        },
      }),
    });

    // `cdk deploy` works by assuming the roles `cdk bootstrap` created; that's all it needs.
    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: this.role.roleArn,
      description: 'Set as the AWS_DEPLOY_ROLE_ARN GitHub variable',
    });
  }
}
