import { Pool } from 'pg';

let pgPool: Pool | null = null;

export async function initPostgresClient(): Promise<Pool> {
  if (pgPool) {
    return pgPool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('DATABASE_URL environment variable is not set, using mock PostgreSQL client');
      pgPool = {
        query: async () => ({ rows: [] }),
        connect: async () => ({ release: () => {} }),
        on: () => {},
      } as unknown as Pool;
      return pgPool!;
    }
    throw new Error(
      'DATABASE_URL environment variable is required in non-development environments.',
    );
  }

  pgPool = new Pool({
    connectionString: databaseUrl,
    // Connection pool settings
    max: 20, // Max connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Reject connection attempt after 5s
    // Connection validation
    application_name: 'qcnote_app',
  });

  pgPool.on('error', (err: Error) => {
    console.error('[Postgres] Unexpected pool error:', err);
    // Implement alerting/monitoring
  });

  pgPool.on('connect', () => {
    console.log('[Postgres] New connection established');
  });

  try {
    // 用 query 验证连通性：pool.query 会自动借出并归还连接，避免 connect() 后忘记 release 而永久占用 1 个连接
    await pgPool.query('SELECT 1');
    await initializeSchema(pgPool);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('PostgreSQL connection failed, using mock PostgreSQL client:', error);
      pgPool = {
        query: async (sql: string) => {
          // Mock responses for common queries
          if (sql.includes('COUNT(*)')) {
            return { rows: [{ count: '2' }] };
          }
          return { rows: [] };
        },
        connect: async () => ({ release: () => {} }),
        on: () => {},
      } as unknown as Pool;
      return pgPool!;
    }
    throw new Error(`PostgreSQL connection failed: ${error}`);
  }

  return pgPool!;
}

export function getPostgresClient(): Pool {
  if (!pgPool) {
    throw new Error('Postgres client not initialized. Call initPostgresClient first.');
  }
  return pgPool;
}

async function initializeSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      image TEXT,
      provider TEXT,
      bio TEXT,
      joined_at BIGINT NOT NULL,
      heatmap JSONB DEFAULT '{}',
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      total_active_days INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    -- 一个账号同一时间只有一个有效的登录会话：每次登录都会换成新的会话 ID，
    -- 令牌里的会话 ID 与之不符的旧会话一律作废。NULL 表示该账号还没有按新方式登录过
    -- （旧令牌没有会话 ID），此时不拦截，等它下一次登录后才开始生效。
    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS active_session_id TEXT;

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user',
      updated_by TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT fk_user_roles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- “版主”角色已取消（它从未拥有任何权限），把残留的记录并回普通用户
    UPDATE user_roles SET role = 'user' WHERE role = 'moderator';

    -- Per-user wrapping key (KEK) for local-database encryption (qcruntime).
    -- wrapped_key is the per-user KEK encrypted at rest with VAULT_MASTER_KEY;
    -- the actual note-encrypting key (DEK) never leaves the user's browser.
    CREATE TABLE IF NOT EXISTS user_vault_keys (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wrapped_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- 用户主动发布到个人主页的笔记快照（明文）。local_note_id 对应浏览器本地笔记 ID，
    -- 但 id 是独立随机生成的，公开链接不暴露本地数据结构。
    CREATE TABLE IF NOT EXISTS public_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      local_note_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]',
      colored_ranges JSONB NOT NULL DEFAULT '[]',
      source_updated_at BIGINT NOT NULL,
      published_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE (user_id, local_note_id)
    );

    -- 管理员关闭某用户的个人主页和公开笔记。只记录“被关闭”这件事：public_notes 里的内容
    -- 原样保留（留作证据），读取和发布路径据此拦截。解除关闭即删除这一行。
    CREATE TABLE IF NOT EXISTS public_suspensions (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL DEFAULT '',
      suspended_by TEXT NOT NULL,
      suspended_at BIGINT NOT NULL
    );

    -- Web Push 订阅。user_id 不加外键，保持与 scripts/001-create-push-subscriptions-table.sql 一致。
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      keys JSONB NOT NULL,
      user_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 注销记录：登录时间早于 deleted_at 的会话一律失效（见 server/session.ts）。
    -- 不加外键：用户行删除后它必须保留，同一账号重新登录后也要继续拦住旧会话。
    CREATE TABLE IF NOT EXISTS account_deletions (
      user_id TEXT PRIMARY KEY,
      deleted_at BIGINT NOT NULL
    );

  `);

  // CRITICAL INDEXES for query performance
  await pool.query(`
    -- Users table indexes
    CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

    -- User roles (frequently checked in auth)
    CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

    -- Public notes (profile page listing)
    CREATE INDEX IF NOT EXISTS idx_public_notes_user_published ON public_notes(user_id, published_at DESC);

    -- Push subscriptions（按用户查询 / 清理）
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
  `);
}
