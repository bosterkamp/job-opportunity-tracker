// @module-tag core
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryState } from '../src/components/QueryState';
import { useOnline } from '../src/useOnline';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';

afterEach(() => {
  vi.restoreAllMocks();
});

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

const failed = new Error('Server unavailable');
const base = { what: 'your opportunities', onRetry: () => undefined, retrying: false };

describe('QueryState', () => {
  it('shows a card-shaped skeleton while loading, announced as loading', () => {
    const { container } = render(<QueryState {...base} isPending error={null} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a detail-shaped skeleton when asked', () => {
    const { container } = render(<QueryState {...base} isPending error={null} skeleton="detail" />);

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
    expect(screen.getByRole('status').className).not.toBe(
      render(<QueryState {...base} isPending error={null} />).container.querySelector(
        '[role="status"]',
      )?.className,
    );
  });

  it('renders nothing once loaded without an error', () => {
    const { container } = render(<QueryState {...base} isPending={false} error={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the error with a "Try again" button that retries', async () => {
    const onRetry = vi.fn();
    render(<QueryState {...base} isPending={false} error={failed} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load your opportunities. Server unavailable",
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('disables the button while retrying', () => {
    render(<QueryState {...base} isPending={false} error={failed} retrying />);

    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
  });

  it('says when the failure is because the browser is offline, and updates on reconnect', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<QueryState {...base} isPending={false} error={failed} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're offline, so your opportunities couldn't load. They'll load again when you reconnect.",
    );
    setOnline(true);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your opportunities.");
  });
});

describe('useOnline', () => {
  function Probe() {
    return <p>{useOnline() ? 'online' : 'offline'}</p>;
  }

  it('follows the online and offline events, and stops listening when unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();

    setOnline(false);
    expect(screen.getByText('offline')).toBeInTheDocument();
    setOnline(true);
    expect(screen.getByText('online')).toBeInTheDocument();

    unmount();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['online', 'offline']),
    );
  });
});

describe('retrying from a page', () => {
  it.each([
    ['/', 'GET /opportunities?status=OPEN', { items: [] }, 'No opportunities yet.'],
    ['/archive', 'GET /opportunities?status=CLOSED', { items: [] }, 'Nothing in the archive yet.'],
    ['/opportunities/r', 'GET /opportunities/r', anOpportunity({ id: 'r' }), 'Senior Engineer'],
  ])('on %s, "Try again" reloads after a failure', async (path, route, body, loaded) => {
    let calls = 0;
    mockApi({
      [route]: () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad request' })
          : jsonResponse(200, body);
      },
    });
    renderApp(path);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(loaded)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the detail skeleton while an opportunity loads', () => {
    mockApi({ 'GET /opportunities/s': () => new Promise<Response>(() => undefined) });

    const { container } = renderApp('/opportunities/s');

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(container.querySelectorAll('[role="status"] [aria-hidden="true"]')).toHaveLength(5);
  });

  // With nothing loaded yet, a retry goes back to the loading state. ("Retrying…" shows when a
  // refresh fails while data is already on screen.)
  it('shows the skeleton again while the reload is in flight', async () => {
    let calls = 0;
    mockApi({
      'GET /opportunities?status=OPEN': () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad request' })
          : new Promise<Response>(() => undefined);
      },
    });
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
