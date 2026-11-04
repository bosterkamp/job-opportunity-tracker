// @module-tag core
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { App, STALE_TIME_MS, createQueryClient, shouldRetry } from '../src/App';
import { jsonResponse, mockApi, renderApp } from './harness';

const renderAt = (path: string) => renderApp(path);

beforeEach(() => {
  mockApi({
    'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [] }),
    'GET /leads': () => jsonResponse(200, { items: [] }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('AppRoutes', () => {
  it.each([
    ['/', 'Overview'],
    ['/archive', 'Archive'],
    ['/leads', 'Networking leads'],
    ['/opportunities/new', 'Add opportunity'],
    ['/no/such/page', 'Page not found'],
  ])('shows the %s page', (path, heading) => {
    renderAt(path);

    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
  });

  it('links back to the overview from the not-found page', () => {
    renderAt('/nope');

    expect(screen.getByRole('link', { name: 'Back to the overview' })).toHaveAttribute('href', '/');
  });
});

describe('Layout', () => {
  it('shows the app title linking home, the main nav, and the add button', () => {
    renderAt('/archive');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Job Opportunity Tracker' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Job Opportunity Tracker' })).toHaveAttribute(
      'href',
      '/',
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Overview', '/'],
      ['Networking leadsLeads', '/leads'],
      ['Archive', '/archive'],
    ]);
    expect(screen.getByRole('link', { name: 'Add opportunity' })).toHaveAttribute(
      'href',
      '/opportunities/new',
    );
  });

  it('puts the icon on the banner, with the full and the phone title (feature 008)', () => {
    renderAt('/');

    const home = screen.getByRole('link', { name: 'Job Opportunity Tracker' });
    // The icon is decoration: the title names the link.
    const icon = within(home).getByRole('presentation');
    expect(icon).toHaveAttribute('src', '/icon.svg');
    expect(icon).toHaveAttribute('alt', '');
    // CSS shows one title or the other by screen width; the link's name is always the full one.
    expect(within(home).getByText('Job Opportunity Tracker')).toBeInTheDocument();
    expect(within(home).getByText('Job Tracker')).toBeInTheDocument();
    expect(home).toHaveAttribute('aria-label', 'Job Opportunity Tracker');
  });

  it('names the leads link in full, with a short label for small screens (feature 010)', () => {
    renderAt('/');

    const leads = screen.getByRole('link', { name: 'Networking leads' });
    expect(leads).toHaveAttribute('aria-label', 'Networking leads');
    expect(within(leads).getByText('Networking leads')).toBeInTheDocument();
    expect(within(leads).getByText('Leads')).toBeInTheDocument();
    // The others are named by their text alone.
    expect(screen.getByRole('link', { name: 'Archive' })).not.toHaveAttribute('aria-label');
  });

  it.each([
    ['/', 'Overview'],
    ['/archive', 'Archive'],
    ['/leads', 'Networking leadsLeads'],
  ])('marks only the current nav item on %s', (path, current) => {
    renderAt(path);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const marked = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);
    expect(marked).toEqual([current]);
  });

  it('navigates when a nav link is clicked', async () => {
    renderAt('/');

    await userEvent.click(screen.getByRole('link', { name: 'Archive' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Archive' })).toBeInTheDocument();
  });
});

describe('shouldRetry', () => {
  it.each([
    ['a network error', new ApiError(0, 'NETWORK_ERROR', 'x'), true],
    ['a 500', new ApiError(500, 'INTERNAL_ERROR', 'x'), true],
    ['a 503', new ApiError(503, 'HTTP_ERROR', 'x'), true],
    ['a 404', new ApiError(404, 'NOT_FOUND', 'x'), false],
    ['a 499', new ApiError(499, 'HTTP_ERROR', 'x'), false],
    ['a 400', new ApiError(400, 'VALIDATION_ERROR', 'x'), false],
    ['a non-API error', new Error('x'), true],
  ])('retries %s once: %s', (_label, error, retryable) => {
    expect(shouldRetry(0, error)).toBe(retryable);
    expect(shouldRetry(1, error)).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('uses the retry rule, 30 seconds of freshness, and no refetch on window focus', () => {
    expect(STALE_TIME_MS).toBe(30_000);
    expect(createQueryClient().getDefaultOptions().queries).toEqual({
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    });
  });
});

describe('App', () => {
  it('renders the shell with local config at the current URL', () => {
    window.history.pushState({}, '', '/no/such/page');

    render(<App config={{ appEnv: 'local', apiUrl: 'http://localhost:3001' }} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Job Opportunity Tracker' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Page not found' })).toBeInTheDocument();
  });
});
