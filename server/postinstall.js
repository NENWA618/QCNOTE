#!/usr/bin/env node
const { execFileSync } = require('child_process');

// 用参数数组而不是拼接 shell 字符串，避免环境变量里的引号/分号被当成命令
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (process.env.ADMIN_SET_EMAIL) {
  try {
    execFileSync(npmBin, ['run', 'set-admin', '--', process.env.ADMIN_SET_EMAIL], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (error) {
    console.error('Error setting admin:', error.message);
    process.exit(1);
  }
} else if (process.env.ADMIN_CHECK_EMAIL) {
  try {
    execFileSync(npmBin, ['run', 'check-admin', '--', process.env.ADMIN_CHECK_EMAIL], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (error) {
    console.error('Error checking admin:', error.message);
    process.exit(1);
  }
} else {
  console.log('ADMIN_SET_EMAIL and ADMIN_CHECK_EMAIL not set, skipping admin setup');
}
