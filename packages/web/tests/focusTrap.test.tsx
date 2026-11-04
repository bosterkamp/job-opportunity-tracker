// @module-tag pipeline
// @module-tag edit
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { keepFocusInside } from '../src/components/focusTrap';

// Returns whether the browser's default (moving focus) would still happen.
const press = (shiftKey = false, key = 'Tab') =>
  fireEvent.keyDown(document.activeElement as Element, { key, shiftKey });

function Dialog({ children }: { children: React.ReactNode }) {
  return (
    <>
      <button type="button">Outside</button>
      <div role="dialog" onKeyDown={keepFocusInside}>
        {children}
      </div>
    </>
  );
}

function renderStages() {
  render(
    <Dialog>
      <input type="radio" name="stage" aria-label="Applied" />
      <input type="radio" name="stage" aria-label="Offer" />
      <input type="text" name="note" aria-label="Note" />
      <a href="/x">Help</a>
      <button type="button">Cancel</button>
      <button type="button" disabled>
        Saving
      </button>
    </Dialog>,
  );
}

describe('keepFocusInside', () => {
  it('wraps Tab from the last enabled control to the first', () => {
    renderStages();
    screen.getByRole('button', { name: 'Cancel' }).focus();

    expect(press()).toBe(false);
    expect(screen.getByRole('radio', { name: 'Applied' })).toHaveFocus();
  });

  it('wraps Shift+Tab from any radio in the first group to the last control', () => {
    renderStages();
    for (const name of ['Applied', 'Offer']) {
      screen.getByRole('radio', { name }).focus();

      expect(press(true)).toBe(false);
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    }
  });

  it('leaves Tab alone everywhere else', () => {
    renderStages();
    const cases: [HTMLElement, boolean][] = [
      [screen.getByLabelText('Note'), false],
      [screen.getByLabelText('Note'), true],
      [screen.getByRole('link', { name: 'Help' }), true],
      [screen.getByRole('radio', { name: 'Applied' }), false],
    ];
    for (const [control, shift] of cases) {
      control.focus();

      expect(press(shift)).toBe(true);
      expect(control).toHaveFocus();
    }
  });

  it('ignores other keys', () => {
    renderStages();
    screen.getByRole('button', { name: 'Cancel' }).focus();

    expect(press(false, 'Enter')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('counts only radios as one stop, not other controls that share a name', () => {
    render(
      <Dialog>
        <input type="text" name="same" aria-label="First" />
        <input type="radio" name="same" aria-label="Radio" />
        <input type="checkbox" name="same" aria-label="Box" />
        <button type="button">Last</button>
      </Dialog>,
    );
    for (const name of ['Radio', 'Box']) {
      const control = screen.getByLabelText(name);
      control.focus();

      expect(press(true)).toBe(true);
      expect(control).toHaveFocus();
    }
  });

  it('wraps Shift+Tab from a first control that is not a radio', () => {
    render(
      <Dialog>
        <input type="text" aria-label="Confirm" />
        <button type="button">Last</button>
      </Dialog>,
    );
    screen.getByLabelText('Confirm').focus();

    expect(press(true)).toBe(false);
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('does not treat a radio in another group as the first stop', () => {
    render(
      <Dialog>
        <input type="radio" name="stage" aria-label="Applied" />
        <input type="radio" name="other" aria-label="Elsewhere" />
        <button type="button">Last</button>
      </Dialog>,
    );
    screen.getByLabelText('Elsewhere').focus();

    expect(press(true)).toBe(true);
    expect(screen.getByLabelText('Elsewhere')).toHaveFocus();
  });

  it('does nothing in a dialog without controls', () => {
    render(
      <div role="dialog" tabIndex={-1} onKeyDown={keepFocusInside}>
        Nothing here
      </div>,
    );
    screen.getByRole('dialog').focus();

    expect(press()).toBe(true);
    expect(press(true)).toBe(true);
  });
});

describe('dialogs keep focus inside', () => {
  it('the delete dialog wraps from Cancel back to the confirmation box', async () => {
    const { DeleteOpportunity } = await import('../src/components/DeleteOpportunity');
    render(<DeleteOpportunity company="Acme" onDelete={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    screen.getByRole('button', { name: 'Cancel' }).focus();

    expect(press()).toBe(false);
    expect(screen.getByLabelText('Type the company name to confirm')).toHaveFocus();
  });

  it('the "Move to…" dialog wraps from Cancel back to the first stage', async () => {
    const { MoveStageMenu } = await import('../src/components/MoveStageMenu');
    render(<MoveStageMenu currentStage="CONSIDERING" onMove={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    screen.getByRole('button', { name: 'Cancel' }).focus();

    expect(press()).toBe(false);
    expect(screen.getByRole('radio', { name: 'Applied' })).toHaveFocus();
  });
});
