import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// CI 为了 `next build` 在整个 job 里设了 NODE_ENV=production；单元测试必须以 test 模式运行，
// 否则 vite 会把 jsdom 环境下的 Node 内置模块（如 crypto）当成浏览器不可用而做空桩。
Object.assign(process.env, { NODE_ENV: 'test' });

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
      '**/node_modules/**',
      '.next',
      '.next/**',
      '.claude/**',
      'dist',
      'e2e/**/*.spec.ts',
      'test/server.test.ts',
      'test/Calendar.test.tsx',
      'test/KnowledgeGraph.test.tsx',
      'test/NoteList.test.tsx',
    ],
  },
});
