import type { DatabaseSync } from 'node:sqlite'
import { hashPassword, hashToken, newId, newToken, verifyPassword } from './crypto.ts'
import type { UserRow } from './db.ts'
import { HttpError } from './http.ts'
import type { Mailer } from './mailer.ts'
import { planOf, type Plan } from './plans.ts'

export interface PublicUser {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  company: string
  createdAt: number
  emailVerified: boolean
  termsAcceptedAt: number | null
  termsVersion: string | null
  /** Which sign-in methods are attached: a password, a Google identity, or both. */
  methods: Array<'password' | 'google'>
  plan: Plan
  /** Null until the person has been through (or skipped) the first-run tour. */
  onboardingSeenAt: number | null
}

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface AuthServiceOptions {
  appOrigin: string
  requireEmailVerification: boolean
  sessionMs: number
  rememberMeMs: number
}

export class AuthService {
  private readonly db: DatabaseSync
  private readonly mailer: Mailer
  private readonly options: AuthServiceOptions

  constructor(db: DatabaseSync, mailer: Mailer, options: AuthServiceOptions) {
    this.db = db
    this.mailer = mailer
    this.options = options
  }

  // ---------- users ----------

  toPublic(row: UserRow): PublicUser {
    const methods: PublicUser['methods'] = []
    if (row.password_hash) methods.push('password')
    const google = this.db.prepare("SELECT 1 FROM identities WHERE provider = 'google' AND user_id = ?").get(row.id)
    if (google) methods.push('google')
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
      company: row.company,
      createdAt: row.created_at,
      emailVerified: row.email_verified === 1,
      termsAcceptedAt: row.terms_accepted_at,
      termsVersion: row.terms_version,
      methods,
      plan: planOf(row.plan),
      onboardingSeenAt: row.onboarding_seen_at,
    }
  }

  setPlan(userId: string, plan: Plan): void {
    this.db.prepare('UPDATE users SET plan = ?, plan_updated_at = ? WHERE id = ?').run(plan, Date.now(), userId)
  }

  markOnboardingSeen(userId: string): void {
    this.db.prepare('UPDATE users SET onboarding_seen_at = ? WHERE id = ?').run(Date.now(), userId)
  }

  findUserByEmail(email: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | undefined) ?? null
  }

  findUserById(id: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
  }

  // ---------- sign-up ----------

  validateSignUp(input: Record<string, unknown>): Record<string, string> {
    const errors: Record<string, string> = {}
    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    if (!s(input.firstName)) errors.firstName = 'Enter your first name.'
    if (!s(input.lastName)) errors.lastName = 'Enter your last name.'
    if (!EMAIL_RE.test(s(input.email))) errors.email = 'Enter a valid email address.'
    if (!s(input.company)) errors.company = 'Enter your company name.'
    if (typeof input.password !== 'string' || input.password.length < 8) errors.password = 'Use at least 8 characters.'
    else if (input.password.length > 256) errors.password = 'That password is too long.'
    if (input.confirmPassword !== input.password) errors.confirmPassword = 'The passwords do not match.'
    if (input.acceptedTerms !== true) errors.acceptedTerms = 'You need to agree to the Terms of Service and Privacy Policy.'
    return errors
  }

  /**
   * Creates the account and sends the verification mail. The response is the
   * same whether or not the address was already registered — the existing
   * owner gets an email instead of the requester getting a hint.
   */
  async signUp(input: {
    firstName: string
    lastName: string
    email: string
    company: string
    password: string
    termsVersion: string | null
  }): Promise<{ requiresVerification: boolean; user: PublicUser | null; sessionUserId: string | null }> {
    const email = normalizeEmail(input.email)
    const existing = this.findUserByEmail(email)
    if (existing) {
      await this.mailer.send({
        to: email,
        subject: 'You already have a Reclaim account',
        body: `Someone tried to create a Reclaim account with this address. You already have one — log in at ${this.options.appOrigin}/login, or reset your password at ${this.options.appOrigin}/forgot-password if you have forgotten it. If this wasn't you, you can ignore this email.`,
        link: `${this.options.appOrigin}/login`,
      })
      return { requiresVerification: this.options.requireEmailVerification, user: null, sessionUserId: null }
    }
    const id = newId('user')
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO users (id, email, email_verified, password_hash, first_name, last_name, company, created_at, terms_accepted_at, terms_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, email, this.options.requireEmailVerification ? 0 : 1, await hashPassword(input.password), input.firstName.trim(), input.lastName.trim(), input.company.trim(), now, now, input.termsVersion)
    const user = this.findUserById(id)!
    if (this.options.requireEmailVerification) {
      await this.sendVerification(user)
      return { requiresVerification: true, user: null, sessionUserId: null }
    }
    return { requiresVerification: false, user: this.toPublic(user), sessionUserId: id }
  }

  async sendVerification(user: UserRow): Promise<void> {
    const { token, hash } = newToken()
    const now = Date.now()
    this.db.prepare('INSERT INTO tokens (id, user_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(hash, user.id, 'verify', now, now + VERIFY_TTL_MS)
    const link = `${this.options.appOrigin}/verify-email?token=${token}`
    await this.mailer.send({
      to: user.email,
      subject: 'Confirm your email for Reclaim',
      body: `Hi ${user.first_name},\n\nConfirm this address to finish setting up your Reclaim account:\n\n${link}\n\nThe link works for 24 hours. If you did not create an account, ignore this email.`,
      link,
    })
  }

  async resendVerification(email: string): Promise<void> {
    const user = this.findUserByEmail(email)
    if (!user || user.email_verified === 1) return
    await this.sendVerification(user)
  }

  verifyEmail(token: string): UserRow {
    const row = this.consumeToken(token, 'verify')
    this.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id)
    return this.findUserById(row.user_id)!
  }

  // ---------- log-in ----------

  async logIn(email: string, password: string): Promise<UserRow> {
    const user = this.findUserByEmail(email)
    const ok = await verifyPassword(password, user?.password_hash ?? null)
    if (!user || !ok) throw new HttpError(401, "That email and password don't match.", 'invalid_credentials')
    if (this.options.requireEmailVerification && user.email_verified !== 1) {
      throw new HttpError(403, 'Confirm your email address first — check your inbox for the link.', 'email_unverified')
    }
    return user
  }

  // ---------- sessions ----------

  createSession(userId: string, rememberMe: boolean): { token: string; maxAgeSeconds: number } {
    const { token, hash } = newToken()
    const now = Date.now()
    const ttl = rememberMe ? this.options.rememberMeMs : this.options.sessionMs
    this.db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hash, userId, now, now + ttl)
    return { token, maxAgeSeconds: Math.floor(ttl / 1000) }
  }

  userForSession(token: string | undefined): UserRow | null {
    if (!token) return null
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(hashToken(token)) as { user_id: string; expires_at: number } | undefined
    if (!row) return null
    if (row.expires_at < Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token))
      return null
    }
    return this.findUserById(row.user_id)
  }

  revokeSession(token: string | undefined): void {
    if (token) this.db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token))
  }

  revokeAllSessions(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }

  // ---------- password reset ----------

  /** Always resolves; the caller responds identically whether or not the account exists. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = this.findUserByEmail(email)
    if (!user) return
    const { token, hash } = newToken()
    const now = Date.now()
    this.db.prepare('INSERT INTO tokens (id, user_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(hash, user.id, 'reset', now, now + RESET_TTL_MS)
    const link = `${this.options.appOrigin}/reset-password?token=${token}`
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your Reclaim password',
      body: `Hi ${user.first_name},\n\nUse this link to choose a new password:\n\n${link}\n\nIt works once, for one hour. If you did not ask for this, ignore this email — your password has not changed.`,
      link,
    })
  }

  async resetPassword(token: string, password: string, confirmPassword: string): Promise<UserRow> {
    const errors: Record<string, string> = {}
    if (typeof password !== 'string' || password.length < 8) errors.password = 'Use at least 8 characters.'
    if (confirmPassword !== password) errors.confirmPassword = 'The passwords do not match.'
    if (Object.keys(errors).length) throw new HttpError(400, 'Check the highlighted fields.', 'validation', errors)
    const row = this.consumeToken(token, 'reset')
    this.db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(await hashPassword(password), row.user_id)
    // A reset means "someone else may have had my password" — every other session goes.
    this.revokeAllSessions(row.user_id)
    return this.findUserById(row.user_id)!
  }

  private consumeToken(token: string, kind: 'verify' | 'reset'): { user_id: string } {
    const hash = hashToken(typeof token === 'string' ? token : '')
    const row = this.db.prepare('SELECT user_id, expires_at, used_at FROM tokens WHERE id = ? AND kind = ?').get(hash, kind) as
      | { user_id: string; expires_at: number; used_at: number | null }
      | undefined
    if (!row) throw new HttpError(400, 'This link is not valid. Request a new one.', 'token_invalid')
    if (row.used_at) throw new HttpError(400, 'This link has already been used. Request a new one.', 'token_used')
    if (row.expires_at < Date.now()) throw new HttpError(400, 'This link has expired. Request a new one.', 'token_expired')
    this.db.prepare('UPDATE tokens SET used_at = ? WHERE id = ?').run(Date.now(), hash)
    return { user_id: row.user_id }
  }

  // ---------- google identity ----------

  /**
   * Find or create the account behind a verified Google identity.
   *   - identity already linked → that account
   *   - email matches an existing account → link (Google verified the address,
   *     so this is the same person; a password-only account gains Google sign-in)
   *   - otherwise → new account, already verified, no password
   */
  userForGoogleIdentity(identity: { sub: string; email: string; emailVerified: boolean; givenName: string; familyName: string }, termsVersion: string | null): UserRow {
    if (!identity.emailVerified) throw new HttpError(403, 'Google reports this email address as unverified.', 'google_email_unverified')
    const email = normalizeEmail(identity.email)
    const linked = this.db.prepare("SELECT user_id FROM identities WHERE provider = 'google' AND subject = ?").get(identity.sub) as { user_id: string } | undefined
    if (linked) return this.findUserById(linked.user_id)!
    const now = Date.now()
    let user = this.findUserByEmail(email)
    if (!user) {
      const id = newId('user')
      this.db
        .prepare(
          `INSERT INTO users (id, email, email_verified, password_hash, first_name, last_name, company, created_at, terms_accepted_at, terms_version)
           VALUES (?, ?, 1, NULL, ?, ?, '', ?, ?, ?)`
        )
        .run(id, email, identity.givenName, identity.familyName, now, now, termsVersion)
      user = this.findUserById(id)!
    } else if (user.email_verified !== 1) {
      this.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id)
      user = this.findUserById(user.id)!
    }
    this.db.prepare("INSERT INTO identities (provider, subject, user_id, email, created_at) VALUES ('google', ?, ?, ?, ?)").run(identity.sub, user.id, email, now)
    return user
  }
}
