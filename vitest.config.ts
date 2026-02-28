import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // increase timeout if needed for async IndexedDB operations
    timeout: 10000,
  },
});