import { DatabaseSync } from 'node:sqlite'
import { rowFingerprint } from './uploads.ts'

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
    CREATE TABLE IF NOT EXISTS audit_starts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      started_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS upload_rows (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      PRIMARY KEY (user_id, fingerprint)
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id, kind);
    CREATE INDEX IF NOT EXISTS audit_starts_user ON audit_starts(user_id, started_at);
  `)
  // Additive migrations for databases created before these columns existed.
  const columns = new Set((db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name))
  if (!columns.has('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'")
  if (!columns.has('plan_updated_at')) db.exec('ALTER TABLE users ADD COLUMN plan_updated_at INTEGER')
  if (!columns.has('onboarding_seen_at')) db.exec('ALTER TABLE users ADD COLUMN onboarding_seen_at INTEGER')
  // The single paid plan became Growth when the three tracks were introduced.
  db.exec("UPDATE users SET plan = 'growth' WHERE plan = 'pro'")
  // audit_starts is the plan-usage ledger (see app.ts). Databases from before it
  // existed get one start per saved audit, dated when the server first stored it.
  const starts = db.prepare('SELECT COUNT(*) AS n FROM audit_starts').get() as { n: number }
  if (starts.n === 0) db.exec('INSERT INTO audit_starts (user_id, project_id, started_at) SELECT user_id, id, created_at FROM projects')
  // upload_rows remembers every payment row an account has uploaded (Free
  // repeat-upload rule). Fill it once from audits saved before it existed.
  const rows = db.prepare('SELECT COUNT(*) AS n FROM upload_rows').get() as { n: number }
  if (rows.n === 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO upload_rows (user_id, fingerprint, project_id, first_seen) VALUES (?, ?, ?, ?)')
    for (const p of db.prepare('SELECT user_id, id, created_at, payload FROM projects').all() as Array<{ user_id: string; id: string; created_at: number; payload: string }>) {
      try {
        const records = (JSON.parse(p.payload).environment?.records ?? []) as Array<{ vendor: string; invoiceNumber: string | null; paymentDate: string; amountPaid: number }>
        for (const r of records) insert.run(p.user_id, rowFingerprint(r), p.id, p.created_at)
      } catch {
        // An unreadable payload is skipped; it simply isn't protected against a repeat.
      }
    }
  }
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
