import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CDK synthesis takes several seconds, more when running alongside other packages' tests.
    testTimeout: 30_000,
    setupFiles: ['tests/setup.ts'],
  },
});
