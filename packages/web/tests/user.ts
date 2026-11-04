import userEvent from '@testing-library/user-event';

// Enters a whole value at once (focus, then paste), instead of userEvent.type's
// key-by-key typing. React sees the same change, so tests check the same behavior,
// several times faster.
export async function fill(element: HTMLElement, text: string): Promise<void> {
  await userEvent.click(element);
  await userEvent.paste(text);
}
