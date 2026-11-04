import { afterEach } from 'vitest';
import { removeTestAppOutput } from './test-app.js';

// Delete every cloud assembly a test synthesized.
afterEach(() => {
  removeTestAppOutput();
});
