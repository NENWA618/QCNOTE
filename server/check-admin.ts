#!/usr/bin/env tsx

import { Pool } from 'pg';

async function main() {
  const args = process.argv.slice(2);
  const identifier = args[0] || process.env.ADMIN_CHECK_EMAIL;

  if (!identifier) {
    console.log('ADMIN_CHECK_EMAIL is not set and no identifier was provided. Skipping admin check.');
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log(`Checking admin role for identifier: ${identifier}`);

    const result = await pool.query(
      `SELECT u.id, u.email, u.username, COALESCE(ur.role, 'user') AS role
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1 OR u.email = $1`,
      [identifier]
    );

    if (result.rows.length === 0) {
      console.log(`No user found for identifier: ${identifier}`);
      process.exit(0);
    }

    result.rows.forEach((row) => {
      console.log('User found:');
      console.log(`  id: ${row.id}`);
      console.log(`  email: ${row.email}`);
      console.log(`  username: ${row.username}`);
      console.log(`  role: ${row.role}`);
      console.log(row.role === 'admin' ? '✅ This user is an admin.' : '⚠️ This user is not an admin.');
    });
  } catch (error) {
    console.error('Failed to check admin role:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
