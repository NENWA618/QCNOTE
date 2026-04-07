import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // default env with fake-indexeddb polyfill
    // polyfill IndexedDB
    setupFiles: ['./test/setup.ts'],
    // increase timeout if needed for async IndexedDB operations
    testTimeout: 10000,
    // exclude e2e tests which are run by Playwright separately
    // exclude server tests which require external dependencies
    exclude: ['node_modules', 'dist', 'e2e/**/*.spec.ts', 'test/server.test.ts'],
    // Configure environment per file pattern
    environmentMatchGlobs: [
      ['test/**/*.tsx', 'jsdom', './test/setup-dom.ts'],
    ],
  },
});