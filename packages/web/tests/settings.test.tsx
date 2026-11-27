// @module-tag offer
import type { OfferFields } from '@jot/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderApp } from './harness';

// Feature 014: the Settings page, where each offer detail's importance is set.

afterEach(() => {
  vi.restoreAllMocks();
});

const START: OfferFields = {
  fields: [
    { id: 'f1', name: 'Commute' },
    { id: 'f2', name: 'Gym' },
  ],
  removed: [],
  weights: { baseSalary: 3, 'custom:f2': 0 },
  version: 4,
};

type Patch = { weights: Record<string, number>; expectedVersion: number };

// A fake settings API that merges weights as the real one does.
function settingsApi(start: OfferFields = START) {
  let current = start;
  const sent: Patch[] = [];
  return {
    sent,
    routes: {
      // Settings also loads the offers, for the custom fields (feature 013).
      'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [] }),
      'GET /offer-fields': () => jsonResponse(200, current),
      'PATCH /offer-weights': ({ body }: { body: unknown }) => {
        const patch = body as Patch;
        sent.push(patch);
        const weights = { ...current.weights };
        for (const [key, value] of Object.entries(patch.weights)) {
          if (value === 1) {
            delete weights[key];
          } else {
            weights[key] = value;
          }
        }
        current = { ...current, weights, version: current.version + 1 };
        return jsonResponse(200, current);
      },
    },
  };
}

const importance = (name: string) =>
  screen.getByRole('combobox', { name: `How much ${name} counts` });

describe('Settings', () => {
  it('lists every detail, then each custom field, with how much it counts', async () => {
    mockApi(settingsApi().routes);
    renderApp('/settings');

    expect(await screen.findByRole('heading', { name: 'Settings', level: 2 })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Offer comparison', level: 3 }),
    ).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'How much each detail counts' });
    const names = within(list)
      .getAllByRole('combobox')
      .map((select) => select.getAttribute('aria-label'));
    expect(names).toEqual(
      [
        'Base salary',
        'Bonus',
        'Sign-on bonus',
        'Equity',
        '401k',
        'Insurance',
        'Location',
        'Work arrangement',
        'Title',
        'Role',
        'PTO',
        'Leadership',
        'Culture',
        'Start date',
        'Respond by',
        'Commute',
        'Gym',
      ].map((name) => `How much ${name} counts`),
    );

    expect(importance('Base salary')).toHaveValue('3');
    expect(importance('PTO')).toHaveValue('1');
    expect(importance('Commute')).toHaveValue('1');
    expect(importance('Gym')).toHaveValue('0');
    expect(
      within(importance('PTO'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['0 · Ignore', '1 · Normal', '2 · Important', '3 · Critical']);
    expect(screen.getByText(/A Critical detail counts three times a Normal one/)).toBeVisible();
    expect(screen.getByRole('region', { name: 'How much each detail counts' })).toBeInTheDocument();
    // Nothing has been saved yet.
    expect(screen.getByRole('status')).toHaveTextContent(/^$/);
    expect(importance('PTO')).not.toHaveAttribute('aria-invalid');
    // Each name is the select's label, so clicking it focuses the select.
    await userEvent.click(within(list).getByText('PTO'));
    expect(importance('PTO')).toHaveFocus();
  });

  it('saves each change on its own, and says so', async () => {
    const api = settingsApi();
    mockApi(api.routes);
    renderApp('/settings');

    await userEvent.selectOptions(await screen.findByLabelText('How much Title counts'), '0');

    await waitFor(() => expect(api.sent).toEqual([{ weights: { title: 0 }, expectedVersion: 4 }]));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(importance('Title')).toHaveValue('0');

    // Back to Normal.
    await userEvent.selectOptions(importance('Base salary'), '1');
    await waitFor(() => expect(api.sent).toHaveLength(2));
    expect(api.sent[1]).toEqual({ weights: { baseSalary: 1 }, expectedVersion: 5 });
    expect(importance('Base salary')).toHaveValue('1');
  });

  it('sends quick changes one after another, each with the version the last returned', async () => {
    const api = settingsApi();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      ...api.routes,
      'PATCH /offer-weights': async (request) => {
        if (api.sent.length === 0) {
          await held;
        }
        return api.routes['PATCH /offer-weights'](request);
      },
    });
    renderApp('/settings');

    await userEvent.selectOptions(await screen.findByLabelText('How much Title counts'), '0');
    await userEvent.selectOptions(importance('PTO'), '2');
    // The second waits for the first, and shows its new value meanwhile.
    expect(importance('PTO')).toHaveValue('2');
    expect(api.sent).toEqual([]);
    release();

    await waitFor(() => expect(api.sent).toHaveLength(2));
    expect(api.sent).toEqual([
      { weights: { title: 0 }, expectedVersion: 4 },
      { weights: { pto: 2 }, expectedVersion: 5 },
    ]);
  });

  it('puts the stored value back and says why when a change fails', async () => {
    const api = settingsApi();
    let reads = 0;
    mockApi({
      ...api.routes,
      'GET /offer-fields': () => {
        reads += 1;
        return api.routes['GET /offer-fields']();
      },
      'PATCH /offer-weights': () =>
        jsonResponse(409, {
          code: 'CONFLICT',
          message: 'Settings changed since you loaded them. Reload and try again.',
        }),
    });
    renderApp('/settings');

    await userEvent.selectOptions(await screen.findByLabelText('How much Title counts'), '3');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save how much Title counts. Settings changed since you loaded them. Reload and try again.",
    );
    expect(importance('Title')).toHaveValue('1');
    expect(importance('Title')).toHaveAttribute('aria-invalid', 'true');
    // A conflict reloads the settings, so the next change goes with the current version.
    await waitFor(() => expect(reads).toBe(2));
    expect(importance('Title')).toHaveAccessibleDescription(
      "Couldn't save how much Title counts. Settings changed since you loaded them. Reload and try again.",
    );
    expect(screen.queryByRole('status')).not.toHaveTextContent('Saved');
  });

  it('says when nothing counts toward the overall score', async () => {
    const weights = Object.fromEntries(
      [
        'baseSalary',
        'bonusPercent',
        'signOnBonus',
        'equity',
        'retirement',
        'insurance',
        'location',
        'workArrangement',
        'title',
        'role',
        'pto',
        'leadership',
        'culture',
        'startDate',
        'respondBy',
      ].map((key) => [key, 0]),
    );
    mockApi(settingsApi({ ...START, fields: [], weights }).routes);
    renderApp('/settings');

    expect(
      await screen.findByText(
        'Nothing counts toward the overall score while every detail is Ignored.',
      ),
    ).toBeInTheDocument();
  });

  it("doesn't say so while something counts", async () => {
    mockApi(settingsApi().routes);
    renderApp('/settings');
    await screen.findByRole('list', { name: 'How much each detail counts' });
    expect(screen.queryByText(/Nothing counts/)).toBeNull();
  });

  it('shows loading, then a failure with Try again', async () => {
    let failing = true;
    mockApi({
      'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [] }),
      'GET /offer-fields': () =>
        failing
          ? jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Nope' })
          : jsonResponse(200, START),
    });
    renderApp('/settings');

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your settings.");
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('list', { name: 'How much each detail counts' }),
    ).toBeInTheDocument();
  });
});
