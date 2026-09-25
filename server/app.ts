import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './db.ts'
import { AuthService, normalizeEmail } from './auth.ts'
import { DevMailer, GmailMailer, ResendMailer, type Mailer } from './mailer.ts'
import { createGoogleClient, type GoogleClient } from './google.ts'
import { createDraftService, DraftError, DraftRequestSchema, unsupportedAmounts, type DraftService } from './ai.ts'
import type { ServerConfig } from './config.ts'
import { HttpError, RateLimiter, empty, json, redirect, serializeCookie, toRequest, writeResponse, type Request, type Response } from './http.ts'
import { newToken } from './crypto.ts'
import { entitlementsFor, isPlan, monthStart, planOf, PLAN_LIMITS, type Plan } from './plans.ts'
import { checkRepeat, repeatMessage, rowFingerprint } from './uploads.ts'

const SESSION_COOKIE = 'reclaim_session'
const OAUTH_STATE_COOKIE = 'reclaim_oauth_state'

export interface AppDependencies {
  config: ServerConfig
  db?: DatabaseSync
  mailer?: Mailer
  google?: GoogleClient | null
  drafts?: DraftService | null
  /** Directory of built static files to serve alongside the API (production). */
  staticDir?: string | null
}

export interface App {
  server: Server
  db: DatabaseSync
  auth: AuthService
  mailer: Mailer
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
  const mailer = deps.mailer ?? (config.resend ? new ResendMailer(config.resend.apiKey, config.resend.from) : config.gmail ? new GmailMailer(config.gmail.user, config.gmail.appPassword) : new DevMailer(db))
  const google = deps.google !== undefined ? deps.google : config.google ? createGoogleClient(config.google.clientId, config.google.clientSecret) : null
  const drafts = deps.drafts !== undefined ? deps.drafts : config.anthropicApiKey ? createDraftService(config.anthropicApiKey, config.anthropicModel) : null
  const auth = new AuthService(db, mailer, {
    appOrigin: config.appOrigin,
    requireEmailVerification: config.requireEmailVerification,
    sessionMs: config.sessionDays * 24 * 60 * 60 * 1000,
    rememberMeMs: config.rememberMeDays * 24 * 60 * 60 * 1000,
  })
  const credentialLimiter = new RateLimiter(20, 60 * 1000)
  const draftLimiter = new RateLimiter(30, 60 * 60 * 1000)
  const contactLimiter = new RateLimiter(5, 60 * 60 * 1000)

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

  async function route(req: Request): Promise<Response> {
    const path = req.url.pathname
    const method = req.method

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
      if (typeof email === 'string') await auth.resendVerification(email)
      return json(200, { ok: true })
    }

    if (path === '/api/auth/login' && method === 'POST') {
      requireJson(req)
      limit(credentialLimiter, `login:${req.ip}`)
      const { email, password, rememberMe } = await req.json<{ email?: string; password?: string; rememberMe?: boolean }>()
      if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Enter your email and password.')
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
      if (typeof email === 'string' && email.trim()) await auth.requestPasswordReset(email)
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
        console.error('google sign-in failed:', err instanceof Error ? err.message : err)
        return back('google_failed')
      }
    }

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
      const rows = db.prepare('SELECT payload FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(user.id) as Array<{ payload: string }>
      return json(200, { projects: rows.map((r) => JSON.parse(r.payload)) })
    }

    const projectMatch = path.match(/^\/api\/projects\/([\w-]+)$/)
    if (projectMatch && method === 'PUT') {
      const user = requireUser(req)
      requireJson(req)
      const project = await req.json<Record<string, unknown>>()
      if (project.id !== projectMatch[1] || !isProjectShape(project)) throw new HttpError(400, 'Malformed project.')
      // Check, count and store with no await in between, so two concurrent
      // uploads cannot both slip under the limit.
      const isNew = !db.prepare('SELECT 1 FROM projects WHERE user_id = ? AND id = ?').get(user.id, project.id)
      if (isNew && !entitlements(user).canStartAudit) {
        const limit = PLAN_LIMITS[planOf(user.plan)].auditsPerMonth
        throw new HttpError(402, `The Free plan includes ${limit} audits a month. Upgrade to Pro for unlimited audits.`, 'plan_limit', { feature: 'audits' })
      }
      const fingerprints = projectFingerprints(project)
      assertNotRepeat(user, project.id as string, fingerprints)
      if (isNew) recordAuditStart(user.id, project.id as string)
      upsertProject(db, user.id, project)
      rememberUpload(user.id, project.id as string, fingerprints)
      return json(200, { ok: true })
    }
    if (projectMatch && method === 'DELETE') {
      const user = requireUser(req)
      db.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').run(user.id, projectMatch[1])
      return json(200, { ok: true })
    }

    if (path === '/api/projects/import' && method === 'POST') {
      const user = requireUser(req)
      requireJson(req)
      const { projects } = await req.json<{ projects?: Array<Record<string, unknown>> }>()
      if (!Array.isArray(projects)) throw new HttpError(400, 'Send projects to import.')
      const imported: string[] = []
      const skipped: string[] = []
      // Past the plan's monthly limit: not stored, and reported so the client keeps its local copy.
      const blocked: string[] = []
      for (const project of projects) {
        if (typeof project.id !== 'string' || !/^[\w-]+$/.test(project.id) || !isProjectShape(project)) {
          throw new HttpError(400, 'Malformed project.')
        }
      }
      for (const project of projects) {
        const id = project.id as string
        const exists = db.prepare('SELECT 1 FROM projects WHERE user_id = ? AND id = ?').get(user.id, id)
        if (exists) {
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
        upsertProject(db, user.id, project)
        rememberUpload(user.id, id, fingerprints)
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
      let draft
      try {
        draft = await drafts.draft(parsed.data)
      } catch (err) {
        const code = err instanceof DraftError ? err.code : 'ai_failed'
        console.error('ai draft failed:', code)
        throw new HttpError(502, err instanceof DraftError ? err.message : 'AI drafting failed. The generated letter is still there.', code)
      }
      if (unsupportedAmounts(draft, parsed.data).length > 0) {
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

    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found.')

    // ---------- static site (production) ----------
    if (deps.staticDir && method === 'GET') return serveStatic(deps.staticDir, path)
    throw new HttpError(404, 'Not found.')
  }

  const server = createServer(async (rawReq, rawRes) => {
    const options = { noStore: (rawReq.url ?? '').startsWith('/api/'), hsts: config.production }
    try {
      const req = await toRequest(rawReq)
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

function upsertProject(db: DatabaseSync, userId: string, project: Record<string, unknown>): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO projects (user_id, id, name, source_label, mode, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, source_label = excluded.source_label, mode = excluded.mode, updated_at = excluded.updated_at, payload = excluded.payload`
  ).run(
    userId,
    project.id as string,
    project.name as string,
    typeof project.sourceLabel === 'string' ? project.sourceLabel : '',
    project.mode === 'sample' ? 'sample' : 'upload',
    // Server time: created_at is when this server first stored the audit, whatever the client claims.
    now,
    typeof project.updatedAt === 'number' ? project.updatedAt : now,
    JSON.stringify(project)
  )
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
  const candidates = [join(base, safe), join(base, safe, 'index.html'), join(base, 'index.html')]
  for (const file of candidates) {
    if (file !== base && !file.startsWith(base + sep)) continue
    if (existsSync(file) && statSync(file).isFile()) {
      return { status: 200, headers: { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }, body: readFileSync(file) }
    }
  }
  return empty(404)
}
