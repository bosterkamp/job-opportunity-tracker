// @module-tag edit
import { localDate } from '@jot/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteOpportunity } from '../src/components/DeleteOpportunity';
import { EMPTY_VALUES, toFormValues, validate } from '../src/components/OpportunityForm';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

afterEach(() => {
  vi.restoreAllMocks();
});

const full = anOpportunity({
  id: 'e1',
  company: 'Initech',
  title: 'Principal Engineer',
  interest: 3,
  contact: { name: 'Sam', role: 'Recruiter', email: 'sam@initech.example', phone: '555' },
  description: 'Build things',
  postingUrl: 'https://initech.example/jobs/1',
  location: 'Austin',
  workArrangement: 'HYBRID',
  salaryMin: 150_000,
  salaryMax: 180_000,
  compensation: '$180k',
  source: 'Referral',
  postedUntil: '2029-12-15',
  followUpDate: '2030-01-01',
  notes: 'Ask about on-call',
});

describe('form edit mode', () => {
  it('fills the form from an opportunity, with blanks for missing fields', () => {
    expect(toFormValues(full)).toEqual({
      company: 'Initech',
      title: 'Principal Engineer',
      contactName: 'Sam',
      contactRole: 'Recruiter',
      contactEmail: 'sam@initech.example',
      contactPhone: '555',
      description: 'Build things',
      interest: 3,
      postingUrl: 'https://initech.example/jobs/1',
      location: 'Austin',
      workArrangement: 'HYBRID',
      salaryMin: '150000',
      salaryMax: '180000',
      compensation: '$180k',
      source: 'Referral',
      postedUntil: '2029-12-15',
      leadId: '',
      followUpDate: '2030-01-01',
      notes: 'Ask about on-call',
      dateAdded: localDate(new Date(full.createdAt)),
    });
    expect(toFormValues(anOpportunity({ id: 'm' }))).toEqual({
      ...EMPTY_VALUES,
      company: 'Acme',
      title: 'Senior Engineer',
      dateAdded: localDate(new Date('2026-10-17T12:00:00.000Z')),
    });
  });

  it('turns blank fields into null when editing, so they are cleared', () => {
    expect(validate({ ...EMPTY_VALUES, company: 'Acme', title: 'Engineer' }, 'edit').input).toEqual(
      {
        company: 'Acme',
        title: 'Engineer',
        contact: null,
        description: null,
        interest: null,
        postingUrl: null,
        location: null,
        workArrangement: null,
        salaryMin: null,
        salaryMax: null,
        compensation: null,
        source: null,
        postedUntil: null,
        leadId: null,
        followUpDate: null,
        notes: null,
      },
    );
  });
});

describe('editing on the detail page', () => {
  it('saves every field as a patch, reloads, and goes back to viewing', async () => {
    const patched: unknown[] = [];
    let gets = 0;
    mockApi({
      'GET /opportunities/e1': () => {
        gets += 1;
        return jsonResponse(200, gets === 1 ? full : { ...full, location: 'Remote' });
      },
      'PATCH /opportunities/e1': ({ body }) => {
        patched.push(body);
        const { history: _history, ...rest } = { ...full, location: 'Remote' };
        return jsonResponse(200, rest);
      },
    });
    renderApp('/opportunities/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Edit Principal Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Company', { exact: false })).toHaveValue('Initech');
    const location = screen.getByLabelText('Location');
    await userEvent.clear(location);
    await fill(location, 'Remote');
    await userEvent.clear(screen.getByLabelText('Notes'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('heading', { level: 2, name: 'Principal Engineer' });
    expect(patched).toEqual([
      {
        company: 'Initech',
        title: 'Principal Engineer',
        contact: { name: 'Sam', role: 'Recruiter', email: 'sam@initech.example', phone: '555' },
        description: 'Build things',
        interest: 3,
        postingUrl: 'https://initech.example/jobs/1',
        location: 'Remote',
        workArrangement: 'HYBRID',
        salaryMin: 150_000,
        salaryMax: 180_000,
        compensation: '$180k',
        source: 'Referral',
        postedUntil: '2029-12-15',
        leadId: null,
        followUpDate: '2030-01-01',
        notes: null,
      },
    ]);
    await waitFor(() => expect(gets).toBe(2));
    expect(await screen.findByText('Remote')).toBeInTheDocument();
  });

  it('blocks clearing the company, keeping the original', async () => {
    const patched: unknown[] = [];
    mockApi({
      'GET /opportunities/e1': () => jsonResponse(200, full),
      'PATCH /opportunities/e1': ({ body }) => {
        patched.push(body);
        return jsonResponse(200, full);
      },
    });
    renderApp('/opportunities/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await userEvent.clear(screen.getByLabelText('Company', { exact: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByLabelText('Company', { exact: false })).toHaveAccessibleDescription(
      'Company is required',
    );
    expect(patched).toEqual([]);
  });

  it('cancels without saving', async () => {
    mockApi({ 'GET /opportunities/e1': () => jsonResponse(200, full) });
    renderApp('/opportunities/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Principal Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });

  it('shows a save failure and stays in edit mode', async () => {
    mockApi({
      'GET /opportunities/e1': () => jsonResponse(200, full),
      'PATCH /opportunities/e1': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad link' }),
    });
    renderApp('/opportunities/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bad link');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('disables saving while the request is in flight', async () => {
    mockApi({
      'GET /opportunities/e1': () => jsonResponse(200, full),
      'PATCH /opportunities/e1': () => new Promise<Response>(() => undefined),
    });
    renderApp('/opportunities/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

describe('DeleteOpportunity', () => {
  const renderDelete = (onDelete = vi.fn(() => Promise.resolve())) => {
    render(<DeleteOpportunity company="Initech" onDelete={onDelete} />);
    return { onDelete };
  };
  const open = () => userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

  it('explains the consequences and asks for the company name', async () => {
    renderDelete();

    await open();

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Initech permanently?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/removes the opportunity and its whole history/);
    expect(screen.getByLabelText('Type the company name to confirm')).toHaveFocus();
    expect(screen.getByLabelText('Type the company name to confirm')).toHaveAttribute(
      'autocomplete',
      'off',
    );
  });

  it('only enables Delete once the company name is typed exactly', async () => {
    const { onDelete } = renderDelete();
    await open();
    const confirm = screen.getByLabelText('Type the company name to confirm');
    const del = screen.getByRole('button', { name: 'Delete' });

    expect(del).toBeDisabled();
    await fill(confirm, 'initech');
    expect(del).toBeDisabled();
    await userEvent.clear(confirm);
    await fill(confirm, ' Initech ');
    expect(del).toBeEnabled();

    await userEvent.click(del);

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('shows a failure, re-enabling Delete', async () => {
    renderDelete(vi.fn(() => Promise.reject(new Error('Server unavailable'))));
    await open();
    await fill(screen.getByLabelText('Type the company name to confirm'), 'Initech');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('says it is deleting while the request is in flight', async () => {
    renderDelete(vi.fn(() => new Promise<void>(() => undefined)));
    await open();
    await fill(screen.getByLabelText('Type the company name to confirm'), 'Initech');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });

  it.each([
    ['Cancel', () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    [
      'the backdrop',
      () => userEvent.click(document.querySelector('[aria-hidden="true"]') as HTMLElement),
    ],
  ])('closes with %s without deleting, returning focus to the button', async (_label, closeIt) => {
    const { onDelete } = renderDelete();
    await open();

    await closeIt();

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('stays open while typing', async () => {
    renderDelete();
    await open();

    await userEvent.type(screen.getByLabelText('Type the company name to confirm'), 'Ini');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('handles the submit itself instead of letting the browser submit the form', async () => {
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    window.addEventListener('submit', listener);
    renderDelete();
    await open();
    await fill(screen.getByLabelText('Type the company name to confirm'), 'Initech');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    window.removeEventListener('submit', listener);
    expect(prevented).toBe(true);
  });
});

describe('deleting from the detail page', () => {
  it('sends the confirmation header, then goes to the overview', async () => {
    const deletes: (Record<string, string> | undefined)[] = [];
    const fetchSpy = mockApi({
      'GET /opportunities/e1': () => jsonResponse(200, full),
      'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [] }),
      'DELETE /opportunities/e1': () => new Response(null, { status: 204 }),
    });
    renderApp('/opportunities/e1');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    await fill(screen.getByLabelText('Type the company name to confirm'), 'Initech');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Overview' })).toBeInTheDocument();
    for (const [url, init] of fetchSpy.mock.calls) {
      if (init?.method === 'DELETE') {
        expect(url as string).toBe('http://api.test/opportunities/e1');
        deletes.push(init.headers as Record<string, string>);
      }
    }
    expect(deletes).toEqual([expect.objectContaining({ 'x-confirm-delete': 'true' })]);
  });
});

describe('duplicate warning when adding', () => {
  const existing = anOpportunity({ id: 'dup', company: 'Acme', title: 'Senior Engineer' });

  async function submit(company: string, title: string) {
    await fill(screen.getByLabelText('Company', { exact: false }), company);
    await fill(screen.getByLabelText('Job title', { exact: false }), title);
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));
  }

  it('warns about a matching open opportunity instead of saving, linking to it', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [existing] }),
      'POST /opportunities': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, anOpportunity({ id: 'created' }));
      },
      'GET /opportunities/created': () => jsonResponse(200, anOpportunity({ id: 'created' })),
    });
    renderApp('/opportunities/new');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    await submit('acme', 'senior engineer');

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(
      'You already have an open opportunity for Senior Engineer at Acme.',
    );
    expect(within(warning).getByRole('link', { name: 'Open existing' })).toHaveAttribute(
      'href',
      '/opportunities/dup',
    );
    expect(posted).toEqual([]);
  });

  it('adds it anyway when asked', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [existing] }),
      'POST /opportunities': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, anOpportunity({ id: 'created', title: 'Senior Engineer' }));
      },
      'GET /opportunities/created': () =>
        jsonResponse(200, anOpportunity({ id: 'created', title: 'Senior Engineer' })),
    });
    renderApp('/opportunities/new');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await submit('Acme', 'Senior Engineer');

    await userEvent.click(await screen.findByRole('button', { name: 'Add anyway' }));

    await screen.findByRole('heading', { level: 2, name: 'Senior Engineer' });
    expect(posted).toEqual([{ company: 'Acme', title: 'Senior Engineer', interest: null }]);
  });

  it('saves straight away when nothing matches', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /opportunities?status=OPEN': () => jsonResponse(200, { items: [existing] }),
      'POST /opportunities': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, anOpportunity({ id: 'created', title: 'Staff Engineer' }));
      },
      'GET /opportunities/created': () =>
        jsonResponse(200, anOpportunity({ id: 'created', title: 'Staff Engineer' })),
    });
    renderApp('/opportunities/new');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    await submit('Acme', 'Staff Engineer');

    await screen.findByRole('heading', { level: 2, name: 'Staff Engineer' });
    expect(posted).toHaveLength(1);
    expect(screen.queryByText(/You already have/)).not.toBeInTheDocument();
  });

  it('still saves when the open list could not be loaded', async () => {
    const posted: unknown[] = [];
    mockApi({
      'POST /opportunities': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, anOpportunity({ id: 'created', title: 'Engineer' }));
      },
      'GET /opportunities/created': () =>
        jsonResponse(200, anOpportunity({ id: 'created', title: 'Engineer' })),
    });
    renderApp('/opportunities/new');

    await submit('Acme', 'Engineer');

    await screen.findByRole('heading', { level: 2, name: 'Engineer' });
    expect(posted).toHaveLength(1);
  });
});

describe('follow-up highlights', () => {
  const today = localDate();

  function serveBoard(followUpDate: string | null) {
    mockApi({
      'GET /opportunities?status=OPEN': () =>
        jsonResponse(200, {
          items: [
            { ...anOpportunity({ id: 'f', company: 'Acme', followUpDate }), history: undefined },
          ],
        }),
    });
  }

  it.each([
    ['today', today, true],
    ['in the past', '2020-01-01', true],
    ['in the future', '2999-01-01', false],
    ['not set', null, false],
  ])('a follow-up %s is %s highlighted on the card', async (_label, date, highlighted) => {
    serveBoard(date);

    renderApp('/');

    const card = await screen.findByRole('article', { name: 'Acme' });
    if (highlighted) {
      expect(within(card).getByText('Follow up')).toBeInTheDocument();
      expect(card.className).not.toBe(screen.queryAllByRole('article')[1]?.className);
    } else {
      expect(within(card).queryByText('Follow up')).not.toBeInTheDocument();
    }
  });

  it('gives a due card a different style from a normal one', async () => {
    mockApi({
      'GET /opportunities?status=OPEN': () =>
        jsonResponse(200, {
          items: [
            {
              ...anOpportunity({ id: 'd', company: 'Due', followUpDate: today }),
              history: undefined,
            },
            { ...anOpportunity({ id: 'n', company: 'Normal' }), history: undefined },
          ],
        }),
    });

    renderApp('/');

    const due = await screen.findByRole('article', { name: 'Due' });
    const normal = screen.getByRole('article', { name: 'Normal' });
    expect(due.className).not.toBe(normal.className);
  });

  it('flags a due follow-up on the detail page', async () => {
    mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, anOpportunity({ id: 'f', followUpDate: today })),
    });

    renderApp('/opportunities/f');

    expect(await screen.findByText('· Follow up now')).toBeInTheDocument();
  });

  it('does not flag a follow-up that is not due yet', async () => {
    mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, anOpportunity({ id: 'f', followUpDate: '2999-01-01' })),
    });

    renderApp('/opportunities/f');

    await screen.findByRole('heading', { level: 2 });
    expect(screen.queryByText(/Follow up now/)).not.toBeInTheDocument();
  });
});

describe('cache refresh after editing or deleting', () => {
  const other = anOpportunity({ id: 'b', company: 'Globex', title: 'Staff Developer' });
  const asListItem = (o: typeof full) => ({ ...o, history: undefined });

  // Opens Globex first (caching it), then goes to Initech through the overview.
  async function cacheGlobexThenOpenInitech(listGets: () => number) {
    await screen.findByRole('heading', { level: 2, name: 'Staff Developer' });
    await userEvent.click(screen.getByRole('link', { name: 'Job Opportunity Tracker' }));
    const card = await screen.findByRole('article', { name: 'Initech' });
    expect(listGets()).toBe(1);
    await userEvent.click(within(card).getByRole('link', { name: 'Initech' }));
    await screen.findByRole('heading', { level: 2, name: 'Principal Engineer' });
  }

  async function openGlobexFromOverview() {
    const card = await screen.findByRole('article', { name: 'Globex' });
    await userEvent.click(within(card).getByRole('link', { name: 'Globex' }));
    await screen.findByRole('heading', { level: 2, name: 'Staff Developer' });
  }

  it('saving reloads that opportunity and the lists, but not other opportunities', async () => {
    let globexGets = 0;
    let listGets = 0;
    mockApi({
      'GET /opportunities/b': () => {
        globexGets += 1;
        return jsonResponse(200, other);
      },
      'GET /opportunities/e1': () => jsonResponse(200, full),
      'GET /opportunities?status=OPEN': () => {
        listGets += 1;
        return jsonResponse(200, { items: [asListItem(full), asListItem(other)] });
      },
      'PATCH /opportunities/e1': () => jsonResponse(200, asListItem(full)),
    });
    renderApp('/opportunities/b');
    await cacheGlobexThenOpenInitech(() => listGets);

    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Edit details' });
    await userEvent.click(screen.getByRole('link', { name: 'Job Opportunity Tracker' }));
    await openGlobexFromOverview();

    expect(listGets).toBe(2);
    expect(globexGets).toBe(1);
  });

  it('deleting drops it from the overview, without reloading other opportunities', async () => {
    let globexGets = 0;
    let deleted = false;
    mockApi({
      'GET /opportunities/b': () => {
        globexGets += 1;
        return jsonResponse(200, other);
      },
      'GET /opportunities/e1': () => jsonResponse(200, full),
      'GET /opportunities?status=OPEN': () =>
        jsonResponse(200, {
          items: deleted ? [asListItem(other)] : [asListItem(full), asListItem(other)],
        }),
      'DELETE /opportunities/e1': () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/opportunities/b');
    await cacheGlobexThenOpenInitech(() => 1);

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await fill(screen.getByLabelText('Type the company name to confirm'), 'Initech');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await screen.findByRole('heading', { level: 2, name: 'Overview' });
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Initech' })).not.toBeInTheDocument(),
    );
    await openGlobexFromOverview();
    expect(globexGets).toBe(1);
  });
});

describe('the closing date on the cards (feature 009)', { tags: ['deadline'] }, () => {
  const inDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localDate(date);
  };

  function serve(path: 'OPEN' | 'CLOSED', ...items: ReturnType<typeof anOpportunity>[]) {
    mockApi({
      [`GET /opportunities?status=${path}`]: () =>
        jsonResponse(200, { items: items.map(({ history: _history, ...rest }) => rest) }),
    });
  }

  const deadlineText = (card: HTMLElement) =>
    within(card).queryByText(/^(Open until|Closes|Posting ended)/);

  it('says when an open posting closes, highlighting one within a week', async () => {
    serve(
      'OPEN',
      anOpportunity({ id: 'a', company: 'Later', postedUntil: inDays(30) }),
      anOpportunity({ id: 'b', company: 'Soon', postedUntil: inDays(3) }),
      anOpportunity({ id: 'c', company: 'Ended', postedUntil: inDays(-2) }),
      anOpportunity({ id: 'd', company: 'Undated' }),
    );

    renderApp('/');

    const later = await screen.findByRole('article', { name: 'Later' });
    const soon = deadlineText(screen.getByRole('article', { name: 'Soon' }));
    const ended = deadlineText(screen.getByRole('article', { name: 'Ended' }));
    expect(deadlineText(later)?.textContent).toMatch(/^Open until /);
    expect(deadlineText(later)?.className).not.toMatch(/deadline(Soon|Ended)/);
    expect(soon?.textContent).toBe('Closes in 3 days');
    expect(soon?.className).toMatch(/deadlineSoon/);
    expect(ended?.textContent).toMatch(/^Posting ended /);
    expect(ended?.className).toMatch(/deadlineEnded/);
    expect(deadlineText(screen.getByRole('article', { name: 'Undated' }))).toBeNull();
  });

  it('does not highlight a closed opportunity whose posting closes soon', async () => {
    serve(
      'CLOSED',
      anOpportunity({
        id: 'x',
        company: 'Withdrawn',
        stage: 'WITHDRAWN',
        status: 'CLOSED',
        postedUntil: inDays(3),
      }),
    );

    renderApp('/archive');

    const text = deadlineText(await screen.findByRole('article', { name: 'Withdrawn' }));
    expect(text?.textContent).toBe('Closes in 3 days');
    expect(text?.className).not.toMatch(/deadlineSoon/);
  });
});
