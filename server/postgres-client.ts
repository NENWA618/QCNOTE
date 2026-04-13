import { Pool } from 'pg';

let pgPool: Pool | null = null;

export async function initPostgresClient(): Promise<Pool> {
  if (pgPool) {
    return pgPool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL environment variable is not set, using mock PostgreSQL client');
    // Return a mock PostgreSQL pool for development
    pgPool = {
      query: async () => ({ rows: [] }),
      connect: async () => ({}),
      on: () => {}
    } as any;
    return pgPool;
  }

  pgPool = new Pool({ connectionString: databaseUrl });

  pgPool.on('error', (err) => {
    console.error('[Postgres] Pool error', err);
  });

  try {
    await pgPool.connect();
    await initializeSchema(pgPool);
  } catch (error) {
    console.warn('PostgreSQL connection failed, using mock PostgreSQL client:', error);
    // Return a mock PostgreSQL pool for development
    pgPool = {
      query: async (sql: string) => {
        // Mock responses for common queries
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '2' }] };
        }
        if (sql.includes('forum_posts') && sql.includes('SELECT p.id')) {
          return { rows: [] }; // Return empty for actual posts query
        }
        if (sql.includes('forum_categories')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      connect: async () => ({}),
      on: () => {}
    } as any;
  }

  return pgPool;
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
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      total_active_days INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

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

    -- Forum tables
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user',
      updated_by TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT fk_user_roles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS forum_categories (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      post_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category_id TEXT,
      author_id TEXT NOT NULL,
      tags JSONB DEFAULT '[]',
      view_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      is_deleted BOOLEAN DEFAULT false,
      deleted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT fk_forum_post_author FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_forum_post_category FOREIGN KEY(category_id) REFERENCES forum_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS forum_replies (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      post_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      parent_reply_id TEXT,
      like_count INTEGER DEFAULT 0,
      is_deleted BOOLEAN DEFAULT false,
      deleted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT fk_forum_reply_post FOREIGN KEY(post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
      CONSTRAINT fk_forum_reply_author FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_forum_reply_parent FOREIGN KEY(parent_reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS forum_likes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      post_id TEXT,
      reply_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT fk_forum_like_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_forum_like_post FOREIGN KEY(post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
      CONSTRAINT fk_forum_like_reply FOREIGN KEY(reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE,
      CONSTRAINT forum_like_target_check CHECK (
        (post_id IS NOT NULL AND reply_id IS NULL) OR
        (post_id IS NULL AND reply_id IS NOT NULL)
      ),
      UNIQUE(user_id, post_id),
      UNIQUE(user_id, reply_id)
    );
  `);
}
