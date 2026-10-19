import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './db.ts'
import { ProjectStore } from './projectStore.ts'
import { accountRoutes } from './account.ts'
import { AuthService, normalizeEmail } from './auth.ts'
import { DevMailer, GmailMailer, ResendMailer, type Mailer } from './mailer.ts'
import { createGoogleClient, type GoogleClient } from './google.ts'
import { createDraftService, DraftError, DraftRequestSchema, unsupportedAmounts, type DraftService } from './ai.ts'
import type { ServerConfig } from './config.ts'
import { HttpError, RateLimiter, empty, isCrossSiteWrite, json, redirect, serializeCookie, toRequest, writeResponse, type Request, type Response } from './http.ts'
import { newToken, openSecret, sealSecret } from './crypto.ts'
import { createQuickBooksClient, migrateQuickBooksLink, syncLedger, QuickBooksReconnectError, QuickBooksUnauthorizedError, type QuickBooksClient, type QuickBooksTokens } from './quickbooks.ts'
import { entitlementsFor, isPlan, monthStart, planOf, PLAN_LIMITS, type Plan } from './plans.ts'
import { checkRepeat, repeatMessage, rowFingerprint } from './uploads.ts'
import { authorizedDraftFacts } from './caseFacts.ts'
import { createBilling } from './billing.ts'
import { createStripeClient, type StripeApi } from './stripe.ts'
import { createGmailClient, createGmailRoutes, type GmailClient } from './gmail.ts'
import { OnboardingProfileSchema } from './onboarding.ts'

const SESSION_COOKIE = 'reclaim_session'
const OAUTH_STATE_COOKIE = 'reclaim_oauth_state'
const QBO_STATE_COOKIE = 'reclaim_qbo_state'
const QBO_PATH = '/api/integrations/quickbooks'

export interface AppDependencies {
  config: ServerConfig
  db?: DatabaseSync
  mailer?: Mailer
  google?: GoogleClient | null
  drafts?: DraftService | null
  quickbooks?: QuickBooksClient | null
  /** Stripe (tests pass FakeStripe). Defaults to the REST client when STRIPE_SECRET_KEY is set. */
  stripe?: StripeApi | null
  gmail?: GmailClient | null
  /** The clock Gmail follow-ups are timed by (tests). */
  now?: () => number
  /** Directory of built static files to serve alongside the API (production). */
  staticDir?: string | null
}

export interface App {
  server: Server
  db: DatabaseSync
  auth: AuthService
  mailer: Mailer
  /** Resolves when background success-fee billing has caught up (tests). */
  billingIdle(): Promise<void>
  listen(port?: number): Promise<number>
  close(): Promise<void>
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

export function createApp(deps: AppDependencies): App {
  const { config } = deps
  const db = deps.db ?? openDatabase(config.databasePath)
  const projects = new ProjectStore(db, config.dataKeys)
  const sealedNow = projects.migrate()
  if (sealedNow) console.log(`  encrypted ${sealedNow} stored audits at rest`)
  const mailer = deps.mailer ?? (config.resend ? new ResendMailer(config.resend.apiKey, config.resend.from) : config.gmail ? new GmailMailer(config.gmail.user, config.gmail.appPassword) : new DevMailer(db))
  const google = deps.google !== undefined ? deps.google : config.google ? createGoogleClient(config.google.clientId, config.google.clientSecret) : null
  const drafts = deps.drafts !== undefined ? deps.drafts : config.anthropicApiKey ? createDraftService(config.anthropicApiKey, config.anthropicModel) : null
  const quickbooks = deps.quickbooks !== undefined ? deps.quickbooks : config.quickbooks ? createQuickBooksClient(config.quickbooks.clientId, config.quickbooks.clientSecret, fetch, config.quickbooks.environment) : null
  const auth = new AuthService(db, mailer, {
    appOrigin: config.appOrigin,
    requireEmailVerification: config.requireEmailVerification,
    sessionMs: config.sessionDays * 24 * 60 * 60 * 1000,
    rememberMeMs: config.rememberMeDays * 24 * 60 * 60 * 1000,
  })
  const credentialLimiter = new RateLimiter(20, 60 * 1000)
  // Per address, whatever IP asks: stops password guessing spread over many IPs,
  // and stops anyone using Reclaim to flood someone's inbox with its emails.
  const loginEmailLimiter = new RateLimiter(10, 15 * 60 * 1000)
  const mailLimiter = new RateLimiter(5, 60 * 60 * 1000)
  const draftLimiter = new RateLimiter(30, 60 * 60 * 1000)
  const contactLimiter = new RateLimiter(5, 60 * 60 * 1000)
  const quickbooksSyncLimiter = new RateLimiter(20, 60 * 60 * 1000)
  const gmailSendLimiter = new RateLimiter(30, 60 * 60 * 1000)
  const gmailClient = deps.gmail !== undefined ? deps.gmail : config.gmailSend ? createGmailClient(config.gmailSend.clientId, config.gmailSend.clientSecret) : null
  const gmailRoutes = createGmailRoutes({ db, appOrigin: config.appOrigin, production: config.production, gmail: gmailClient && config.gmailSend ? { client: gmailClient, tokenKey: config.gmailSend.tokenKey } : null, userFor: (req) => auth.userForSession(req.cookies[SESSION_COOKIE]), getProject: (userId, projectId) => projects.get(userId, projectId), allowSend: (id) => gmailSendLimiter.check(`gmail:${id}`), now: deps.now })

  const sessionCookie = (token: string, maxAge: number) => serializeCookie(SESSION_COOKIE, token, { maxAge, secure: config.production })
  const clearSessionCookie = () => serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: config.production })
  const publicUser = (row: NonNullable<ReturnType<AuthService['findUserById']>>) => auth.toPublic(row)

  const requireUser = (req: Request) => {
    const user = auth.userForSession(req.cookies[SESSION_COOKIE])
    if (!user) throw new HttpError(401, 'You need to log in.', 'unauthenticated')
    return user
  }
  // Plan usage is counted from audit_starts: one row per audit the server
  // accepted, stamped with the server's clock. Deleting an audit does not
  // delete its start, and nothing the client sends (a back-dated createdAt)
  // can move a start out of the current month.
  const auditsThisMonth = (userId: string) =>
    (db.prepare('SELECT COUNT(*) AS n FROM audit_starts WHERE user_id = ? AND started_at >= ?').get(userId, monthStart()) as { n: number }).n
  const entitlements = (user: { id: string; plan: string }) => entitlementsFor(planOf(user.plan), auditsThisMonth(user.id))

  // Free-track repeat uploads: every payment row an account has uploaded, and which audit it went to.
  const projectFingerprints = (project: Record<string, unknown>): string[] => {
    const records = ((project.environment as { records?: unknown[] }).records ?? []) as Array<Record<string, unknown>>
    return records
      .filter((r) => typeof r.vendor === 'string' && typeof r.amountPaid === 'number' && typeof r.paymentDate === 'string')
      .map((r) => rowFingerprint({ vendor: r.vendor as string, invoiceNumber: (r.invoiceNumber as string | null) ?? null, paymentDate: r.paymentDate as string, amountPaid: r.amountPaid as number }))
  }
  const assertNotRepeat = (user: { id: string; plan: string }, projectId: string, fingerprints: string[]) => {
    if (!PLAN_LIMITS[planOf(user.plan)].blocksRepeatUploads) return
    const owner = db.prepare('SELECT project_id FROM upload_rows WHERE user_id = ? AND fingerprint = ?')
    // Only rows new to this audit are judged; re-saving an audit's own rows is not an upload.
    const fresh = fingerprints.filter((fp) => (owner.get(user.id, fp) as { project_id: string } | undefined)?.project_id !== projectId)
    const check = checkRepeat(fresh, (fp) => owner.get(user.id, fp) !== undefined)
    if (check.repeat) throw new HttpError(409, repeatMessage(check), 'repeat_upload', { feature: 'repeat_upload' })
  }
  const rememberUpload = (userId: string, projectId: string, fingerprints: string[]) => {
    const insert = db.prepare('INSERT OR IGNORE INTO upload_rows (user_id, fingerprint, project_id, first_seen) VALUES (?, ?, ?, ?)')
    const now = Date.now()
    for (const fp of new Set(fingerprints)) insert.run(userId, fp, projectId, now)
  }
  const recordAuditStart = (userId: string, projectId: string) =>
    db.prepare('INSERT INTO audit_starts (user_id, project_id, started_at) VALUES (?, ?, ?)').run(userId, projectId, Date.now())
  const requireJson = (req: Request) => {
    if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON.')
  }
  const limit = (limiter: RateLimiter, key: string) => {
    if (!limiter.check(key)) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.', 'rate_limited')
  }

  // QuickBooks Online (read-only; sandbox or production per QBO_ENVIRONMENT). Tokens are sealed at rest under a
  // key from the environment; they are never logged and never sent to the browser.
  const qbo = quickbooks && config.quickbooks ? { client: quickbooks, key: config.quickbooks.tokenKey } : null
  const qboRedirectUri = `${config.appOrigin}${QBO_PATH}/callback`
  migrateQuickBooksLink(db)
  type ConnectionRow = { realm_id: string; company_name: string; tokens_sealed: string; connected_at: number; last_sync_at: number | null; linked_project_id: string | null }
  const sealContext = (userId: string, realmId: string) => `quickbooks:${userId}:${realmId}`
  const qboConnection = (userId: string) =>
    db.prepare("SELECT realm_id, company_name, tokens_sealed, connected_at, last_sync_at, linked_project_id FROM integration_connections WHERE user_id = ? AND provider = 'quickbooks'").get(userId) as ConnectionRow | undefined
  const dropQboConnection = (userId: string) => db.prepare("DELETE FROM integration_connections WHERE user_id = ? AND provider = 'quickbooks'").run(userId)
  const qboTokens = (userId: string, row: ConnectionRow): QuickBooksTokens => {
    try {
      return JSON.parse(openSecret(row.tokens_sealed, qbo!.key, sealContext(userId, row.realm_id))) as QuickBooksTokens
    } catch {
      // Wrong key, altered row, or a row moved between accounts: never usable.
      throw new QuickBooksReconnectError('Stored QuickBooks tokens could not be opened.')
    }
  }
  /** Tells Intuit to cancel the connection. Deleting the sealed tokens afterwards still ends Reclaim's access if this fails. */
  const revokeQuickBooks = async (userId: string) => {
    const row = qboConnection(userId)
    if (!row || !qbo) return
    try {
      await qbo.client.revoke(qboTokens(userId, row).refreshToken)
    } catch (err) {
      console.error('quickbooks revoke failed:', err instanceof Error ? err.message : 'unknown error')
    }
  }
  const billing = createBilling({ db, auth, requireUser, stripe: deps.stripe !== undefined ? deps.stripe : config.stripe ? createStripeClient(config.stripe.secretKey) : null, webhookSecret: config.stripe?.webhookSecret ?? null })
  const revokeIntegrations = async (userId: string) => {
    await revokeQuickBooks(userId)
    await gmailRoutes.revoke(userId)
  }
  const accountContext = { db, projects, requireUser, publicUser, clearSessionCookie, revokeIntegrations, endSubscription: billing.closeAccount }
  /** A usable access token, refreshed and re-sealed when it is about to expire (or when `force`d after a 401). */
  async function qboAccessToken(userId: string, row: ConnectionRow, force = false): Promise<string> {
    const tokens = qboTokens(userId, row)
    if (!force && tokens.accessExpiresAt - Date.now() > 60_000) return tokens.accessToken
    const fresh = await qbo!.client.refresh(tokens.refreshToken)
    db.prepare("UPDATE integration_connections SET tokens_sealed = ? WHERE user_id = ? AND provider = 'quickbooks'")
      .run(sealSecret(JSON.stringify(fresh), qbo!.key, sealContext(userId, row.realm_id)), userId)
    return fresh.accessToken
  }

  async function route(req: Request): Promise<Response> {
    const path = req.url.pathname
    const method = req.method
    if (isCrossSiteWrite(req, config.appOrigin, config.production)) throw new HttpError(403, 'This request came from another site.', 'cross_site')

    // ---------- discovery ----------
    if (path === '/api/auth/providers' && method === 'GET') {
      return json(200, { google: google !== null, ai: drafts !== null, emailDelivery: mailer.kind, requireEmailVerification: config.requireEmailVerification, devMailbox: config.devMailbox })
    }

    // ---------- landing-site contact form ----------
    if (path === '/api/contact' && method === 'POST') {
      requireJson(req)
      limit(contactLimiter, `contact:${req.ip}`)
      const body = await req.json<Record<string, unknown>>()
      const text = (key: string, max: number) => (typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, max) : '')
      const name = text('name', 120)
      const email = text('email', 254)
      const role = text('role', 80)
      const message = text('message', 4000)
      const systems = Array.isArray(body.systems) ? body.systems.filter((s): s is string => typeof s === 'string').slice(0, 12).map((s) => s.slice(0, 60)) : []
      const kind = body.kind === 'audit' ? 'Get started' : 'Talk to us'
      const fields: Record<string, string> = {}
      if (!name) fields.name = 'Please enter your name.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = 'Please enter a valid work email.'
      if (!role) fields.role = 'Please select your role.'
      if (Object.keys(fields).length) return json(400, { message: 'Check the highlighted fields.', code: 'validation', fields })
      // Header-safe: no line breaks in the subject.
      const subject = `${kind}: ${name} (${role})`.replace(/[\r\n]+/g, ' ')
      await mailer.send({
        to: config.contactEmail,
        replyTo: email,
        subject,
        body: [`${kind} form on the Reclaim website`, '', `Name: ${name}`, `Email: ${email}`, `Role: ${role}`, `Systems: ${systems.join(', ') || '—'}`, '', message ? `Message:\n${message}` : 'No message.'].join('\n'),
      })
      return json(200, { ok: true })
    }

    // ---------- email/password ----------
    if (path === '/api/auth/signup' && method === 'POST') {
      requireJson(req)
      limit(credentialLimiter, `signup:${req.ip}`)
      const body = await req.json<Record<string, unknown>>()
      const fields = auth.validateSignUp(body)
      if (Object.keys(fields).length) return json(400, { message: 'Check the highlighted fields.', code: 'validation', fields })
      limit(mailLimiter, `signup:${normalizeEmail(body.email as string)}`)
      const result = await auth.signUp({
        firstName: body.firstName as string,
        lastName: body.lastName as string,
        email: body.email as string,
        company: body.company as string,
        password: body.password as string,
        termsVersion: typeof body.termsVersion === 'string' ? body.termsVersion : null,
      })
      if (result.sessionUserId) {
        const session = auth.createSession(result.sessionUserId, false)
        return json(201, { requiresVerification: false, user: result.user }, { 'Set-Cookie': sessionCookie(session.token, session.maxAgeSeconds) })
      }
      return json(201, { requiresVerification: result.requiresVerification, email: normalizeEmail(body.email as string) })
    }

    if (path === '/api/auth/verify-email' && method === 'POST') {
      requireJson(req)
      const { token } = await req.json<{ token?: string }>()
      const user = auth.verifyEmail(token ?? '')
      const session = auth.createSession(user.id, false)
      return json(200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(session.token, session.maxAgeSeconds) })
    }

    if (path === '/api/auth/resend-verification' && method === 'POST') {
      requireJson(req)
      limit(credentialLimiter, `resend:${req.ip}`)
      const { email } = await req.json<{ email?: string }>()
      // Over the per-address limit nothing is sent, and the answer is the same.
      if (typeof email === 'string' && mailLimiter.check(`resend:${normalizeEmail(email)}`)) await auth.resendVerification(email)
      return json(200, { ok: true })
    }

    if (path === '/api/auth/login' && method === 'POST') {
      requireJson(req)
      limit(credentialLimiter, `login:${req.ip}`)
      const { email, password, rememberMe } = await req.json<{ email?: string; password?: string; rememberMe?: boolean }>()
      if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Enter your email and password.')
      limit(loginEmailLimiter, `login:${normalizeEmail(email)}`)
      const user = await auth.logIn(email, password)
      const session = auth.createSession(user.id, rememberMe === true)
      return json(200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(session.token, session.maxAgeSeconds) })
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      auth.revokeSession(req.cookies[SESSION_COOKIE])
      return json(200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = auth.userForSession(req.cookies[SESSION_COOKIE])
      if (!user) return json(401, { message: 'Not logged in.', code: 'unauthenticated' }, { 'Set-Cookie': clearSessionCookie() })
      return json(200, { user: publicUser(user) })
    }

    if (path === '/api/auth/forgot-password' && method === 'POST') {
      requireJson(req)
      limit(credentialLimiter, `forgot:${req.ip}`)
      const { email } = await req.json<{ email?: string }>()
      if (typeof email === 'string' && email.trim() && mailLimiter.check(`forgot:${normalizeEmail(email)}`)) await auth.requestPasswordReset(email)
      // Same answer whether or not the address is registered.
      return json(200, { ok: true })
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
      requireJson(req)
      limit(credentialLimiter, `reset:${req.ip}`)
      const { token, password, confirmPassword } = await req.json<{ token?: string; password?: string; confirmPassword?: string }>()
      const user = await auth.resetPassword(token ?? '', password ?? '', confirmPassword ?? '')
      const session = auth.createSession(user.id, false)
      return json(200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(session.token, session.maxAgeSeconds) })
    }

    // ---------- google sign-in ----------
    if (path === '/api/auth/google' && method === 'GET') {
      if (!google) throw new HttpError(503, 'Google sign-in is not configured on this server.', 'google_unavailable')
      const { token: state } = newToken()
      const url = google.authorizationUrl({ redirectUri: `${config.appOrigin}/api/auth/google/callback`, state })
      return redirect(url, { 'Set-Cookie': serializeCookie(OAUTH_STATE_COOKIE, state, { maxAge: 600, secure: config.production }) })
    }

    if (path === '/api/auth/google/callback' && method === 'GET') {
      const clearState = serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0, secure: config.production })
      const back = (error: string) => redirect(`/login?error=${error}`, { 'Set-Cookie': clearState })
      if (!google) return back('google_unavailable')
      const params = req.url.searchParams
      const error = params.get('error')
      if (error === 'access_denied') return back('google_cancelled')
      if (error) return back('google_failed')
      const code = params.get('code')
      const state = params.get('state')
      if (!code || !state || state !== req.cookies[OAUTH_STATE_COOKIE]) return back('google_state')
      try {
        const identity = await google.exchangeCode({ code, redirectUri: `${config.appOrigin}/api/auth/google/callback` })
        const user = auth.userForGoogleIdentity(identity, null)
        const session = auth.createSession(user.id, true)
        return redirect('/audit', { 'Set-Cookie': [sessionCookie(session.token, session.maxAgeSeconds), clearState] })
      } catch (err) {
        if (err instanceof HttpError && err.code === 'google_email_unverified') return back('google_email_unverified')
        console.error('google sign-in failed:', err instanceof Error ? err.message : 'unknown error')
        return back('google_failed')
      }
    }

    // ---------- QuickBooks Online (read-only) ----------
    if (path === QBO_PATH && method === 'GET') {
      const user = requireUser(req)
      if (!qbo) return json(200, { available: false })
      const row = qboConnection(user.id)
      return json(200, { available: true, environment: qbo.client.environment, connected: Boolean(row), companyName: row?.company_name ?? null, connectedAt: row?.connected_at ?? null, lastSyncAt: row?.last_sync_at ?? null, linkedAuditId: row?.linked_project_id ?? null })
    }

    if (path === `${QBO_PATH}/connect` && method === 'GET') {
      const user = auth.userForSession(req.cookies[SESSION_COOKIE])
      if (!user) return redirect('/login?next=%2Faudit%3Fentry%3Dupload')
      if (!qbo) return redirect('/audit?entry=upload&quickbooks=unavailable')
      const { token: state } = newToken()
      const url = qbo.client.authorizationUrl({ redirectUri: qboRedirectUri, state })
      // The state names the account that started, so a callback can only finish its own user's connection.
      return redirect(url, { 'Set-Cookie': serializeCookie(QBO_STATE_COOKIE, `${state}.${user.id}`, { maxAge: 600, secure: config.production, path: QBO_PATH }) })
    }

    if (path === `${QBO_PATH}/callback` && method === 'GET') {
      const clearState = serializeCookie(QBO_STATE_COOKIE, '', { maxAge: 0, secure: config.production, path: QBO_PATH })
      const back = (status: string) => redirect(`/audit?entry=upload&quickbooks=${status}`, { 'Set-Cookie': clearState })
      if (!qbo) return back('unavailable')
      const user = auth.userForSession(req.cookies[SESSION_COOKIE])
      if (!user) return back('signed_out')
      const params = req.url.searchParams
      if (params.get('error') === 'access_denied') return back('cancelled')
      if (params.get('error')) return back('failed')
      const code = params.get('code')
      const state = params.get('state')
      const realmId = params.get('realmId')
      const expected = req.cookies[QBO_STATE_COOKIE]
      if (!code || !state || !realmId || !/^\d+$/.test(realmId) || !expected || expected !== `${state}.${user.id}`) return back('state')
      try {
        const tokens = await qbo.client.exchangeCode({ code, redirectUri: qboRedirectUri })
        const company = await qbo.client.companyInfo(realmId, tokens.accessToken)
        const companyName = typeof company.CompanyName === 'string' ? company.CompanyName.slice(0, 200) : ''
        db.prepare(`INSERT INTO integration_connections (user_id, provider, realm_id, company_name, tokens_sealed, connected_at, last_sync_at)
          VALUES (?, 'quickbooks', ?, ?, ?, ?, NULL)
          ON CONFLICT(user_id, provider) DO UPDATE SET
            -- Reconnecting the same company keeps its audit; a different company starts unlinked.
            linked_project_id = CASE WHEN integration_connections.realm_id = excluded.realm_id THEN integration_connections.linked_project_id ELSE NULL END,
            realm_id = excluded.realm_id, company_name = excluded.company_name,
            tokens_sealed = excluded.tokens_sealed, connected_at = excluded.connected_at, last_sync_at = NULL`)
          .run(user.id, realmId, companyName, sealSecret(JSON.stringify(tokens), qbo.key, sealContext(user.id, realmId)), Date.now())
        return back('connected')
      } catch (err) {
        console.error('quickbooks connect failed:', err instanceof Error ? err.message : 'unknown error')
        return back('failed')
      }
    }

    if (path === `${QBO_PATH}/sync` && method === 'POST') {
      const user = requireUser(req)
      if (!qbo) throw new HttpError(503, 'QuickBooks is not set up on this server.', 'quickbooks_unavailable')
      limit(quickbooksSyncLimiter, user.id)
      const row = qboConnection(user.id)
      if (!row) throw new HttpError(409, 'Connect QuickBooks first.', 'quickbooks_not_connected')
      // The client says when it last pulled this company into the audit it is importing into; recent enough means only changes.
      const body = await req.json<{ since?: unknown }>().catch(() => ({}) as { since?: unknown })
      const since = typeof body.since === 'number' && Number.isFinite(body.since) ? body.since : null
      // Taken before reading, so anything changed during the pull is picked up next time.
      const pulledAt = Date.now()
      try {
        let accessToken = await qboAccessToken(user.id, row)
        let result
        try {
          result = await syncLedger(qbo.client, row.realm_id, accessToken, since, pulledAt)
        } catch (err) {
          if (!(err instanceof QuickBooksUnauthorizedError)) throw err
          accessToken = await qboAccessToken(user.id, qboConnection(user.id)!, true)
          result = await syncLedger(qbo.client, row.realm_id, accessToken, since, pulledAt)
        }
        db.prepare("UPDATE integration_connections SET last_sync_at = ? WHERE user_id = ? AND provider = 'quickbooks'").run(Date.now(), user.id)
        return json(200, { companyName: row.company_name, ...result })
      } catch (err) {
        if (err instanceof QuickBooksReconnectError || err instanceof QuickBooksUnauthorizedError) {
          dropQboConnection(user.id)
          throw new HttpError(409, 'QuickBooks needs to be connected again.', 'quickbooks_reconnect')
        }
        console.error('quickbooks sync failed:', err instanceof Error ? err.message : 'unknown error')
        throw new HttpError(502, 'QuickBooks didn’t respond as expected. Try again in a minute.', 'quickbooks_failed')
      }
    }

    // Which audit this connection keeps up to date when the user signs in.
    if (path === `${QBO_PATH}/link` && method === 'POST') {
      const user = requireUser(req)
      requireJson(req)
      const { auditId } = await req.json<{ auditId?: unknown }>()
      if (typeof auditId !== 'string' || !/^[\w-]{1,100}$/.test(auditId)) throw new HttpError(400, 'Send the audit to link.')
      if (!qboConnection(user.id)) throw new HttpError(409, 'Connect QuickBooks first.', 'quickbooks_not_connected')
      db.prepare("UPDATE integration_connections SET linked_project_id = ? WHERE user_id = ? AND provider = 'quickbooks'").run(auditId, user.id)
      return json(200, { ok: true, linkedAuditId: auditId })
    }

    if (path === `${QBO_PATH}/disconnect` && method === 'POST') {
      const user = requireUser(req)
      await revokeQuickBooks(user.id)
      dropQboConnection(user.id)
      return json(200, { ok: true })
    }

    // ---------- billing (server/billing.ts) ----------
    const billed = await billing.route(req)
    if (billed) return billed

    // ---------- data rights: export, delete account, accept changed terms (account.ts) ----------
    const accountResponse = await accountRoutes(req, accountContext)
    if (accountResponse) return accountResponse

    // ---------- plan / entitlements ----------
    if (path === '/api/account/entitlements' && method === 'GET') {
      const user = requireUser(req)
      return json(200, entitlements(user))
    }

    if (path === '/api/account/onboarding-seen' && method === 'POST') {
      const user = requireUser(req)
      auth.markOnboardingSeen(user.id)
      return json(200, { user: publicUser(auth.findUserById(user.id)!) })
    }

    if (path === '/api/account/tour-seen' && method === 'POST') {
      const user = requireUser(req)
      auth.markTourSeen(user.id)
      return json(200, { user: publicUser(auth.findUserById(user.id)!) })
    }

    if (path === '/api/account/onboarding' && method === 'POST') {
      const user = requireUser(req)
      requireJson(req)
      const parsed = OnboardingProfileSchema.safeParse(await req.json())
      if (!parsed.success) throw new HttpError(400, 'Some onboarding answers were not recognised.', 'validation')
      auth.saveOnboarding(user.id, parsed.data)
      return json(200, { user: publicUser(auth.findUserById(user.id)!) })
    }

    // Upgrading is not wired to any payment yet. This endpoint exists so the
    // client has one honest place to ask, and the answer is "not yet".
    if (path === '/api/account/upgrade' && method === 'POST') {
      requireUser(req)
      return json(501, { message: 'Paid plans are coming soon. No payment was taken.', code: 'coming_soon' })
    }

    // Development only: flip an account's plan to exercise the Pro surface.
    if (path === '/api/dev/plan' && method === 'POST') {
      if (!config.devMailbox) throw new HttpError(404, 'Not found.')
      const user = requireUser(req)
      requireJson(req)
      const { plan } = await req.json<{ plan?: unknown }>()
      if (!isPlan(plan)) throw new HttpError(400, 'plan must be "free", "growth" or "flat".')
      auth.setPlan(user.id, plan as Plan)
      return json(200, { user: publicUser(auth.findUserById(user.id)!), entitlements: entitlements({ id: user.id, plan }) })
    }

    // ---------- account data ----------
    if (path === '/api/projects' && method === 'GET') {
      const user = requireUser(req)
      return json(200, { projects: projects.list(user.id) })
    }

    const projectMatch = path.match(/^\/api\/projects\/([\w-]+)$/)
    if (projectMatch && method === 'PUT') {
      const user = requireUser(req)
      requireJson(req)
      const project = await req.json<Record<string, unknown>>()
      if (project.id !== projectMatch[1] || !isProjectShape(project)) throw new HttpError(400, 'Malformed project.')
      // Check, count and store with no await in between, so two concurrent
      // uploads cannot both slip under the limit.
      const isNew = !projects.exists(user.id, project.id as string)
      if (isNew && !entitlements(user).canStartAudit) {
        const limit = PLAN_LIMITS[planOf(user.plan)].auditsPerMonth
        throw new HttpError(402, `The Free plan includes ${limit} audits a month. Upgrade to Pro for unlimited audits.`, 'plan_limit', { feature: 'audits' })
      }
      const fingerprints = projectFingerprints(project)
      assertNotRepeat(user, project.id as string, fingerprints)
      if (isNew) recordAuditStart(user.id, project.id as string)
      projects.upsert(user.id, project)
      rememberUpload(user.id, project.id as string, fingerprints)
      billing.recordRecoveries(user.id, project)
      return json(200, { ok: true })
    }
    if (projectMatch && method === 'DELETE') {
      const user = requireUser(req)
      projects.delete(user.id, projectMatch[1])
      return json(200, { ok: true })
    }

    if (path === '/api/projects/import' && method === 'POST') {
      const user = requireUser(req)
      requireJson(req)
      const { projects: incoming } = await req.json<{ projects?: Array<Record<string, unknown>> }>()
      if (!Array.isArray(incoming)) throw new HttpError(400, 'Send projects to import.')
      const imported: string[] = []
      const skipped: string[] = []
      // Past the plan's monthly limit: not stored, and reported so the client keeps its local copy.
      const blocked: string[] = []
      for (const project of incoming) {
        if (typeof project.id !== 'string' || !/^[\w-]+$/.test(project.id) || !isProjectShape(project)) {
          throw new HttpError(400, 'Malformed project.')
        }
      }
      for (const project of incoming) {
        const id = project.id as string
        if (projects.exists(user.id, id)) {
          skipped.push(id)
          continue
        }
        const fingerprints = projectFingerprints(project)
        if (!entitlements(user).canStartAudit) {
          blocked.push(id)
          continue
        }
        try {
          assertNotRepeat(user, id, fingerprints)
        } catch {
          blocked.push(id)
          continue
        }
        recordAuditStart(user.id, id)
        projects.upsert(user.id, project)
        rememberUpload(user.id, id, fingerprints)
        billing.recordRecoveries(user.id, project, { imported: true })
        imported.push(id)
      }
      return json(200, { imported, skipped, blocked })
    }

    // ---------- ai drafting ----------
    if (path === '/api/ai/draft' && method === 'POST') {
      const user = requireUser(req)
      if (!entitlements(user).limits.aiDrafts) throw new HttpError(402, 'AI recovery drafts are part of the Pro plan.', 'plan_limit', { feature: 'ai' })
      if (!drafts) throw new HttpError(503, 'AI drafting is not configured on this server.', 'ai_unavailable')
      requireJson(req)
      limit(draftLimiter, `draft:${user.id}`)
      const parsed = DraftRequestSchema.safeParse(await req.json())
      if (!parsed.success) throw new HttpError(400, 'The case data is malformed.', 'validation')
      const { projectId, findingId, ...clientFacts } = parsed.data
      const facts = authorizedDraftFacts(projects.get(user.id, projectId), findingId, clientFacts.amountRequested)
      if (!facts.ok) throw new HttpError(403, facts.reason, 'recovery_not_authorized')
      // Only the reviewer's tone/context and sender may come from the browser.
      const request = { ...facts.facts, userContext: clientFacts.userContext, sender: clientFacts.sender }
      let draft
      try {
        draft = await drafts.draft(request)
      } catch (err) {
        const code = err instanceof DraftError ? err.code : 'ai_failed'
        console.error('ai draft failed:', code)
        throw new HttpError(502, err instanceof DraftError ? err.message : 'AI drafting failed. The generated letter is still there.', code)
      }
      if (unsupportedAmounts(draft, request).length > 0) {
        throw new HttpError(502, 'The AI draft mentioned an amount that is not in the records, so it was discarded. Use the generated letter or try again.', 'ai_unsupported_amount')
      }
      return json(200, draft)
    }

    // ---------- dev mailbox ----------
    if (path === '/api/dev/mailbox' && method === 'GET') {
      if (!config.devMailbox) throw new HttpError(404, 'Not found.')
      const to = req.url.searchParams.get('to')
      if (!to) throw new HttpError(400, 'Which address?')
      const rows = db.prepare('SELECT id, to_email, subject, body, link, created_at FROM mailbox WHERE to_email = ? ORDER BY id DESC LIMIT 20').all(normalizeEmail(to))
      return json(200, { messages: rows })
    }

    const gmailResponse = await gmailRoutes.route(req)
    if (gmailResponse) return gmailResponse

    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found.')

    // ---------- static site (production) ----------
    if (deps.staticDir && method === 'GET') return serveStatic(deps.staticDir, path)
    throw new HttpError(404, 'Not found.')
  }

  const server = createServer(async (rawReq, rawRes) => {
    const options = { noStore: (rawReq.url ?? '').startsWith('/api/'), hsts: config.production }
    try {
      const req = await toRequest(rawReq, { trustProxy: config.trustProxy })
      const response = await route(req)
      writeResponse(rawRes, response, options)
    } catch (err) {
      if (err instanceof HttpError) {
        writeResponse(rawRes, json(err.status, { message: err.message, code: err.code, fields: err.fields }), options)
        return
      }
      // Never echo the error object: it could contain a token or a body.
      console.error('unhandled server error:', err instanceof Error ? err.message : 'unknown')
      writeResponse(rawRes, json(500, { message: 'Something went wrong on our side.', code: 'server_error' }), options)
    }
  })

  return {
    server,
    db,
    auth,
    mailer,
    billingIdle: () => billing.idle(),
    listen(port = config.port) {
      return new Promise((resolve) => server.listen(port, () => resolve((server.address() as { port: number }).port)))
    },
    close() {
      return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    },
  }
}

/**
 * Just enough structure that every client can revive what it pulls back: a
 * stored `environment: null` would otherwise break the account's audit list
 * on every device the next time it loads.
 */
function isProjectShape(project: Record<string, unknown>): boolean {
  const env = project.environment as Record<string, unknown> | null
  if (typeof project.name !== 'string' || project.name.length > 300) return false
  if (!env || typeof env !== 'object' || Array.isArray(env)) return false
  const result = env.result as Record<string, unknown> | null
  return Array.isArray(env.records) && !!result && typeof result === 'object' && Array.isArray(result.findings)
}

function serveStatic(root: string, urlPath: string): Response {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    throw new HttpError(400, 'Bad request.')
  }
  const base = resolve(root)
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const candidates = [join(base, safe), join(base, safe, 'index.html')]
  for (const file of candidates) {
    if (file !== base && !file.startsWith(base + sep)) continue
    if (existsSync(file) && statSync(file).isFile()) {
      return { status: 200, headers: { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }, body: readFileSync(file) }
    }
  }
  // Not index.html: in the build that is the marketing home (scripts/landingSitePlugin.ts).
  // 404.html is the React app, which renders its "Page not found" for any path it doesn't route.
  const notFound = join(base, '404.html')
  if (existsSync(notFound)) return { status: 404, headers: { 'Content-Type': MIME['.html'] }, body: readFileSync(notFound) }
  return empty(404)
}
