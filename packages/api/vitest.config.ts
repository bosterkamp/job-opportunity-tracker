import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Starts DynamoDB Local if needed and creates a per-run table for tests/integration.
    globalSetup: ['tests/integration/setup.ts'],
    // The integration tests share one DynamoDB Local. In the full run with coverage, a test that
    // makes many calls can take longer than the default 5 seconds.
    testTimeout: 20_000,
  },
});
