#!/usr/bin/env tsx

import { Pool } from 'pg';

async function main() {
  const args = process.argv.slice(2);
  const identifier = args[0] || process.env.ADMIN_SET_EMAIL;

  if (!identifier) {
    console.log('ADMIN_SET_EMAIL is not set and no identifier was provided. Skipping admin set.');
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log(`Setting admin role for identifier: ${identifier}`);

    const userResult = await pool.query(
      'SELECT id, email, username FROM users WHERE id = $1 OR email = $1',
      [identifier]
    );

    if (userResult.rows.length === 0) {
      console.error(`No user found for identifier: ${identifier}`);
      process.exit(1);
    }

    const user = userResult.rows[0];
    await pool.query(
      `INSERT INTO user_roles (user_id, role, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         role = EXCLUDED.role,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [user.id, 'admin', user.id]
    );

    console.log(`✅ User ${user.username} (${user.email}) is now set to admin.`);
    console.log(`User ID: ${user.id}`);
  } catch (error) {
    console.error('Failed to set admin role:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
