import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCalendarDate, formatDate } from '../src/format';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

afterEach(() => {
  vi.restoreAllMocks();
});

const listOf =
  (...items: ReturnType<typeof anOpportunity>[]) =>
  () =>
    jsonResponse(200, { items: items.map(({ history: _history, ...rest }) => rest) });

describe('Overview', { tags: ['overview'] }, () => {
  it('shows a loading state, then an empty state with a way to add the first opportunity', async () => {
    mockApi({ 'GET /opportunities?status=OPEN': listOf() });

    renderApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByText('No opportunities yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your first opportunity' })).toHaveAttribute(
      'href',
      '/opportunities/new',
    );
    expect(screen.queryByRole('list', { name: 'Open opportunities' })).not.toBeInTheDocument();
  });

  it('shows open opportunities as cards linking to each one, without the empty state', async () => {
    mockApi({
      'GET /opportunities?status=OPEN': listOf(
        anOpportunity({ id: 'a', company: 'Acme', title: 'Senior Engineer', interest: 4 }),
      ),
    });

    renderApp('/');

    const card = await screen.findByRole('article', { name: 'Acme' });
    expect(within(card).getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/opportunities/a',
    );
    expect(within(card).getByText('Senior Engineer')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Interest: 4 of 5' })).toBeInTheDocument();
    expect(within(card).getByText(/^Last change /)).toBeInTheDocument();
    // The board groups cards by stage, so cards here have no stage badge.
    expect(within(card).queryByText('Considering')).not.toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Move Acme to another stage' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No opportunities yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows an error when the list cannot load', async () => {
    mockApi({
      'GET /opportunities?status=OPEN': () =>
        jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' }),
    });

    renderApp('/');

    // A 500 is retried once (about a second later) before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      "Couldn't load your opportunities. Something went wrong",
    );
  });
});

describe('Add opportunity', { tags: ['capture'] }, () => {
  it('creates the opportunity, then opens its detail page without another request', async () => {
    const created = anOpportunity({ id: 'new1', company: 'Acme', title: 'Senior Engineer' });
    const posted: unknown[] = [];
    const fetchSpy = mockApi({
      'POST /opportunities': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, created);
      },
    });

    const { queryClient } = renderApp('/opportunities/new');
    expect(screen.getByRole('heading', { level: 2, name: 'Add opportunity' })).toBeInTheDocument();
    await fill(screen.getByLabelText('Company', { exact: false }), 'Acme');
    await fill(screen.getByLabelText('Job title', { exact: false }), 'Senior Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' }),
    ).toBeInTheDocument();
    expect(posted).toEqual([{ company: 'Acme', title: 'Senior Engineer', interest: null }]);
    // The page loads the open list (for the duplicate check), but never refetches the detail.
    const gets = fetchSpy.mock.calls
      .filter(([, init]) => (init?.method ?? 'GET') === 'GET')
      .map(([url]) => url as string);
    expect(gets.filter((url) => url.includes('/opportunities/'))).toEqual([]);
    // Checked on the cache too: a refetch would start only after the page renders.
    expect(queryClient.getQueryState(['opportunity', 'new1'])?.isInvalidated).toBe(false);
  });

  it('refreshes the overview list after creating', async () => {
    let listGets = 0;
    mockApi({
      'GET /opportunities?status=OPEN': () => {
        listGets += 1;
        return listOf()();
      },
      'POST /opportunities': () =>
        jsonResponse(201, anOpportunity({ id: 'n2', company: 'Initech' })),
    });
    renderApp('/opportunities/new');
    await waitFor(() => expect(listGets).toBe(1));

    await fill(screen.getByLabelText('Company', { exact: false }), 'Initech');
    await fill(screen.getByLabelText('Job title', { exact: false }), 'Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    // Creating invalidates the list, so the page (still watching it) loads it again.
    await waitFor(() => expect(listGets).toBe(2));
  });

  it('shows the server error and stays on the form when saving fails', async () => {
    mockApi({
      'POST /opportunities': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Job title is required' }),
    });

    renderApp('/opportunities/new');
    await fill(screen.getByLabelText('Company', { exact: false }), 'Acme');
    await fill(screen.getByLabelText('Job title', { exact: false }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Job title is required');
    expect(screen.getByRole('heading', { level: 2, name: 'Add opportunity' })).toBeInTheDocument();
  });

  it('disables the button while saving', async () => {
    let finish: (response: Response) => void = () => undefined;
    mockApi({
      'POST /opportunities': () => new Promise<Response>((resolve) => (finish = resolve)),
    });

    renderApp('/opportunities/new');
    await fill(screen.getByLabelText('Company', { exact: false }), 'Acme');
    await fill(screen.getByLabelText('Job title', { exact: false }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish(jsonResponse(201, anOpportunity()));
  });
});

describe('Opportunity detail', { tags: ['capture'] }, () => {
  const full = anOpportunity({
    id: 'full',
    company: 'Initech',
    title: 'Principal Engineer',
    interest: 4,
    contact: {
      name: 'Sam Lee',
      role: 'Recruiter',
      email: 'sam@initech.example',
      phone: '555 0100',
    },
    description: 'Line one\n\nLine two',
    postingUrl: 'https://initech.example/jobs/42',
    location: 'Austin, TX',
    workArrangement: 'HYBRID',
    salaryMin: 150_000,
    salaryMax: 180_000,
    compensation: '$180k',
    source: 'Referral',
    followUpDate: '2099-10-24',
    notes: 'Ask about on-call',
    stage: 'APPLIED',
    history: [
      {
        seq: 1,
        fromStage: null,
        toStage: 'CONSIDERING',
        changedAt: '2026-10-10T12:00:00.000Z',
        note: null,
        recordedAt: '2026-10-10T12:00:00.000Z',
      },
      {
        seq: 2,
        fromStage: 'CONSIDERING',
        toStage: 'APPLIED',
        changedAt: '2026-10-12T12:00:00.000Z',
        note: 'Applied on the site',
        recordedAt: '2026-10-12T12:00:00.000Z',
      },
    ],
  });

  function facts() {
    const terms = screen.getAllByRole('term').map((dt) => dt.textContent);
    const values = screen.getAllByRole('definition').map((dd) => dd.textContent);
    return Object.fromEntries(terms.map((term, i) => [term, values[i]]));
  }

  it('shows every field, the stage, the date added, and the history', async () => {
    mockApi({ 'GET /opportunities/full': () => jsonResponse(200, full) });

    renderApp('/opportunities/full');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Principal Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(facts()).toEqual({
      Stage: 'Applied',
      Interest: '★★★★☆',
      'Date added': formatDate(full.createdAt),
      'Point of contact': 'Sam Lee, Recruiter · sam@initech.example · 555 0100',
      'Job posting': 'https://initech.example/jobs/42',
      Location: 'Austin, TX',
      'Work arrangement': 'Hybrid',
      Salary: '$150k–$180k',
      'Pay notes': '$180k',
      'Where you found it': 'Referral',
      'Follow-up date': formatCalendarDate('2099-10-24'),
    });
    expect(screen.getByRole('img', { name: 'Interest: 4 of 5' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'https://initech.example/jobs/42' });
    expect(link).toHaveAttribute('href', 'https://initech.example/jobs/42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');

    const description = screen.getByRole('region', { name: 'Job description' });
    expect(within(description).getByText(/Line one/).textContent).toBe('Line one\n\nLine two');
    expect(
      within(screen.getByRole('region', { name: 'Notes' })).getByText('Ask about on-call'),
    ).toBeInTheDocument();

    const history = within(screen.getByRole('region', { name: 'History' })).getAllByRole(
      'listitem',
    );
    expect(history.map((item) => item.textContent)).toEqual([
      `Considering · ${formatDate('2026-10-10T12:00:00.000Z')}`,
      `Applied · ${formatDate('2026-10-12T12:00:00.000Z')} · Applied on the site`,
    ]);
  });

  it('shows only the basics, with "Not rated", for an opportunity with just company and title', async () => {
    mockApi({ 'GET /opportunities/min': () => jsonResponse(200, anOpportunity({ id: 'min' })) });

    renderApp('/opportunities/min');

    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    expect(facts()).toEqual({
      Stage: 'Considering',
      Interest: 'Not rated',
      'Date added': formatDate('2026-10-17T12:00:00.000Z'),
    });
    expect(screen.queryByRole('region', { name: 'Job description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('shows a partial contact without empty separators', async () => {
    mockApi({
      'GET /opportunities/c': () =>
        jsonResponse(200, anOpportunity({ id: 'c', contact: { email: 'x@example.com' } })),
    });

    renderApp('/opportunities/c');

    await screen.findByRole('heading', { level: 2 });
    expect(facts()['Point of contact']).toBe('x@example.com');
  });

  it('encodes the id in the request URL', async () => {
    const fetchSpy = mockApi({});

    renderApp('/opportunities/a%20b');

    await screen.findByRole('heading', { level: 2, name: 'Opportunity not found' });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://api.test/opportunities/a%20b');
  });

  it('says when the opportunity does not exist', async () => {
    mockApi({});

    renderApp('/opportunities/nope');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Opportunity not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the overview' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/No mock/)).not.toBeInTheDocument();
  });

  it('shows other load errors with their message', async () => {
    mockApi({
      'GET /opportunities/x': () =>
        jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' }),
    });

    renderApp('/opportunities/x');

    // A 500 is retried once (about a second later) before the error shows.
    expect(
      await screen.findByRole(
        'heading',
        { level: 2, name: "Couldn't load this opportunity" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load this opportunity. Something went wrong",
    );
    expect(screen.getByRole('link', { name: 'Back to the overview' })).toHaveAttribute('href', '/');
  });

  it('shows a loading state first', () => {
    mockApi({ 'GET /opportunities/slow': () => new Promise<Response>(() => undefined) });

    renderApp('/opportunities/slow');

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});

describe('Moving through the pipeline', { tags: ['pipeline'] }, () => {
  const opp = anOpportunity({
    id: 'm1',
    company: 'Acme',
    title: 'Senior Engineer',
    changeCount: 1,
  });
  const moved = anOpportunity({
    id: 'm1',
    company: 'Acme',
    title: 'Senior Engineer',
    stage: 'APPLIED',
    changeCount: 2,
    history: [
      ...opp.history,
      {
        seq: 2,
        fromStage: 'CONSIDERING',
        toStage: 'APPLIED',
        changedAt: '2026-10-18T12:00:00.000Z',
        note: 'Applied via site',
        recordedAt: '2026-10-18T12:00:00.000Z',
      },
    ],
  });

  async function moveTo(stage: string, note?: string) {
    await userEvent.click(screen.getByRole('button', { name: /^Move/ }));
    await userEvent.click(screen.getByRole('radio', { name: stage }));
    if (note) {
      await fill(screen.getByLabelText('Note (optional)'), note);
    }
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move' }));
  }

  it('moves from the detail page, sending the change count, and shows the new stage and history', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /opportunities/m1': () => jsonResponse(200, opp),
      'POST /opportunities/m1/stage-changes': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, moved);
      },
    });
    renderApp('/opportunities/m1');
    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });

    await moveTo('Applied', 'Applied via site');

    expect(posted).toEqual([
      { toStage: 'APPLIED', note: 'Applied via site', expectedChangeCount: 1 },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('definition')[0]).toHaveTextContent('Applied');
    const history = within(screen.getByRole('region', { name: 'History' })).getAllByRole(
      'listitem',
    );
    expect(history.at(-1)).toHaveTextContent('Applied · ');
    expect(history.at(-1)).toHaveTextContent('Applied via site');
  });

  it('refreshes the lists after a move so the overview and archive are current', async () => {
    mockApi({
      'GET /opportunities/m1': () => jsonResponse(200, opp),
      'POST /opportunities/m1/stage-changes': () => jsonResponse(201, moved),
    });
    const { queryClient } = renderApp('/opportunities/m1');
    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    await queryClient.fetchQuery({
      queryKey: ['opportunities', 'OPEN'],
      queryFn: () => Promise.resolve([]),
    });

    await moveTo('Applied');

    await waitFor(() =>
      expect(queryClient.getQueryState(['opportunities', 'OPEN'])?.isInvalidated).toBe(true),
    );
  });

  it('explains a conflict and reloads the opportunity so the next try is current', async () => {
    let gets = 0;
    mockApi({
      'GET /opportunities/m1': () => {
        gets += 1;
        return jsonResponse(200, gets === 1 ? opp : moved);
      },
      'POST /opportunities/m1/stage-changes': () =>
        jsonResponse(409, {
          code: 'CONFLICT',
          message: 'This opportunity changed since you loaded it.',
        }),
    });
    const { queryClient } = renderApp('/opportunities/m1');
    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    await queryClient.fetchQuery({
      queryKey: ['opportunities', 'OPEN'],
      queryFn: () => Promise.resolve([]),
    });

    await queryClient.fetchQuery({
      queryKey: ['opportunity', 'unrelated'],
      queryFn: () => Promise.resolve(null),
    });

    await moveTo('Contacted');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This opportunity changed. Please try again.',
    );
    expect(queryClient.getQueryState(['opportunity', 'unrelated'])?.isInvalidated).toBe(false);
    await waitFor(() => expect(gets).toBe(2));
    expect(queryClient.getQueryState(['opportunities', 'OPEN'])?.isInvalidated).toBe(true);
  });

  it('shows other errors from the server as they are, without reloading', async () => {
    let gets = 0;
    mockApi({
      'GET /opportunities/m1': () => {
        gets += 1;
        return jsonResponse(200, opp);
      },
      'POST /opportunities/m1/stage-changes': () =>
        jsonResponse(422, { code: 'FUTURE_DATE', message: 'No dates in the future' }),
    });
    renderApp('/opportunities/m1');
    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });

    await moveTo('Applied');

    expect(await screen.findByRole('alert')).toHaveTextContent('No dates in the future');
    expect(gets).toBe(1);
  });

  it('moves straight from an overview row, named after its company', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /opportunities?status=OPEN': listOf(opp),
      'POST /opportunities/m1/stage-changes': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, moved);
      },
    });
    renderApp('/');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Move Acme to another stage' }),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Interviewing' }));
    const dialog = screen.getByRole('dialog', { name: 'Move Acme to' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(posted).toEqual([{ toStage: 'INTERVIEWING', expectedChangeCount: 1 }]),
    );
  });
});

describe('Archive', { tags: ['overview'] }, () => {
  it('shows closed opportunities with their outcome, linking to each one', async () => {
    mockApi({
      'GET /opportunities?status=CLOSED': listOf(
        anOpportunity({
          id: 'c1',
          company: 'Globex',
          title: 'Staff Engineer',
          stage: 'REJECTED',
          status: 'CLOSED',
          interviewCount: 2,
        }),
      ),
    });

    renderApp('/archive');

    const list = await screen.findByRole('list', { name: 'Closed opportunities' });
    const card = within(list).getByRole('article', { name: 'Globex' });
    expect(within(card).getByRole('link', { name: 'Globex' })).toHaveAttribute(
      'href',
      '/opportunities/c1',
    );
    expect(within(card).getByText('Rejected')).toBeInTheDocument();
    expect(within(card).getByText('Staff Engineer')).toBeInTheDocument();
    // Reopening happens from the detail page, so archive cards have no "Move to…".
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing in the archive yet.')).not.toBeInTheDocument();
    // Closed cards keep their interview count (feature 005).
    expect(within(card).getByText('2 interviews')).toBeInTheDocument();
    // Only sort and search: the stage and salary filters belong to the board.
    expect(screen.getByRole('search').style.getPropertyValue('--controls')).toBe('1');
    expect(screen.queryByLabelText('Salary at least')).not.toBeInTheDocument();
  });

  it('sorts and searches closed opportunities, keeping the choice in the URL', async () => {
    mockApi({
      'GET /opportunities?status=CLOSED': listOf(
        anOpportunity({
          id: 'a',
          company: 'Acme',
          stage: 'DECLINED',
          status: 'CLOSED',
          interest: 2,
        }),
        anOpportunity({
          id: 'g',
          company: 'Globex',
          stage: 'REJECTED',
          status: 'CLOSED',
          interest: 5,
        }),
      ),
    });
    renderApp('/archive?sort=interest');
    const list = await screen.findByRole('list', { name: 'Closed opportunities' });

    const companies = () =>
      within(list)
        .getAllByRole('article')
        .map((card) => card.querySelector('h3')?.textContent);
    expect(companies()).toEqual(['Globex', 'Acme']);
    expect(screen.queryByLabelText('Stage')).not.toBeInTheDocument();
    await fill(screen.getByLabelText('Search'), 'zzz');

    expect(screen.getByText('No closed opportunities match “zzz”.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Closed opportunities' })).not.toBeInTheDocument();
  });

  it('explains the empty archive', async () => {
    mockApi({ 'GET /opportunities?status=CLOSED': listOf() });

    renderApp('/archive');

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('Nothing in the archive yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(await screen.findByText('Nothing in the archive yet.')).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.getByText(/Opportunities move here when you close them/)).toHaveTextContent(
      'Opportunities move here when you close them as Accepted, Declined, Rejected, Withdrawn, or No Response, or when the job is no longer available.',
    );
    expect(screen.queryByRole('list', { name: 'Closed opportunities' })).not.toBeInTheDocument();
  });

  it('shows an error when the archive cannot load', async () => {
    mockApi({
      'GET /opportunities?status=CLOSED': () =>
        jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' }),
    });

    renderApp('/archive');

    // A 500 is retried once (about a second later) before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      "Couldn't load the archive. Something went wrong",
    );
  });
});

describe('Filter changes and the browser history', { tags: ['overview'] }, () => {
  it.each([
    ['/', 'GET /opportunities?status=OPEN', 'OPEN'],
    ['/archive', 'GET /opportunities?status=CLOSED', 'CLOSED'],
  ] as const)(
    'on %s, replace the current history entry, so going back leaves the page',
    async (path, route, status) => {
      mockApi({ [route]: listOf(anOpportunity({ id: 'x', company: 'Acme', status })) });
      renderApp(path, { from: '/no/such/page' });
      await screen.findByRole('article', { name: 'Acme' });

      await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Interest');
      await fill(screen.getByLabelText('Search'), 'ac');
      await userEvent.click(screen.getByRole('button', { name: 'test: go back' }));

      expect(screen.getByRole('heading', { level: 2, name: 'Page not found' })).toBeInTheDocument();
    },
  );
});

describe('posted until on the detail page (feature 009)', { tags: ['deadline'] }, () => {
  const facts = () =>
    Object.fromEntries(
      screen
        .getAllByRole('term')
        .map((dt, i) => [dt.textContent, screen.getAllByRole('definition')[i]?.textContent]),
    );

  it('shows the date, after where it was found', async () => {
    mockApi({
      'GET /opportunities/p': () =>
        jsonResponse(200, anOpportunity({ id: 'p', source: 'Lever', postedUntil: '2026-11-30' })),
    });

    renderApp('/opportunities/p');

    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    const labels = Object.keys(facts());
    expect(facts()['Posted until']).toBe(formatCalendarDate('2026-11-30'));
    expect(labels.indexOf('Posted until')).toBe(labels.indexOf('Where you found it') + 1);
  });

  it('shows nothing without one', async () => {
    mockApi({ 'GET /opportunities/n': () => jsonResponse(200, anOpportunity({ id: 'n' })) });

    renderApp('/opportunities/n');

    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    expect(screen.queryByText('Posted until')).not.toBeInTheDocument();
  });
});

describe('the lead on the detail page (feature 010)', { tags: ['leads'] }, () => {
  const facts = () =>
    Object.fromEntries(
      screen
        .getAllByRole('term')
        .map((dt, i) => [dt.textContent, screen.getAllByRole('definition')[i]?.textContent]),
    );
  const leads = {
    items: [
      {
        id: 'l1',
        name: 'Dana Ruiz',
        email: 'dana@example.com',
        phone: '+1 555 0100',
        createdAt: '2026-10-31T12:00:00.000Z',
        updatedAt: '2026-10-31T12:00:00.000Z',
        opportunities: [],
        notes: [],
      },
      {
        id: 'l2',
        name: 'Sam Lee',
        createdAt: '2026-10-31T12:00:00.000Z',
        updatedAt: '2026-10-31T12:00:00.000Z',
        opportunities: [],
        notes: [],
      },
    ],
  };

  it("shows the lead's name, email and phone as text, after the point of contact", async () => {
    mockApi({
      'GET /opportunities/p': () =>
        jsonResponse(200, anOpportunity({ id: 'p', contact: { name: 'Pat' }, leadId: 'l1' })),
      'GET /leads': () => jsonResponse(200, leads),
    });

    renderApp('/opportunities/p');

    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    await waitFor(() => expect(facts().Lead).toBe('Dana Ruiz · dana@example.com · +1 555 0100'));
    const labels = Object.keys(facts());
    expect(labels.indexOf('Lead')).toBe(labels.indexOf('Point of contact') + 1);
    expect(screen.queryByRole('link', { name: /dana@example.com/ })).not.toBeInTheDocument();
  });

  it('shows just the name when that is all there is', async () => {
    mockApi({
      'GET /opportunities/p': () => jsonResponse(200, anOpportunity({ id: 'p', leadId: 'l2' })),
      'GET /leads': () => jsonResponse(200, leads),
    });

    renderApp('/opportunities/p');

    await waitFor(() => expect(facts().Lead).toBe('Sam Lee'));
  });

  it.each(['n', 'g'])(
    "shows nothing without a lead, or for a lead that's gone (%s)",
    async (id) => {
      mockApi({
        'GET /opportunities/n': () => jsonResponse(200, anOpportunity({ id: 'n' })),
        'GET /opportunities/g': () => jsonResponse(200, anOpportunity({ id: 'g', leadId: 'gone' })),
        'GET /leads': () => jsonResponse(200, leads),
      });

      const { queryClient } = renderApp(`/opportunities/${id}`);

      await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
      await waitFor(() => expect(queryClient.getQueryData(['leads'])).toBeDefined());
      expect(facts()).not.toHaveProperty('Lead');
    },
  );

  it('picks the lead in the edit form, from the leads list', async () => {
    mockApi({
      'GET /opportunities/p': () => jsonResponse(200, anOpportunity({ id: 'p', leadId: 'l2' })),
      'GET /leads': () => jsonResponse(200, leads),
    });
    renderApp('/opportunities/p');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await waitFor(() => expect(screen.getByLabelText('Lead')).toHaveValue('l2'));
  });
});
