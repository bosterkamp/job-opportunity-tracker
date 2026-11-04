// @module-tag leads
import type { LeadNote, LeadWithOpportunities } from '@jot/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

// Notes on networking leads (feature 011): a dated note for each conversation, on the lead's
// card.

const NOW = new Date('2026-11-01T15:00:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function aNote(overrides: Partial<LeadNote> = {}): LeadNote {
  return {
    id: 'n1',
    leadId: 'l1',
    heldAt: '2026-10-30T17:00:00.000Z',
    text: 'Coffee chat.\nShe will intro me to Acme.',
    createdAt: '2026-10-30T18:00:00.000Z',
    updatedAt: '2026-10-30T18:00:00.000Z',
    ...overrides,
  };
}

function aLead(notes: LeadNote[] = [], opportunities: LeadWithOpportunities['opportunities'] = []) {
  return {
    id: 'l1',
    name: 'Dana Ruiz',
    email: 'dana@example.com',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    opportunities,
    notes,
  };
}

const older = aNote({ id: 'n2', heldAt: '2026-10-12T17:00:00.000Z', text: 'First call' });
const oldest = aNote({ id: 'n3', heldAt: '2026-09-02T17:00:00.000Z', text: 'Met at a meetup' });

const card = () => screen.getByRole('article', { name: 'Dana Ruiz' });
const notes = () => within(card()).getByRole('region', { name: 'Notes with Dana Ruiz' });
const dialog = () => screen.getByRole('dialog');

async function openPage(items: unknown[], routes: Parameters<typeof mockApi>[0] = {}) {
  const fetch = mockApi({ 'GET /leads': () => jsonResponse(200, { items }), ...routes });
  const view = renderApp('/leads');
  await screen.findByRole('article', { name: 'Dana Ruiz' });
  return { fetch, ...view };
}

const sent = (fetch: ReturnType<typeof mockApi>, method: string) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([input, init]) => ({
      url: new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      ).pathname,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      headers: new Headers(init?.headers),
    }));

describe('the notes on a lead', () => {
  it('offers "Add note", and shows no notes area without any', async () => {
    await openPage([aLead()]);

    expect(
      within(card()).getByRole('button', { name: 'Add a note for Dana Ruiz' }),
    ).toHaveTextContent('Add note');
    expect(within(card()).queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows one note with its day and its text, line breaks kept, and nothing to open', async () => {
    await openPage([aLead([aNote()])]);

    const items = within(notes()).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Oct 30, 2026');
    const text = within(notes()).getByText(/Coffee chat\./);
    expect(text.textContent).toBe('Coffee chat.\nShe will intro me to Acme.');
    expect(within(card()).queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('shows the newest of several, and opens and closes the rest', async () => {
    await openPage([aLead([aNote(), older, oldest])]);
    const toggle = within(card()).getByRole('button', { name: 'Show all 3 notes' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(notes())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Coffee chat.') as string]);

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Show fewer');
    expect(
      within(notes())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringMatching(/^Oct 30, 2026.*Coffee chat\./s) as string,
      expect.stringMatching(/^Oct 12, 2026.*First call/s) as string,
      expect.stringMatching(/^Sep 2, 2026.*Met at a meetup/s) as string,
    ]);
    expect(notes()).toHaveAttribute('id', toggle.getAttribute('aria-controls'));

    await userEvent.click(toggle);
    expect(within(notes()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows a link written in a note as plain text', async () => {
    await openPage([aLead([aNote({ text: 'Her post: https://example.com/jobs' })])]);

    expect(within(notes()).getByText('Her post: https://example.com/jobs')).toBeInTheDocument();
    expect(within(notes()).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('adding a note', () => {
  it('saves a note for today, refreshes the list, and gives focus back', async () => {
    let items = [aLead()];
    const { fetch } = await openPage([], {
      'GET /leads': () => jsonResponse(200, { items }),
      'POST /leads/l1/notes': () => {
        items = [aLead([aNote({ text: 'Lunch' })])];
        return jsonResponse(201, aNote({ text: 'Lunch' }));
      },
    });
    const add = within(card()).getByRole('button', { name: 'Add a note for Dana Ruiz' });

    await userEvent.click(add);
    expect(dialog()).toHaveAccessibleName('Add a note for Dana Ruiz');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-11-01');
    expect(screen.getByLabelText('Note')).toHaveFocus();
    await fill(screen.getByLabelText('Note'), ' Lunch ');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await within(notes()).findByText('Lunch')).toBeInTheDocument();
    // Today is now, which the API sets.
    expect(sent(fetch, 'POST')).toEqual([
      expect.objectContaining({ url: '/leads/l1/notes', body: { text: 'Lunch' } }),
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveFocus();
  });

  it('dates a note on an earlier day at noon', async () => {
    const { fetch } = await openPage([aLead()], {
      'POST /leads/l1/notes': () => jsonResponse(201, aNote()),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add a note for Dana Ruiz' }));

    await userEvent.clear(screen.getByLabelText('Date'));
    await fill(screen.getByLabelText('Date'), '2026-10-20');
    await fill(screen.getByLabelText('Note'), 'Phone call');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetch, 'POST')[0]?.body).toEqual({
      text: 'Phone call',
      heldAt: new Date('2026-10-20T12:00:00').toISOString(),
    });
  });

  it('dates a note now when its day is cleared', async () => {
    const { fetch } = await openPage([aLead()], {
      'POST /leads/l1/notes': () => jsonResponse(201, aNote()),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add a note for Dana Ruiz' }));

    await userEvent.clear(screen.getByLabelText('Date'));
    await fill(screen.getByLabelText('Note'), 'Phone call');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetch, 'POST')[0]?.body).toEqual({ text: 'Phone call' });
  });

  it('needs a note, and a day that is not in the future, before sending anything', async () => {
    const { fetch } = await openPage([aLead()]);
    await userEvent.click(screen.getByRole('button', { name: 'Add a note for Dana Ruiz' }));

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Note')).toHaveAccessibleDescription('Write a note');
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Note')).toHaveFocus();
    expect(screen.getByLabelText('Date')).not.toHaveAttribute('aria-invalid');

    await userEvent.clear(screen.getByLabelText('Date'));
    await fill(screen.getByLabelText('Date'), '2026-11-03');
    await fill(screen.getByLabelText('Note'), 'Later');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Date')).toHaveAccessibleDescription(
      "A note can't be dated in the future",
    );
    expect(screen.getByLabelText('Note')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Date')).toHaveFocus();
    expect(sent(fetch, 'POST')).toEqual([]);
  });

  it("shows the API's refusal, says it is saving, and lets you try again", async () => {
    let reply: (value: Response) => void = () => undefined;
    await openPage([aLead()], {
      'POST /leads/l1/notes': () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add a note for Dana Ruiz' }));
    await fill(screen.getByLabelText('Note'), 'Lunch');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(within(dialog()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    reply(
      jsonResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'This lead already has 200 notes, the most it can have',
      }),
    );

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'This lead already has 200 notes, the most it can have',
    );
    expect(within(dialog()).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('handles the submit itself instead of letting the browser submit the form', async () => {
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    await openPage([aLead()]);
    await userEvent.click(screen.getByRole('button', { name: 'Add a note for Dana Ruiz' }));
    window.addEventListener('submit', listener);

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    window.removeEventListener('submit', listener);
    expect(prevented).toBe(true);
  });

  it('closes on Cancel or Escape without saving, keeping focus inside while open', async () => {
    const { fetch } = await openPage([aLead()]);
    const add = screen.getByRole('button', { name: 'Add a note for Dana Ruiz' });

    await userEvent.click(add);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveFocus();

    await userEvent.click(add);
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveFocus();
    expect(sent(fetch, 'POST')).toEqual([]);
  });

  it('refreshes only the leads', async () => {
    const { queryClient } = await openPage([aLead()], {
      'POST /leads/l1/notes': () => jsonResponse(201, aNote()),
    });
    await queryClient.fetchQuery({ queryKey: ['unrelated'], queryFn: () => Promise.resolve(1) });
    await userEvent.click(screen.getByRole('button', { name: 'Add a note for Dana Ruiz' }));
    await fill(screen.getByLabelText('Note'), 'Lunch');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  });
});

describe('editing a note', () => {
  it('opens filled in, and sends only what changed', async () => {
    let items = [aLead([aNote()])];
    const { fetch, queryClient } = await openPage([], {
      'GET /leads': () => jsonResponse(200, { items }),
      'PATCH /leads/l1/notes/n1': () => {
        items = [aLead([aNote({ text: 'Lunch instead' })])];
        return jsonResponse(200, aNote({ text: 'Lunch instead' }));
      },
    });
    await queryClient.fetchQuery({ queryKey: ['unrelated'], queryFn: () => Promise.resolve(1) });
    const edit = within(notes()).getByRole('button', {
      name: 'Edit the note on Oct 30, 2026 with Dana Ruiz',
    });

    await userEvent.click(edit);
    expect(dialog()).toHaveAccessibleName('Edit note');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-30');
    expect(screen.getByLabelText('Note')).toHaveValue('Coffee chat.\nShe will intro me to Acme.');
    await userEvent.clear(screen.getByLabelText('Note'));
    await fill(screen.getByLabelText('Note'), 'Lunch instead');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await within(notes()).findByText('Lunch instead')).toBeInTheDocument();
    expect(sent(fetch, 'PATCH')).toEqual([
      expect.objectContaining({ url: '/leads/l1/notes/n1', body: { text: 'Lunch instead' } }),
    ]);
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
    expect(
      within(notes()).getByRole('button', { name: 'Edit the note on Oct 30, 2026 with Dana Ruiz' }),
    ).toHaveFocus();
  });

  it('sends a new day alone, and closes without a request when nothing changed', async () => {
    const { fetch } = await openPage([aLead([aNote()])], {
      'PATCH /leads/l1/notes/n1': () => jsonResponse(200, aNote()),
    });
    const edit = () =>
      within(notes()).getByRole('button', {
        name: 'Edit the note on Oct 30, 2026 with Dana Ruiz',
      });

    await userEvent.click(edit());
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent(fetch, 'PATCH')).toEqual([]);

    await userEvent.click(edit());
    await userEvent.clear(screen.getByLabelText('Date'));
    await fill(screen.getByLabelText('Date'), '2026-10-29');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetch, 'PATCH').map((call) => call.body)).toEqual([
      { heldAt: new Date('2026-10-29T12:00:00').toISOString() },
    ]);
  });
});

describe('deleting a note', () => {
  const deleteButton = () =>
    within(notes()).getByRole('button', { name: 'Delete the note on Oct 30, 2026 with Dana Ruiz' });

  it('asks first, and does nothing on Cancel or Escape', async () => {
    const { fetch } = await openPage([aLead([aNote()])]);

    await userEvent.click(deleteButton());
    const confirm = screen.getByRole('alertdialog', { name: 'Delete this note?' });
    expect(confirm).toHaveAccessibleDescription(
      "The note from Oct 30, 2026 is deleted, and it can't be undone.",
    );
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab();
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toHaveFocus();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteButton()).toHaveFocus();

    await userEvent.click(deleteButton());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteButton()).toHaveFocus();
    expect(sent(fetch, 'DELETE')).toEqual([]);
  });

  it('deletes it once confirmed, with the confirmation header, refreshing only the leads', async () => {
    let items = [aLead([aNote()])];
    const { fetch, queryClient } = await openPage([], {
      'GET /leads': () => jsonResponse(200, { items }),
      'DELETE /leads/l1/notes/n1': () => {
        items = [aLead()];
        return new Response(null, { status: 204 });
      },
    });
    await queryClient.fetchQuery({ queryKey: ['unrelated'], queryFn: () => Promise.resolve(1) });

    await userEvent.click(deleteButton());
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => expect(within(card()).queryByRole('region')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const [call] = sent(fetch, 'DELETE');
    expect(call?.url).toBe('/leads/l1/notes/n1');
    expect(call?.headers.get('x-confirm-delete')).toBe('true');
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
    expect(within(card()).getByRole('button', { name: 'Add a note for Dana Ruiz' })).toHaveFocus();
  });

  it('says it is deleting, and shows why it could not', async () => {
    let reply: (value: Response) => void = () => undefined;
    await openPage([aLead([aNote()])], {
      'DELETE /leads/l1/notes/n1': () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    });
    await userEvent.click(deleteButton());
    const confirm = screen.getByRole('alertdialog');

    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(within(confirm).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    reply(jsonResponse(404, { code: 'NOT_FOUND', message: 'Note not found' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Note not found');
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});

describe('deleting a lead with notes', () => {
  it.each([
    [[aNote()], [], ' 1 note will be deleted.'],
    [[aNote(), older], [], ' 2 notes will be deleted.'],
    [
      [aNote()],
      [{ id: 'o1', company: 'Acme', title: 'Engineer', stage: 'APPLIED', status: 'OPEN' }],
      ' 1 opportunity will stay, without a lead. 1 note will be deleted.',
    ],
  ] as const)('says how many notes go with it (%#)', async (noteList, opportunities, after) => {
    await openPage([aLead([...noteList], [...opportunities])]);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Dana Ruiz' }));

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      `This removes the lead, and it can't be undone.${after}`,
    );
  });
});
