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
        connect: async () => ({}),
        on: () => {},
      } as any;
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

  pgPool.on('error', (err) => {
    console.error('[Postgres] Unexpected pool error:', err);
    // Implement alerting/monitoring
  });

  pgPool.on('connect', () => {
    console.log('[Postgres] New connection established');
  });

  try {
    await pgPool.connect();
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
          if (sql.includes('SELECT p.id')) {
            return { rows: [] }; // Return empty for actual posts query
          }
          return { rows: [] };
        },
        connect: async () => ({}),
        on: () => {},
      } as any;
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
      followers INTEGER DEFAULT 0,
      following INTEGER DEFAULT 0,
      credit INTEGER DEFAULT 0,
      is_public BOOLEAN DEFAULT true,
      heatmap JSONB DEFAULT '{}',
      device_fingerprints JSONB DEFAULT '{}',
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      total_active_days INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS device_fingerprints JSONB DEFAULT '{}';

    CREATE TABLE IF NOT EXISTS user_spaces (
      space_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      space_name TEXT NOT NULL,
      background_color TEXT,
      theme TEXT,
      decorations JSONB DEFAULT '[]',
      background_image TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_user_space_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS community_notes (
      community_id TEXT PRIMARY KEY,
      original_note_id TEXT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      tags JSONB DEFAULT '[]',
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      published_at BIGINT NOT NULL,
      is_published BOOLEAN DEFAULT true,
      last_modified_at BIGINT NOT NULL,
      cover_image TEXT,
      CONSTRAINT fk_community_note_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS interactions (
      interaction_id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      to_note_id TEXT,
      to_user_id TEXT,
      type TEXT NOT NULL,
      content TEXT,
      created_at BIGINT NOT NULL,
      CONSTRAINT fk_interaction_user FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS follows (
      user_id TEXT NOT NULL,
      followee_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, followee_id),
      CONSTRAINT fk_follows_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_follows_followee FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user',
      updated_by TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT fk_user_roles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

    -- Follows table
    CREATE INDEX IF NOT EXISTS idx_follows_user_id ON follows(user_id);
    CREATE INDEX IF NOT EXISTS idx_follows_followee_id ON follows(followee_id);

    -- Community notes
    CREATE INDEX IF NOT EXISTS idx_community_notes_user_id ON community_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_community_notes_category ON community_notes(category);
    CREATE INDEX IF NOT EXISTS idx_community_notes_published ON community_notes(published_at DESC) WHERE is_published = true;
  `);
}
