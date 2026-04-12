import { Pool } from 'pg';

let pgPool: Pool | null = null;

export async function initPostgresClient(): Promise<Pool> {
  if (pgPool) {
    return pgPool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  pgPool = new Pool({ connectionString: databaseUrl });

  pgPool.on('error', (err) => {
    console.error('[Postgres] Pool error', err);
  });

  await pgPool.connect();
  await initializeSchema(pgPool);

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
  `);
}
