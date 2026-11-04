import { useSyncExternalStore } from 'react';

// Whether a CSS media query matches, updating when it changes (for example on rotation).
// Used where the layout differs in structure, not just style, such as board vs. tabs.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

// The width where the overview switches from stage tabs to one column per stage. Six columns
// (five open stages and Closed) need about 1280 px to keep a card readable.
export const WIDE_QUERY = '(min-width: 1280px)';
