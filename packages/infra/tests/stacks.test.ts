// @module-tag infra
import { fileURLToPath } from 'node:url';
import type { Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  ALERT_THRESHOLD_PERCENT,
  DEFAULT_MONTHLY_LIMIT_USD,
  BudgetStack,
} from '../lib/budget-stack.js';
import { STACK_PREFIX, buildApp, type AppSettings } from '../lib/build-app.js';
import { contentSecurityPolicy } from '../lib/web-distribution-stack.js';
import { testApp } from './test-app.js';

const webDistPath = fileURLToPath(new URL('./fixtures/web-dist', import.meta.url));

function build(settings: Partial<AppSettings> = {}) {
  const app = testApp();
  const stacks = buildApp(app, { webDistPath, budgetEmail: 'me@example.com', ...settings });
  return { app, stacks };
}

const template = (stack: Stack) => Template.fromStack(stack);

describe('app', () => {
  it('synthesizes every stack without circular references, in dependency order', () => {
    const { app, stacks } = build({ includeCiStack: true });

    const assembly = app.synth();

    expect(assembly.stacks.map((s) => s.stackName).sort()).toEqual(
      ['Api', 'Auth', 'Budget', 'Ci', 'Data', 'WebContent', 'WebDistribution']
        .map((n) => `${STACK_PREFIX}-${n}`)
        .sort(),
    );
    expect(STACK_PREFIX).toBe('Jot');
    expect(stacks.auth.dependencies).toEqual([stacks.webDistribution]);
    expect(stacks.api.dependencies.map((s) => s.stackName).sort()).toEqual([
      'Jot-Auth',
      'Jot-Data',
      'Jot-WebDistribution',
    ]);
    expect(stacks.webContent.dependencies.map((s) => s.stackName).sort()).toEqual([
      'Jot-Api',
      'Jot-Auth',
      'Jot-WebDistribution',
    ]);
    expect(stacks.data.dependencies).toEqual([]);
    expect(stacks.webDistribution.dependencies).toEqual([]);
  });

  it('leaves out the CI stack unless asked for it', () => {
    const { app, stacks } = build();

    expect(stacks.ci).toBeUndefined();
    expect(app.synth().stacks.map((s) => s.stackName)).not.toContain('Jot-Ci');
  });

  it('skips the budget with a warning when no email is given', () => {
    const { stacks } = build({ budgetEmail: undefined });

    expect(stacks.budget).toBeUndefined();
    const warnings = Annotations.fromStack(stacks.data).findWarning('*', Match.anyValue());
    // The ack id lets someone silence the warning with `cdk acknowledge`.
    expect(warnings.map((w) => w.entry.data)).toEqual([
      'BUDGET_EMAIL is not set, so no AWS Budgets cost alert is deployed. [ack: jot:no-budget]',
    ]);
  });

  it('adds no budget warning when an email is given', () => {
    const { stacks } = build();

    expect(Annotations.fromStack(stacks.data).findWarning('*', Match.anyValue())).toEqual([]);
  });
});

describe('DataStack', () => {
  it('creates the retained single table with point-in-time recovery and GSI1', () => {
    const { stacks } = build();

    template(stacks.data).hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        BillingMode: 'PAY_PER_REQUEST',
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ]),
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      },
    });
  });
});

describe('WebDistributionStack', () => {
  it('keeps the site bucket private, encrypted, and HTTPS-only', () => {
    const { stacks } = build();
    const t = template(stacks.webDistribution);

    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
    t.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
    t.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
    t.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
  });

  it('serves the bucket through CloudFront with OAC, HTTPS redirect, and SPA fallback', () => {
    const { stacks } = build();
    const t = template(stacks.webDistribution);

    t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CustomErrorResponses: [
          {
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
            ErrorCachingMinTTL: 0,
          },
          {
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
            ErrorCachingMinTTL: 0,
          },
        ],
      }),
    });
  });

  it('sends security headers on every response', () => {
    const { stacks } = build();
    const t = template(stacks.webDistribution);

    t.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: {
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 31_536_000,
            IncludeSubdomains: true,
            Override: true,
          },
          ContentTypeOptions: { Override: true },
          FrameOptions: { FrameOption: 'DENY', Override: true },
          ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
          ContentSecurityPolicy: {
            ContentSecurityPolicy: stacks.webDistribution.resolve(
              contentSecurityPolicy(stacks.webDistribution.region),
            ) as unknown,
            Override: true,
          },
        },
      }),
    });
    const [policyId] = Object.keys(t.findResources('AWS::CloudFront::ResponseHeadersPolicy'));
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ResponseHeadersPolicyId: { Ref: policyId },
        }),
      }),
    });
  });

  it('allows connections only to this site, the API, and Cognito in the region', () => {
    expect(contentSecurityPolicy('us-east-1')).toBe(
      "default-src 'self'; " +
        "connect-src 'self' https://*.execute-api.us-east-1.amazonaws.com " +
        'https://cognito-idp.us-east-1.amazonaws.com https://*.auth.us-east-1.amazoncognito.com; ' +
        "img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; " +
        "frame-ancestors 'none'",
    );
  });

  it('exposes the https site URL built from the distribution domain', () => {
    const { stacks } = build();

    expect(stacks.webDistribution.resolve(stacks.webDistribution.siteUrl)).toEqual({
      'Fn::Join': [
        '',
        ['https://', { 'Fn::GetAtt': [expect.any(String) as unknown, 'DomainName'] }],
      ],
    });
  });
});

describe('AuthStack', () => {
  it('creates a retained admin-only user pool with email sign-in', () => {
    const { stacks } = build();
    const t = template(stacks.auth);

    t.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
        UsernameAttributes: ['email'],
        AutoVerifiedAttributes: ['email'],
        AccountRecoverySetting: { RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] },
        Policies: { PasswordPolicy: Match.objectLike({ MinimumLength: 12 }) },
        Schema: Match.arrayWith([
          Match.objectLike({ Name: 'email', Required: true, Mutable: true }),
        ]),
      }),
    });
  });

  it('adds a managed-login domain named after the account', () => {
    const { stacks } = build();

    template(stacks.auth).hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: { 'Fn::Join': ['', ['jot-', { Ref: 'AWS::AccountId' }]] },
      ManagedLoginVersion: 2,
    });
    template(stacks.auth).hasResourceProperties('AWS::Cognito::ManagedLoginBranding', {
      UseCognitoProvidedValues: true,
      UserPoolId: Match.anyValue(),
      ClientId: Match.anyValue(),
    });
  });

  it('configures a secretless code-flow client for the site and localhost', () => {
    const { stacks } = build();
    const site = { 'Fn::Join': ['', ['https://', Match.anyValue(), '/']] };

    template(stacks.auth).hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      // Without these, managed login's "set a new password" step fails.
      ExplicitAuthFlows: Match.arrayEquals([
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_USER_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ]),
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: ['openid', 'email'],
      SupportedIdentityProviders: ['COGNITO'],
      PreventUserExistenceErrors: 'ENABLED',
      CallbackURLs: [site, 'http://localhost:5173/'],
      LogoutURLs: [site, 'http://localhost:5173/'],
    });
  });
});

describe('ApiStack', () => {
  it('runs the API on a Node 24 ARM Lambda with the table name and AWS app env', () => {
    const { stacks } = build();

    template(stacks.api).hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      MemorySize: 512,
      Timeout: 10,
      Handler: 'index.handler',
      Environment: { Variables: { APP_ENV: 'aws', TABLE_NAME: Match.anyValue() } },
    });
    template(stacks.api).hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('grants table access to the API and MCP functions only, and MCP may invoke the import function', () => {
    const { stacks } = build();
    const t = template(stacks.api);

    type Statement = { Action: string | string[]; Resource: unknown };
    type Policy = { Properties: { PolicyDocument: { Statement: Statement[] }; Roles: unknown[] } };
    const policies = Object.values(t.findResources('AWS::IAM::Policy')) as Policy[];
    const statements = policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
    const actions = (st: Statement) => [st.Action].flat();

    // Nothing but table access and one invoke permission.
    for (const statement of statements) {
      const list = actions(statement);
      if (list.every((action) => action.startsWith('dynamodb:'))) {
        // Every resource is the table (imported from the data stack) or its indexes.
        for (const resource of [statement.Resource].flat()) {
          expect(JSON.stringify(resource)).toMatch(/Jot-Data:ExportsOutputFnGetAttTable/);
        }
      } else {
        expect(list).toEqual(['lambda:InvokeFunction']);
        expect(JSON.stringify(statement.Resource)).toMatch(/ImportFunction/);
      }
    }
    expect(statements.flatMap(actions)).toEqual(
      expect.arrayContaining([
        'dynamodb:PutItem',
        'dynamodb:Query',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'lambda:InvokeFunction',
      ]),
    );
    // Two policies, one per function with table access (the API and MCP).
    expect(policies).toHaveLength(2);
  });

  it('protects every route with the Cognito JWT authorizer for this client', () => {
    const { stacks } = build();
    const t = template(stacks.api);

    type RouteResource = { Properties: { AuthorizationType: string; RouteKey: string } };
    const routes = Object.values(t.findResources('AWS::ApiGatewayV2::Route')) as RouteResource[];
    // Explicit methods only: no $default catch-all and no OPTIONS route. Either would send the
    // browser's token-less CORS preflight to the authorizer (401), which blocks every request.
    expect(routes.map((route) => route.Properties.RouteKey).sort()).toEqual(
      [
        'DELETE /{proxy+}',
        'GET /{proxy+}',
        'PATCH /{proxy+}',
        'POST /imports',
        'POST /{proxy+}',
        ...MCP_ROUTE_KEYS,
      ].sort(),
    );
    for (const route of routes) {
      // The MCP routes check the token in the function itself (feature 003).
      expect(route.Properties.AuthorizationType).toBe(
        MCP_ROUTE_KEYS.includes(route.Properties.RouteKey) ? 'NONE' : 'JWT',
      );
    }
    t.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: { Audience: [Match.anyValue()], Issuer: Match.anyValue() },
    });
  });

  it('runs "Fill from link" in its own small function, with no table and no secrets', () => {
    const { stacks } = build();
    const t = template(stacks.api);

    t.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      MemorySize: 256,
      Timeout: 15,
      Handler: 'index.handler',
      Environment: { Variables: { APP_ENV: 'aws' } },
    });
    type Fn = { Properties: { MemorySize: number; Role: { 'Fn::GetAtt': [string] } } };
    const functions = Object.values(t.findResources('AWS::Lambda::Function')) as Fn[];
    const importFn = functions.find((f) => f.Properties.MemorySize === 256) as Fn;
    const roleId = importFn.Properties.Role['Fn::GetAtt'][0];

    // Its role gets only the managed basic-execution policy (its logs), and no inline policy.
    t.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          ],
        },
      ],
    });
    const inline = Object.values(t.findResources('AWS::IAM::Policy')).filter((p) =>
      JSON.stringify(p).includes(roleId),
    );
    expect(inline).toEqual([]);
    expect(Object.keys(t.findResources('AWS::IAM::Role'))).toContain(roleId);

    // Its only route is POST /imports, behind the same authorizer.
    type RouteResource = {
      Properties: { RouteKey: string; Target: unknown; AuthorizerId: unknown };
    };
    const routes = Object.values(t.findResources('AWS::ApiGatewayV2::Route')) as RouteResource[];
    const importRoute = routes.find(
      (r) => r.Properties.RouteKey === 'POST /imports',
    ) as RouteResource;
    const apiRoute = routes.find(
      (r) => r.Properties.RouteKey === 'POST /{proxy+}',
    ) as RouteResource;
    expect(importRoute.Properties.AuthorizerId).toEqual(apiRoute.Properties.AuthorizerId);
    expect(importRoute.Properties.Target).not.toEqual(apiRoute.Properties.Target);
    t.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    expect(
      Object.values(t.findResources('AWS::Logs::LogGroup')).map(
        (g) => (g as { Properties: { RetentionInDays: number } }).Properties.RetentionInDays,
      ),
    ).toEqual([30, 30, 30]);
  });

  it('allows CORS from the site and localhost only', () => {
    const { stacks } = build();

    template(stacks.api).hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: [Match.anyValue(), 'http://localhost:5173'],
        AllowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        AllowHeaders: ['authorization', 'content-type', 'x-confirm-delete'],
        MaxAge: 3600,
      },
    });
  });

  it('outputs the API URL', () => {
    const { stacks } = build();

    template(stacks.api).hasOutput('ApiUrl', { Description: 'Job tracker API base URL' });
  });
});

describe('WebContentStack', () => {
  it('deploys the web build plus config.json and invalidates CloudFront', () => {
    const { stacks } = build();
    const t = template(stacks.webContent);

    t.hasResourceProperties('Custom::CDKBucketDeployment', {
      SourceBucketNames: [Match.anyValue(), Match.anyValue()],
      DistributionPaths: ['/*'],
      Prune: true,
    });
    t.hasOutput('SiteUrl', { Description: 'Job tracker web app URL' });
  });

  it('writes all five runtime settings into config.json', () => {
    const { stacks } = build();

    expect(Object.keys(stacks.webContent.config)).toEqual([
      'appEnv',
      'apiUrl',
      'cognitoAuthority',
      'cognitoClientId',
      'redirectUri',
    ]);
    expect(stacks.webContent.config.appEnv).toBe('aws');
    expect(stacks.webContent.config.redirectUri).toBe(stacks.auth.redirectUri);
    expect(stacks.webContent.config.apiUrl).toBe(stacks.api.apiUrl);
  });
});

describe('BudgetStack', () => {
  it('alerts by email at 80% of the default $5 monthly cost budget', () => {
    const { stacks } = build();

    expect(DEFAULT_MONTHLY_LIMIT_USD).toBe(5);
    expect(ALERT_THRESHOLD_PERCENT).toBe(80);
    template(stacks.budget as BudgetStack).hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'job-tracker-monthly',
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: 5, Unit: 'USD' },
      },
      NotificationsWithSubscribers: [
        {
          Notification: {
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 80,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'me@example.com' }],
        },
      ],
    });
  });

  it('accepts a custom limit', () => {
    const stack = new BudgetStack(testApp(), 'B', { email: 'x@example.com', monthlyLimitUsd: 12 });

    template(stack).hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 12, Unit: 'USD' } }),
    });
  });
});

describe('CiStack', () => {
  const trust = {
    AssumeRolePolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              // GitHub's immutable subject: owner and repo as name@id.
              'token.actions.githubusercontent.com:sub':
                'repo:<owner>@<owner id>/job-opportunities@<repo id>:ref:refs/heads/master',
            },
          },
        }),
      ],
    },
  };

  it('creates the GitHub OIDC provider and a master-only deploy role', () => {
    const { stacks } = build({ includeCiStack: true });
    const t = template(stacks.ci as Stack);

    t.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIDList: ['sts.amazonaws.com'],
    });
    t.hasResourceProperties('AWS::IAM::Role', {
      ...trust,
      MaxSessionDuration: 3600,
      Description: 'GitHub Actions deploys for bosterkamp/job-opportunities (master only)',
    });
    t.hasOutput('DeployRoleArn', { Description: 'Set as the AWS_DEPLOY_ROLE_ARN GitHub variable' });
  });

  it('only lets the role assume the CDK bootstrap roles', () => {
    const { stacks } = build({ includeCiStack: true });

    template(stacks.ci as Stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  { Ref: 'AWS::Partition' },
                  ':iam::',
                  { Ref: 'AWS::AccountId' },
                  ':role/cdk-*',
                ],
              ],
            },
          },
        ],
      },
    });
  });

  it('reuses an existing GitHub OIDC provider when one is given', () => {
    const arn = 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com';
    const { stacks } = build({ includeCiStack: true, existingOidcProviderArn: arn });
    const t = template(stacks.ci as Stack);

    t.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Federated: arn } })],
      },
    });
  });
});

const MCP_ROUTE_KEYS = [
  'DELETE /mcp',
  'GET /.well-known/oauth-authorization-server',
  'GET /.well-known/oauth-protected-resource/mcp',
  'GET /mcp',
  'POST /mcp',
];

describe('using the tracker from Claude (feature 003)', () => {
  type Fn = {
    Properties: {
      Handler: string;
      MemorySize: number;
      Environment: { Variables: Record<string, unknown> };
      Role: { 'Fn::GetAtt': [string, string] };
    };
  };
  const functions = (stacks: ReturnType<typeof build>['stacks']) =>
    Object.values(template(stacks.api).findResources('AWS::Lambda::Function')).filter(
      (f) => 'Environment' in (f as Fn).Properties,
    ) as Fn[];

  it('gives every function the bundle entry point, and the API only its own settings', () => {
    const { stacks } = build();
    const all = functions(stacks);

    // The API, "Fill from link", and the MCP server.
    expect(all).toHaveLength(3);
    for (const fn of all) {
      expect(fn.Properties.Handler).toBe('index.handler');
    }
    const api = all.find(
      (f) => f.Properties.MemorySize === 512 && !('API_URL' in f.Properties.Environment.Variables),
    );
    expect(Object.keys(api?.Properties.Environment.Variables ?? {}).sort()).toEqual([
      'APP_ENV',
      'TABLE_NAME',
    ]);
    expect(api?.Properties.Environment.Variables.APP_ENV).toBe('aws');
  });

  it("gives the MCP function's own role table access", () => {
    const { stacks } = build();
    const t = template(stacks.api);
    const mcp = functions(stacks).find(
      (f) => 'API_URL' in f.Properties.Environment.Variables,
    ) as Fn;
    const roleId = mcp.Properties.Role['Fn::GetAtt'][0];

    type Policy = {
      Properties: {
        Roles: { Ref: string }[];
        PolicyDocument: { Statement: { Action: string | string[] }[] };
      };
    };
    const policy = (Object.values(t.findResources('AWS::IAM::Policy')) as Policy[]).find((p) =>
      p.Properties.Roles.some((role) => role.Ref === roleId),
    );
    const actions = policy?.Properties.PolicyDocument.Statement.flatMap((st) => [st.Action].flat());
    expect(actions).toEqual(
      expect.arrayContaining(['dynamodb:Query', 'dynamodb:PutItem', 'lambda:InvokeFunction']),
    );
  });

  it("uses Cognito's own look for both clients' sign-in pages", () => {
    const { stacks } = build();
    const brandings = [stacks.auth, stacks.api].flatMap(
      (stack) =>
        Object.values(template(stack).findResources('AWS::Cognito::ManagedLoginBranding')) as {
          Properties: { UseCognitoProvidedValues: boolean };
        }[],
    );

    expect(brandings.map((b) => b.Properties.UseCognitoProvidedValues)).toEqual([true, true]);
  });

  it("binds Claude's tokens to the MCP URL: the resource server is named after it", () => {
    const { stacks } = build();
    const t = template(stacks.api);
    type ResourceServer = { Properties: { Identifier: unknown; Name: string; Scopes: unknown } };
    const servers = Object.entries(t.findResources('AWS::Cognito::UserPoolResourceServer')) as [
      string,
      ResourceServer,
    ][];

    // Cognito only binds a token to a resource (Claude always sends the MCP URL) for scopes of a
    // resource server whose identifier is that resource.
    expect(servers).toHaveLength(1);
    const [[serverId, server]] = servers as [[string, ResourceServer]];
    expect(server.Properties.Identifier).toEqual(stacks.api.resolve(`${stacks.api.apiUrl}/mcp`));
    // AWS's own patterns for these fields: the identifier may be a URL, the name may not.
    expect(server.Properties.Name).toBe('Job tracker for Claude');
    expect(server.Properties.Name).toMatch(/^[\w\s+=,.@-]{1,256}$/);
    expect(server.Properties.Scopes).toEqual([
      { ScopeName: 'tools', ScopeDescription: 'Use the job tracker from Claude' },
    ]);
    t.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'claude',
      AllowedOAuthScopes: [{ 'Fn::Join': ['', [{ Ref: serverId }, '/tools']] }],
    });
  });

  it("adds a confidential client for Claude's connector, and keeps the web client to itself", () => {
    const { stacks } = build();
    const t = template(stacks.api);

    t.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'claude',
      GenerateSecret: true,
      ExplicitAuthFlows: Match.arrayEquals([
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_USER_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ]),
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: [
        'https://claude.ai/api/mcp/auth_callback',
        'https://claude.com/api/mcp/auth_callback',
      ],
      AccessTokenValidity: 60,
      IdTokenValidity: 60,
      RefreshTokenValidity: 43_200,
      TokenValidityUnits: { AccessToken: 'minutes', IdToken: 'minutes', RefreshToken: 'minutes' },
      SupportedIdentityProviders: ['COGNITO'],
      PreventUserExistenceErrors: 'ENABLED',
    });
    // The auth stack keeps only the web client; the first Claude client was removed (T034).
    const auth = template(stacks.auth);
    auth.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    auth.resourceCountIs('AWS::Cognito::UserPoolResourceServer', 0);
    const outputs = (auth.toJSON() as { Outputs?: Record<string, unknown> }).Outputs ?? {};
    expect(Object.keys(outputs).some((key) => key.includes('ClaudeConnectorClient'))).toBe(false);
    expect(stacks.auth.resolve(stacks.auth.domainUrl)).toEqual({
      'Fn::Join': [
        '',
        [
          'https://',
          { Ref: expect.stringMatching(/^UserPoolDomain/) as string },
          '.auth.',
          { Ref: 'AWS::Region' },
          '.amazoncognito.com',
        ],
      ],
    });
  });

  it('runs the MCP server in its own function, configured from the other stacks', () => {
    const { stacks } = build();

    template(stacks.api).hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      MemorySize: 512,
      Timeout: 10,
      Environment: {
        Variables: {
          APP_ENV: 'aws',
          TABLE_NAME: Match.anyValue(),
          API_URL: Match.anyValue(),
          USER_POOL_ID: Match.anyValue(),
          MCP_CLIENT_ID: { Ref: Match.stringLikeRegexp('ClaudeConnectorClient') },
          COGNITO_DOMAIN_URL: Match.anyValue(),
          IMPORT_FUNCTION_NAME: { Ref: Match.stringLikeRegexp('ImportFunction') },
        },
      },
    });
  });

  it('limits MCP requests to 5 a second, in bursts of 10', () => {
    const { stacks } = build();

    template(stacks.api).hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      RouteSettings: { 'POST /mcp': { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 } },
    });
  });

  it('applies the throttling only after the MCP routes exist', () => {
    const { stacks } = build();
    const t = template(stacks.api);
    type Route = { Properties: { RouteKey: string } };
    const routes = t.findResources('AWS::ApiGatewayV2::Route') as Record<string, Route>;
    const postMcp = Object.keys(routes).find(
      (id) => routes[id]?.Properties.RouteKey === 'POST /mcp',
    );
    const [stage] = Object.values(t.findResources('AWS::ApiGatewayV2::Stage')) as {
      DependsOn?: string[];
    }[];

    expect(postMcp).toBeDefined();
    expect(stage?.DependsOn).toEqual(expect.arrayContaining([postMcp]));
  });

  it('expires the MCP change counters through the table TTL', () => {
    const { stacks } = build();

    template(stacks.data).hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });

  it("keeps every Cognito resource server's name and identifier within AWS's patterns", () => {
    const { stacks } = build();
    const servers = [stacks.auth, stacks.api].flatMap(
      (stack) =>
        Object.values(template(stack).findResources('AWS::Cognito::UserPoolResourceServer')) as {
          Properties: { Name: string; Identifier: unknown };
        }[],
    );

    expect(servers).toHaveLength(1);
    for (const server of servers) {
      expect(server.Properties.Name).toMatch(/^[\w\s+=,.@-]{1,256}$/);
    }
  });
});
