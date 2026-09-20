import { DatabaseSync } from 'node:sqlite'

/**
 * SQLite through Node's built-in driver: no native dependency, one file on
 * disk (or `:memory:` in tests). Every row that belongs to an account carries
 * its user_id, and every query that reads account data filters on it — that
 * is the whole data-isolation model, so keep it boringly consistent.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      terms_accepted_at INTEGER,
      terms_version TEXT
    );
    CREATE TABLE IF NOT EXISTS identities (
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (provider, subject)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS projects (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      source_label TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS mailbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id, kind);
  `)
  // Additive migrations for databases created before these columns existed.
  const columns = new Set((db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name))
  if (!columns.has('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'")
  if (!columns.has('plan_updated_at')) db.exec('ALTER TABLE users ADD COLUMN plan_updated_at INTEGER')
  if (!columns.has('onboarding_seen_at')) db.exec('ALTER TABLE users ADD COLUMN onboarding_seen_at INTEGER')
  return db
}

export interface UserRow {
  id: string
  email: string
  email_verified: number
  password_hash: string | null
  first_name: string
  last_name: string
  company: string
  created_at: number
  terms_accepted_at: number | null
  terms_version: string | null
  plan: string
  plan_updated_at: number | null
  onboarding_seen_at: number | null
}
