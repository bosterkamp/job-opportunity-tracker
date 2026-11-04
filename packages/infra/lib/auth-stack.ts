import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  ManagedLoginVersion,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export const LOCAL_WEB_URL = 'http://localhost:5173';

// Where the Claude apps (web, desktop, mobile) return after sign-in (feature 003). Anthropic
// may move it to claude.com, so both are allowed.
export const CLAUDE_CALLBACK_URLS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];
export const MCP_TOOLS_SCOPE = 'tools';

export interface AuthStackProps extends StackProps {
  // https://<CloudFront domain>, from WebDistributionStack.
  siteUrl: string;
}

// One user, created by an admin: self sign-up is off (Constitution Principle IV).
export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly redirectUri: string;
  // The managed-login domain, for example https://jot-123.auth.us-east-1.amazoncognito.com
  readonly domainUrl: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 12 },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const domain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `jot-${this.account}` },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    this.redirectUri = `${props.siteUrl}/`;
    const allowedUrls = [this.redirectUri, `${LOCAL_WEB_URL}/`];

    this.client = this.userPool.addClient('WebClient', {
      // A browser app can't keep a secret; PKCE protects the code exchange instead.
      generateSecret: false,
      // The managed login pages check your password through the client's own sign-in flows.
      // With none allowed, steps like "set a new password" fail with "Invalid challenge
      // transition". SRP never sends the password itself; USER_AUTH is the choice-based flow
      // managed login uses.
      authFlows: { userSrp: true, user: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL],
        callbackUrls: allowedUrls,
        logoutUrls: allowedUrls,
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
    });

    // The newer managed login pages need a branding record; use Cognito's default look.
    new CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    this.domainUrl = domain.baseUrl();
  }
}
