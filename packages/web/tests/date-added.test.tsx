// @module-tag capture
// @module-tag edit
import { localDate } from '@jot/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_VALUES,
  OpportunityForm,
  fieldForPath,
  toInput,
  validate,
} from '../src/components/OpportunityForm';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

// Fixed so "today" is known. Only Date is faked: timers stay real for user events.
const NOW = new Date('2026-10-20T15:00:00.000Z');
const TODAY = localDate(NOW);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const dateAdded = () => screen.getByLabelText('Date added');

function renderForm(props: Partial<Parameters<typeof OpportunityForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <OpportunityForm
      submitLabel="Save"
      onSubmit={onSubmit}
      initialValues={{ ...EMPTY_VALUES, company: 'Acme', title: 'Engineer' }}
      {...props}
    />,
  );
  return { onSubmit };
}

async function chooseDay(day: string) {
  await userEvent.clear(dateAdded());
  await fill(dateAdded(), day);
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('the date added on the add form', () => {
  it('starts on today, offers no later day, and sits after the follow-up date', () => {
    renderForm();

    expect(dateAdded()).toHaveValue(TODAY);
    expect(dateAdded()).toHaveAttribute('type', 'date');
    expect(dateAdded()).toHaveAttribute('max', TODAY);
    const labels = [...document.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels.indexOf('Date added')).toBe(labels.indexOf('Follow-up date') + 1);
  });

  it('sends nothing when it stays today', async () => {
    const { onSubmit } = renderForm();

    await save();

    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('createdAt');
  });

  it('sends noon in the device time zone for an earlier day', async () => {
    const { onSubmit } = renderForm();

    await chooseDay('2026-07-04');
    await save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: new Date('2026-07-04T12:00:00').toISOString() }),
    );
  });

  it('refuses a later day on the field, without sending anything', async () => {
    const { onSubmit } = renderForm();

    await chooseDay('2026-10-22');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dateAdded()).toHaveAccessibleDescription("The date can't be in the future");
    await waitFor(() => expect(dateAdded()).toHaveFocus());
  });

  it('treats the day the form started on as unchanged, so it is never refused', async () => {
    const { onSubmit } = renderForm({
      initialValues: { ...EMPTY_VALUES, company: 'A', title: 'B', dateAdded: '2030-01-01' },
    });

    // The form started on that day, so it's unchanged and not sent: not a problem.
    await save();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('the date added when editing', () => {
  const history = [
    { seq: 1, changedAt: '2026-09-01T12:00:00.000Z' },
    { seq: 2, changedAt: new Date('2026-10-01T09:30:00').toISOString() },
  ];

  function renderEdit() {
    const onSubmit = vi.fn();
    render(
      <OpportunityForm
        mode="edit"
        submitLabel="Save"
        onSubmit={onSubmit}
        history={history}
        initialValues={{ ...EMPTY_VALUES, company: 'A', title: 'B', dateAdded: '2026-09-01' }}
      />,
    );
    return { onSubmit };
  }

  it('sends nothing when the day is unchanged', async () => {
    const { onSubmit } = renderEdit();

    await save();

    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('createdAt');
  });

  it('sends the current time when moved to today', () => {
    expect(
      toInput({ ...EMPTY_VALUES, dateAdded: TODAY }, { originalDateAdded: '2026-09-01' }),
    ).toMatchObject({ createdAt: NOW.toISOString() });
  });

  it('allows the day of the first move, dated no later than the move', async () => {
    const { onSubmit } = renderEdit();

    await chooseDay('2026-10-01');
    await save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: history[1]?.changedAt }),
    );
  });

  it('refuses a day after the first move, on the field', async () => {
    const { onSubmit } = renderEdit();

    await chooseDay('2026-10-02');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dateAdded()).toHaveAccessibleDescription(
      "The date added can't be after the first stage change",
    );
  });
});

describe('date added helpers', () => {
  it('maps the API field to the form field', () => {
    expect(fieldForPath(['createdAt'])).toBe('dateAdded');
  });

  it('sends nothing for a blank day', () => {
    expect(toInput({ ...EMPTY_VALUES, dateAdded: '' }, { originalDateAdded: TODAY })).toMatchObject(
      {
        createdAt: undefined,
      },
    );
  });

  it('reports a date problem together with other problems', () => {
    const { errors, input } = validate(
      { ...EMPTY_VALUES, company: '', title: 'B', dateAdded: '2030-01-01' },
      'create',
      { originalDateAdded: TODAY },
    );

    expect(input).toBeUndefined();
    expect(errors).toEqual({
      company: 'Company is required',
      dateAdded: "The date can't be in the future",
    });
  });
});

describe('the date added on the detail page', () => {
  it('saves a new day through Edit details', async () => {
    const opportunity = anOpportunity({ id: 'd', createdAt: '2026-10-17T12:00:00.000Z' });
    const patched: unknown[] = [];
    mockApi({
      'GET /opportunities/d': () => jsonResponse(200, opportunity),
      'PATCH /opportunities/d': ({ body }) => {
        patched.push(body);
        const { history: _history, ...rest } = opportunity;
        return jsonResponse(200, rest);
      },
    });
    renderApp('/opportunities/d');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await chooseDay('2026-07-04');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toMatchObject({ createdAt: new Date('2026-07-04T12:00:00').toISOString() });
    expect(await screen.findByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });

  it('shows the server problem with the date', async () => {
    const opportunity = anOpportunity({ id: 'd' });
    mockApi({
      'GET /opportunities/d': () => jsonResponse(200, opportunity),
      'PATCH /opportunities/d': () =>
        jsonResponse(400, {
          code: 'VALIDATION_ERROR',
          message: "The date added can't be after the first stage change",
          fields: ['createdAt'],
        }),
    });
    renderApp('/opportunities/d');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    await chooseDay('2026-07-04');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The date added can't be after the first stage change",
    );
  });
});
