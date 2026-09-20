#!/usr/bin/env node
const { execSync } = require('child_process');

if (process.env.ADMIN_SET_EMAIL) {
  try {
    execSync(`npm run set-admin -- "${process.env.ADMIN_SET_EMAIL}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Error setting admin:', error.message);
    process.exit(1);
  }
} else if (process.env.ADMIN_CHECK_EMAIL) {
  try {
    execSync(`npm run check-admin -- "${process.env.ADMIN_CHECK_EMAIL}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Error checking admin:', error.message);
    process.exit(1);
  }
} else {
  console.log('ADMIN_SET_EMAIL and ADMIN_CHECK_EMAIL not set, skipping admin setup');
}
