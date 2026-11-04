// @module-tag overview
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { setWideScreen } from './media';
import { fill } from './user';

afterEach(() => {
  vi.restoreAllMocks();
});

const opps = [
  anOpportunity({
    id: 'a',
    company: 'Acme',
    title: 'Senior Engineer',
    stage: 'CONSIDERING',
    interest: 2,
    lastStageChangeAt: '2026-10-10T00:00:00.000Z',
  }),
  anOpportunity({
    id: 'g',
    company: 'Globex',
    title: 'Staff Developer',
    stage: 'APPLIED',
    interest: 5,
    lastStageChangeAt: '2026-10-12T00:00:00.000Z',
  }),
  anOpportunity({
    id: 'i',
    company: 'Initech',
    title: 'Engineer',
    stage: 'APPLIED',
    interest: null,
    lastStageChangeAt: '2026-10-14T00:00:00.000Z',
  }),
  anOpportunity({
    id: 'h',
    company: 'Hooli',
    title: 'Architect',
    stage: 'OFFER',
    interest: 3,
    lastStageChangeAt: '2026-10-08T00:00:00.000Z',
  }),
];

const closedOpps = [
  anOpportunity({
    id: 'u',
    company: 'Umbrella',
    title: 'Engineer',
    stage: 'REJECTED',
    status: 'CLOSED',
    salaryMin: 160_000,
    lastStageChangeAt: '2026-10-09T00:00:00.000Z',
  }),
  anOpportunity({
    id: 'w',
    company: 'Wayne',
    title: 'Developer',
    stage: 'ACCEPTED',
    status: 'CLOSED',
    lastStageChangeAt: '2026-10-11T00:00:00.000Z',
  }),
];

const listOf = (items: typeof opps) => () =>
  jsonResponse(200, { items: items.map(({ history: _history, ...rest }) => rest) });

function serve(items = opps, closed: typeof opps = []) {
  return mockApi({
    'GET /opportunities?status=OPEN': listOf(items),
    'GET /opportunities?status=CLOSED': listOf(closed),
  });
}

const cardNames = (container: HTMLElement) =>
  within(container)
    .queryAllByRole('article')
    .map((card) => card.querySelector('h3')?.textContent);

describe('Overview on a wide screen', () => {
  it('shows one column per open stage, in order, with counts and empty-column messages', async () => {
    setWideScreen(true);
    serve();

    renderApp('/');

    await screen.findByRole('article', { name: 'Acme' });
    const columns = screen.getAllByRole('region');
    expect(columns.map((column) => column.querySelector('h3')?.textContent)).toEqual([
      'Considering1',
      'Applied2',
      'Contacted0',
      'Interviewing0',
      'Offer1',
      'Closed0',
    ]);
    expect(columns.map((column) => column.getAttribute('aria-labelledby'))).toEqual(
      columns.map((column) => column.querySelector('h3')?.id),
    );
    const applied = screen.getByRole('region', { name: 'Applied2' });
    expect(cardNames(applied)).toEqual(['Initech', 'Globex']);
    expect(
      within(screen.getByRole('region', { name: 'Contacted0' })).getByText('Nothing in Contacted'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Applied' })).toBeInTheDocument();
  });

  it('switches between tabs and columns when the screen width changes', async () => {
    serve();
    renderApp('/');
    await screen.findByRole('tablist', { name: 'Stages' });

    act(() => setWideScreen(true));

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(6);
  });

  it('shows only the filtered stage as a single column', async () => {
    setWideScreen(true);
    serve();

    renderApp('/?stage=APPLIED');

    await screen.findByRole('article', { name: 'Globex' });
    expect(screen.getAllByRole('region').map((c) => c.querySelector('h3')?.textContent)).toEqual([
      'Applied2',
    ]);
  });
});

describe('Overview on a narrow screen', () => {
  it('shows a tab per stage with counts, and the first stage selected', async () => {
    serve();

    renderApp('/');

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Considering (1)',
      'Applied (2)',
      'Contacted (0)',
      'Interviewing (0)',
      'Offer (1)',
      'Closed (0)',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAccessibleName('Considering (1)');
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
    expect(cardNames(panel)).toEqual(['Acme']);
  });

  it("shows only the chosen tab's cards", async () => {
    serve();
    renderApp('/');

    await userEvent.click(await screen.findByRole('tab', { name: 'Applied (2)' }));

    expect(screen.getByRole('tab', { name: 'Applied (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(cardNames(screen.getByRole('tabpanel'))).toEqual(['Initech', 'Globex']);
  });

  it('says when the chosen stage is empty', async () => {
    serve();
    renderApp('/');

    await userEvent.click(await screen.findByRole('tab', { name: 'Contacted (0)' }));

    expect(
      within(screen.getByRole('tabpanel')).getByText('Nothing in Contacted'),
    ).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys, wrapping at the ends', async () => {
    serve();
    renderApp('/');
    const first = await screen.findByRole('tab', { name: 'Considering (1)' });
    first.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Applied (2)' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Applied (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Closed (0)' })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Considering (1)' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('tab', { name: 'Considering (1)' })).toHaveFocus();
  });

  it('falls back to the first remaining stage when the chosen one is filtered out', async () => {
    serve();
    renderApp('/');
    await userEvent.click(await screen.findByRole('tab', { name: 'Offer (1)' }));

    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'Applied');

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Applied (2)']);
    expect(screen.getByRole('tab', { name: 'Applied (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('the interview count (feature 005)', { tags: ['interview'] }, () => {
  const badge = (name: string) =>
    screen.getByRole('article', { name }).querySelector('[class*="interviews"]')?.textContent;

  it('shows "1 interview" and "3 interviews" at the top right, and nothing without any', async () => {
    setWideScreen(true);
    serve([
      anOpportunity({ id: 'o', company: 'One', interviewCount: 1 }),
      anOpportunity({ id: 't', company: 'Three', interviewCount: 3 }),
      anOpportunity({ id: 'z', company: 'Zero', interviewCount: 0 }),
      anOpportunity({ id: 'n', company: 'Never' }),
    ]);
    renderApp('/');

    await screen.findByRole('article', { name: 'One' });
    expect(badge('One')).toBe('1 interview');
    expect(badge('Three')).toBe('3 interviews');
    expect(badge('Zero')).toBeUndefined();
    expect(badge('Never')).toBeUndefined();
    // Beside the company, in the card's header.
    const header = screen.getByRole('article', { name: 'Three' }).firstElementChild;
    expect(header?.querySelector('h3')).toHaveTextContent('Three');
    expect(header?.lastElementChild).toHaveTextContent('3 interviews');
  });

  it('shows the count on closed cards too', async () => {
    setWideScreen(true);
    serve(
      [],
      [
        anOpportunity({
          id: 'c',
          company: 'Closed Co',
          stage: 'REJECTED',
          status: 'CLOSED',
          interviewCount: 2,
        }),
      ],
    );
    renderApp('/');

    await screen.findByRole('article', { name: 'Closed Co' });
    expect(badge('Closed Co')).toBe('2 interviews');
  });
});

describe('the Closed column', () => {
  it('comes last on a wide screen, newest outcome first, with each outcome and no "Move to…"', async () => {
    setWideScreen(true);
    serve(opps, closedOpps);
    renderApp('/');

    const column = await screen.findByRole('region', { name: 'Closed2' });
    expect(screen.getAllByRole('region').at(-1)).toBe(column);
    expect(cardNames(column)).toEqual(['Wayne', 'Umbrella']);
    const umbrella = within(column).getByRole('article', { name: 'Umbrella' });
    expect(umbrella).toHaveTextContent('Rejected');
    expect(within(umbrella).queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
    expect(within(umbrella).getByRole('link', { name: 'Umbrella' })).toHaveAttribute(
      'href',
      '/opportunities/u',
    );
    const acme = screen.getByRole('article', { name: 'Acme' });
    expect(within(acme).getByRole('button', { name: /Move/ })).toBeInTheDocument();
    expect(acme).not.toHaveTextContent('Considering');
  });

  it('is the last tab on a narrow screen', async () => {
    serve(opps, closedOpps);
    renderApp('/');

    await userEvent.click(await screen.findByRole('tab', { name: 'Closed (2)' }));

    expect(screen.getAllByRole('tab').at(-1)).toHaveTextContent('Closed (2)');
    expect(cardNames(screen.getByRole('tabpanel'))).toEqual(['Wayne', 'Umbrella']);
  });

  it('says when nothing is closed yet', async () => {
    setWideScreen(true);
    serve();
    renderApp('/');

    const column = await screen.findByRole('region', { name: 'Closed0' });
    expect(within(column).getByText('Nothing closed yet')).toBeInTheDocument();
  });

  it('follows the search, the sort, and the salary filter', async () => {
    setWideScreen(true);
    serve(opps, closedOpps);
    renderApp('/?q=umb');

    const column = await screen.findByRole('region', { name: 'Closed1' });
    expect(cardNames(column)).toEqual(['Umbrella']);

    await userEvent.clear(screen.getByLabelText('Search'));
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Salary (minimum)');
    expect(cardNames(screen.getByRole('region', { name: 'Closed2' }))).toEqual([
      'Umbrella',
      'Wayne',
    ]);

    await userEvent.selectOptions(screen.getByLabelText('Salary at least'), '$150k');
    expect(cardNames(screen.getByRole('region', { name: 'Closed1' }))).toEqual(['Umbrella']);
    // Every open one and Wayne have no salary.
    expect(screen.getByRole('status')).toHaveTextContent('5 hidden because they have no salary');
  });

  it('is the only column when the stage filter is Closed', async () => {
    setWideScreen(true);
    serve(opps, closedOpps);
    renderApp('/?stage=CLOSED');

    await screen.findByRole('article', { name: 'Umbrella' });
    expect(screen.getAllByRole('region').map((c) => c.querySelector('h3')?.textContent)).toEqual([
      'Closed2',
    ]);
  });

  it('counts the hidden ones only in the columns shown', async () => {
    setWideScreen(true);
    serve(opps, closedOpps);
    renderApp('/?stage=CLOSED&salary=150000');

    await screen.findByRole('article', { name: 'Umbrella' });
    expect(screen.getByRole('status')).toHaveTextContent('1 hidden because it has no salary');
  });

  it('shows the board when every opportunity is closed', async () => {
    setWideScreen(true);
    serve([], closedOpps);
    renderApp('/');

    expect(await screen.findByRole('region', { name: 'Closed2' })).toBeInTheDocument();
    expect(screen.queryByText('No opportunities yet.')).not.toBeInTheDocument();
  });

  it('shows one message, not two, when both lists fail to load', async () => {
    const failure = () => jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad request' });
    mockApi({
      'GET /opportunities?status=OPEN': failure,
      'GET /opportunities?status=CLOSED': failure,
    });
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your opportunities.");
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('offers to try again when the closed list fails to load, then shows the board', async () => {
    setWideScreen(true);
    let calls = 0;
    mockApi({
      'GET /opportunities?status=OPEN': listOf(opps),
      'GET /opportunities?status=CLOSED': () => {
        calls += 1;
        // A 400 isn't retried by itself, so the failure shows straight away.
        return calls === 1
          ? jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad request' })
          : listOf(closedOpps)();
      },
    });
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your closed opportunities.",
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'Closed2' })).toBeInTheDocument();
  });
});

describe('Overview toolbar', () => {
  it('offers every open stage, the seven sorts, and the salary amounts', async () => {
    serve();
    renderApp('/');
    await screen.findByRole('search', { name: 'Filter and sort' });

    expect(
      within(screen.getByLabelText('Stage'))
        .getAllByRole('option')
        .map((o) => [o.textContent, o.getAttribute('value')]),
    ).toEqual([
      ['All stages', 'ALL'],
      ['Considering', 'CONSIDERING'],
      ['Applied', 'APPLIED'],
      ['Contacted', 'CONTACTED'],
      ['Interviewing', 'INTERVIEWING'],
      ['Offer', 'OFFER'],
      ['Closed', 'CLOSED'],
    ]);
    expect(
      within(screen.getByLabelText('Sort by'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Closing soonest',
      'Recently changed',
      'Waiting longest',
      'Interest',
      'Date added',
      'Salary (minimum)',
      'Salary (maximum)',
    ]);
    expect(
      within(screen.getByLabelText('Salary at least'))
        .getAllByRole('option')
        .map((o) => [o.textContent, o.getAttribute('value')]),
    ).toEqual([
      ['Any', ''],
      ['$50k', '50000'],
      ['$75k', '75000'],
      ['$100k', '100000'],
      ['$125k', '125000'],
      ['$150k', '150000'],
      ['$175k', '175000'],
      ['$200k', '200000'],
      ['$250k', '250000'],
      ['$300k', '300000'],
    ]);
    expect(screen.getByLabelText('Search')).toHaveAttribute('type', 'search');
    expect(screen.getByLabelText('Search')).toHaveAttribute('placeholder', 'Company or job title');
  });

  it('sorts by interest with unrated last', async () => {
    setWideScreen(true);
    serve();
    renderApp('/');
    await screen.findByRole('article', { name: 'Acme' });

    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Interest');

    expect(cardNames(screen.getByRole('region', { name: 'Applied2' }))).toEqual([
      'Globex',
      'Initech',
    ]);
  });

  it('searches company and title, ignoring case', async () => {
    setWideScreen(true);
    serve();
    renderApp('/');
    await screen.findByRole('article', { name: 'Acme' });

    await fill(screen.getByLabelText('Search'), 'DEVELOPER');

    expect(cardNames(document.body)).toEqual(['Globex']);
    expect(screen.getByRole('region', { name: 'Applied1' })).toBeInTheDocument();
  });

  it('reads the toolbar state from the URL', async () => {
    setWideScreen(true);
    serve();

    renderApp('/?stage=APPLIED&sort=interest&q=e');

    await screen.findByRole('article', { name: 'Globex' });
    expect(screen.getByLabelText('Stage')).toHaveValue('APPLIED');
    expect(screen.getByLabelText('Sort by')).toHaveValue('interest');
    expect(screen.getByLabelText('Search')).toHaveValue('e');
    expect(cardNames(document.body)).toEqual(['Globex', 'Initech']);
  });

  it('says when nothing matches, and clears the filters back to everything', async () => {
    setWideScreen(true);
    serve();
    renderApp('/?stage=OFFER&q=acme');

    expect(await screen.findByText('No opportunities match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(cardNames(document.body)).toHaveLength(4);
    expect(screen.getByLabelText('Stage')).toHaveValue('ALL');
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(screen.queryByText('No opportunities match these filters.')).not.toBeInTheDocument();
  });

  describe('salary', () => {
    const paid = [
      anOpportunity({ id: 'r', company: 'Ranged', salaryMin: 150_000, salaryMax: 180_000 }),
      anOpportunity({ id: 'm', company: 'MinOnly', salaryMin: 120_000 }),
      anOpportunity({ id: 'x', company: 'MaxOnly', salaryMax: 200_000 }),
      anOpportunity({ id: 'n', company: 'NoPay' }),
    ];

    it('shows the range on each card, and nothing without one', async () => {
      setWideScreen(true);
      serve(paid);
      renderApp('/');

      const meta = (name: string) =>
        screen.getByRole('article', { name }).querySelector('p:last-of-type')?.textContent;
      await screen.findByRole('article', { name: 'Ranged' });
      expect(meta('Ranged')).toContain('$150k–$180k');
      expect(meta('MinOnly')).toContain('$120k+');
      expect(meta('MaxOnly')).toContain('Up to $200k');
      expect(meta('NoPay')).not.toContain('$');
      // Its own element, and none at all without a salary.
      expect(screen.getByText('$150k–$180k').className).toMatch(/salary/);
      expect(
        screen.getByRole('article', { name: 'NoPay' }).querySelector('[class*="salary"]'),
      ).toBeNull();
    });

    it('filters by an amount and says how many have no salary', async () => {
      setWideScreen(true);
      serve([...paid, anOpportunity({ id: 'n2', company: 'AlsoNoPay' })]);
      renderApp('/');
      await screen.findByRole('article', { name: 'Ranged' });

      await userEvent.selectOptions(screen.getByLabelText('Salary at least'), '$150k');

      expect(cardNames(document.body).sort()).toEqual(['MaxOnly', 'Ranged']);
      expect(screen.getByRole('status')).toHaveTextContent('2 hidden because they have no salary');

      await userEvent.selectOptions(screen.getByLabelText('Salary at least'), 'Any');
      expect(cardNames(document.body)).toHaveLength(5);
      expect(screen.queryByText(/hidden because/)).not.toBeInTheDocument();
    });

    it('says "1 hidden" for a single opportunity without a salary', async () => {
      setWideScreen(true);
      serve(paid);
      renderApp('/?salary=100000');

      await screen.findByRole('article', { name: 'Ranged' });
      expect(screen.getByLabelText('Salary at least')).toHaveValue('100000');
      expect(screen.getByRole('status')).toHaveTextContent('1 hidden because it has no salary');
    });

    it('sorts by the maximum, highest first, with no salary last', async () => {
      setWideScreen(true);
      serve(paid);
      renderApp('/?sort=salary-max');

      await screen.findByRole('article', { name: 'Ranged' });
      expect(cardNames(document.body)).toEqual(['MaxOnly', 'Ranged', 'MinOnly', 'NoPay']);
    });
  });

  it('lays out its four controls in one row, starting on any salary', async () => {
    serve();
    renderApp('/');

    const toolbar = await screen.findByRole('search', { name: 'Filter and sort' });
    // Stage, sort, and salary sit before the search field.
    expect(toolbar.style.getPropertyValue('--controls')).toBe('3');
    expect(screen.getByLabelText('Salary at least')).toHaveValue('');
  });

  it('keeps the toolbar hidden while loading and for an empty list', async () => {
    serve([]);
    renderApp('/');

    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    await screen.findByText('No opportunities yet.');
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });
});
