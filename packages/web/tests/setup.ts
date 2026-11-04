import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { installMatchMedia } from './media';

// Vitest globals are off, so React Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
});

// Every test starts on a narrow screen; call setWideScreen(true) for the desktop layout.
beforeEach(() => {
  installMatchMedia();
});
