import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // use node env with fake-indexeddb polyfill
    // polyfill IndexedDB
    setupFiles: './test/setup.ts',
    // increase timeout if needed for async IndexedDB operations
    testTimeout: 10000,
  },
});