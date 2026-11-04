// @module-tag mcp
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../src/format';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';

afterEach(() => {
  vi.restoreAllMocks();
});

const history = [
  {
    seq: 1,
    fromStage: null,
    toStage: 'CONSIDERING' as const,
    changedAt: '2026-10-17T12:00:00.000Z',
    note: null,
    recordedAt: '2026-10-17T12:00:00.000Z',
  },
  {
    seq: 2,
    fromStage: 'CONSIDERING' as const,
    toStage: 'APPLIED' as const,
    changedAt: '2026-10-19T12:00:00.000Z',
    note: 'Sent CV',
    recordedAt: '2026-10-19T12:00:00.000Z',
    via: 'CLAUDE' as const,
  },
];

async function open(overrides: Parameters<typeof anOpportunity>[0]) {
  mockApi({
    'GET /opportunities/v': () => jsonResponse(200, anOpportunity({ id: 'v', ...overrides })),
  });
  renderApp('/opportunities/v');
  await screen.findByRole('heading', { level: 2 });
}

describe('changes made through Claude', () => {
  it('marks history entries made through Claude, after the date, and only those', async () => {
    await open({ stage: 'APPLIED', history });

    const entries = within(screen.getByRole('list', { name: '' }).closest('ol') as HTMLElement)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(entries).toEqual([
      `Considering · ${formatDate('2026-10-17T12:00:00.000Z')}`,
      `Applied · ${formatDate('2026-10-19T12:00:00.000Z')} · via Claude · Sent CV`,
    ]);
  });

  it('says when the details were last changed through Claude', async () => {
    await open({ detailsEditedViaClaudeAt: '2026-10-20T16:30:00.000Z' });

    expect(
      screen.getByText(
        `Details last changed through Claude on ${formatDate('2026-10-20T16:30:00.000Z')}`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['absent', {}],
    ['cleared', { detailsEditedViaClaudeAt: null }],
  ])('says nothing about Claude when that time is %s', async (_label, overrides) => {
    await open(overrides);

    expect(screen.queryByText(/through Claude|via Claude/)).not.toBeInTheDocument();
  });
});
