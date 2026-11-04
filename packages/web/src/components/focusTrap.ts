import type { KeyboardEvent } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

const isRadio = (el: Element | null | undefined): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === 'radio';

// Keeps Tab and Shift+Tab inside a modal dialog (attach to the dialog's onKeyDown): Tab on the
// last control wraps to the first, and Shift+Tab on the first wraps to the last. A radio group
// is a single Tab stop, so any radio in the first control's group counts as the first.
export function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') {
    return;
  }
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = controls[0];
  const last = controls.at(-1);
  const active = document.activeElement;
  const atFirst =
    active === first || (isRadio(active) && isRadio(first) && active.name === first.name);
  if (event.shiftKey ? atFirst : active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
