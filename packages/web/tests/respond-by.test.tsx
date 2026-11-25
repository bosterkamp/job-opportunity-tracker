// @module-tag offer
import type { OpportunityWithHistory } from '@jot/shared';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { setWideScreen } from './media';

// Feature 013, story 6: when an offer needs an answer, on the card and the Offers page.
const NOW = new Date('2026-11-21T15:00:00.000Z');
const AT = '2026-11-20T15:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const withRespondBy = (
  id: string,
  company: string,
  respondBy: string | undefined,
  overrides: Partial<OpportunityWithHistory> = {},
) =>
  anOpportunity({
    id,
    company,
    stage: 'OFFER',
    offer: { ...(respondBy && { respondBy }), createdAt: AT, updatedAt: AT },
    offerScores: {},
    ...overrides,
  });

const soon = withRespondBy('s', 'Soon', '2026-11-24');
const later = withRespondBy('l', 'Later', '2026-11-25');
const passed = withRespondBy('p', 'Passed', '2026-11-20');
const none = withRespondBy('n', 'None', undefined);
const closed = withRespondBy('c', 'Closed', '2026-11-22', { stage: 'ACCEPTED', status: 'CLOSED' });

function routes() {
  return {
    'GET /opportunities?status=OPEN': () =>
      jsonResponse(200, { items: [soon, later, passed, none] }),
    'GET /opportunities?status=CLOSED': () => jsonResponse(200, { items: [closed] }),
    'GET /offer-fields': () => jsonResponse(200, { fields: [], removed: [], version: 0 }),
  };
}

describe('respond-by dates on the board', () => {
  it('warn within 3 days, and say when they have passed', async () => {
    setWideScreen(true);
    mockApi(routes());
    renderApp('/');

    const card = async (name: string) => within(await screen.findByRole('article', { name }));
    expect((await card('Soon')).getByText('Respond by Nov 24')).toHaveClass(/deadlineSoon/);
    expect((await card('Later')).getByText('Respond by Nov 25')).not.toHaveClass(/deadlineSoon/);
    expect((await card('Passed')).getByText('Response was due Nov 20')).not.toHaveClass(
      /deadlineSoon/,
    );
    expect((await card('None')).queryByText(/Respond|Response/)).toBeNull();
    // Closed: shown, never highlighted.
    expect((await card('Closed')).getByText('Respond by Nov 22')).not.toHaveClass(/deadlineSoon/);
  });
});

describe('respond-by dates on the Offers page', () => {
  it('warn the same way', async () => {
    mockApi(routes());
    renderApp('/offers');

    await screen.findByRole('list', { name: 'Offers' });
    expect(screen.getByText('Respond by Nov 24, 2026')).toHaveClass(/due/);
    expect(screen.getByText('Respond by Nov 25, 2026')).toHaveClass(/muted/);
    expect(screen.getByText('Response was due Nov 20, 2026')).toHaveClass(/muted/);
    expect(screen.getByText('Respond by Nov 22, 2026')).toHaveClass(/muted/);
  });
});
