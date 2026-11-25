// @module-tag interview
import type { Interview } from '@jot/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewForm } from '../src/components/InterviewForm';
import { toLocalInputValue } from '../src/components/MoveStageMenu';
import { fill } from './user';

// The interview form (features 005 and 012): when, the details, the note and the
// interviewers. Fixed so "now" is known. Only Date is faked: timers stay real for user events.
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

const whenField = () => screen.getByLabelText('Date and time');
const field = (label: string) => screen.getByLabelText(label);
const select = (label: string, option: string) =>
  userEvent.selectOptions(screen.getByLabelText(label), option);
// A datetime-local value, as the browser's time zone reads it.
const at = (value: string) => new Date(value).toISOString();

async function chooseWhen(value: string) {
  await userEvent.clear(whenField());
  await fill(whenField(), value);
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
  it('starts now, with every detail empty, and offers up to a year ahead', () => {
    renderAdd();

    expect(screen.getByRole('form', { name: 'Add interview' })).toBeInTheDocument();
    expect(whenField()).toHaveAttribute('type', 'datetime-local');
    expect(whenField()).toHaveValue(toLocalInputValue(NOW));
    expect(whenField()).toHaveAttribute('max', toLocalInputValue(new Date('2027-10-20T15:00Z')));
    expect(field('Type')).toHaveValue('');
    expect(field('Panel interview')).not.toBeChecked();
    expect(field('Format')).toHaveValue('');
    expect(field('How it went')).toHaveValue('');
    expect(field('Next steps')).toHaveValue('');
    expect(field('Note')).toHaveValue('');
  });

  it('offers the types, formats and outcomes, each with a "not set" choice', () => {
    renderAdd();

    const options = (label: string) =>
      within(field(label))
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(options('Type')).toEqual([
      'Not set',
      'HR / talent advisor',
      'Hiring manager',
      'Business',
      'Engineering',
      'Other',
    ]);
    expect(options('Format')).toEqual(['Not set', 'Phone', 'Video', 'In person']);
    expect(options('How it went')).toEqual(['Not set', 'Went well', 'Not sure', 'Went badly']);
  });

  it('sends nothing when nothing is filled in, so the API dates it now', async () => {
    const { onSubmit } = renderAdd();

    await save();

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('sends every detail filled in, trimmed', async () => {
    const { onSubmit } = renderAdd();

    await chooseWhen('2026-10-13T14:30');
    await select('Type', 'Hiring manager');
    await userEvent.click(field('Panel interview'));
    await select('Format', 'Video');
    await select('How it went', 'Went well');
    await fill(field('Next steps'), ' Decision by Friday ');
    await fill(field('Note'), '  Bring the portfolio ');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      heldAt: at('2026-10-13T14:30'),
      kind: 'HIRING_MANAGER',
      panel: true,
      format: 'VIDEO',
      outcome: 'WENT_WELL',
      nextSteps: 'Decision by Friday',
      note: 'Bring the portfolio',
    });
  });

  it('takes an upcoming time, and only then hides "How it went"', async () => {
    const { onSubmit } = renderAdd();
    await select('How it went', 'Not sure');

    await chooseWhen('2026-10-22T10:00');

    expect(screen.queryByLabelText('How it went')).not.toBeInTheDocument();
    expect(screen.getByText(/You can say how it went once it's happened/)).toBeInTheDocument();
    await save();
    expect(onSubmit).toHaveBeenCalledWith({ heldAt: at('2026-10-22T10:00') });

    await chooseWhen('2026-10-19T10:00');
    expect(field('How it went')).toBeInTheDocument();
  });

  it.each([
    ['more than a year ahead', '2027-10-21T10:00', "An interview can't be more than a year ahead"],
    ['before the date added', '2026-08-31T10:00', "An interview can't be before the date added"],
  ])('refuses a time %s, on the field, without sending', async (_label, value, message) => {
    const { onSubmit } = renderAdd();

    await chooseWhen(value);
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(whenField()).toHaveAttribute('aria-invalid', 'true');
    expect(whenField()).toHaveAccessibleDescription(message);
    await waitFor(() => expect(whenField()).toHaveFocus());
  });

  it.each([
    ['Note', 201, 'Must be 200 characters or fewer'],
    ['Next steps', 501, 'Must be 500 characters or fewer'],
  ])('refuses %s over its limit, on the field', async (label, length, message) => {
    const { onSubmit } = renderAdd();

    await fill(field(label), 'x'.repeat(length));
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field(label)).toHaveAccessibleDescription(message);
    await waitFor(() => expect(field(label)).toHaveFocus());
  });

  it('clears a problem once it is fixed', async () => {
    const { onSubmit } = renderAdd();
    await chooseWhen('2027-12-01T10:00');
    await save();

    await chooseWhen('2026-10-19T10:00');
    await save();

    expect(whenField()).not.toHaveAttribute('aria-invalid');
    expect(onSubmit).toHaveBeenCalledWith({ heldAt: at('2026-10-19T10:00') });
  });

  it('treats a cleared time as now', async () => {
    const { onSubmit } = renderAdd();

    await userEvent.clear(whenField());
    await save();

    expect(onSubmit).toHaveBeenCalledWith({});
    expect(field('How it went')).toBeInTheDocument();
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

  it('cancels', async () => {
    const { onCancel } = renderAdd();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('is laid out as a panel with the form fields', () => {
    renderAdd();

    const form = screen.getByRole('form', { name: 'Add interview' });
    expect(form.className).toMatch(/form/);
    expect(form.className).toMatch(/panel/);
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

describe('the interview form, editing', () => {
  const interview: Interview = {
    id: 'i1',
    heldAt: '2026-10-05T17:30:00.000Z',
    note: 'Phone',
    recordedAt: '2026-10-05T18:00:00.000Z',
    kind: 'ENGINEERING',
    panel: true,
    format: 'IN_PERSON',
    outcome: 'NOT_SURE',
    nextSteps: 'Wait for the recruiter',
    interviewers: [{ name: 'Priya Shah', title: 'Staff Engineer' }],
  };

  function renderEdit(initial: Interview = interview) {
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
    expect(whenField()).toHaveValue(toLocalInputValue(new Date(interview.heldAt)));
    expect(field('Type')).toHaveValue('ENGINEERING');
    expect(field('Panel interview')).toBeChecked();
    expect(field('Format')).toHaveValue('IN_PERSON');
    expect(field('How it went')).toHaveValue('NOT_SURE');
    expect(field('Next steps')).toHaveValue('Wait for the recruiter');
    expect(field('Note')).toHaveValue('Phone');
    expect(field('Name')).toHaveValue('Priya Shah');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('starts empty where the interview has nothing', () => {
    renderEdit({ id: 'i2', heldAt: interview.heldAt, note: null, recordedAt: interview.heldAt });

    expect(field('Type')).toHaveValue('');
    expect(field('Panel interview')).not.toBeChecked();
    expect(field('Note')).toHaveValue('');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('sends only what changed, and what was cleared as null', async () => {
    const { onSubmit } = renderEdit();

    await select('Type', 'Not set');
    await userEvent.click(field('Panel interview'));
    await select('Format', 'Phone');
    await userEvent.clear(field('Next steps'));
    await userEvent.clear(field('Note'));
    await save();

    expect(onSubmit).toHaveBeenLastCalledWith({
      kind: null,
      panel: false,
      format: 'PHONE',
      nextSteps: null,
      note: null,
    });
  });

  it('sends a new time and how it went', async () => {
    const { onSubmit } = renderEdit();

    await chooseWhen('2026-10-06T09:15');
    await select('How it went', 'Went badly');
    await save();

    expect(onSubmit).toHaveBeenLastCalledWith({
      heldAt: at('2026-10-06T09:15'),
      outcome: 'WENT_BADLY',
    });
  });

  it('keeps how it went, without sending it, when the time moves ahead', async () => {
    const { onSubmit } = renderEdit();

    await chooseWhen('2026-10-25T09:15');
    await save();

    expect(onSubmit).toHaveBeenLastCalledWith({ heldAt: at('2026-10-25T09:15') });
  });

  it('hides how it went for an upcoming interview', () => {
    renderEdit({ ...interview, heldAt: '2026-10-25T17:30:00.000Z' });

    expect(screen.queryByLabelText('How it went')).not.toBeInTheDocument();
  });

  it('applies the same date rules', async () => {
    const { onSubmit } = renderEdit();

    await chooseWhen('2027-11-01T10:00');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(whenField()).toHaveAccessibleDescription("An interview can't be more than a year ahead");
  });
});

describe('interviewers in the form', () => {
  const row = (n: number) => screen.getByRole('group', { name: `Interviewer ${n}` });
  const inRow = (n: number, label: string) => within(row(n)).getByLabelText(label);
  const addInterviewer = () =>
    userEvent.click(screen.getByRole('button', { name: 'Add interviewer' }));

  it('starts with none, and adds a row with each detail', async () => {
    renderAdd();
    expect(screen.queryByRole('group', { name: /^Interviewer/ })).not.toBeInTheDocument();

    await addInterviewer();

    for (const label of ['Name', 'Title', 'Email', 'Phone', 'LinkedIn']) {
      expect(inRow(1, label)).toHaveValue('');
    }
    expect(inRow(1, 'Name')).toHaveFocus();
    // Only LinkedIn shows what to type.
    expect(inRow(1, 'LinkedIn')).toHaveAttribute('placeholder', 'linkedin.com/in/…');
    expect(inRow(1, 'Name')).not.toHaveAttribute('placeholder');
  });

  it('sends the interviewers in order, leaving out blank details', async () => {
    const { onSubmit } = renderAdd();

    await addInterviewer();
    await fill(inRow(1, 'Name'), 'Priya Shah');
    await fill(inRow(1, 'Title'), 'Engineering Manager');
    await fill(inRow(1, 'Email'), 'priya@acme.example');
    await fill(inRow(1, 'Phone'), '+1 555 0100');
    await fill(inRow(1, 'LinkedIn'), 'linkedin.com/in/priya-shah');
    await addInterviewer();
    await fill(inRow(2, 'Name'), 'Tom Lee');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      interviewers: [
        {
          name: 'Priya Shah',
          title: 'Engineering Manager',
          email: 'priya@acme.example',
          phone: '+1 555 0100',
          linkedin: 'https://linkedin.com/in/priya-shah',
        },
        { name: 'Tom Lee' },
      ],
    });
  });

  it('removes one, keeping the others in order', async () => {
    const { onSubmit } = renderAdd();
    for (const name of ['Ana', 'Ben', 'Cy']) {
      await addInterviewer();
      await fill(screen.getAllByLabelText('Name').at(-1) as HTMLElement, name);
    }

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ben' }));
    await save();

    expect(screen.getAllByRole('group', { name: /^Interviewer/ })).toHaveLength(2);
    expect(onSubmit).toHaveBeenCalledWith({ interviewers: [{ name: 'Ana' }, { name: 'Cy' }] });
  });

  it('names each Remove by the person, trimmed, or by its place without a name', async () => {
    renderAdd();
    await addInterviewer();
    await fill(inRow(1, 'Name'), '   ');
    await addInterviewer();
    await fill(inRow(2, 'Name'), ' Ben ');

    expect(within(row(1)).getByRole('button').textContent).toBe('Remove interviewer 1');
    expect(within(row(2)).getByRole('button').textContent).toBe('Remove Ben');
  });

  it('allows at most 10', async () => {
    renderAdd();
    for (let i = 0; i < 9; i++) {
      await addInterviewer();
    }
    expect(screen.getByRole('button', { name: 'Add interviewer' })).toBeEnabled();
    expect(screen.queryByText('An interview can have at most 10 interviewers')).toBeNull();

    await addInterviewer();

    expect(screen.getByRole('button', { name: 'Add interviewer' })).toBeDisabled();
    expect(screen.getByText('An interview can have at most 10 interviewers')).toBeVisible();
  });

  it('shows each problem on its field, and sends nothing', async () => {
    const { onSubmit } = renderAdd();
    await addInterviewer();
    await fill(inRow(1, 'Email'), 'not an email');
    await addInterviewer();
    await fill(inRow(2, 'Name'), 'Tom');
    await fill(inRow(2, 'LinkedIn'), 'https://example.com/in/tom');

    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(inRow(1, 'Name')).toHaveAccessibleDescription('Name is required');
    expect(inRow(1, 'Email')).toHaveAccessibleDescription('Enter a valid email address');
    expect(inRow(2, 'LinkedIn')).toHaveAccessibleDescription('Enter a LinkedIn profile address');
    await waitFor(() => expect(inRow(1, 'Name')).toHaveFocus());
  });

  it('sends the whole list on an edit when any of it changed, and null when emptied', async () => {
    const onSubmit = vi.fn();
    render(
      <InterviewForm
        createdAt={CREATED}
        initial={{
          id: 'i1',
          heldAt: '2026-10-05T17:30:00.000Z',
          note: null,
          recordedAt: '2026-10-05T18:00:00.000Z',
          interviewers: [{ name: 'Ana' }, { name: 'Ben', title: 'CTO' }],
        }}
        submitLabel="Save interview"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await save();
    expect(onSubmit).toHaveBeenLastCalledWith({});

    await userEvent.clear(inRow(2, 'Title'));
    await fill(inRow(2, 'Title'), 'CEO');
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith({
      interviewers: [{ name: 'Ana' }, { name: 'Ben', title: 'CEO' }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ben' }));
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith({ interviewers: null });
  });
});
