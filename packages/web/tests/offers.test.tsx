// @module-tag offer
import type { Offer, OfferChange, OfferFields, OpportunityWithHistory } from '@jot/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

// Feature 013: the Offer section, the offer's own page, and its history.
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

const FIELDS: OfferFields = {
  fields: [{ id: 'f1', name: 'Commute' }],
  removed: [{ id: 'f2', name: 'Tuition' }],
  version: 3,
};

const offer: Offer = {
  baseSalary: 165000,
  bonusPercent: 10,
  workArrangement: 'REMOTE',
  pto: '20 days',
  respondBy: '2026-11-28',
  custom: { f1: '20 min' },
  createdAt: AT,
  updatedAt: AT,
};

function acme(overrides: Partial<OpportunityWithHistory> = {}) {
  return anOpportunity({
    id: 'a',
    company: 'Acme',
    title: 'Staff Engineer',
    stage: 'OFFER',
    location: 'Denver, CO',
    workArrangement: 'HYBRID',
    salaryMin: 150000,
    salaryMax: 180000,
    ...overrides,
  });
}

const withOffer = (overrides: Partial<OpportunityWithHistory> = {}) =>
  acme({ offer, offerScores: {}, offerHistory: [recorded], ...overrides });

const recorded: OfferChange = {
  seq: 1,
  at: AT,
  kind: 'RECORDED',
  changes: [{ field: 'baseSalary', from: null, to: 160000 }],
};

const section = () => screen.getByRole('region', { name: 'Offer' });

describe('the Offer section', () => {
  it('offers to add one when there is none', async () => {
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, acme()),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a');

    const link = await screen.findByRole('link', { name: 'Add offer' });
    expect(link).toHaveAttribute('href', '/opportunities/a/offer');
    expect(within(section()).getByText('No offer recorded yet.')).toBeInTheDocument();
  });

  it('shows each detail as entered, beside the salary range', async () => {
    mockApi({
      'GET /opportunities/a': () =>
        jsonResponse(200, withOffer({ offerScores: { baseSalary: 5, equity: 0 } })),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a');

    const offerSection = await screen.findByRole('region', { name: 'Offer' });
    const facts = () =>
      within(offerSection)
        .getAllByRole('term')
        .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`);
    await waitFor(() => expect(facts()).toContain('Commute: 20 min'));
    expect(facts()).toEqual([
      'Base salary: 165,0005 · Best',
      'Bonus: 10%',
      // Scored 0 with nothing entered.
      'Equity: Not entered0 · Not offered',
      'Work arrangement: Remote',
      'PTO: 20 days',
      'Respond by: Nov 28, 2026',
      'Commute: 20 min',
    ]);
    expect(within(offerSection).getByText(/Overall score:/)).toHaveTextContent(
      'Overall score: 2.5 · Okay',
    );
    expect(screen.getByText('$150k–$180k')).toBeInTheDocument();
    expect(within(offerSection).getByRole('link', { name: 'Edit offer' })).toHaveAttribute(
      'href',
      '/opportunities/a/offer',
    );
  });

  it('says when nothing is scored or entered', async () => {
    mockApi({
      'GET /opportunities/a': () =>
        jsonResponse(200, withOffer({ offer: { createdAt: AT, updatedAt: AT } })),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a');

    expect(await screen.findByText('No details yet.')).toBeInTheDocument();
    expect(screen.getByText(/Overall score:/)).toHaveTextContent('Overall score: Not scored');
  });

  it('removes the offer after asking, saying its history goes too', async () => {
    const removed: unknown[] = [];
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, withOffer()),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
      'DELETE /opportunities/a/offer': (request) => {
        removed.push(request);
        return jsonResponse(200, acme());
      },
    });
    renderApp('/opportunities/a');

    await userEvent.click(await screen.findByRole('button', { name: 'Remove offer' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      "Remove this offer? Its scores and its history go too. This can't be undone.",
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(removed).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Remove offer' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    expect(await screen.findByRole('link', { name: 'Add offer' })).toBeInTheDocument();
    expect(removed).toHaveLength(1);
  });
});

describe('the offer history', () => {
  const changed: OfferChange = {
    seq: 2,
    at: '2026-11-21T09:00:00.000Z',
    kind: 'CHANGED',
    via: 'CLAUDE',
    changes: [
      { field: 'baseSalary', from: 160000, to: 165000 },
      { field: 'signOnBonus', from: null, to: 10000 },
      { field: 'equity', from: 'RSUs', to: null },
      { field: 'custom:f1', from: '10 min', to: '20 min' },
      { field: 'custom:f2', from: 'Yes', to: null },
      { field: 'custom:f9', from: 'x', to: null },
    ],
  };

  it('lists each saved change, newest first, naming removed fields', async () => {
    mockApi({
      'GET /opportunities/a': () =>
        jsonResponse(200, withOffer({ offerHistory: [recorded, changed] })),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a');

    const history = await screen.findByRole('list', { name: 'Offer history' });
    await waitFor(() => expect(history).toHaveTextContent('Commute: 10 min → 20 min'));
    const entries = within(history)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === history);
    expect(entries.map((entry) => entry.firstChild?.textContent)).toEqual([
      'Offer changed · Nov 21, 2026',
      'Offer recorded · Nov 20, 2026',
    ]);
    expect(entries[0]).toHaveTextContent('via Claude');
    expect(
      within(entries[0] as HTMLElement)
        .getAllByRole('listitem')
        .map((line) => line.textContent),
    ).toEqual([
      'Base salary: 160,000 → 165,000',
      'Sign-on bonus added: 10,000',
      'Equity cleared (was RSUs)',
      'Commute: 10 min → 20 min',
      'Tuition (removed) cleared (was Yes)',
      'Removed field cleared (was x)',
    ]);
    expect(within(entries[1] as HTMLElement).getByRole('listitem')).toHaveTextContent(
      'Base salary: 160,000',
    );
    expect(entries[1]).not.toHaveTextContent('via Claude');
    expect(within(section()).queryByRole('button', { name: /edit|remove entry/i })).toBeNull();
  });

  it('lists no lines for an entry with no changes', async () => {
    const empty: OfferChange = { seq: 1, at: AT, kind: 'RECORDED', changes: [] };
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, withOffer({ offerHistory: [empty] })),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a');

    const history = await screen.findByRole('list', { name: 'Offer history' });
    const [entry] = within(history).getAllByRole('listitem');
    expect(entry).toHaveTextContent('Offer recorded · Nov 20, 2026');
    expect(within(entry as HTMLElement).queryByRole('list')).toBeNull();
  });

  it("isn't there with no entries", async () => {
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, withOffer({ offerHistory: undefined })),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a');

    await screen.findByRole('link', { name: 'Edit offer' });
    expect(screen.queryByRole('list', { name: 'Offer history' })).toBeNull();
  });
});

describe('the offer page', () => {
  function routes(current: OpportunityWithHistory, posted: unknown[], reply?: () => Response) {
    return {
      'GET /opportunities/a': () => jsonResponse(200, current),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
      'PATCH /opportunities/a/offer': ({ body }: { body: unknown }) => {
        posted.push(body);
        return reply ? reply() : jsonResponse(200, withOffer());
      },
    };
  }

  it('starts a new offer from the opportunity, and sends what was entered', async () => {
    const posted: unknown[] = [];
    mockApi(routes(acme(), posted));
    renderApp('/opportunities/a/offer');

    expect(
      await screen.findByRole('heading', { name: 'Add an offer from Acme' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Title')).toHaveValue('Staff Engineer');
    expect(screen.getByLabelText('Location')).toHaveValue('Denver, CO');
    expect(screen.getByLabelText('Work arrangement')).toHaveValue('HYBRID');
    for (const label of [
      'Base salary',
      'Bonus (%)',
      'Sign-on bonus',
      'Equity',
      '401k contribution',
      'Insurance benefits',
      'Role',
      'PTO',
      'Leadership',
      'Culture',
      'Start date',
      'Respond by',
      'Commute',
    ]) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }

    await fill(screen.getByLabelText('Base salary'), '165k');
    await fill(screen.getByLabelText('Bonus (%)'), '12.5');
    await fill(screen.getByLabelText('PTO'), '20 days');
    await fill(screen.getByLabelText('Commute'), '20 min');
    await userEvent.selectOptions(screen.getByLabelText('Work arrangement'), 'Remote');
    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));

    expect(await screen.findByRole('heading', { name: 'Staff Engineer' })).toBeInTheDocument();
    expect(posted).toEqual([
      {
        baseSalary: 165000,
        bonusPercent: 12.5,
        location: 'Denver, CO',
        workArrangement: 'REMOTE',
        title: 'Staff Engineer',
        pto: '20 days',
        custom: { f1: '20 min' },
      },
    ]);
  });

  it('sends only the changes to an offer, clearing with null', async () => {
    const posted: unknown[] = [];
    mockApi(routes(withOffer(), posted));
    renderApp('/opportunities/a/offer');

    expect(
      await screen.findByRole('heading', { name: 'Edit the offer from Acme' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Base salary')).toHaveValue('165000');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    await userEvent.clear(screen.getByLabelText('PTO'));
    await userEvent.clear(screen.getByLabelText('Base salary'));
    await fill(screen.getByLabelText('Base salary'), '170,000');
    await userEvent.clear(screen.getByLabelText('Commute'));
    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted).toEqual([{ baseSalary: 170000, pto: null, custom: { f1: null } }]);
  });

  it('gives each detail the right kind of field, with an example', async () => {
    mockApi(routes(acme(), []));
    renderApp('/opportunities/a/offer');

    const form = await screen.findByRole('form', { name: 'Add offer' });
    const field = (label: string) => within(form).getByLabelText(label, { exact: true });
    expect(
      Object.fromEntries(
        [
          'Base salary',
          'Bonus (%)',
          'Sign-on bonus',
          '401k contribution',
          'PTO',
          'Equity',
          'Title',
        ].map((label) => [label, field(label).getAttribute('placeholder')]),
      ),
    ).toEqual({
      'Base salary': '165,000 or 165k',
      'Bonus (%)': '10',
      'Sign-on bonus': '10,000',
      '401k contribution': '100% match up to 6%',
      PTO: '20 days',
      Equity: null,
      Title: null,
    });
    // Longer text gets a text area; dates a date picker; amounts a number pad.
    for (const label of ['Equity', 'Role', 'Leadership', 'Culture', 'Commute']) {
      expect(field(label).tagName).toBe('TEXTAREA');
    }
    for (const label of ['Title', 'PTO', 'Location', 'Base salary']) {
      expect(field(label).tagName).toBe('INPUT');
    }
    expect(field('Start date')).toHaveAttribute('type', 'date');
    expect(field('Respond by')).toHaveAttribute('type', 'date');
    expect(field('PTO')).toHaveAttribute('type', 'text');
    expect(field('Base salary')).toHaveAttribute('inputmode', 'numeric');
    expect(field('Sign-on bonus')).toHaveAttribute('inputmode', 'numeric');
    expect(field('Bonus (%)')).toHaveAttribute('inputmode', 'decimal');
    expect(field('PTO')).not.toHaveAttribute('inputmode');
    expect(field('Start date')).not.toHaveAttribute('inputmode');
    expect(within(form).getByRole('group', { name: 'Your fields' })).toBeInTheDocument();
    expect(form).toHaveClass(/form/);
    expect(form).toHaveClass(/panel/);
    // Saving stays on the page rather than submitting the form to the browser.
    expect(fireEvent.submit(form)).toBe(false);
  });

  it('has no group of your fields when there are none', async () => {
    mockApi({
      ...routes(withOffer(), []),
      'GET /offer-fields': () => jsonResponse(200, { fields: [], removed: [], version: 0 }),
    });
    renderApp('/opportunities/a/offer');

    expect(await screen.findByRole('form', { name: 'Change offer' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Your fields' })).toBeNull();
  });

  it('clears amounts and the bonus with null, and sends numbers in text as text', async () => {
    const posted: unknown[] = [];
    mockApi(routes(withOffer(), posted));
    renderApp('/opportunities/a/offer');

    await userEvent.clear(await screen.findByLabelText('Base salary'));
    await userEvent.clear(screen.getByLabelText('Bonus (%)'));
    await userEvent.clear(screen.getByLabelText('PTO'));
    await fill(screen.getByLabelText('PTO'), '25');
    await fill(screen.getByLabelText('Start date'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    // The unchanged custom field isn't sent.
    expect(posted).toEqual([
      { baseSalary: null, bonusPercent: null, pto: '25', startDate: '2026-12-01' },
    ]);
  });

  it("shows a custom field's problem on that field", async () => {
    const posted: unknown[] = [];
    mockApi(routes(acme(), posted));
    renderApp('/opportunities/a/offer');

    fireEvent.change(await screen.findByLabelText('Commute'), {
      target: { value: 'x'.repeat(501) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));

    expect(screen.getByLabelText('Commute')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Commute')).toHaveFocus();
    expect(posted).toEqual([]);
  });

  it('shows problems on their fields and sends nothing', async () => {
    const posted: unknown[] = [];
    mockApi(routes(acme(), posted));
    renderApp('/opportunities/a/offer');

    await fill(await screen.findByLabelText('Base salary'), 'lots');
    await fill(screen.getByLabelText('Bonus (%)'), '12.55');
    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));

    expect(screen.getByLabelText('Base salary')).toHaveAccessibleDescription(
      'Enter a whole number, like 150000',
    );
    expect(screen.getByLabelText('Bonus (%)')).toHaveAccessibleDescription(
      'Enter a percentage from 0 to 100, like 12.5',
    );
    expect(screen.getByLabelText('Base salary')).toHaveFocus();
    expect(posted).toEqual([]);
  });

  it("shows the API's refusal on its field, or above the buttons, and that it's saving", async () => {
    let refuse: ((fields: string[]) => void) | undefined;
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, acme()),
      'GET /offer-fields': () => jsonResponse(200, FIELDS),
      'PATCH /opportunities/a/offer': () =>
        new Promise<Response>((resolve) => {
          refuse = (fields) =>
            resolve(
              jsonResponse(fields.length ? 400 : 409, {
                code: fields.length ? 'VALIDATION_ERROR' : 'CONFLICT',
                message: fields.length
                  ? 'Unknown custom field'
                  : 'This opportunity changed since you loaded it. Reload and try again.',
                fields,
              }),
            );
        }),
    });
    renderApp('/opportunities/a/offer');

    await fill(await screen.findByLabelText('Commute'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    refuse?.(['custom.f1']);
    await waitFor(() =>
      expect(screen.getByLabelText('Commute')).toHaveAccessibleDescription('Unknown custom field'),
    );
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save offer' }));
    refuse?.([]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and try again.');
  });

  it('goes back on Cancel', async () => {
    mockApi(routes(acme(), []));
    renderApp('/opportunities/a/offer');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Staff Engineer' })).toBeInTheDocument();
  });

  it("says so when the custom fields can't load", async () => {
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, acme()),
      'GET /offer-fields': () => jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Nope' }),
    });
    renderApp('/opportunities/a/offer');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your custom fields. Nope",
    );
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('tries loading the custom fields again', async () => {
    let failing = true;
    mockApi({
      'GET /opportunities/a': () => jsonResponse(200, acme()),
      'GET /offer-fields': () =>
        failing
          ? jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Nope' })
          : jsonResponse(200, FIELDS),
    });
    renderApp('/opportunities/a/offer');

    await screen.findByRole('alert');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('form', { name: 'Add offer' })).toBeInTheDocument();
  });
});
