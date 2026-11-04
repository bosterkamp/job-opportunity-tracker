import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { WebStorageStateStore } from 'oidc-client-ts';
import { AuthProvider as OidcProvider, useAuth } from 'react-oidc-context';
import { useConfig, type AwsConfig } from '../config';
import { useOnline } from '../useOnline';

export interface AuthSession {
  userName: string;
  // Resolves to undefined locally, where the API needs no token.
  getAccessToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthSession | null>(null);

export const DEV_SESSION: AuthSession = {
  userName: 'Dev user',
  getAccessToken: () => Promise.resolve(undefined),
};

// After Cognito redirects back, drop ?code=&state= from the address bar.
export function clearSigninParams(): void {
  window.history.replaceState({}, document.title, window.location.pathname);
}

export const OFFLINE_SIGN_IN_MESSAGE = "You're offline. Sign in again once you're connected.";

function CognitoGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  // Offline, the sign-in page can't load: wait for the connection instead of showing a browser
  // error (feature 006, opening the installed app offline).
  const online = useOnline();
  // A token refresh that failed (offline, say) only means signing in again, not an error page.
  const failed = auth.error && auth.error.source !== 'renewSilent' ? auth.error : undefined;
  const mustSignIn = !auth.isLoading && !auth.isAuthenticated && !failed && !auth.activeNavigator;

  useEffect(() => {
    if (mustSignIn && online) {
      void auth.signinRedirect();
    }
  }, [mustSignIn, online, auth]);

  const user = auth.user;
  if (failed) {
    return <p role="alert">Sign-in failed: {failed.message}</p>;
  }
  if (mustSignIn && !online && !user) {
    return <p role="status">{OFFLINE_SIGN_IN_MESSAGE}</p>;
  }
  // Offline, a kept sign-in opens the app even once its token has expired: nothing can load
  // anyway, and the pages say so under the banner (feature 008). Back online, an expired one
  // signs in again.
  if (!user || (!auth.isAuthenticated && online)) {
    return <p role="status">Signing in…</p>;
  }

  const session: AuthSession = {
    userName: user.profile.email ?? 'Signed in',
    getAccessToken: () => Promise.resolve(user.access_token),
  };
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

// The sign-in is kept on the device, not just for the session: iOS ends the session whenever
// the installed app is closed, and offline it then couldn't sign in again (feature 008). It
// lasts as long as Cognito's tokens do.
// Stryker disable next-line ObjectLiteral: the store's own default is localStorage too; this says so
export const keptSignIn = () => new WebStorageStateStore({ store: window.localStorage });

function CognitoAuth({ config, children }: { config: AwsConfig; children: ReactNode }) {
  const [userStore] = useState(keptSignIn);
  return (
    <OidcProvider
      authority={config.cognitoAuthority}
      client_id={config.cognitoClientId}
      redirect_uri={config.redirectUri}
      scope="openid email"
      userStore={userStore}
      onSigninCallback={clearSigninParams}
    >
      <CognitoGate>{children}</CognitoGate>
    </OidcProvider>
  );
}

// Locally there is no Cognito: everyone is the fixed dev user. In AWS the app signs in with
// Cognito managed login (authorization code + PKCE) before rendering anything.
export function AuthProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  if (config.appEnv === 'local') {
    return <AuthContext.Provider value={DEV_SESSION}>{children}</AuthContext.Provider>;
  }
  return <CognitoAuth config={config}>{children}</CognitoAuth>;
}

export function useAuthSession(): AuthSession {
  const session = useContext(AuthContext);
  if (!session) {
    throw new Error('useAuthSession must be used inside <AuthProvider>');
  }
  return session;
}

export function useAccessToken(): AuthSession['getAccessToken'] {
  return useAuthSession().getAccessToken;
}
