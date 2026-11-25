// @module-tag interview
import type { Interview, OpportunityWithHistory } from '@jot/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../src/format';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

// The interview pages (feature 012): adding one, the Interviews section on the opportunity,
// each interview's own page, and its line in the history.
const NOW = new Date('2026-10-20T15:00:00.000Z');
const CREATED = '2026-09-01T12:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const past: Interview = {
  id: 'i1',
  heldAt: '2026-10-05T17:30:00.000Z',
  note: 'Bring the portfolio',
  recordedAt: '2026-10-05T18:00:00.000Z',
  kind: 'HIRING_MANAGER',
  panel: true,
  format: 'VIDEO',
  outcome: 'WENT_WELL',
  nextSteps: 'Decision by Friday',
  interviewers: [
    {
      name: 'Priya Shah',
      title: 'Engineering Manager',
      email: 'priya@acme.example',
      phone: '+1 555 0100',
      linkedin: 'https://www.linkedin.com/in/priya-shah',
    },
    { name: 'Tom Lee' },
  ],
};
const older: Interview = {
  id: 'i0',
  heldAt: '2026-09-20T12:00:00.000Z',
  note: null,
  recordedAt: '2026-09-20T12:00:00.000Z',
};
const upcoming: Interview = {
  id: 'i2',
  heldAt: '2026-10-22T19:00:00.000Z',
  note: null,
  recordedAt: '2026-10-19T12:00:00.000Z',
  kind: 'ENGINEERING',
  format: 'IN_PERSON',
  // Kept from before its date moved ahead; not shown until it's past.
  outcome: 'WENT_BADLY',
};

function globex(
  interviews: Interview[] = [past, older, upcoming],
  overrides: Partial<OpportunityWithHistory> = {},
) {
  return anOpportunity({
    id: 'f',
    company: 'Globex',
    title: 'Platform Engineer',
    createdAt: CREATED,
    history: [
      {
        seq: 1,
        fromStage: null,
        toStage: 'CONSIDERING',
        changedAt: CREATED,
        note: null,
        recordedAt: CREATED,
      },
    ],
    interviews,
    interviewCount: interviews.length,
    interviewTimes: interviews.map((i) => i.heldAt).sort(),
    ...overrides,
  });
}

const section = () => screen.getByRole('region', { name: 'Interviews' });
const historyItems = () =>
  within(screen.getByRole('region', { name: 'History' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('adding an interview on its own page', () => {
  it('starts from the opportunity page and is titled for the opportunity', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex([])) });
    renderApp('/opportunities/f');

    await userEvent.click(await screen.findByRole('link', { name: 'Add interview' }));

    expect(
      await screen.findByRole('heading', { name: 'Add an interview for Globex' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Add interview' })).toBeInTheDocument();
  });

  it("saves, and opens the new interview's page", async () => {
    const posted: unknown[] = [];
    const logged: Interview = {
      id: 'i9',
      heldAt: NOW.toISOString(),
      note: null,
      recordedAt: NOW.toISOString(),
      kind: 'HR',
    };
    mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, globex(posted.length ? [older, logged] : [older])),
      'POST /opportunities/f/interviews': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, globex([older, logged]));
      },
    });
    renderApp('/opportunities/f/interviews/new');

    await userEvent.selectOptions(await screen.findByLabelText('Type'), 'HR / talent advisor');
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));
    await waitFor(() => expect(posted).toHaveLength(1));

    expect(
      await screen.findByRole('heading', { name: 'HR / talent advisor interview' }),
    ).toBeInTheDocument();
    expect(posted).toEqual([{ kind: 'HR' }]);
  });

  it('goes back to the opportunity on Cancel', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex([])) });
    renderApp('/opportunities/f/interviews/new');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeInTheDocument();
  });

  it("shows the API's refusal, and that it's saving", async () => {
    let refuse: (() => void) | undefined;
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, globex([])),
      'POST /opportunities/f/interviews': () =>
        new Promise<Response>((resolve) => {
          refuse = () =>
            resolve(jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Something is wrong' }));
        }),
    });
    renderApp('/opportunities/f/interviews/new');

    await userEvent.click(await screen.findByRole('button', { name: 'Save interview' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    refuse?.();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something is wrong');
  });

  it('says when the opportunity already has 6 interviews, instead of the form', async () => {
    const six = Array.from({ length: 6 }, (_, n) => ({ ...older, id: `i${n}` }));
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex(six)) });
    renderApp('/opportunities/f/interviews/new');

    expect(
      await screen.findByText('This opportunity already has 6 interviews, the most it can have'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Globex' })).toHaveAttribute(
      'href',
      '/opportunities/f',
    );
  });

  it("says so when the opportunity doesn't exist", async () => {
    mockApi({
      'GET /opportunities/gone': () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'Opportunity not found' }),
    });
    renderApp('/opportunities/gone/interviews/new');

    expect(
      await screen.findByRole('heading', { name: 'Opportunity not found' }),
    ).toBeInTheDocument();
  });
});

describe('the Interviews section', () => {
  it('lists upcoming interviews first, then past ones, newest first', async () => {
    const later = { ...upcoming, id: 'i3', heldAt: '2026-11-02T15:00:00.000Z' };
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, globex([past, later, older, upcoming])),
    });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'Interviews' });
    expect(
      within(section())
        .getAllByRole('heading', { level: 4 })
        .map((h) => h.textContent),
    ).toEqual(['Upcoming', 'Past']);
    const links = (name: string) =>
      within(within(section()).getByRole('list', { name })).getAllByRole('link');
    expect(links('Upcoming interviews').map((l) => l.textContent)).toEqual([
      `${formatDateTime(upcoming.heldAt)} · Engineering · In person`,
      `${formatDateTime(later.heldAt)} · Engineering · In person`,
    ]);
    expect(links('Past interviews').map((l) => l.textContent)).toEqual([
      `${formatDateTime(past.heldAt)} · Hiring manager · Panel · Video`,
      formatDateTime(older.heldAt),
    ]);
    expect(links('Past interviews')[0]).toHaveAttribute('href', '/opportunities/f/interviews/i1');
  });

  it('shows only the lists it has', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex([older])) });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'Interviews' });
    expect(within(section()).queryByRole('list', { name: 'Upcoming interviews' })).toBeNull();
    expect(within(section()).getByRole('list', { name: 'Past interviews' })).toBeVisible();
  });

  it('offers only "Add interview" when there are none', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex([])) });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'Interviews' });
    expect(within(section()).queryByRole('list')).toBeNull();
    expect(within(section()).getByRole('link', { name: 'Add interview' })).toHaveAttribute(
      'href',
      '/opportunities/f/interviews/new',
    );
  });

  it('says when the limit is reached, instead of offering more', async () => {
    const six = Array.from({ length: 6 }, (_, n) => ({ ...older, id: `i${n}` }));
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex(six)) });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'Interviews' });
    expect(
      within(section()).getByText(
        'This opportunity already has 6 interviews, the most it can have',
      ),
    ).toBeVisible();
    expect(within(section()).queryByRole('link', { name: 'Add interview' })).toBeNull();
  });
});

describe('the history', () => {
  it('shows each past interview as one line linking to its page, and no upcoming ones', async () => {
    mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, globex([past, { ...older, via: 'CLAUDE' }, upcoming])),
    });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'History' });
    expect(historyItems()).toEqual([
      expect.stringMatching(/^Considering · /),
      `Interview · ${formatDateTime(older.heldAt)} · via Claude`,
      `Interview · ${formatDateTime(past.heldAt)} · Hiring manager · Panel`,
    ]);
    const history = screen.getByRole('region', { name: 'History' });
    expect(
      within(history).getByRole('link', {
        name: `Interview · ${formatDateTime(past.heldAt)} · Hiring manager · Panel`,
      }),
    ).toHaveAttribute('href', '/opportunities/f/interviews/i1');
    expect(within(history).queryByRole('button')).toBeNull();
  });

  it('gives every history entry its own key', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const two = globex();
    two.history.push({
      seq: 2,
      fromStage: 'CONSIDERING',
      toStage: 'APPLIED',
      changedAt: '2026-09-10T12:00:00.000Z',
      note: null,
      recordedAt: '2026-09-10T12:00:00.000Z',
    });
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, two) });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'History' });
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('keeps the date added from moving after the first interview', async () => {
    const patched: unknown[] = [];
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, globex([older])),
      'PATCH /opportunities/f': ({ body }) => {
        patched.push(body);
        return jsonResponse(200, globex([older]));
      },
    });
    renderApp('/opportunities/f');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    const dateAdded = screen.getByLabelText('Date added');
    await userEvent.clear(dateAdded);
    await fill(dateAdded, '2026-09-25');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(dateAdded).toHaveAccessibleDescription(
      "The date added can't be after the first interview",
    );
    expect(patched).toEqual([]);
  });
});

describe("an interview's page", () => {
  const facts = () =>
    Object.fromEntries(
      within(screen.getByRole('region', { name: 'Details' }))
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );

  it('shows every detail, its interviewers, and the way back', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f/interviews/i1');

    expect(
      await screen.findByRole('heading', { name: 'Hiring manager interview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Globex · Platform Engineer')).toBeInTheDocument();
    expect(facts()).toEqual({
      When: formatDateTime(past.heldAt),
      Panel: 'Yes',
      Format: 'Video',
      'How it went': 'Went well',
      'Next steps': 'Decision by Friday',
      Note: 'Bring the portfolio',
    });
    // Each person's details, one per line, and nothing for what they don't have.
    const people = within(screen.getByRole('region', { name: 'Interviewers' }));
    expect(
      people.getAllByRole('listitem').map((li) => [...li.children].map((c) => c.textContent)),
    ).toEqual([
      ['Priya Shah', 'Engineering Manager', 'priya@acme.example', '+1 555 0100', 'LinkedIn'],
      ['Tom Lee'],
    ]);
    expect(screen.getByRole('link', { name: 'Back to Globex' })).toHaveAttribute(
      'href',
      '/opportunities/f',
    );
  });

  it('opens a LinkedIn profile in a new tab, and leaves email and phone as plain text', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f/interviews/i1');

    const profile = await screen.findByRole('link', { name: 'LinkedIn profile of Priya Shah' });
    expect(profile).toHaveAttribute('href', 'https://www.linkedin.com/in/priya-shah');
    expect(profile).toHaveAttribute('target', '_blank');
    expect(profile).toHaveAttribute('rel', 'noopener noreferrer');
    const people = within(screen.getByRole('region', { name: 'Interviewers' }));
    expect(people.getAllByRole('link')).toHaveLength(1);
  });

  it('marks an upcoming interview, and hides how it went until it has happened', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f/interviews/i2');

    expect(await screen.findByRole('heading', { name: 'Engineering interview' })).toBeVisible();
    expect(screen.getByText('Upcoming')).toBeVisible();
    expect(facts()).toEqual({ When: formatDateTime(upcoming.heldAt), Format: 'In person' });
    expect(screen.queryByRole('region', { name: 'Interviewers' })).toBeNull();
  });

  it('is just "Interview" without a type, with only its time', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f/interviews/i0');

    expect(await screen.findByRole('heading', { name: 'Interview' })).toBeVisible();
    expect(facts()).toEqual({ When: formatDateTime(older.heldAt) });
    expect(screen.queryByText('Upcoming')).toBeNull();
  });

  it('says when the interview is gone, with the way back', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f/interviews/nope');

    expect(await screen.findByRole('heading', { name: 'Interview not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Globex' })).toBeVisible();
  });

  it("says so when the opportunity doesn't exist", async () => {
    mockApi({
      'GET /opportunities/gone': () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'Opportunity not found' }),
    });
    renderApp('/opportunities/gone/interviews/i1');

    expect(
      await screen.findByRole('heading', { name: 'Opportunity not found' }),
    ).toBeInTheDocument();
  });

  it('is opened from the section and from the history', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f');

    const history = await screen.findByRole('region', { name: 'History' });
    await userEvent.click(within(history).getAllByRole('link').at(-1) as HTMLElement);

    expect(
      await screen.findByRole('heading', { name: 'Hiring manager interview' }),
    ).toBeInTheDocument();
  });

  it('edits the interview on the page', async () => {
    const patched: unknown[] = [];
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, globex()),
      'PATCH /opportunities/f/interviews/i1': ({ body }) => {
        patched.push(body);
        return jsonResponse(200, globex([{ ...past, kind: 'ENGINEERING' }, older, upcoming]));
      },
    });
    renderApp('/opportunities/f/interviews/i1');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit interview' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Engineering');
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));

    expect(await screen.findByRole('heading', { name: 'Engineering interview' })).toBeVisible();
    expect(screen.queryByRole('form')).toBeNull();
    expect(patched).toEqual([{ kind: 'ENGINEERING' }]);
  });

  it('forgets a failed edit when cancelled', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, globex()),
      'PATCH /opportunities/f/interviews/i1': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Something is wrong' }),
    });
    renderApp('/opportunities/f/interviews/i1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit interview' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit interview' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes the interview after asking, and goes back to the opportunity', async () => {
    const removed: string[] = [];
    const fetchSpy = mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, removed.length ? globex([older]) : globex([past, older])),
      'DELETE /opportunities/f/interviews/i1': () => {
        removed.push('i1');
        return jsonResponse(200, globex([older]));
      },
    });
    renderApp('/opportunities/f/interviews/i1');

    await userEvent.click(await screen.findByRole('button', { name: 'Remove interview' }));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      "Remove this interview? This can't be undone.",
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(removed).toEqual([]);
    expect(screen.getByRole('button', { name: 'Remove interview' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Remove interview' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeVisible();
    expect(removed).toEqual(['i1']);
    // The API removes only with this header (spec FR-007 of feature 005).
    const call = fetchSpy.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(new Headers(call?.[1]?.headers).get('x-confirm-delete')).toBe('true');
    await waitFor(() =>
      expect(
        within(within(section()).getByRole('list', { name: 'Past interviews' })).getAllByRole(
          'link',
        ),
      ).toHaveLength(1),
    );
  });

  it('shows why removing failed, in the dialog, and lets it be tried again', async () => {
    let fail: (() => void) | undefined;
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, globex()),
      'DELETE /opportunities/f/interviews/i1': () =>
        new Promise<Response>((resolve) => {
          fail = () =>
            resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'Interview not found' }));
        }),
    });
    renderApp('/opportunities/f/interviews/i1');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove interview' }));
    const dialog = screen.getByRole('alertdialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(within(dialog).getByRole('button', { name: 'Removing…' })).toBeDisabled();
    fail?.();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Interview not found');
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('keeps focus inside the dialog, and closes it with Escape', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, globex()) });
    renderApp('/opportunities/f/interviews/i1');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove interview' }));
    const dialog = screen.getByRole('alertdialog');
    const removeButton = within(dialog).getByRole('button', { name: 'Remove' });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });

    expect(removeButton).toHaveFocus();
    await userEvent.keyboard('a');
    expect(dialog).toBeInTheDocument();
    await userEvent.tab();
    expect(cancelButton).toHaveFocus();
    await userEvent.tab();
    expect(removeButton).toHaveFocus();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
