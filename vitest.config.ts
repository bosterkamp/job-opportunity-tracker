import { defineConfig } from 'vitest/config';
import { TAGS } from './scripts/test-tags.mjs';

// Each package is its own Vitest project; packages/web adds jsdom via its vite.config.ts.
export default defineConfig({
  test: {
    projects: ['packages/*'],
    // Every test is tagged with what it checks (scripts/test-tags.mjs); unknown tags fail.
    tags: TAGS,
    coverage: {
      provider: 'v8',
      // Only source code counts. Tests, tool config, and scripts sit outside these folders.
      // Exclusions must stay limited to thin entry points (Constitution Principle VI) and
      // are listed in specs/001-job-opportunity-tracker/plan.md.
      include: ['packages/*/src/**/*.{ts,tsx}', 'packages/infra/lib/**/*.ts'],
      // Thin entry points: they only wire tested code to the browser (plans for features 001
      // and 006).
      exclude: ['packages/web/src/main.tsx', 'packages/web/src/sw/sw.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
