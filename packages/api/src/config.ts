export type AppEnv = 'local' | 'aws';

export interface ApiConfig {
  tableName: string;
  appEnv: AppEnv;
  region: string;
  // Only set locally, where it points at DynamoDB Local.
  dynamoEndpoint?: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export interface ImportConfig {
  appEnv: AppEnv;
  // `host:port` values the import may fetch although they aren't public. Only honored locally,
  // where Playwright serves fixture postings (research.md §6); always empty in AWS.
  allowHosts: string[];
}

function appEnvFrom(env: Env): AppEnv {
  const appEnv = required(env, 'APP_ENV');
  if (appEnv !== 'local' && appEnv !== 'aws') {
    throw new Error(`APP_ENV must be "local" or "aws", got "${appEnv}"`);
  }
  return appEnv;
}

// Configuration for the import function, which needs no table.
export function loadImportConfig(env: Env = process.env): ImportConfig {
  const appEnv = appEnvFrom(env);
  const allowHosts =
    appEnv === 'local'
      ? (env.IMPORT_ALLOW_LOCAL_HOSTS ?? '')
          .split(',')
          .map((host) => host.trim())
          .filter(Boolean)
      : [];
  return { appEnv, allowHosts };
}

// Reads configuration once at cold start and fails fast, so a misconfigured function errors
// on its first request instead of misbehaving later.
export function loadConfig(env: Env = process.env): ApiConfig {
  const appEnv = appEnvFrom(env);
  const config: ApiConfig = {
    tableName: required(env, 'TABLE_NAME'),
    appEnv,
    region: required(env, 'AWS_REGION'),
  };

  if (appEnv === 'local') {
    config.dynamoEndpoint = required(env, 'DYNAMO_ENDPOINT');
  }

  return config;
}

export interface McpConfig extends ApiConfig {
  // The HTTP API's base URL; the MCP server is at `${apiUrl}/mcp`.
  apiUrl: string;
  userPoolId: string;
  // The Claude connector's Cognito app client.
  clientId: string;
  // The user pool's managed-login domain, for example https://jot-123.auth.us-east-1.amazoncognito.com
  cognitoDomainUrl: string;
  // The import function, invoked to read posting links (feature 002).
  importFunctionName: string;
}

// Configuration for the MCP function (feature 003). Fails fast on anything missing.
export function loadMcpConfig(env: Env = process.env): McpConfig {
  return {
    ...loadConfig(env),
    apiUrl: required(env, 'API_URL'),
    userPoolId: required(env, 'USER_POOL_ID'),
    clientId: required(env, 'MCP_CLIENT_ID'),
    cognitoDomainUrl: required(env, 'COGNITO_DOMAIN_URL'),
    importFunctionName: required(env, 'IMPORT_FUNCTION_NAME'),
  };
}
