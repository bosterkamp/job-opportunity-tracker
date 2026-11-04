// @module-tag core
import { act, render, screen, waitFor } from '@testing-library/react';
import { WebStorageStateStore } from 'oidc-client-ts';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthProvider,
  DEV_SESSION,
  clearSigninParams,
  keptSignIn,
  useAccessToken,
  useAuthSession,
} from '../src/auth/AuthProvider';
import { ConfigContext, type AppConfig } from '../src/config';

// react-oidc-context talks to Cognito; replace it with a controllable fake.
const oidc = vi.hoisted(() => ({
  providerProps: undefined as Record<string, unknown> | undefined,
  auth: {},
}));

vi.mock('react-oidc-context', () => ({
  AuthProvider: ({ children, ...props }: { children: ReactNode }) => {
    oidc.providerProps = props;
    return children;
  },
  useAuth: () => oidc.auth,
}));

const awsConfig: AppConfig = {
  appEnv: 'aws',
  apiUrl: 'https://api.example.com',
  cognitoAuthority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc',
  cognitoClientId: 'client123',
  redirectUri: 'https://d111.cloudfront.net/',
};

let signinRedirect: ReturnType<typeof vi.fn>;

function authState(overrides: Record<string, unknown>) {
  oidc.auth = {
    isLoading: false,
    isAuthenticated: false,
    error: undefined,
    activeNavigator: undefined,
    user: null,
    signinRedirect,
    ...overrides,
  };
}

function SessionInfo() {
  const session = useAuthSession();
  const getToken = useAccessToken();
  return (
    <button
      type="button"
      onClick={() => void getToken().then((token) => (document.title = token ?? 'none'))}
    >
      {session.userName}
    </button>
  );
}

function renderWith(config: AppConfig) {
  return render(
    <ConfigContext.Provider value={config}>
      <AuthProvider>
        <SessionInfo />
      </AuthProvider>
    </ConfigContext.Provider>,
  );
}

beforeEach(() => {
  signinRedirect = vi.fn(() => Promise.resolve());
  oidc.providerProps = undefined;
  authState({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthProvider locally', () => {
  it('signs everyone in as the dev user with no token', async () => {
    renderWith({ appEnv: 'local', apiUrl: 'http://localhost:3001' });

    expect(screen.getByRole('button', { name: 'Dev user' })).toBeInTheDocument();
    expect(oidc.providerProps).toBeUndefined();
    await expect(DEV_SESSION.getAccessToken()).resolves.toBeUndefined();
  });
});

describe('AuthProvider in AWS', () => {
  it('configures Cognito with the code flow settings from config', () => {
    renderWith(awsConfig);

    const { userStore, ...settings } = oidc.providerProps ?? {};
    expect(settings).toEqual({
      authority: awsConfig.cognitoAuthority,
      client_id: 'client123',
      redirect_uri: 'https://d111.cloudfront.net/',
      scope: 'openid email',
      onSigninCallback: clearSigninParams,
    });
    expect(userStore).toBeInstanceOf(WebStorageStateStore);
  });

  describe('keeping the sign-in (feature 008)', { tags: ['theme'] }, () => {
    it('keeps it on the device, so it survives the installed app being closed', async () => {
      localStorage.clear();

      await keptSignIn().set('user:test', 'kept');

      expect(localStorage.getItem('oidc.user:test')).toBe('kept');
      expect(sessionStorage.getItem('oidc.user:test')).toBeNull();
    });

    const expired = { access_token: 'old', profile: { email: 'me@example.com' }, expired: true };

    it('opens the app offline with an expired sign-in, then signs in again once online', async () => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      authState({ user: expired });

      renderWith(awsConfig);

      expect(screen.getByRole('button', { name: 'me@example.com' })).toBeInTheDocument();
      expect(signinRedirect).not.toHaveBeenCalled();

      onLine.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(screen.getByRole('status')).toHaveTextContent('Signing in…');
      await waitFor(() => expect(signinRedirect).toHaveBeenCalledOnce());
    });

    it('treats a failed token refresh as signed out, not as an error', async () => {
      authState({ user: expired, error: { source: 'renewSilent', message: 'Failed to fetch' } });

      renderWith(awsConfig);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await waitFor(() => expect(signinRedirect).toHaveBeenCalledOnce());
    });

    it('still opens the app offline after a failed token refresh', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      authState({ user: expired, error: { source: 'renewSilent', message: 'Failed to fetch' } });

      renderWith(awsConfig);

      expect(screen.getByRole('button', { name: 'me@example.com' })).toBeInTheDocument();
    });
  });

  it('redirects to Cognito sign-in when signed out', async () => {
    renderWith(awsConfig);

    expect(screen.getByRole('status')).toHaveTextContent('Signing in…');
    await waitFor(() => expect(signinRedirect).toHaveBeenCalledOnce());
  });

  describe('offline (feature 006)', { tags: ['installable'] }, () => {
    it('says so instead of redirecting, then signs in once the connection is back', async () => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      renderWith(awsConfig);

      expect(screen.getByRole('status')).toHaveTextContent(
        "You're offline. Sign in again once you're connected.",
      );
      expect(signinRedirect).not.toHaveBeenCalled();

      onLine.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => expect(signinRedirect).toHaveBeenCalledOnce());
    });

    it('waits quietly while loading, even offline', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      authState({ isLoading: true });

      renderWith(awsConfig);

      expect(screen.getByRole('status')).toHaveTextContent('Signing in…');
    });

    it('opens the app offline when already signed in', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      authState({
        isAuthenticated: true,
        user: { access_token: 'token', profile: { email: 'me@example.com' } },
      });

      renderWith(awsConfig);

      expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
    });
  });

  it.each([
    ['still loading', { isLoading: true }],
    ['already redirecting', { activeNavigator: 'signinRedirect' }],
  ])('waits without redirecting while %s', (_label, state) => {
    authState(state);

    renderWith(awsConfig);

    expect(screen.getByRole('status')).toHaveTextContent('Signing in…');
    expect(signinRedirect).not.toHaveBeenCalled();
  });

  it('redirects once loading finishes and the user turns out to be signed out', async () => {
    authState({ isLoading: true });
    const { rerender } = renderWith(awsConfig);
    expect(signinRedirect).not.toHaveBeenCalled();

    authState({ isLoading: false });
    rerender(
      <ConfigContext.Provider value={awsConfig}>
        <AuthProvider>
          <SessionInfo />
        </AuthProvider>
      </ConfigContext.Provider>,
    );

    await waitFor(() => expect(signinRedirect).toHaveBeenCalledOnce());
  });

  it('shows a sign-in error instead of redirecting again', () => {
    authState({ error: Object.assign(new Error('invalid_grant'), { source: 'signinCallback' }) });

    renderWith(awsConfig);

    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed: invalid_grant');
    expect(signinRedirect).not.toHaveBeenCalled();
  });

  it('waits when authenticated but the user is not loaded yet', () => {
    authState({ isAuthenticated: true, user: null });

    renderWith(awsConfig);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the app with the signed-in user and their access token', async () => {
    authState({
      isAuthenticated: true,
      user: { profile: { email: 'me@example.com' }, access_token: 'tok-123' },
    });

    renderWith(awsConfig);

    const button = screen.getByRole('button', { name: 'me@example.com' });
    button.click();
    await waitFor(() => expect(document.title).toBe('tok-123'));
    expect(signinRedirect).not.toHaveBeenCalled();
  });

  it('falls back to a generic name when the token has no email', () => {
    authState({ isAuthenticated: true, user: { profile: {}, access_token: 'tok' } });

    renderWith(awsConfig);

    expect(screen.getByRole('button', { name: 'Signed in' })).toBeInTheDocument();
  });
});

describe('clearSigninParams', () => {
  it('removes the code and state query parameters from the address bar', () => {
    window.history.pushState({}, '', '/archive?code=abc&state=xyz');

    clearSigninParams();

    expect(window.location.pathname).toBe('/archive');
    expect(window.location.search).toBe('');
  });
});

describe('useAuthSession', () => {
  it('throws outside AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<SessionInfo />)).toThrow(
      'useAuthSession must be used inside <AuthProvider>',
    );
  });
});
