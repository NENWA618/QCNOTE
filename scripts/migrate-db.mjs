#!/usr/bin/env node

// QCNOTE 数据库迁移脚本
// 用于添加索引和优化查询性能

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_LOG = path.join(__dirname, 'migration.log');

async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  await fs.appendFile(MIGRATION_LOG, logMessage);
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await log('开始数据库迁移...');

    // 检查现有索引
    await log('检查现有索引...');
    const existingIndexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('users', 'user_spaces', 'follows', 'community_notes', 'comments')
      ORDER BY indexname;
    `);

    await log(`发现 ${existingIndexes.rows.length} 个现有索引`);

    // 添加用户表索引
    await log('添加用户表索引...');

    // 用户ID索引 (应该已存在主键)
    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);');
      await log('✓ 创建 idx_users_email 索引');
    } catch (error) {
      await log(`⚠ idx_users_email 索引创建失败: ${error.message}`);
    }

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username ON users(username);');
      await log('✓ 创建 idx_users_username 索引');
    } catch (error) {
      await log(`⚠ idx_users_username 索引创建失败: ${error.message}`);
    }

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users(created_at);');
      await log('✓ 创建 idx_users_created_at 索引');
    } catch (error) {
      await log(`⚠ idx_users_created_at 索引创建失败: ${error.message}`);
    }

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_updated_at ON users(updated_at);');
      await log('✓ 创建 idx_users_updated_at 索引');
    } catch (error) {
      await log(`⚠ idx_users_updated_at 索引创建失败: ${error.message}`);
    }

    // 关注表索引
    await log('添加关注表索引...');

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_user_id ON follows(user_id);');
      await log('✓ 创建 idx_follows_user_id 索引');
    } catch (error) {
      await log(`⚠ idx_follows_user_id 索引创建失败: ${error.message}`);
    }

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_followee_id ON follows(followee_id);');
      await log('✓ 创建 idx_follows_followee_id 索引');
    } catch (error) {
      await log(`⚠ idx_follows_followee_id 索引创建失败: ${error.message}`);
    }

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_created_at ON follows(created_at);');
      await log('✓ 创建 idx_follows_created_at 索引');
    } catch (error) {
      await log(`⚠ idx_follows_created_at 索引创建失败: ${error.message}`);
    }

    // 社区笔记表索引 (如果存在)
    await log('检查社区笔记表...');

    try {
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'community_notes'
        );
      `);

      if (tableExists.rows[0].exists) {
        await log('添加社区笔记表索引...');

        await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_notes_user_id ON community_notes(user_id);');
        await log('✓ 创建 idx_community_notes_user_id 索引');

        await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_notes_category ON community_notes(category);');
        await log('✓ 创建 idx_community_notes_category 索引');

        await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_notes_created_at ON community_notes(created_at);');
        await log('✓ 创建 idx_community_notes_created_at 索引');

        await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_notes_published_at ON community_notes(published_at);');
        await log('✓ 创建 idx_community_notes_published_at 索引');

        // GIN 索引用于标签数组搜索
        await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_notes_tags ON community_notes USING GIN (tags);');
        await log('✓ 创建 idx_community_notes_tags GIN 索引');
      } else {
        await log('社区笔记表不存在，跳过索引创建');
      }
    } catch (error) {
      await log(`⚠ 社区笔记表索引创建失败: ${error.message}`);
    }

    // 虚拟空间表索引
    await log('添加虚拟空间表索引...');

    try {
      await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_spaces_user_id ON user_spaces(user_id);');
      await log('✓ 创建 idx_user_spaces_user_id 索引');
    } catch (error) {
      await log(`⚠ idx_user_spaces_user_id 索引创建失败: ${error.message}`);
    }

    // 分析查询性能
    await log('分析查询性能...');

    // 检查慢查询
    const slowQueries = await pool.query(`
      SELECT query, calls, total_time, mean_time, rows
      FROM pg_stat_statements
      WHERE mean_time > 100  -- 超过100ms的查询
      ORDER BY mean_time DESC
      LIMIT 10;
    `);

    if (slowQueries.rows.length > 0) {
      await log('发现慢查询:');
      slowQueries.rows.forEach((row, index) => {
        log(`  ${index + 1}. 平均时间: ${row.mean_time.toFixed(2)}ms, 调用次数: ${row.calls}`);
        log(`     查询: ${row.query.substring(0, 100)}...`);
      });
    } else {
      await log('未发现明显慢查询');
    }

    // 验证索引使用情况
    await log('验证索引使用情况...');

    const indexUsage = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      WHERE tablename IN ('users', 'user_spaces', 'follows', 'community_notes')
      ORDER BY idx_scan DESC;
    `);

    await log(`索引使用统计 (${indexUsage.rows.length} 个索引):`);
    indexUsage.rows.forEach(row => {
      log(`  ${row.tablename}.${row.indexname}: 扫描 ${row.idx_scan} 次`);
    });

    await log('数据库迁移完成！');

  } catch (error) {
    await log(`数据库迁移失败: ${error.message}`);
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 运行迁移
runMigrations().catch(console.error);