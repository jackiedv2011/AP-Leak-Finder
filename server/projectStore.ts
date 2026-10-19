import type { DatabaseSync } from 'node:sqlite'
import { openSecret, sealSecret } from './crypto.ts'

type Project = Record<string, unknown>
type Keys = { current: Buffer; previous: Buffer | null } | null

/**
 * Saved audits at rest. Each payload (every record, finding, decision and
 * recovery note in an audit) is sealed with AES-256-GCM under DATA_KEY, with
 * the owning user and audit bound in as associated data: a sealed payload
 * copied onto another account's row, or another audit's, fails to open.
 *
 * Rows written before encryption hold plain JSON (it starts with `{`; a
 * sealed value starts with `v1.`). Both read correctly, and `migrate()` seals
 * the plain ones at startup. The audit's name and file name are kept only
 * inside the sealed payload; the plain columns stay empty.
 *
 * Without a key (development only: production refuses to start) payloads are
 * stored as plain JSON, exactly as before.
 */
export class ProjectStore {
  private readonly db: DatabaseSync
  private readonly keys: Keys

  constructor(db: DatabaseSync, keys: Keys) {
    this.db = db
    this.keys = keys
    // Deleted and overwritten content is zeroed in the file rather than left
    // in free pages: replaced plaintext, deleted audits, deleted accounts.
    db.exec('PRAGMA secure_delete = ON')
  }

  get encrypted(): boolean {
    return this.keys !== null
  }

  list(userId: string): Project[] {
    const rows = this.db.prepare('SELECT id, payload FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as Array<{ id: string; payload: string }>
    return rows.map((row) => this.decode(userId, row.id, row.payload))
  }

  get(userId: string, projectId: string): Project | null {
    const row = this.db.prepare('SELECT payload FROM projects WHERE user_id = ? AND id = ?').get(userId, projectId) as { payload: string } | undefined
    return row ? this.decode(userId, projectId, row.payload) : null
  }

  exists(userId: string, projectId: string): boolean {
    return this.db.prepare('SELECT 1 FROM projects WHERE user_id = ? AND id = ?').get(userId, projectId) !== undefined
  }

  upsert(userId: string, project: Project): void {
    const id = project.id as string
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO projects (user_id, id, name, source_label, mode, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, source_label = excluded.source_label, mode = excluded.mode, updated_at = excluded.updated_at, payload = excluded.payload`
      )
      .run(
        userId,
        id,
        this.keys ? '' : (project.name as string),
        this.keys ? '' : typeof project.sourceLabel === 'string' ? project.sourceLabel : '',
        project.mode === 'sample' ? 'sample' : 'upload',
        // Server time: created_at is when this server first stored the audit, whatever the client claims.
        now,
        typeof project.updatedAt === 'number' ? project.updatedAt : now,
        this.encode(userId, id, JSON.stringify(project))
      )
  }

  delete(userId: string, projectId: string): void {
    this.db.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').run(userId, projectId)
  }

  /**
   * Seals every plain-JSON row, and re-seals rows still under DATA_KEY_PREVIOUS
   * during a rotation. When anything changed, the file is rebuilt (VACUUM) and
   * the WAL checkpointed and truncated, so no plaintext copy stays in the
   * database file, its free pages or its WAL. Returns how many rows changed.
   */
  migrate(): number {
    if (!this.keys) {
      const sealed = (this.db.prepare("SELECT COUNT(*) AS n FROM projects WHERE payload LIKE 'v1.%'").get() as { n: number }).n
      if (sealed) console.warn(`${sealed} stored audits are encrypted but DATA_KEY is not set: they can't be read until it is.`)
      return 0
    }
    const { previous } = this.keys
    const rows = this.db.prepare(previous ? 'SELECT user_id, id, payload FROM projects' : "SELECT user_id, id, payload FROM projects WHERE payload NOT LIKE 'v1.%'").all() as Array<{
      user_id: string
      id: string
      payload: string
    }>
    const update = this.db.prepare("UPDATE projects SET payload = ?, name = '', source_label = '' WHERE user_id = ? AND id = ?")
    let changed = 0
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        if (isSealed(row.payload) && this.opens(row.payload, this.keys.current, row.user_id, row.id)) continue
        const plain = isSealed(row.payload) ? openSecret(row.payload, previous!, context(row.user_id, row.id)) : row.payload
        update.run(sealSecret(plain, this.keys.current, context(row.user_id, row.id)), row.user_id, row.id)
        changed += 1
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw new Error(`Could not encrypt stored audits; nothing was changed. ${err instanceof Error ? err.message : ''}`.trim())
    }
    if (changed) scrub(this.db)
    return changed
  }

  private encode(userId: string, projectId: string, json: string): string {
    return this.keys ? sealSecret(json, this.keys.current, context(userId, projectId)) : json
  }

  private decode(userId: string, projectId: string, payload: string): Project {
    if (!isSealed(payload)) return JSON.parse(payload) as Project
    if (!this.keys) throw new Error('This audit is encrypted and DATA_KEY is not set.')
    const ctx = context(userId, projectId)
    try {
      return JSON.parse(openSecret(payload, this.keys.current, ctx)) as Project
    } catch (err) {
      // Mid-rotation, before migrate() has re-sealed this row.
      if (this.keys.previous) return JSON.parse(openSecret(payload, this.keys.previous, ctx)) as Project
      throw err
    }
  }

  private opens(payload: string, key: Buffer, userId: string, projectId: string): boolean {
    try {
      openSecret(payload, key, context(userId, projectId))
      return true
    } catch {
      return false
    }
  }
}

/**
 * Rewrites the database file without free pages and folds the WAL back in,
 * truncating it. Call after removing data that must not linger on disk.
 */
export function scrub(db: DatabaseSync): void {
  db.exec('VACUUM')
  checkpointWal(db)
}

/** Folds the WAL into the database file and truncates it, dropping older copies of every page. */
export function checkpointWal(db: DatabaseSync): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
}

const isSealed = (payload: string) => payload.startsWith('v1.')
const context = (userId: string, projectId: string) => `project:${userId}:${projectId}`
