import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // polyfill IndexedDB
    setupFiles: ['./test/setup.ts', './test/setup-dom.ts'],
    // increase timeout if needed for async IndexedDB operations
    testTimeout: 10000,
    // exclude e2e tests which are run by Playwright separately
    // exclude server tests which require external dependencies
    exclude: [
      'node_modules',
      'dist',
      'e2e/**/*.spec.ts',
      'test/server.test.ts',
      'test/Calendar.test.tsx',
      'test/KnowledgeGraph.test.tsx',
      'test/NoteList.test.tsx',
      'test/live2d.test.tsx',
    ],
  },
});
