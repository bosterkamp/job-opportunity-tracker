import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnStage, CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  CfnManagedLoginBranding,
  OAuthScope,
  ResourceServerScope,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolResourceServer,
  type UserPool,
} from 'aws-cdk-lib/aws-cognito';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat, type BundlingOptions } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { CLAUDE_CALLBACK_URLS, LOCAL_WEB_URL, MCP_TOOLS_SCOPE } from './auth-stack.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

// esbuild settings for the API Lambda. esbuild targets the runtime's Node version by default.
export const API_BUNDLING: BundlingOptions = {
  format: OutputFormat.ESM,
  minify: true,
  sourceMap: true,
  // The Lambda runtime already includes AWS SDK v3.
  externalModules: ['@aws-sdk/*'],
};

// The MCP server's routes (feature 003), all served by McpFunction without an authorizer.
export const MCP_ROUTES: [path: string, methods: HttpMethod[]][] = [
  ['/mcp', [HttpMethod.POST, HttpMethod.GET, HttpMethod.DELETE]],
  ['/.well-known/oauth-protected-resource/mcp', [HttpMethod.GET]],
  ['/.well-known/oauth-authorization-server', [HttpMethod.GET]],
];

// Methods the API serves. OPTIONS is deliberately absent (see the routes below).
export const API_METHODS = [HttpMethod.GET, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.DELETE];

export interface ApiStackProps extends StackProps {
  table: Table;
  userPool: UserPool;
  client: UserPoolClient;
  // https://<CloudFront domain>, allowed by CORS.
  siteUrl: string;
  // The managed-login domain (feature 003).
  cognitoDomainUrl: string;
}

export class ApiStack extends Stack {
  readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const handler = new NodejsFunction(this, 'ApiFunction', {
      entry: `${repoRoot}packages/api/src/handler.ts`,
      handler: 'handler',
      // The repo root's package-lock.json is found automatically from here.
      projectRoot: repoRoot,
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment: { APP_ENV: 'aws', TABLE_NAME: props.table.tableName },
      logGroup: new LogGroup(this, 'ApiLogs', { retention: RetentionDays.ONE_MONTH }),
      bundling: API_BUNDLING,
    });

    // Read/write on this table and its index only.
    props.table.grantReadWriteData(handler);

    const api = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [props.siteUrl, LOCAL_WEB_URL],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type', 'x-confirm-delete'],
        maxAge: Duration.hours(1),
      },
    });

    // Every request needs a valid Cognito token for this app's client.
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      props.userPool.userPoolProviderUrl,
      { jwtAudience: [props.client.userPoolClientId] },
    );

    // Explicit routes rather than a $default catch-all. Browsers send a CORS preflight
    // (OPTIONS) without a token; with a catch-all, OPTIONS hit the JWT authorizer and got a
    // 401, so the browser blocked every request. With no route for OPTIONS, API Gateway
    // answers preflights itself from corsPreflight above.
    api.addRoutes({
      path: '/{proxy+}',
      methods: API_METHODS,
      integration: new HttpLambdaIntegration('ApiIntegration', handler),
      authorizer,
    });

    // "Fill from link" (feature 002) fetches pages the owner pastes and parses untrusted HTML, so
    // it runs in its own function with no table access and no other permissions: only its logs.
    // The explicit route takes precedence over /{proxy+}.
    const importFunction = new NodejsFunction(this, 'ImportFunction', {
      entry: `${repoRoot}packages/api/src/importHandler.ts`,
      handler: 'handler',
      projectRoot: repoRoot,
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      // The fetch gives up after 10 seconds (research.md §4); this leaves room to answer.
      timeout: Duration.seconds(15),
      environment: { APP_ENV: 'aws' },
      logGroup: new LogGroup(this, 'ImportLogs', { retention: RetentionDays.ONE_MONTH }),
      bundling: API_BUNDLING,
    });
    api.addRoutes({
      path: '/imports',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ImportIntegration', importFunction),
      authorizer,
    });

    // Using the tracker from Claude (feature 003, contracts/oauth-metadata.md). The owner enters
    // the connector client's ID and secret in Claude's settings. Cognito binds a token to the MCP
    // URL only for a scope of a resource server whose identifier is that URL, so the resource
    // server and the client live here, where the URL is known; the first connection failed with
    // "custom scopes requested for resource-binding must be assigned to the resource".
    const mcpUrl = `${api.apiEndpoint}/mcp`;
    const tools = new ResourceServerScope({
      scopeName: MCP_TOOLS_SCOPE,
      scopeDescription: 'Use the job tracker from Claude',
    });
    const mcpResourceServer = new UserPoolResourceServer(this, 'McpResourceServer', {
      userPool: props.userPool,
      identifier: mcpUrl,
      // The name defaults to the identifier, but a name can't contain ":" or "/".
      userPoolResourceServerName: 'Job tracker for Claude',
      scopes: [tools],
    });
    const connectorClient = new UserPoolClient(this, 'ClaudeConnectorClient', {
      userPool: props.userPool,
      userPoolClientName: 'claude',
      // Claude's servers keep the secret; it never reaches a browser.
      generateSecret: true,
      authFlows: { userSrp: true, user: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.resourceServer(mcpResourceServer, tools)],
        callbackUrls: CLAUDE_CALLBACK_URLS,
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
    });
    // Managed login needs a branding record for each client; use Cognito's default look.
    new CfnManagedLoginBranding(this, 'ConnectorLoginBranding', {
      userPoolId: props.userPool.userPoolId,
      clientId: connectorClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    // These routes have no API Gateway authorizer:
    // the function checks the owner's token itself, so it can answer the 401 that tells Claude
    // where to sign in, and the two discovery documents are public by design (research.md §3).
    const mcpFunction = new NodejsFunction(this, 'McpFunction', {
      entry: `${repoRoot}packages/api/src/mcpHandler.ts`,
      handler: 'handler',
      projectRoot: repoRoot,
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment: {
        APP_ENV: 'aws',
        TABLE_NAME: props.table.tableName,
        API_URL: api.apiEndpoint,
        USER_POOL_ID: props.userPool.userPoolId,
        MCP_CLIENT_ID: connectorClient.userPoolClientId,
        COGNITO_DOMAIN_URL: props.cognitoDomainUrl,
        IMPORT_FUNCTION_NAME: importFunction.functionName,
      },
      logGroup: new LogGroup(this, 'McpLogs', { retention: RetentionDays.ONE_MONTH }),
      bundling: API_BUNDLING,
    });
    props.table.grantReadWriteData(mcpFunction);
    // Posting links are read by the import function, which has no table access (feature 002).
    importFunction.grantInvoke(mcpFunction);
    const mcpIntegration = new HttpLambdaIntegration('McpIntegration', mcpFunction);
    const mcpRoutes = MCP_ROUTES.flatMap(([path, methods]) =>
      api.addRoutes({ path, methods, integration: mcpIntegration }),
    );
    // At most 5 MCP requests a second, in bursts of 10, before API Gateway answers 429.
    const stage = api.defaultStage?.node.defaultChild as CfnStage;
    stage.addPropertyOverride('RouteSettings', {
      'POST /mcp': { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 },
    });
    // A route's settings can only be applied once the route exists. CloudFormation doesn't know
    // that on its own, and the first deploy failed with "Unable to find Route by key POST /mcp".
    stage.node.addDependency(...mcpRoutes);

    this.apiUrl = api.apiEndpoint;
    new CfnOutput(this, 'ApiUrl', { value: this.apiUrl, description: 'Job tracker API base URL' });
  }
}
