#!/usr/bin/env node

// 设置管理员用户脚本
// 用于将指定用户设置为管理员

import { Pool } from 'pg';
import { createClient } from 'redis';
import { ForumService } from '../server/forum-service.js';
import { UGCService } from '../server/ugc-service.js';

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
  const redis = createClient();
  await redis.connect();

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

        const ugcService = new UGCService(redis, pool);
        const profile = await ugcService.createUserProfile(identifier, identifier, username);

        console.log(`✅ 已创建新用户: ${profile.username} (${profile.email})`);

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
    const forumService = new ForumService(redis, pool);
    await forumService.setUserRole(user.id, 'admin', user.id);

    console.log(`✅ 成功将用户 ${user.name || user.username} 设置为管理员！`);
    console.log(`用户ID: ${user.id}`);
    console.log(`邮箱: ${user.email}`);

  } catch (error) {
    console.error('设置管理员失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
    await redis.disconnect();
  }
}

setupAdmin().catch(console.error);