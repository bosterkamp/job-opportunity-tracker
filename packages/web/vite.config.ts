import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The service worker (feature 006) is built to /sw.js, then told its build id and this build's
// hashed files, which it caches on install (specs/006-installable-app/research.md §2).
function serviceWorker(): Plugin {
  return {
    name: 'job-tracker-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const worker = bundle['sw.js'];
      if (worker?.type !== 'chunk') {
        throw new Error('The service worker (sw.js) is missing from the build');
      }
      const assets = Object.keys(bundle)
        .filter((file) => file.startsWith('assets/'))
        .sort()
        .map((file) => `/${file}`);
      // The hashed file names change whenever the app does. SW_BUILD_ID lets the end-to-end
      // test make two builds that differ.
      const buildId =
        process.env.SW_BUILD_ID ??
        createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      worker.code = worker.code
        .replaceAll('__BUILD_ID__', JSON.stringify(buildId))
        .replaceAll('__ASSETS__', JSON.stringify(assets));
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    // Playwright runs its own copy on another port (WEB_PORT), so it never shares your dev server.
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        sw: fileURLToPath(new URL('src/sw/sw.ts', import.meta.url)),
      },
      output: {
        // The worker keeps a fixed name at the root, so its scope is the whole site.
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Typing into many fields with user-event is slow when all packages' tests run at once.
    testTimeout: 15_000,
    setupFiles: ['./tests/setup.ts'],
  },
});
