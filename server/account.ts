import type { DatabaseSync } from 'node:sqlite'
import { TERMS_VERSION } from '../src/legal/terms.ts'
import { normalizeEmail, type PublicUser } from './auth.ts'
import type { UserRow } from './db.ts'
import { HttpError, json, type Request, type Response } from './http.ts'
import { checkpointWal, type ProjectStore } from './projectStore.ts'

/** What the account routes need from the app; app.ts builds it once. */
export interface AccountContext {
  db: DatabaseSync
  projects: ProjectStore
  requireUser(req: Request): UserRow
  publicUser(row: UserRow): PublicUser
  clearSessionCookie(): string
  /** Cancels the QuickBooks connection with Intuit, if there is one. Never throws. */
  revokeQuickBooks(userId: string): Promise<void>
  /** Ends a paid subscription (billing.ts closeAccount). Throws when it can't, which stops the deletion. */
  endSubscription(userId: string): Promise<void>
}

/**
 * The account holder's own data rights: export everything, delete everything,
 * and accept changed terms. Returns null for any other path.
 */
export async function accountRoutes(req: Request, ctx: AccountContext): Promise<Response | null> {
  const path = req.url.pathname
  const method = req.method

  if (path === '/api/account/export' && method === 'GET') {
    const user = ctx.requireUser(req)
    const day = new Date().toISOString().slice(0, 10)
    return json(200, exportAccount(ctx.db, ctx.projects, user), { 'Content-Disposition': `attachment; filename="reclaim-export-${day}.json"` })
  }

  if (path === '/api/account/delete' && method === 'POST') {
    const user = ctx.requireUser(req)
    if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON.')
    const { confirmEmail } = await req.json<{ confirmEmail?: unknown }>()
    if (typeof confirmEmail !== 'string' || normalizeEmail(confirmEmail) !== normalizeEmail(user.email)) {
      throw new HttpError(400, 'Type the email address on this account to confirm.', 'validation', { confirmEmail: 'This doesn’t match the email on this account.' })
    }
    // Stripe first: an account that can't stop its subscription isn't deleted.
    await ctx.endSubscription(user.id)
    // Intuit next, while the sealed tokens still exist to name the connection.
    await ctx.revokeQuickBooks(user.id)
    deleteAccount(ctx.db, user)
    return json(200, { ok: true }, { 'Set-Cookie': ctx.clearSessionCookie() })
  }

  if (path === '/api/account/accept-terms' && method === 'POST') {
    const user = ctx.requireUser(req)
    if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON.')
    const { termsVersion } = await req.json<{ termsVersion?: unknown }>()
    // Only the current text can be accepted: a stale tab must reload and show it first.
    if (termsVersion !== TERMS_VERSION) throw new HttpError(409, 'The Terms have changed again. Reload to see the current version.', 'terms_outdated')
    ctx.db.prepare('UPDATE users SET terms_accepted_at = ?, terms_version = ? WHERE id = ?').run(Date.now(), TERMS_VERSION, user.id)
    return json(200, { user: ctx.publicUser({ ...user, terms_accepted_at: Date.now(), terms_version: TERMS_VERSION }) })
  }

  return null
}

/** Everything Reclaim holds about the account, readable. Never tokens, hashes or fingerprints. */
export function exportAccount(db: DatabaseSync, projects: ProjectStore, user: UserRow) {
  const qbo = db
    .prepare("SELECT company_name, connected_at, last_sync_at FROM integration_connections WHERE user_id = ? AND provider = 'quickbooks'")
    .get(user.id) as { company_name: string; connected_at: number; last_sync_at: number | null } | undefined
  const methods = (db.prepare('SELECT provider FROM identities WHERE user_id = ?').all(user.id) as Array<{ provider: string }>).map((r) => r.provider)
  return {
    format: 'reclaim-export-v1',
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      company: user.company,
      createdAt: new Date(user.created_at).toISOString(),
      emailVerified: user.email_verified === 1,
      plan: user.plan,
      signInMethods: [...(user.password_hash ? ['password'] : []), ...methods],
      termsVersion: user.terms_version,
      termsAcceptedAt: user.terms_accepted_at ? new Date(user.terms_accepted_at).toISOString() : null,
    },
    quickbooks: qbo
      ? { companyName: qbo.company_name, connectedAt: new Date(qbo.connected_at).toISOString(), lastSyncAt: qbo.last_sync_at ? new Date(qbo.last_sync_at).toISOString() : null }
      : null,
    audits: projects.list(user.id),
  }
}

/**
 * Removes the account and every row tied to it, in one transaction: any table
 * with a `user_id` column (sessions, tokens, identities, projects, upload
 * rows, audit starts, integration connections, and tables added later), the
 * dev mailbox's copies of its email, then the user. The freed space is
 * zeroed (secure_delete) and the WAL's older copies of those pages truncated
 * away, so the deleted data doesn't linger in the database files.
 */
export function deleteAccount(db: DatabaseSync, user: Pick<UserRow, 'id' | 'email'>): void {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'users'").all() as Array<{ name: string }>)
    .map((t) => t.name)
    .filter((name) => (db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all() as Array<{ name: string }>).some((c) => c.name === 'user_id'))
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const name of tables) db.prepare(`DELETE FROM "${name.replace(/"/g, '""')}" WHERE user_id = ?`).run(user.id)
    db.prepare('DELETE FROM mailbox WHERE to_email = ?').run(normalizeEmail(user.email))
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  checkpointWal(db)
}
