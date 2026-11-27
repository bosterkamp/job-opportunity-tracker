// @module-tag offer
import type { Offer, OfferFields, OpportunityWithHistory } from '@jot/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

// Feature 013: the custom fields every offer shares, managed on Settings since feature 014.
const AT = '2026-11-20T15:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

const offerOf = (details: Partial<Offer>): Offer => ({ ...details, createdAt: AT, updatedAt: AT });

const acme = anOpportunity({
  id: 'a',
  company: 'Acme',
  stage: 'OFFER',
  offer: offerOf({ custom: { f1: '20 min' } }),
  offerScores: { 'custom:f1': 2, pto: 4 },
});
const bolt = anOpportunity({
  id: 'b',
  company: 'Bolt',
  stage: 'OFFER',
  offer: offerOf({ custom: { f1: '1 hour', f2: 'Yes' } }),
  offerScores: {},
});

// A fake list of fields that takes each change, as the API does.
function fieldsApi(start: OfferFields['fields'], extra: Record<string, () => Response> = {}) {
  let current: OfferFields = { fields: start, removed: [], weights: {}, version: 4 };
  const sent: { body: unknown; headers: Headers }[] = [];
  let n = 0;
  const routes = {
    'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [acme, bolt] }),
    'GET /opportunities?status=CLOSED': () => jsonResponse(200, { items: [] }),
    'GET /opportunities/a': () => jsonResponse(200, acme),
    'GET /opportunities/b': () => jsonResponse(200, bolt),
    'GET /offer-fields': () => jsonResponse(200, current),
    'PATCH /offer-fields': (request: { body: unknown; headers: Headers }) => {
      sent.push(request);
      const { fields } = request.body as { fields: { id?: string; name: string }[] };
      const kept = new Set(fields.map((f) => f.id));
      current = {
        fields: fields.map((f) => ({ id: f.id ?? `new${n++}`, name: f.name })),
        removed: [...current.removed, ...current.fields.filter((f) => !kept.has(f.id))],
        weights: current.weights,
        version: current.version + 1,
      };
      return jsonResponse(200, current);
    },
    ...extra,
  };
  return { routes, sent };
}

const START = [
  { id: 'f1', name: 'Commute' },
  { id: 'f2', name: 'Tuition' },
];

const confirmHeader = (request?: { headers: Headers }) =>
  request?.headers.get('x-confirm-delete') ?? null;

const fieldNames = () =>
  within(screen.getByRole('list', { name: 'Custom fields' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('span')?.textContent);

describe('Custom fields, on Settings', () => {
  it('adds a field, which becomes a row on the comparison and a field on the form', async () => {
    const { routes, sent } = fieldsApi([]);
    mockApi(routes);
    const view = renderApp('/settings');

    expect(
      await screen.findByText(
        'Add your own fields, such as the commute or tuition support. Every offer gets them.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Custom fields' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Custom fields' })).toBeNull();
    await fill(screen.getByLabelText('New field'), 'Commute');
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }));

    await waitFor(() => expect(fieldNames()).toEqual(['Commute']));
    expect(screen.queryByText(/Add your own fields/)).toBeNull();
    expect(screen.getByLabelText('New field')).toHaveValue('');
    expect(sent.map((r) => r.body)).toEqual([
      { fields: [{ name: 'Commute' }], expectedVersion: 4 },
    ]);
    // Only removing needs the confirmation.
    expect(confirmHeader(sent[0])).toBeNull();
    // Adding stays on the page rather than submitting the form to the browser.
    expect(fireEvent.submit(screen.getByRole('form', { name: 'Add a custom field' }))).toBe(false);
    view.unmount();

    renderApp('/offers/compare?ids=a,b');
    expect(await screen.findByRole('rowheader', { name: 'Commute' })).toBeInTheDocument();
  });

  it('refuses a blank, long or repeated name on its field, and sends nothing', async () => {
    const { routes, sent } = fieldsApi(START);
    mockApi(routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Add field' }));
    expect(screen.getByLabelText('New field')).toHaveAccessibleDescription('Name the field');
    expect(screen.getByLabelText('New field')).toHaveAttribute('aria-invalid', 'true');
    await fill(screen.getByLabelText('New field'), 'commute');
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getByLabelText('New field')).toHaveAccessibleDescription(
      "There's already a field called commute",
    );
    await userEvent.clear(screen.getByLabelText('New field'));
    await fill(screen.getByLabelText('New field'), 'x'.repeat(61));
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getByLabelText('New field')).toHaveAccessibleDescription(
      'Must be 60 characters or fewer',
    );
    expect(sent).toEqual([]);
  });

  it('says when there are 20, instead of offering more', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, name: `Field ${i}` }));
    mockApi(fieldsApi(twenty).routes);
    renderApp('/settings');

    expect(await screen.findByText('You can have at most 20 custom fields')).toBeInTheDocument();
    expect(screen.queryByLabelText('New field')).toBeNull();
  });

  it('renames a field, keeping its id', async () => {
    const { routes, sent } = fieldsApi(START);
    mockApi(routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Commute' }));
    const input = screen.getByLabelText('New name for Commute');
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByLabelText('New name for Commute')).toHaveAccessibleDescription(
      'Name the field',
    );
    expect(screen.getByLabelText('New name for Commute')).toHaveAttribute('aria-invalid', 'true');
    expect(fireEvent.submit(screen.getByRole('form', { name: 'Rename Commute' }))).toBe(false);
    await fill(screen.getByLabelText('New name for Commute'), 'Commute time');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => expect(fieldNames()).toEqual(['Commute time', 'Tuition']));
    expect(sent.map((r) => r.body)).toEqual([
      {
        fields: [
          { id: 'f1', name: 'Commute time' },
          { id: 'f2', name: 'Tuition' },
        ],
        expectedVersion: 4,
      },
    ]);
    expect(confirmHeader(sent[0])).toBeNull();
  });

  it('refuses renaming a field to the name of one after it, and sends nothing', async () => {
    const { routes, sent } = fieldsApi(START);
    mockApi(routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Commute' }));
    await userEvent.clear(screen.getByLabelText('New name for Commute'));
    await fill(screen.getByLabelText('New name for Commute'), 'tuition');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(screen.getByLabelText('New name for Commute')).toHaveAccessibleDescription(
      "There's already a field called tuition",
    );
    expect(sent).toEqual([]);
  });

  it('cancels a rename', async () => {
    const { routes, sent } = fieldsApi(START);
    mockApi(routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Tuition' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fieldNames()).toEqual(['Commute', 'Tuition']);
    expect(sent).toEqual([]);
  });

  it('moves fields up and down', async () => {
    const { routes, sent } = fieldsApi([...START, { id: 'f3', name: 'Gym' }]);
    mockApi(routes);
    renderApp('/settings');

    expect(await screen.findByRole('button', { name: 'Move Commute up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Gym down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Gym up' }));
    await waitFor(() => expect(fieldNames()).toEqual(['Commute', 'Gym', 'Tuition']));
    await userEvent.click(screen.getByRole('button', { name: 'Move Commute down' }));
    await waitFor(() => expect(fieldNames()).toEqual(['Gym', 'Commute', 'Tuition']));
    expect(sent).toHaveLength(2);
    expect(sent.map(confirmHeader)).toEqual([null, null]);
  });

  it('removes a field after saying how many offers have a value for it', async () => {
    const { routes, sent } = fieldsApi(START);
    mockApi(routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Commute' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Remove the field "Commute"? 2 offers have a value for it, which go too, with their scores.',
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tuition' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '1 offer has a value for it, which goes too, with its score.',
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(fieldNames()).toEqual(['Commute']));
    expect(sent.map((r) => r.body)).toEqual([
      { fields: [{ id: 'f1', name: 'Commute' }], expectedVersion: 4 },
    ]);
    expect(confirmHeader(sent[0])).toBe('true');
  });

  it('says when no offer has a value for the field', async () => {
    mockApi(fieldsApi([{ id: 'f9', name: 'Gym' }]).routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Gym' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Remove the field "Gym"? No offer has a value for it.',
    );
  });

  it('shows the reload message when the list changed elsewhere', async () => {
    const { routes } = fieldsApi(START, {
      'PATCH /offer-fields': () =>
        jsonResponse(409, {
          code: 'CONFLICT',
          message: 'Settings changed since you loaded them. Reload and try again.',
        }),
    });
    mockApi(routes);
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('button', { name: 'Move Tuition up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and try again.');
  });
});

describe('on the Offers page and the comparison', () => {
  it('has no field controls, only a link to Settings, on the Offers page', async () => {
    mockApi(fieldsApi(START).routes);
    renderApp('/offers');

    await screen.findByRole('list', { name: 'Offers' });
    expect(screen.queryByLabelText('New field')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Custom fields' })).toBeNull();
    expect(
      screen.getByRole('link', {
        name: 'Custom fields and what each detail counts are in Settings',
      }),
    ).toHaveAttribute('href', '/settings');
  });

  it("has no field controls on the comparison, but each offer's value and score", async () => {
    mockApi(fieldsApi([{ id: 'f1', name: 'Commute' }]).routes);
    renderApp('/offers/compare?ids=a,b');

    expect(
      await screen.findByRole('combobox', { name: 'Score Commute for Acme' }),
    ).toHaveDisplayValue('2 · Poor');
    // Bolt's value for the removed field f2 isn't shown.
    expect(screen.queryByText('Yes')).toBeNull();
    expect(screen.queryByLabelText('New field')).toBeNull();
    expect(screen.queryByRole('region', { name: /field/i })).toBeNull();
  });

  it('leaves a removed field out of the overall', async () => {
    const withRemoved: OpportunityWithHistory = {
      ...acme,
      offerScores: { 'custom:gone': 0, pto: 4 },
    };
    const { routes } = fieldsApi(START, {
      'GET /opportunities/a': () => jsonResponse(200, withRemoved),
    });
    mockApi(routes);
    renderApp('/offers/compare?ids=a,b');

    const overall = (await screen.findByRole('rowheader', { name: 'Overall' })).closest('tr');
    expect(within(overall as HTMLElement).getAllByRole('cell')[0]).toHaveTextContent('4.0 · Good');
  });
});

describe('custom fields and how much they count', () => {
  const importances = () =>
    within(screen.getByRole('list', { name: 'How much each detail counts' }))
      .getAllByRole('combobox')
      .map((select) => [select.getAttribute('aria-label'), (select as HTMLSelectElement).value]);

  it('lists a new field at Normal, and a removed one no more', async () => {
    mockApi(fieldsApi([{ id: 'f1', name: 'Commute' }]).routes);
    renderApp('/settings');

    await fill(await screen.findByLabelText('New field'), 'Gym');
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }));
    await waitFor(() =>
      expect(importances().slice(-2)).toEqual([
        ['How much Commute counts', '1'],
        ['How much Gym counts', '1'],
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove Commute' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() => expect(importances().slice(-1)).toEqual([['How much Gym counts', '1']]));
    expect(importances()).toHaveLength(16);
  });
});
