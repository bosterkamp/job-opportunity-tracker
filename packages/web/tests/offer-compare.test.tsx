// @module-tag offer
import type { Offer, OfferFields, OpportunityWithHistory } from '@jot/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareIds } from '../src/pages/CompareOffers';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { setWideScreen } from './media';

// Feature 013: picking offers on the Offers page and the board, comparing them, and scoring.
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

const FIELDS: OfferFields = { fields: [{ id: 'f1', name: 'Commute' }], removed: [], version: 1 };

const offerOf = (details: Partial<Offer>): Offer => ({ ...details, createdAt: AT, updatedAt: AT });

const acme = anOpportunity({
  id: 'a',
  company: 'Acme',
  title: 'Staff Engineer',
  stage: 'OFFER',
  offer: offerOf({ baseSalary: 165000, pto: '20 days', custom: { f1: '20 min' } }),
  offerScores: { baseSalary: 5, pto: 4, equity: 0 },
});
const bolt = anOpportunity({
  id: 'b',
  company: 'Bolt',
  title: 'Principal Engineer',
  stage: 'OFFER',
  offer: offerOf({ baseSalary: 170000, respondBy: '2026-11-23' }),
  offerScores: { baseSalary: 4 },
});
const cove = anOpportunity({ id: 'c', company: 'Cove', title: 'Lead', stage: 'OFFER' });
const dune = anOpportunity({
  id: 'd',
  company: 'Dune',
  title: 'Architect',
  stage: 'DECLINED',
  status: 'CLOSED',
  offer: offerOf({ baseSalary: 150000 }),
  offerScores: {},
});
const elm = anOpportunity({ id: 'e', company: 'Elm', title: 'Engineer', stage: 'INTERVIEWING' });

function lists(open: OpportunityWithHistory[] = [acme, bolt, cove, elm], closed = [dune]) {
  return {
    'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: open }),
    'GET /opportunities?status=CLOSED': () => jsonResponse(200, { items: closed }),
    'GET /offer-fields': () => jsonResponse(200, FIELDS),
  };
}

const details = (...opportunities: OpportunityWithHistory[]) =>
  Object.fromEntries(
    opportunities.map((o) => [`GET /opportunities/${o.id}`, () => jsonResponse(200, o)]),
  );

describe('the Offers page', () => {
  it('is in the navigation, before the archive', async () => {
    mockApi(lists());
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Overview', 'Networking leadsLeads', 'Offers', 'Archive']);
    await userEvent.click(within(nav).getByRole('link', { name: 'Offers' }));
    expect(await screen.findByRole('heading', { name: 'Offers' })).toBeInTheDocument();
  });

  it('lists every offer, open and closed, and the Offer stage without one', async () => {
    mockApi(lists());
    renderApp('/offers');

    const list = await screen.findByRole('list', { name: 'Offers' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getAllByRole('link')[0]?.textContent)).toEqual([
      'Acme',
      'Bolt',
      'Cove',
      'Dune',
    ]);
    await waitFor(() => expect(rows[0]).toHaveTextContent('Overall3.0 · Okay'));
    expect(rows[0]).toHaveTextContent('Staff Engineer');
    expect(rows[0]).toHaveTextContent('StageOffer');
    expect(rows[0]).toHaveTextContent('Base salary165,000');
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/opportunities/a',
    );
    expect(rows[1]).toHaveTextContent('Respond by Nov 23, 2026');
    expect(within(rows[1] as HTMLElement).getByText('Respond by Nov 23, 2026')).toHaveClass(/due/);
    expect(rows[2]).toHaveTextContent('OfferNo details yet · Add offer');
    expect(within(rows[2] as HTMLElement).getByRole('link', { name: 'Add offer' })).toHaveAttribute(
      'href',
      '/opportunities/c/offer',
    );
    expect(rows[3]).toHaveTextContent('StageDeclined');
    expect(rows[3]).toHaveTextContent('OverallNot scored');
    expect(screen.queryByText(/No offers yet/)).toBeNull();
  });

  it('says when an offer has no base salary yet', async () => {
    const fox = anOpportunity({
      id: 'f',
      company: 'Fox',
      title: 'Engineer',
      stage: 'OFFER',
      offer: offerOf({ pto: '15 days' }),
    });
    mockApi(lists([fox], []));
    renderApp('/offers');
    const list = await screen.findByRole('list', { name: 'Offers' });
    expect(list).toHaveTextContent('Base salaryNot entered');
  });

  it('shows it is loading until both lists have loaded', async () => {
    let finish: (response: Response) => void = () => undefined;
    mockApi({
      ...lists(),
      'GET /opportunities?status=CLOSED': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    renderApp('/offers');

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('list', { name: 'Offers' })).toBeNull();
    finish(jsonResponse(200, { items: [dune] }));
    expect(await screen.findByRole('list', { name: 'Offers' })).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it("says why when either list can't load, and tries that one again", async () => {
    let failing = true;
    let calls = 0;
    let finish: (response: Response) => void = () => undefined;
    mockApi({
      ...lists(),
      'GET /opportunities?status=CLOSED': () => {
        calls += 1;
        if (failing) {
          return jsonResponse(404, { code: 'NOT_FOUND', message: 'Down' });
        }
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      },
    });
    renderApp('/offers');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your offers. Down");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    const before = calls;
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // Nothing of that list is loaded, so the retry shows the loading state again.
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(calls).toBe(before + 1);
    finish(jsonResponse(200, { items: [dune] }));
    expect(await screen.findByRole('list', { name: 'Offers' })).toHaveTextContent('Dune');
  });

  it("tries the open list again when it's the one that failed", async () => {
    let failing = true;
    mockApi({
      ...lists(),
      'GET /opportunities?status=OPEN': () =>
        failing
          ? jsonResponse(404, { code: 'NOT_FOUND', message: 'Down' })
          : jsonResponse(200, { items: [acme] }),
    });
    renderApp('/offers');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your offers. Down");
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Offers' })).toHaveTextContent('Acme');
  });

  it('says when there are none', async () => {
    mockApi(lists([elm], []));
    renderApp('/offers');
    expect(
      await screen.findByText(
        "No offers yet. Add one from an opportunity's page, or move one to the Offer stage.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Offers' })).toBeNull();
  });

  it('offers Compare for two or three, and no more than three', async () => {
    mockApi({ ...lists(), ...details(acme, bolt, cove) });
    renderApp('/offers');

    await screen.findByRole('list', { name: 'Offers' });
    expect(screen.queryByRole('link', { name: /^Compare/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Compare Bolt, Principal Engineer' }),
    );
    expect(screen.queryByRole('link', { name: /^Compare/ })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Compare Acme, Staff Engineer' }));
    expect(screen.getByRole('link', { name: 'Compare 2' })).toHaveAttribute(
      'href',
      '/offers/compare?ids=b,a',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Compare Cove, Lead' }));
    expect(screen.getByRole('link', { name: 'Compare 3' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('You can compare up to 3 offers');
    expect(screen.getByRole('checkbox', { name: 'Compare Dune, Architect' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Compare Cove, Lead' }));
    expect(screen.getByRole('checkbox', { name: 'Compare Dune, Architect' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('');

    await userEvent.click(screen.getByRole('link', { name: 'Compare 2' }));
    expect(await screen.findByRole('heading', { name: 'Compare offers' })).toBeInTheDocument();
  });
});

describe("the board's Offer column", () => {
  it('ticks offers in the Offer column only, with Compare in its header', async () => {
    setWideScreen(true);
    mockApi(lists());
    renderApp('/');

    const column = await screen.findByRole('region', { name: /^Offer/ });
    expect(within(column).getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await userEvent.click(
      within(column).getByRole('checkbox', { name: 'Compare Acme, Staff Engineer' }),
    );
    await userEvent.click(within(column).getByRole('checkbox', { name: 'Compare Cove, Lead' }));
    expect(within(column).getByRole('link', { name: 'Compare 2' })).toHaveAttribute(
      'href',
      '/offers/compare?ids=a,c',
    );
  });

  it('ticks on the Offer tab on phones, separately from the Offers page', async () => {
    mockApi(lists());
    renderApp('/');

    await userEvent.click(await screen.findByRole('tab', { name: 'Offer (3)' }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Compare Bolt, Principal Engineer' }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Compare Bolt, Principal Engineer' }),
    ).toBeChecked();

    await userEvent.click(screen.getByRole('link', { name: 'Offers' }));
    await screen.findByRole('list', { name: 'Offers' });
    expect(
      screen.getByRole('checkbox', { name: 'Compare Bolt, Principal Engineer' }),
    ).not.toBeChecked();
  });

  it('shows when to respond on the card', async () => {
    setWideScreen(true);
    mockApi(lists());
    renderApp('/');

    const card = await screen.findByRole('article', { name: 'Bolt' });
    expect(within(card).getByText('Respond by Nov 23')).toHaveClass(/deadlineSoon/);
  });
});

describe('the comparison', () => {
  const cells = (rowName: string) => {
    const row = screen.getByRole('rowheader', { name: rowName }).closest('tr') as HTMLElement;
    return within(row)
      .getAllByRole('cell')
      .map((cell) => cell.querySelector('span')?.textContent ?? cell.textContent);
  };

  it('reads the offers from its address, at most three, each once', () => {
    expect(compareIds('a,b,a,c,d')).toEqual(['a', 'b', 'c']);
    expect(compareIds(null)).toEqual([]);
    expect(compareIds('a,,b')).toEqual(['a', 'b']);
  });

  it('shows offers as columns and every detail and custom field as rows', async () => {
    mockApi({ ...lists(), ...details(acme, bolt, cove) });
    renderApp('/offers/compare?ids=a,b,c');

    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Detail', 'AcmeStaff Engineer', 'BoltPrincipal Engineer', 'CoveLeadAdd offer']);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual([
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
      'Overall',
    ]);
    expect(cells('Base salary')).toEqual(['165,000', '170,000', '—']);
    expect(cells('Commute')).toEqual(['20 min', '—', '—']);
    expect(cells('Respond by')).toEqual(['—', 'Nov 23, 2026', '—']);
    expect(within(table).getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/opportunities/a',
    );
    expect(within(table).getByRole('link', { name: 'Add offer' })).toHaveAttribute(
      'href',
      '/opportunities/c/offer',
    );
    expect(cells('Overall')).toEqual(['3.0 · Okay', '4.0 · Good', 'Not scored']);
    expect(screen.queryByText(/no longer available/)).toBeNull();
    // No score controls without an offer.
    expect(within(table).queryByRole('combobox', { name: /for Cove$/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Offers side by side' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('shows each score with its word and color, the overall row, and the legend', async () => {
    mockApi({ ...lists(), ...details(acme, bolt) });
    renderApp('/offers/compare?ids=a,b');

    const base = await screen.findByRole('combobox', { name: 'Score Base salary for Acme' });
    expect(base).toHaveDisplayValue('5 · Best');
    expect(base).toHaveClass(/score5/);
    const equity = screen.getByRole('combobox', { name: 'Score Equity for Acme' });
    expect(equity).toHaveDisplayValue('0 · Not offered');
    expect(equity).toHaveClass(/score0/);
    const unscored = screen.getByRole('combobox', { name: 'Score Equity for Bolt' });
    expect(unscored).toHaveDisplayValue('Not scored');
    expect(unscored.className).not.toMatch(/score\d/);
    expect(unscored.className.trim().split(/\s+/)).toHaveLength(1);
    expect(
      within(base)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Not scored',
      '0 · Not offered',
      '1 · Worst',
      '2 · Poor',
      '3 · Okay',
      '4 · Good',
      '5 · Best',
    ]);

    expect(cells('Overall')).toEqual(['3.0 · Okay', '4.0 · Good']);
    const badge = screen.getByText('4.0 · Good');
    expect(badge).toHaveClass(/badge/);
    expect(badge).toHaveClass(/score4/);
    const legend = screen.getByRole('list', { name: 'Score scale' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['0 · Not offered', '1 · Worst', '2 · Poor', '3 · Okay', '4 · Good', '5 · Best']);
  });

  it('saves a score, and clears one, updating the overall', async () => {
    const posted: unknown[] = [];
    let current = acme;
    mockApi({
      ...lists(),
      ...details(bolt),
      'GET /opportunities/a': () => jsonResponse(200, current),
      'PATCH /opportunities/a/offer/scores': ({ body }) => {
        posted.push(body);
        const { scores } = body as { scores: Record<string, number | null> };
        const next = { ...current.offerScores };
        for (const [key, score] of Object.entries(scores)) {
          if (score === null) delete next[key];
          else next[key] = score;
        }
        current = { ...current, offerScores: next };
        return jsonResponse(200, current);
      },
    });
    renderApp('/offers/compare?ids=a,b');

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Score Commute for Acme' }),
      '1 · Worst',
    );
    await waitFor(() => expect(cells('Overall')[0]).toBe('2.5 · Okay'));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Score Equity for Acme' }),
      'Not scored',
    );
    await waitFor(() => expect(cells('Overall')[0]).toBe('3.3 · Okay'));
    expect(posted).toEqual([{ scores: { 'custom:f1': 1 } }, { scores: { equity: null } }]);
  });

  it("keeps the old score and says why when it can't be saved", async () => {
    mockApi({
      ...lists(),
      ...details(acme, bolt),
      'PATCH /opportunities/a/offer/scores': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Add the offer before scoring it' }),
    });
    renderApp('/offers/compare?ids=a,b');

    const pto = await screen.findByRole('combobox', { name: 'Score PTO for Acme' });
    await userEvent.selectOptions(pto, '1 · Worst');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the score. Add the offer before scoring it",
    );
    expect(pto).toHaveDisplayValue('4 · Good');
  });

  it('leaves out an offer that is gone, and says so', async () => {
    mockApi({
      ...lists(),
      ...details(acme, bolt),
      'GET /opportunities/x': () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'Opportunity not found' }),
    });
    renderApp('/offers/compare?ids=a,x,b');

    expect(await screen.findByText('1 offer is no longer available.')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  });

  it('needs two offers', async () => {
    mockApi({
      ...lists(),
      ...details(acme),
      'GET /opportunities/x': () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'Opportunity not found' }),
      'GET /opportunities/y': () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'Opportunity not found' }),
    });
    renderApp('/offers/compare?ids=a,x,y');

    expect(await screen.findByText('2 offers are no longer available.')).toBeInTheDocument();
    expect(screen.getByText('Pick at least 2 offers to compare.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Offers' })).toHaveAttribute('href', '/offers');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it("says so when an offer can't load", async () => {
    mockApi({
      ...lists(),
      ...details(acme),
      'GET /opportunities/b': () => jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad' }),
    });
    renderApp('/offers/compare?ids=a,b');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load these offers. Bad");
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Pick at least 2 offers to compare.')).toBeNull();
  });

  it('shows it is loading until every offer and the fields have loaded', async () => {
    let finish: (response: Response) => void = () => undefined;
    mockApi({
      ...lists(),
      ...details(acme),
      'GET /opportunities/b': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    renderApp('/offers/compare?ids=a,b');

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Pick at least 2 offers to compare.')).toBeNull();
    finish(jsonResponse(200, bolt));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('tries the offer that failed again', async () => {
    let failing = true;
    mockApi({
      ...lists(),
      ...details(acme),
      'GET /opportunities/b': () =>
        failing
          ? jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad' })
          : jsonResponse(200, bolt),
    });
    renderApp('/offers/compare?ids=a,b');

    await screen.findByRole('alert');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
