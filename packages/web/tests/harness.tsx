import type { OpportunityWithHistory } from '@jot/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { vi } from 'vitest';
import { ApiClientProvider } from '../src/api/ApiClientProvider';
import { AppRoutes, createQueryClient } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ConfigContext } from '../src/config';

export const API = 'http://api.test';

type Reply = (request: { body: unknown }) => Response | Promise<Response>;

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Fakes the API: keys are "METHOD /path?query". Unknown requests get a 404 error body.
const CLOSED_LIST = 'GET /opportunities?status=CLOSED';

export function mockApi(routes: Record<string, Reply>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    // The overview also loads the closed list (feature 004); it's empty unless a test says so.
    const reply =
      routes[key] ?? (key === CLOSED_LIST ? () => jsonResponse(200, { items: [] }) : undefined);
    if (!reply) {
      return jsonResponse(404, { code: 'NOT_FOUND', message: `No mock for ${key}` });
    }
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    return reply({ body });
  });
}

// A "back" button for tests, since MemoryRouter has no browser back button.
function TestBackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      test: go back
    </button>
  );
}

// Renders the real routes with local config, the dev user, and a fresh query cache that uses
// the app's real query settings. `from` puts an earlier page in the history (for going back).
export function renderApp(path: string, { from }: { from?: string } = {}) {
  const queryClient = createQueryClient();
  const view = render(
    <ConfigContext.Provider value={{ appEnv: 'local', apiUrl: API }}>
      <AuthProvider>
        <ApiClientProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={from ? [from, path] : [path]} initialIndex={from ? 1 : 0}>
              <AppRoutes />
              {from && <TestBackButton />}
            </MemoryRouter>
          </QueryClientProvider>
        </ApiClientProvider>
      </AuthProvider>
    </ConfigContext.Provider>,
  );
  return { ...view, queryClient };
}

export function anOpportunity(
  overrides: Partial<OpportunityWithHistory> = {},
): OpportunityWithHistory {
  return {
    id: '01JTEST',
    company: 'Acme',
    title: 'Senior Engineer',
    stage: 'CONSIDERING',
    status: 'OPEN',
    createdAt: '2026-10-17T12:00:00.000Z',
    updatedAt: '2026-10-17T12:00:00.000Z',
    lastStageChangeAt: '2026-10-17T12:00:00.000Z',
    changeCount: 1,
    history: [
      {
        seq: 1,
        fromStage: null,
        toStage: 'CONSIDERING',
        changedAt: '2026-10-17T12:00:00.000Z',
        note: null,
        recordedAt: '2026-10-17T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}
