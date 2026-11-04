// @module-tag interview
import { localDate, type OpportunityWithHistory } from '@jot/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewForm } from '../src/components/InterviewForm';
import { formatDate } from '../src/format';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

// Fixed so "today" is known. Only Date is faked: timers stay real for user events.
const NOW = new Date('2026-10-20T15:00:00.000Z');
const TODAY = localDate(NOW);
const CREATED = '2026-09-01T12:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const dateField = () => screen.getByLabelText('Date');
const noteField = () => screen.getByLabelText('Note');
const noonOn = (day: string) => new Date(`${day}T12:00:00`).toISOString();

async function chooseDay(day: string) {
  await userEvent.clear(dateField());
  await fill(dateField(), day);
}

function renderAdd() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <InterviewForm
      createdAt={CREATED}
      submitLabel="Save interview"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save interview' }));

describe('the interview form, adding', () => {
  it('starts on today with no note, offering no later day', () => {
    renderAdd();

    expect(screen.getByRole('form', { name: 'Add interview' })).toBeInTheDocument();
    expect(dateField()).toHaveValue(TODAY);
    expect(dateField()).toHaveAttribute('type', 'date');
    expect(dateField()).toHaveAttribute('max', TODAY);
    expect(noteField()).toHaveValue('');
  });

  it('sends nothing for an unchanged day and an empty note, so the API dates it now', async () => {
    const { onSubmit } = renderAdd();

    await save();

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('sends noon local time for an earlier day, and the trimmed note', async () => {
    const { onSubmit } = renderAdd();

    await chooseDay('2026-10-13');
    await fill(noteField(), '  Hiring manager ');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({ heldAt: noonOn('2026-10-13'), note: 'Hiring manager' });
  });

  it('is never earlier than the date added, on that day', async () => {
    const onSubmit = vi.fn();
    const evening = new Date('2026-09-01T21:00:00').toISOString();
    render(
      <InterviewForm
        createdAt={evening}
        submitLabel="Save interview"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await chooseDay('2026-09-01');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({ heldAt: evening });
  });

  it.each([
    ['in the future', '2026-10-22', "The date can't be in the future"],
    ['before the date added', '2026-08-31', "An interview can't be before the date added"],
  ])('refuses a day %s, on the field, without sending', async (_label, day, message) => {
    const { onSubmit } = renderAdd();

    await chooseDay(day);
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dateField()).toHaveAttribute('aria-invalid', 'true');
    expect(dateField()).toHaveAccessibleDescription(message);
    await waitFor(() => expect(dateField()).toHaveFocus());
  });

  it('refuses a note over 200 characters, on the field', async () => {
    const { onSubmit } = renderAdd();

    await fill(noteField(), 'x'.repeat(201));
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(noteField()).toHaveAccessibleDescription('Must be 200 characters or fewer');
    await waitFor(() => expect(noteField()).toHaveFocus());
  });

  it('clears a problem once it is fixed', async () => {
    const { onSubmit } = renderAdd();
    await chooseDay('2026-10-22');
    await save();

    await chooseDay('2026-10-19');
    await save();

    expect(dateField()).not.toHaveAttribute('aria-invalid');
    expect(onSubmit).toHaveBeenCalledWith({ heldAt: noonOn('2026-10-19') });
  });

  it('handles the submit itself instead of letting the browser submit the form', async () => {
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    window.addEventListener('submit', listener);
    renderAdd();

    await save();

    window.removeEventListener('submit', listener);
    expect(prevented).toBe(true);
  });

  it('treats a cleared date as unchanged, so the API dates it now', async () => {
    const { onSubmit } = renderAdd();

    await userEvent.clear(dateField());
    await save();

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('is laid out as a panel with the form fields', () => {
    renderAdd();

    const form = screen.getByRole('form', { name: 'Add interview' });
    expect(form.className).toMatch(/form/);
    expect(form.className).toMatch(/panel/);
  });

  it('cancels', async () => {
    const { onCancel } = renderAdd();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows a server problem and a busy, disabled button while saving', () => {
    render(
      <InterviewForm
        createdAt={CREATED}
        submitLabel="Save interview"
        submitting
        serverError="Something went wrong."
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

describe('logging an interview from the detail page', () => {
  const history: OpportunityWithHistory['history'] = [
    {
      seq: 1,
      fromStage: null,
      toStage: 'CONSIDERING',
      changedAt: CREATED,
      note: null,
      recordedAt: CREATED,
    },
    {
      seq: 2,
      fromStage: 'CONSIDERING',
      toStage: 'INTERVIEWING',
      changedAt: '2026-10-10T12:00:00.000Z',
      note: null,
      recordedAt: '2026-10-10T12:00:00.000Z',
    },
  ];
  const opportunity = anOpportunity({
    id: 'f',
    company: 'Farmers',
    stage: 'INTERVIEWING',
    createdAt: CREATED,
    history,
    interviews: [],
  });
  // Each entry's text, without an interview's Edit and Remove buttons.
  const historyItems = () =>
    within(screen.getByRole('region', { name: 'History' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(/EditRemove$/, ''));

  it('adds an interview through the form and shows it in the history, in date order', async () => {
    const posted: unknown[] = [];
    const logged = {
      id: 'i1',
      heldAt: '2026-10-05T12:00:00.000Z',
      note: 'Phone screen',
      recordedAt: NOW.toISOString(),
    };
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'POST /opportunities/f/interviews': ({ body }) => {
        posted.push(body);
        return jsonResponse(201, { ...opportunity, interviews: [logged], interviewCount: 1 });
      },
    });
    renderApp('/opportunities/f');

    await userEvent.click(await screen.findByRole('button', { name: 'Add interview' }));
    await chooseDay('2026-10-05');
    await fill(noteField(), 'Phone screen');
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Add interview' })).toBeNull());
    expect(posted).toEqual([{ heldAt: noonOn('2026-10-05'), note: 'Phone screen' }]);
    expect(historyItems()).toEqual([
      `Considering · ${formatDate(CREATED)}`,
      `Interview · ${formatDate(logged.heldAt)} · Phone screen`,
      `Interviewing · ${formatDate('2026-10-10T12:00:00.000Z')}`,
    ]);
    expect(screen.getByText('Interviewing', { selector: 'dd' })).toBeInTheDocument();
  });

  it('marks interviews logged through Claude', async () => {
    mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, {
          ...opportunity,
          interviews: [
            {
              id: 'i1',
              heldAt: NOW.toISOString(),
              note: null,
              recordedAt: NOW.toISOString(),
              via: 'CLAUDE',
            },
          ],
          interviewCount: 1,
        }),
    });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'History' });
    expect(historyItems().at(-1)).toBe(`Interview · ${formatDate(NOW.toISOString())} · via Claude`);
  });

  it('shows a server problem and keeps the form open', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'POST /opportunities/f/interviews': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Something is wrong' }),
    });
    renderApp('/opportunities/f');

    await userEvent.click(await screen.findByRole('button', { name: 'Add interview' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something is wrong');
    expect(screen.getByRole('form', { name: 'Add interview' })).toBeInTheDocument();
  });

  it('closes the form on Cancel, forgetting a failed save', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'POST /opportunities/f/interviews': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Something is wrong' }),
    });
    renderApp('/opportunities/f');
    await userEvent.click(await screen.findByRole('button', { name: 'Add interview' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Add interview' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add interview' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when the opportunity already has 6 interviews, instead of offering more', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, { ...opportunity, interviewCount: 6 }),
    });
    renderApp('/opportunities/f');

    expect(
      await screen.findByText('This opportunity already has 6 interviews, the most it can have'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add interview' })).not.toBeInTheDocument();
  });

  it('offers "Add interview" below the limit', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, { ...opportunity, interviewCount: 5 }),
    });
    renderApp('/opportunities/f');

    expect(await screen.findByRole('button', { name: 'Add interview' })).toBeEnabled();
    expect(screen.queryByText(/the most it can have/)).not.toBeInTheDocument();
  });

  it('turns "Add interview" off while the form is open', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, opportunity) });
    renderApp('/opportunities/f');

    await userEvent.click(await screen.findByRole('button', { name: 'Add interview' }));

    expect(screen.getByRole('button', { name: 'Add interview' })).toBeDisabled();
  });
});

describe('the interview form, editing', () => {
  const interview = { heldAt: '2026-10-05T12:00:00.000Z', note: 'Phone' };

  function renderEdit(initial: { heldAt: string; note: string | null } = interview) {
    const onSubmit = vi.fn();
    render(
      <InterviewForm
        createdAt={CREATED}
        initial={initial}
        submitLabel="Save interview"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    return { onSubmit };
  }

  it('starts from the interview, and sends nothing when nothing changed', async () => {
    const { onSubmit } = renderEdit();

    expect(screen.getByRole('form', { name: 'Change interview' })).toBeInTheDocument();
    expect(dateField()).toHaveValue(localDate(new Date(interview.heldAt)));
    expect(noteField()).toHaveValue('Phone');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('sends only what changed, and a cleared note as null', async () => {
    const { onSubmit } = renderEdit();

    await userEvent.clear(noteField());
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith({ note: null });

    await chooseDay('2026-10-06');
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith({ heldAt: noonOn('2026-10-06'), note: null });
  });

  it('starts with an empty note when the interview has none', () => {
    renderEdit({ heldAt: interview.heldAt, note: null });

    expect(noteField()).toHaveValue('');
  });

  it('applies the same date rules', async () => {
    const { onSubmit } = renderEdit();

    await chooseDay('2026-10-22');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dateField()).toHaveAccessibleDescription("The date can't be in the future");
  });
});

describe('changing and removing interviews on the detail page', () => {
  const logged = [
    {
      id: 'i1',
      heldAt: '2026-10-05T12:00:00.000Z',
      note: 'Phone',
      recordedAt: '2026-10-05T12:00:00.000Z',
    },
    {
      id: 'i2',
      heldAt: '2026-10-12T12:00:00.000Z',
      note: null,
      recordedAt: '2026-10-12T12:00:00.000Z',
    },
  ];
  const opportunity = anOpportunity({
    id: 'f',
    company: 'Farmers',
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
    interviews: logged,
    interviewCount: 2,
  });
  const entry = (text: RegExp) =>
    within(screen.getByRole('region', { name: 'History' }))
      .getAllByRole('listitem')
      .find((item) => text.test(item.textContent ?? '')) as HTMLElement;

  it('changes an interview in place', async () => {
    const patched: unknown[] = [];
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'PATCH /opportunities/f/interviews/i1': ({ body }) => {
        patched.push(body);
        return jsonResponse(200, {
          ...opportunity,
          interviews: [{ ...logged[0], note: 'Panel' }, logged[1]],
        });
      },
    });
    renderApp('/opportunities/f');

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Edit the interview on ${formatDate(logged[0]?.heldAt as string)}`,
      }),
    );
    await userEvent.clear(noteField());
    await fill(noteField(), 'Panel');
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Change interview' })).toBeNull(),
    );
    expect(patched).toEqual([{ note: 'Panel' }]);
    expect(entry(/Panel/)).toHaveTextContent(
      `Interview · ${formatDate(logged[0]?.heldAt as string)} · Panel`,
    );
  });

  it('keeps the entry when changing is cancelled', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, opportunity) });
    renderApp('/opportunities/f');

    const [firstEdit] = await screen.findAllByRole('button', { name: /^Edit the interview on / });
    await userEvent.click(firstEdit as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Change interview' })).not.toBeInTheDocument();
    expect(entry(/Phone/)).toBeDefined();
  });

  it('removes an interview after asking, and keeps it when cancelled', async () => {
    const removed: unknown[] = [];
    const fetchSpy = mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'DELETE /opportunities/f/interviews/i2': () => {
        removed.push('i2');
        return jsonResponse(200, { ...opportunity, interviews: [logged[0]], interviewCount: 1 });
      },
    });
    renderApp('/opportunities/f');
    const removeLabel = `Remove the interview on ${formatDate(logged[1]?.heldAt as string)}`;

    await userEvent.click(await screen.findByRole('button', { name: removeLabel }));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      "Remove this interview? This can't be undone.",
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(removed).toEqual([]);
    expect(screen.getByRole('button', { name: removeLabel })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: removeLabel }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(removed).toEqual(['i2']));
    // The API removes only with this header (spec FR-007).
    const call = fetchSpy.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(new Headers(call?.[1]?.headers).get('x-confirm-delete')).toBe('true');
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'History' })).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
  });

  it('shows why removing failed, in the dialog', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'DELETE /opportunities/f/interviews/i1': () =>
        jsonResponse(404, { code: 'NOT_FOUND', message: 'Interview not found' }),
    });
    renderApp('/opportunities/f');

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Remove the interview on ${formatDate(logged[0]?.heldAt as string)}`,
      }),
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      'Interview not found',
    );
  });

  it('shows that it is removing, and lets it be tried again after a failure', async () => {
    let fail: (() => void) | undefined;
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'DELETE /opportunities/f/interviews/i1': () =>
        new Promise<Response>((resolve) => {
          fail = () =>
            resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'Interview not found' }));
        }),
    });
    renderApp('/opportunities/f');
    await userEvent.click(
      await screen.findByRole('button', {
        name: `Remove the interview on ${formatDate(logged[0]?.heldAt as string)}`,
      }),
    );
    const dialog = screen.getByRole('alertdialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(within(dialog).getByRole('button', { name: 'Removing…' })).toBeDisabled();
    fail?.();

    expect(await within(dialog).findByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('keeps the dialog open for other keys, and keeps focus inside it', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, opportunity) });
    renderApp('/opportunities/f');
    await userEvent.click(
      await screen.findByRole('button', {
        name: `Remove the interview on ${formatDate(logged[0]?.heldAt as string)}`,
      }),
    );
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
  });

  it('forgets a failed change when changing is cancelled', async () => {
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'PATCH /opportunities/f/interviews/i1': () =>
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Something is wrong' }),
    });
    renderApp('/opportunities/f');
    const editLabel = `Edit the interview on ${formatDate(logged[0]?.heldAt as string)}`;
    await userEvent.click(await screen.findByRole('button', { name: editLabel }));
    await userEvent.click(screen.getByRole('button', { name: 'Save interview' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: editLabel }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gives every history entry its own key', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockApi({
      'GET /opportunities/f': () =>
        jsonResponse(200, {
          ...opportunity,
          history: [
            ...opportunity.history,
            {
              seq: 2,
              fromStage: 'CONSIDERING',
              toStage: 'APPLIED',
              changedAt: '2026-10-08T12:00:00.000Z',
              note: null,
              recordedAt: '2026-10-08T12:00:00.000Z',
            },
          ],
        }),
    });
    renderApp('/opportunities/f');

    await screen.findByRole('region', { name: 'History' });
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('closes the dialog with Escape', async () => {
    mockApi({ 'GET /opportunities/f': () => jsonResponse(200, opportunity) });
    renderApp('/opportunities/f');

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Remove the interview on ${formatDate(logged[0]?.heldAt as string)}`,
      }),
    );
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the date added from moving after the first interview', async () => {
    const patched: unknown[] = [];
    mockApi({
      'GET /opportunities/f': () => jsonResponse(200, opportunity),
      'PATCH /opportunities/f': ({ body }) => {
        patched.push(body);
        return jsonResponse(200, opportunity);
      },
    });
    renderApp('/opportunities/f');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    const dateAdded = screen.getByLabelText('Date added');
    await userEvent.clear(dateAdded);
    await fill(dateAdded, '2026-10-06');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(dateAdded).toHaveAccessibleDescription(
      "The date added can't be after the first interview",
    );
    expect(patched).toEqual([]);
  });
});
