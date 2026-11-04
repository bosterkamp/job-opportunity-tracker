// @module-tag core
import { describe, expect, it } from 'vitest';

describe('@jot/shared', () => {
  it('loads the package entry point', async () => {
    await expect(import('../../src/index.js')).resolves.toBeDefined();
  });
});
