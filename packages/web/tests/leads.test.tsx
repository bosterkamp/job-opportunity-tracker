// @module-tag leads
import type { LeadWithOpportunities } from '@jot/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

afterEach(() => {
  vi.restoreAllMocks();
});

function aLead(overrides: Partial<LeadWithOpportunities> = {}): LeadWithOpportunities {
  return {
    id: 'l1',
    name: 'Dana Ruiz',
    email: 'dana@example.com',
    phone: '+1 555 0100',
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    opportunities: [],
    notes: [],
    ...overrides,
  };
}

const leadsList = (items: LeadWithOpportunities[]) => () => jsonResponse(200, { items });
const { opportunities: _none, ...dana } = aLead();

const heading = () => screen.findByRole('heading', { level: 2, name: 'Networking leads' });
const card = (name: string) => screen.getByRole('article', { name });
const dialog = () => screen.getByRole('dialog');

describe('the Networking leads page', () => {
  it('says there are none yet, and offers "Add lead"', async () => {
    mockApi({ 'GET /leads': leadsList([]) });
    renderApp('/leads');

    await heading();
    expect(await screen.findByText('No networking leads yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add lead' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Networking leads' })).not.toBeInTheDocument();
  });

  it('lists each lead with its email and phone as plain text', async () => {
    mockApi({
      'GET /leads': leadsList([
        aLead(),
        aLead({ id: 'l2', name: 'Sam Lee', email: undefined, phone: undefined }),
      ]),
    });
    renderApp('/leads');

    const list = await screen.findByRole('list', { name: 'Networking leads' });
    expect(
      within(list)
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Dana Ruiz', 'Sam Lee']);
    expect(screen.queryByText('No networking leads yet.')).not.toBeInTheDocument();
    expect(within(card('Dana Ruiz')).getByText('dana@example.com')).not.toBe(card('Dana Ruiz'));
    expect(within(card('Dana Ruiz')).getByText('+1 555 0100')).not.toBe(card('Dana Ruiz'));
    expect(within(card('Sam Lee')).queryAllByRole('paragraph')).toEqual([]);
    // Email and phone are text, never mailto: or tel: links (spec FR-003).
    expect(within(card('Dana Ruiz')).queryAllByRole('link')).toEqual([]);
    expect(within(card('Sam Lee')).queryByText('dana@example.com')).not.toBeInTheDocument();
  });

  it('shows why the leads could not load, and tries again', async () => {
    let fail = true;
    mockApi({
      'GET /leads': () =>
        fail
          ? jsonResponse(404, { code: 'NOT_FOUND', message: 'Down' })
          : jsonResponse(200, { items: [] }),
    });
    renderApp('/leads');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your leads.");
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No networking leads yet.')).toBeInTheDocument();
  });
});

describe('adding a lead', () => {
  it('opens a dialog, saves the lead, and lists it', async () => {
    let saved: unknown;
    let items: LeadWithOpportunities[] = [];
    mockApi({
      'GET /leads': () => jsonResponse(200, { items }),
      'POST /leads': ({ body }) => {
        saved = body;
        items = [aLead()];
        return jsonResponse(201, dana);
      },
    });
    renderApp('/leads');
    await screen.findByText('No networking leads yet.');

    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    expect(dialog()).toHaveAccessibleName('Add lead');
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await fill(screen.getByLabelText('Name'), ' Dana Ruiz ');
    await fill(screen.getByLabelText('Email'), 'dana@example.com');
    await fill(screen.getByLabelText('Phone'), '+1 555 0100');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('article', { name: 'Dana Ruiz' })).toBeInTheDocument();
    expect(saved).toEqual({ name: 'Dana Ruiz', email: 'dana@example.com', phone: '+1 555 0100' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add lead' })).toHaveFocus();
  });

  it('needs a name, and checks the email, before sending anything', async () => {
    const fetch = mockApi({ 'GET /leads': leadsList([]) });
    renderApp('/leads');
    await screen.findByText('No networking leads yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));

    await fill(screen.getByLabelText('Email'), 'dana@');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name is required');
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address',
    );
    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-invalid');
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
  });

  it("shows the API's refusal in the dialog", async () => {
    mockApi({
      'GET /leads': leadsList([]),
      'POST /leads': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Name is required' }),
    });
    renderApp('/leads');
    await screen.findByText('No networking leads yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    await fill(screen.getByLabelText('Name'), 'Dana');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Name is required');
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
    expect(within(dialog()).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says it is saving while the request is in flight', async () => {
    mockApi({
      'GET /leads': leadsList([]),
      'POST /leads': () => new Promise<Response>(() => undefined),
    });
    renderApp('/leads');
    await screen.findByText('No networking leads yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    await fill(screen.getByLabelText('Name'), 'Dana');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(within(dialog()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('handles the submit itself instead of letting the browser submit the form', async () => {
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    mockApi({ 'GET /leads': leadsList([]) });
    renderApp('/leads');
    await screen.findByText('No networking leads yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    window.addEventListener('submit', listener);

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    window.removeEventListener('submit', listener);
    expect(prevented).toBe(true);
  });

  it('refreshes only the leads', async () => {
    mockApi({ 'GET /leads': leadsList([]), 'POST /leads': () => jsonResponse(201, dana) });
    const { queryClient } = renderApp('/leads');
    await screen.findByText('No networking leads yet.');
    await queryClient.fetchQuery({ queryKey: ['unrelated'], queryFn: () => Promise.resolve(1) });
    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    await fill(screen.getByLabelText('Name'), 'Dana Ruiz');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  });

  it('closes on Cancel or Escape without saving, keeping focus inside while open', async () => {
    mockApi({ 'GET /leads': leadsList([]) });
    renderApp('/leads');
    await screen.findByText('No networking leads yet.');

    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }));
    await userEvent.tab({ shift: true });
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add lead' })).toHaveFocus();
  });
});

describe('editing a lead', () => {
  it('opens the dialog filled in, and sends only a PATCH, clearing blank fields', async () => {
    let patch: unknown;
    let items = [aLead()];
    mockApi({
      'GET /leads': () => jsonResponse(200, { items }),
      'PATCH /leads/l1': ({ body }) => {
        patch = body;
        items = [aLead({ phone: undefined })];
        return jsonResponse(200, { ...dana, phone: undefined });
      },
    });
    const { queryClient } = renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });
    await queryClient.fetchQuery({ queryKey: ['unrelated'], queryFn: () => Promise.resolve(1) });

    await userEvent.click(
      within(card('Dana Ruiz')).getByRole('button', { name: 'Edit Dana Ruiz' }),
    );
    expect(dialog()).toHaveAccessibleName('Edit Dana Ruiz');
    expect(screen.getByLabelText('Name')).toHaveValue('Dana Ruiz');
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com');
    expect(screen.getByLabelText('Phone')).toHaveValue('+1 555 0100');
    await userEvent.clear(screen.getByLabelText('Phone'));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(patch).toEqual({ name: 'Dana Ruiz', email: 'dana@example.com', phone: null });
    await waitFor(() =>
      expect(within(card('Dana Ruiz')).queryByText('+1 555 0100')).not.toBeInTheDocument(),
    );
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
    expect(within(card('Dana Ruiz')).getByRole('button', { name: 'Edit Dana Ruiz' })).toHaveFocus();
  });
});

describe('deleting a lead', () => {
  it('asks first, and does nothing on Cancel', async () => {
    const fetch = mockApi({ 'GET /leads': leadsList([aLead()]) });
    renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });

    await userEvent.click(
      within(card('Dana Ruiz')).getByRole('button', { name: 'Delete Dana Ruiz' }),
    );
    const confirm = screen.getByRole('alertdialog', { name: 'Delete Dana Ruiz?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toEqual([]);
  });

  it('closes on Escape, giving focus back to its button', async () => {
    mockApi({ 'GET /leads': leadsList([aLead()]) });
    renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });
    const button = screen.getByRole('button', { name: 'Delete Dana Ruiz' });

    await userEvent.click(button);
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
    // Other keys leave it open, and Tab stays inside it.
    await userEvent.tab();
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    ).toHaveFocus();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('deletes it once confirmed, with the confirmation header', async () => {
    let items = [aLead()];
    const fetch = mockApi({
      'GET /leads': () => jsonResponse(200, { items }),
      'DELETE /leads/l1': () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });
    const { queryClient } = renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });
    await queryClient.fetchQuery({ queryKey: ['unrelated'], queryFn: () => Promise.resolve(1) });

    await userEvent.click(
      within(card('Dana Ruiz')).getByRole('button', { name: 'Delete Dana Ruiz' }),
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(await screen.findByText('No networking leads yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
    const call = fetch.mock.calls.find(([, init]) => init?.method === 'DELETE');
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get('x-confirm-delete')).toBe('true');
  });

  it('shows why it could not delete', async () => {
    mockApi({
      'GET /leads': leadsList([aLead()]),
      'DELETE /leads/l1': () => jsonResponse(404, { code: 'NOT_FOUND', message: 'Lead not found' }),
    });
    renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });
    await userEvent.click(
      within(card('Dana Ruiz')).getByRole('button', { name: 'Delete Dana Ruiz' }),
    );

    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      'Lead not found',
    );
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    ).toBeEnabled();
  });

  it('says it is deleting while the request is in flight', async () => {
    mockApi({
      'GET /leads': leadsList([aLead()]),
      'DELETE /leads/l1': () => new Promise<Response>(() => undefined),
    });
    renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });
    await userEvent.click(
      within(card('Dana Ruiz')).getByRole('button', { name: 'Delete Dana Ruiz' }),
    );

    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
  });
});

describe("a lead's opportunities", () => {
  const opportunities: LeadWithOpportunities['opportunities'] = [
    { id: 'o1', company: 'Acme', title: 'Staff Engineer', stage: 'APPLIED', status: 'OPEN' },
    { id: 'o2', company: 'Initech', title: 'Architect', stage: 'REJECTED', status: 'CLOSED' },
  ];

  it('lists each, open or closed, with its stage, linking to it', async () => {
    mockApi({ 'GET /leads': leadsList([aLead({ opportunities })]) });
    renderApp('/leads');

    const list = await screen.findByRole('list', { name: 'Opportunities from Dana Ruiz' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Acme: Staff Engineer (Applied)', 'Initech: Architect (Rejected)']);
    expect(within(list).getByRole('link', { name: 'Acme: Staff Engineer' })).toHaveAttribute(
      'href',
      '/opportunities/o1',
    );
  });

  it('lists nothing for a lead without any', async () => {
    mockApi({ 'GET /leads': leadsList([aLead()]) });
    renderApp('/leads');

    await screen.findByRole('article', { name: 'Dana Ruiz' });
    expect(screen.queryByRole('list', { name: /Opportunities from/ })).not.toBeInTheDocument();
  });

  it.each([
    [1, ' 1 opportunity will stay, without a lead.'],
    [2, ' 2 opportunities will stay, without a lead.'],
    [0, ''],
  ])('says how many of %i will be unlinked when deleting', async (count, after) => {
    mockApi({
      'GET /leads': leadsList([aLead({ opportunities: opportunities.slice(0, count) })]),
    });
    renderApp('/leads');
    await screen.findByRole('article', { name: 'Dana Ruiz' });

    await userEvent.click(screen.getByRole('button', { name: 'Delete Dana Ruiz' }));

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      `This removes the lead, and it can't be undone.${after}`,
    );
  });
});
