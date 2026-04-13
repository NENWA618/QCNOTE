#!/usr/bin/env tsx

// 设置管理员用户脚本
// 用于将指定用户设置为管理员

import { Pool } from 'pg';

async function setupAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.length > 2) {
    console.log('Usage:');
    console.log('  node setup-admin.mjs <user-email> [username]');
    console.log('  node setup-admin.mjs <user-id>');
    console.log('');
    console.log('Examples:');
    console.log('  node setup-admin.mjs admin@gmail.com');
    console.log('  node setup-admin.mjs admin@gmail.com "Admin User"');
    console.log('  node setup-admin.mjs user-uuid-here');
    process.exit(1);
  }

  const identifier = args[0];
  const username = args[1];
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('连接数据库...');

    let user;

    // 首先尝试通过ID查找用户
    let userResult = await pool.query(
      'SELECT id, name, email, username FROM users WHERE id = $1',
      [identifier]
    );

    if (userResult.rows.length === 0) {
      // 如果没找到，尝试通过邮箱查找
      console.log(`通过ID未找到用户，尝试通过邮箱查找: ${identifier}`);
      userResult = await pool.query(
        'SELECT id, name, email, username FROM users WHERE email = $1',
        [identifier]
      );

      if (userResult.rows.length === 0) {
        // 如果还是没找到，可能是OAuth用户还没有登录过，需要创建用户
        console.log(`用户 ${identifier} 不存在，创建新用户...`);

        if (!username) {
          console.error('创建新用户需要提供用户名');
          console.log('用法: node setup-admin.mjs <email> <username>');
          process.exit(1);
        }

        const now = Date.now();
        const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
        const bio = '这是我的个人空间';

        await pool.query(
          `INSERT INTO users(id, email, username, image, provider, bio, joined_at, followers, following, credit, is_public, heatmap, current_streak, longest_streak, total_active_days, created_at, updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id) DO UPDATE
             SET email = EXCLUDED.email,
                 username = EXCLUDED.username,
                 image = EXCLUDED.image,
                 provider = EXCLUDED.provider,
                 updated_at = EXCLUDED.updated_at`,
          [
            identifier, // userId
            identifier, // email
            username,
            avatar,
            'nextauth',
            bio,
            now,
            0, // followers
            0, // following
            10, // credit
            true, // is_public
            JSON.stringify({}), // heatmap
            0, // current_streak
            0, // longest_streak
            0, // total_active_days
            now,
            now,
          ]
        );

        console.log(`✅ 已创建新用户: ${username} (${identifier})`);

        // 重新查询用户
        userResult = await pool.query(
          'SELECT id, name, email, username FROM users WHERE id = $1',
          [identifier]
        );
      }
    }

    if (userResult.rows.length === 0) {
      console.error(`无法找到或创建用户: ${identifier}`);
      process.exit(1);
    }

    user = userResult.rows[0];
    console.log(`找到用户: ${user.name || user.username} (${user.email}) - ID: ${user.id}`);

    // 设置为管理员
    await pool.query(
      `INSERT INTO user_roles (user_id, role, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         role = EXCLUDED.role,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [user.id, 'admin', user.id]
    );

    console.log(`✅ 成功将用户 ${user.name || user.username} 设置为管理员！`);
    console.log(`用户ID: ${user.id}`);
    console.log(`邮箱: ${user.email}`);

  } catch (error) {
    console.error('设置管理员失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupAdmin().catch(console.error);