// @module-tag pipeline
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoveStageMenu, toLocalInputValue } from '../src/components/MoveStageMenu';
import { fill } from './user';

const NOW = new Date(2026, 9, 18, 14, 30); // Oct 18, 2026 14:30 local time
const now = () => NOW;

function renderMenu(props: Partial<Parameters<typeof MoveStageMenu>[0]> = {}) {
  const onMove = vi.fn<(move: unknown) => Promise<unknown>>(() => Promise.resolve());
  render(<MoveStageMenu currentStage="CONSIDERING" onMove={onMove} now={now} {...props} />);
  return { onMove };
}

const CLOSE_NAMES = [
  'Accepted',
  'Declined',
  'Rejected',
  'No Longer Available',
  'Withdrawn',
  'No Response',
];

const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Move to…' }));
const dialog = () => screen.getByRole('dialog');
const submit = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Move' }));

describe('MoveStageMenu', () => {
  it('starts closed, with a button that says it opens a dialog', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Move to…' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every other stage, grouped into open stages and outcomes, without the current one', async () => {
    renderMenu({ currentStage: 'APPLIED' });

    await openMenu();

    expect(screen.getByRole('button', { name: 'Move to…' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(dialog()).toHaveAccessibleName('Move to');
    const open = within(screen.getByRole('group', { name: 'Still in progress' })).getAllByRole(
      'radio',
    );
    const close = within(screen.getByRole('group', { name: 'Close as' })).getAllByRole('radio');
    expect(open.map((r) => r.closest('label')?.textContent)).toEqual([
      'Considering',
      'Contacted',
      'Interviewing',
      'Offer',
    ]);
    expect(close).toHaveLength(CLOSE_NAMES.length);
    close.forEach((radio, i) => expect(radio).toHaveAccessibleName(CLOSE_NAMES[i]));
    expect(screen.queryByRole('radio', { name: 'Applied' })).not.toBeInTheDocument();
  });

  it('says what each outcome means under its name, and nothing under open stages', async () => {
    renderMenu();
    await openMenu();

    const close = within(screen.getByRole('group', { name: 'Close as' })).getAllByRole('radio');
    expect(close.map((r) => r.closest('label')?.textContent)).toEqual([
      'AcceptedYou took the job.',
      'DeclinedThey made an offer and you turned it down.',
      'RejectedThey turned you down.',
      'No Longer AvailableThe role was filled or taken down without a decision on you.',
      'WithdrawnYou pulled out before any offer.',
      'No ResponseYou never heard back.',
    ]);
    expect(screen.getByRole('radio', { name: 'Withdrawn' })).toHaveAccessibleDescription(
      'You pulled out before any offer.',
    );
    expect(screen.getByRole('radio', { name: 'Applied' })).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('radio', { name: 'Applied' })).toHaveAccessibleDescription('');
  });

  it('picks an outcome when its meaning is clicked', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByText('You never heard back.'));
    await submit();

    expect(onMove).toHaveBeenCalledWith({ toStage: 'NO_RESPONSE' });
  });

  it('leaves out the current stage when it is an outcome too', async () => {
    renderMenu({ currentStage: 'REJECTED' });
    await openMenu();

    expect(
      within(screen.getByRole('group', { name: 'Close as' })).getAllByRole('radio'),
    ).toHaveLength(5);
    expect(
      within(screen.getByRole('group', { name: 'Still in progress' })).getAllByRole('radio'),
    ).toHaveLength(5);
  });

  it('focuses the first stage choice when it opens', async () => {
    renderMenu();

    await openMenu();

    expect(screen.getByRole('radio', { name: 'Applied' })).toHaveFocus();
  });

  it('moves with only a stage chosen, so the server dates it now', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await submit();

    expect(onMove).toHaveBeenCalledWith({ toStage: 'APPLIED' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Move to…' })).toHaveFocus();
  });

  it('sends a trimmed note and an earlier date', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await fill(screen.getByLabelText('Note (optional)'), '  Applied via site  ');
    await userEvent.clear(screen.getByLabelText('When?'));
    await fill(screen.getByLabelText('When?'), '2026-10-15T09:30');
    await submit();

    expect(onMove).toHaveBeenCalledWith({
      toStage: 'APPLIED',
      note: 'Applied via site',
      changedAt: new Date(2026, 9, 15, 9, 30).toISOString(),
    });
  });

  it('leaves out a note that is only spaces', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Offer' }));
    await fill(screen.getByLabelText('Note (optional)'), '   ');
    await submit();

    expect(onMove).toHaveBeenCalledWith({ toStage: 'OFFER' });
  });

  it('starts "When?" at now and does not allow later', async () => {
    renderMenu();
    await openMenu();

    expect(screen.getByLabelText('When?')).toHaveValue('2026-10-18T14:30');
    expect(screen.getByLabelText('When?')).toHaveAttribute('max', '2026-10-18T14:30');
    expect(screen.getByLabelText('When?')).toHaveAttribute('type', 'datetime-local');
  });

  it('blocks a future date', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await userEvent.clear(screen.getByLabelText('When?'));
    await fill(screen.getByLabelText('When?'), '2026-10-18T14:31');
    await submit();

    expect(screen.getByRole('alert')).toHaveTextContent("The date can't be in the future");
    expect(onMove).not.toHaveBeenCalled();
  });

  it('allows a date of exactly now', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await userEvent.clear(screen.getByLabelText('When?'));
    await fill(screen.getByLabelText('When?'), '2026-10-18T14:30');
    await submit();

    expect(onMove).toHaveBeenCalledWith({ toStage: 'APPLIED', changedAt: NOW.toISOString() });
  });

  it('asks for a stage when none is chosen', async () => {
    const { onMove } = renderMenu();
    await openMenu();

    await submit();

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a stage');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows a failure from saving and stays open', async () => {
    const onMove = vi.fn(() =>
      Promise.reject(new Error('This opportunity changed. Please try again.')),
    );
    renderMenu({ onMove });
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This opportunity changed. Please try again.',
    );
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Move' })).toBeEnabled();
  });

  it('disables the button and says so while saving', async () => {
    let finish: () => void = () => undefined;
    renderMenu({ onMove: () => new Promise<void>((resolve) => (finish = resolve)) });
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await submit();

    expect(within(dialog()).getByRole('button', { name: 'Moving…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each([
    ['Cancel', () => userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    ['the button again', () => userEvent.click(screen.getByRole('button', { name: 'Move to…' }))],
  ])('closes with %s and returns focus to the button', async (_label, closeIt) => {
    const { onMove } = renderMenu();
    await openMenu();

    await closeIt();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to…' })).toHaveFocus();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', async () => {
    renderMenu();
    await openMenu();

    await userEvent.click(document.querySelector('[aria-hidden="true"]') as HTMLElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays open while typing; only Escape closes it', async () => {
    renderMenu();
    await openMenu();

    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Hi');

    expect(dialog()).toBeInTheDocument();
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Hi');
  });

  it('marks the chosen stage, and arrow keys move between stages as one group', async () => {
    renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    expect(screen.getByRole('radio', { name: 'Applied' })).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: 'Contacted' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Applied' })).not.toBeChecked();
    const names = new Set(screen.getAllByRole('radio').map((radio) => radio.getAttribute('name')));
    expect(names.size).toBe(1);
    expect([...names][0]).toMatch(/.+-stage$/);
  });

  it('handles the submit itself instead of letting the browser submit the form', async () => {
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    window.addEventListener('submit', listener);
    renderMenu();
    await openMenu();

    await submit();

    window.removeEventListener('submit', listener);
    expect(prevented).toBe(true);
  });

  it('starts fresh each time it opens', async () => {
    renderMenu();
    await openMenu();
    await userEvent.click(screen.getByRole('radio', { name: 'Applied' }));
    await fill(screen.getByLabelText('Note (optional)'), 'draft');
    await userEvent.clear(screen.getByLabelText('When?'));
    await fill(screen.getByLabelText('When?'), '2026-10-01T08:00');
    await submit();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openMenu();
    await submit();

    expect(screen.getByRole('radio', { name: 'Applied' })).not.toBeChecked();
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('');
    expect(screen.getByLabelText('When?')).toHaveValue('2026-10-18T14:30');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a stage');
  });

  it('names the opportunity for screen readers when given a label', async () => {
    renderMenu({ label: 'Acme' });

    const trigger = screen.getByRole('button', { name: 'Move Acme to another stage' });
    await userEvent.click(trigger);

    expect(dialog()).toHaveAccessibleName('Move Acme to');
  });

  it('uses the real clock by default', async () => {
    render(<MoveStageMenu currentStage="APPLIED" onMove={vi.fn()} />);
    await openMenu();

    const value = screen.getByLabelText<HTMLInputElement>('When?').value;
    expect(Math.abs(new Date(value).getTime() - Date.now())).toBeLessThan(2 * 60_000);
  });
});

describe('toLocalInputValue', () => {
  it('formats a date for a datetime-local input in local time, zero-padded', () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
    expect(toLocalInputValue(new Date(2026, 11, 25, 23, 59))).toBe('2026-12-25T23:59');
  });
});
