import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextPath = require.resolve('next/dist/bin/next');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [nextPath, ...args], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
