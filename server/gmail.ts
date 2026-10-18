/**
 * Sending a recovery request from the customer's own Gmail.
 *
 * Connecting is a separate Google consent from sign-in, asking for
 * `gmail.send` (send mail as the customer; no access to read, search, list or
 * delete anything in the mailbox) plus `openid email`, which only tells
 * Reclaim which address was connected. The refresh token is sealed at rest
 * under GMAIL_TOKEN_KEY; access tokens are minted per send and never stored.
 *
 * A send goes out only for a case the server itself can authorize from the
 * account's saved project (evidence gate, customer approval, amount), and only
 * with the exact subject, message and recipient the customer approved. Each
 * case can be sent once: a row in `gmail_sends` is reserved before Gmail is
 * called, so a double click or a retry can never email a vendor twice.
 */
import type { DatabaseSync } from 'node:sqlite'
import { HttpError, json, redirect, serializeCookie, type Request, type Response } from './http.ts'
import { newToken, openSecret, sealSecret } from './crypto.ts'
import { PLAN_LIMITS, planOf } from './plans.ts'
import { authorizedFollowUpFacts, authorizedSendFacts } from './caseFacts.ts'

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
/** `openid email` identify the connected address; `gmail.send` is the only Gmail permission. */
export const GMAIL_SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE]
export const GMAIL_PATH = '/api/integrations/gmail'
const GMAIL_STATE_COOKIE = 'reclaim_gmail_state'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export interface GmailGrant {
  refreshToken: string
  accessToken: string
  /** The connected Gmail address. */
  email: string
  /** Google's stable account id. */
  sub: string
}

export interface GmailClient {
  authorizationUrl(params: { redirectUri: string; state: string }): string
  exchangeCode(params: { code: string; redirectUri: string }): Promise<GmailGrant>
  /** A fresh access token from the stored refresh token. */
  accessToken(refreshToken: string): Promise<string>
  /** `users.messages.send`, in `threadId`'s conversation when given. Resolves only when Gmail accepted the message. */
  send(accessToken: string, raw: string, threadId?: string | null): Promise<{ id: string; threadId: string | null }>
  revoke(token: string): Promise<void>
}

/** Google no longer accepts the stored grant: the customer has to connect again. */
export class GmailReconnectError extends Error {}
/** The customer unticked the send permission on Google's consent screen. */
export class GmailScopeError extends Error {}
/**
 * A send that failed. `uncertain` means Gmail may have sent it (network
 * failure, server error, no message id): the case is not marked sent, and a
 * retry needs the customer to check their Sent folder first.
 */
export class GmailSendError extends Error {
  readonly kind: 'rejected' | 'uncertain'
  constructor(message: string, kind: 'rejected' | 'uncertain') {
    super(message)
    this.kind = kind
  }
}

export function createGmailClient(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): GmailClient {
  async function token(body: Record<string, string>) {
    const res = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
    })
    // Never include the response body in errors: it can echo token material.
    if (res.status === 400 || res.status === 401) throw new GmailReconnectError(`Google refused the token request (${res.status}).`)
    if (!res.ok) throw new Error(`Google token request failed (${res.status}).`)
    return (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string }
  }

  return {
    authorizationUrl({ redirectUri, state }) {
      const url = new URL(AUTH_ENDPOINT)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GMAIL_SCOPES.join(' '))
      url.searchParams.set('state', state)
      // offline + consent: Google returns a refresh token every time.
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'select_account consent')
      // Deliberately no include_granted_scopes: sign-in and sending stay separate grants.
      return url.toString()
    },
    async exchangeCode({ code, redirectUri }) {
      const tokens = await token({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
      if (!tokens.access_token || !tokens.refresh_token) throw new Error('Google returned no tokens.')
      if (!(tokens.scope ?? '').split(' ').includes(GMAIL_SEND_SCOPE)) {
        await this.revoke(tokens.refresh_token).catch(() => {})
        throw new GmailScopeError('The send permission was not granted.')
      }
      const info = await fetchImpl(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
      if (!info.ok) throw new Error(`Google userinfo failed (${info.status}).`)
      const who = (await info.json()) as { sub?: string; email?: string; email_verified?: boolean }
      if (!who.sub || !who.email || who.email_verified === false) throw new Error('Google did not return a verified address.')
      return { refreshToken: tokens.refresh_token, accessToken: tokens.access_token, email: who.email, sub: who.sub }
    },
    async accessToken(refreshToken) {
      const tokens = await token({ refresh_token: refreshToken, grant_type: 'refresh_token' })
      if (!tokens.access_token) throw new Error('Google returned no access token.')
      return tokens.access_token
    },
    async send(accessToken, raw, threadId) {
      let res: globalThis.Response
      try {
        res = await fetchImpl(SEND_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
        })
      } catch {
        throw new GmailSendError('Gmail didn’t answer, so Reclaim can’t tell whether the email went out.', 'uncertain')
      }
      if (res.status === 401) throw new GmailReconnectError('Gmail refused the access token.')
      if (res.status === 400) throw new GmailSendError('Gmail rejected the message. Check the email addresses and try again.', 'rejected')
      if (res.status === 403 || res.status === 429) throw new GmailSendError('Gmail refused to send right now (a permission or sending limit on your Google account). Nothing was sent.', 'rejected')
      if (!res.ok) throw new GmailSendError(`Gmail had a problem (${res.status}), so Reclaim can’t tell whether the email went out.`, 'uncertain')
      const sent = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string }
      if (!sent.id) throw new GmailSendError('Gmail didn’t return a message id, so Reclaim can’t confirm the email went out.', 'uncertain')
      return { id: sent.id, threadId: sent.threadId ?? null }
    },
    async revoke(t) {
      const res = await fetchImpl(REVOKE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t }) })
      if (!res.ok) throw new Error(`Google revoke failed (${res.status}).`)
    },
  }
}

// ---------- the message ----------

const EMAIL = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/
export const isEmailAddress = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL.test(v)

const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s)
/** RFC 2047 for anything that isn't plain ASCII. */
const encodeWord = (s: string) => (ascii(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`)
const mailbox = (name: string, address: string) => {
  const clean = name.replace(/["\\\r\n]/g, '').trim()
  if (!clean) return address
  return ascii(clean) ? `"${clean}" <${address}>` : `${encodeWord(clean)} <${address}>`
}

export interface OutgoingEmail {
  from: string
  fromName: string
  to: string
  cc: string[]
  subject: string
  body: string
}

/** A plain-text RFC 5322 message, base64url-encoded the way `users.messages.send` takes it. */
export function buildRawMessage(email: OutgoingEmail): string {
  for (const address of [email.from, email.to, ...email.cc]) if (!isEmailAddress(address)) throw new Error('Invalid email address.')
  if (/[\r\n]/.test(email.subject)) throw new Error('A subject cannot contain line breaks.')
  const body = Buffer.from(email.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n')
  const headers = [
    `From: ${mailbox(email.fromName, email.from)}`,
    `To: ${email.to}`,
    ...(email.cc.length ? [`Cc: ${email.cc.join(', ')}`] : []),
    `Subject: ${encodeWord(email.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ]
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url')
}

// ---------- routes ----------

export interface GmailUser {
  id: string
  plan: string
  first_name: string
  last_name: string
}

export interface GmailRouteDeps {
  db: DatabaseSync
  appOrigin: string
  production: boolean
  /** Null when the server has no Google client or no GMAIL_TOKEN_KEY. */
  gmail: { client: GmailClient; tokenKey: Buffer } | null
  /** The signed-in account for this request, or null. */
  userFor(req: Request): GmailUser | null
  /** The account's saved audit, opened (audits are encrypted at rest), or null. */
  getProject(userId: string, projectId: string): Record<string, unknown> | null
  /** Per-account send limiter: true while under the limit. */
  allowSend(userId: string): boolean
  /** The clock, for tests. */
  now?: () => number
}

export interface GmailRoutes {
  route(req: Request): Promise<Response | null>
  /** Cancels the account's Gmail access with Google and deletes it. Never throws. */
  revoke(userId: string): Promise<void>
}

/** Follow-ups per case, and the least time between two emails on one case. */
export const MAX_FOLLOW_UPS = 5
export const MIN_FOLLOW_UP_GAP_MS = 24 * 60 * 60 * 1000

type ConnectionRow = { realm_id: string; company_name: string; tokens_sealed: string; connected_at: number }
type SendStatus = 'sending' | 'sent' | 'uncertain'
type SendRow = { status: SendStatus; message_id: string | null; thread_id: string | null; from_email: string; to_email: string; cc: string; sent_at: number | null }
type FollowUpRow = SendRow & { seq: number }

const sendView = (r: SendRow) => ({ messageId: r.message_id, from: r.from_email, to: r.to_email, cc: r.cc ? r.cc.split(',') : [], sentAt: r.sent_at })

/** Only same-site paths inside the app, so the callback can't be turned into an open redirect. */
function safeNext(value: string | null): string {
  if (!value || value.length > 500 || !value.startsWith('/audit') || value.startsWith('//') || /[\r\n\\]/.test(value)) return '/audit?mode=settings'
  return value
}
const withStatus = (next: string, status: string) => {
  const url = new URL(next, 'http://reclaim.local')
  url.searchParams.set('gmail', status)
  return `${url.pathname}${url.search}`
}

/** What an account's Gmail connection and sends look like in its data export. Never tokens. */
export function exportGmail(db: DatabaseSync, userId: string) {
  const conn = db.prepare("SELECT company_name, connected_at FROM integration_connections WHERE user_id = ? AND provider = 'gmail'").get(userId) as { company_name: string; connected_at: number } | undefined
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('gmail_sends', 'gmail_follow_ups')").all() as Array<{ name: string }>).map((t) => t.name)
  const rows = (table: string) => (tables.includes(table)
    ? db.prepare(`SELECT project_id, finding_id, message_id, from_email, to_email, cc, sent_at FROM ${table} WHERE user_id = ? AND status = 'sent' ORDER BY sent_at`).all(userId) as Array<{ project_id: string; finding_id: string; message_id: string; from_email: string; to_email: string; cc: string; sent_at: number }>
    : [])
  const view = (kind: 'request' | 'follow-up') => (r: ReturnType<typeof rows>[number]) => ({ kind, auditId: r.project_id, findingId: r.finding_id, gmailMessageId: r.message_id, from: r.from_email, to: r.to_email, cc: r.cc ? r.cc.split(',') : [], sentAt: new Date(r.sent_at).toISOString() })
  const sent = [...rows('gmail_sends').map(view('request')), ...rows('gmail_follow_ups').map(view('follow-up'))].sort((a, b) => a.sentAt.localeCompare(b.sentAt))
  return conn || sent.length ? { connectedAddress: conn?.company_name ?? null, connectedAt: conn ? new Date(conn.connected_at).toISOString() : null, sent } : null
}

/**
 * The Gmail routes. `route` returns null for any path it doesn't own, so
 * `app.ts` dispatches to it with one line.
 */
export function createGmailRoutes(deps: GmailRouteDeps): GmailRoutes {
  const { db, gmail } = deps
  const now = deps.now ?? Date.now
  db.exec(`
    -- One row per case sent through Gmail, reserved before Gmail is called.
    CREATE TABLE IF NOT EXISTS gmail_sends (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      status TEXT NOT NULL,
      message_id TEXT,
      thread_id TEXT,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      cc TEXT NOT NULL DEFAULT '',
      amount_minor INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      PRIMARY KEY (user_id, project_id, finding_id)
    );
    -- Follow-ups on a sent case, numbered 1, 2, 3… and reserved the same way.
    CREATE TABLE IF NOT EXISTS gmail_follow_ups (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      status TEXT NOT NULL,
      message_id TEXT,
      thread_id TEXT,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      cc TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      PRIMARY KEY (user_id, project_id, finding_id, seq)
    )
  `)
  const redirectUri = `${deps.appOrigin}${GMAIL_PATH}/callback`
  const sealContext = (userId: string, sub: string) => `gmail:${userId}:${sub}`
  const connection = (userId: string) =>
    db.prepare("SELECT realm_id, company_name, tokens_sealed, connected_at FROM integration_connections WHERE user_id = ? AND provider = 'gmail'").get(userId) as ConnectionRow | undefined
  const drop = (userId: string) => db.prepare("DELETE FROM integration_connections WHERE user_id = ? AND provider = 'gmail'").run(userId)
  const refreshToken = (userId: string, row: ConnectionRow) => {
    try {
      return openSecret(row.tokens_sealed, gmail!.tokenKey, sealContext(userId, row.realm_id))
    } catch {
      // Wrong key, altered row, or a row moved between accounts: never usable.
      throw new GmailReconnectError('Stored Gmail access could not be opened.')
    }
  }
  const requireUser = (req: Request) => {
    const user = deps.userFor(req)
    if (!user) throw new HttpError(401, 'You need to log in.', 'unauthenticated')
    return user
  }
  const unavailable = () => new HttpError(503, 'Gmail sending isn’t set up on this server.', 'gmail_unavailable')

  async function revoke(userId: string) {
    const row = connection(userId)
    if (row && gmail) {
      try {
        await gmail.client.revoke(refreshToken(userId, row))
      } catch (err) {
        // Deleting the sealed token still ends Reclaim's access.
        console.error('gmail revoke failed:', err instanceof Error ? err.message : 'unknown error')
      }
    }
    drop(userId)
  }

  /** The checks every send shares, before anything about the case: plan, server, JSON, rate, connection. */
  function precheck(req: Request) {
    const user = requireUser(req)
    if (!PLAN_LIMITS[planOf(user.plan)].gmailSending) throw new HttpError(402, 'Sending through Gmail isn’t part of this plan.', 'plan_limit', { feature: 'gmail' })
    if (!gmail) throw unavailable()
    if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON.')
    if (!deps.allowSend(user.id)) throw new HttpError(429, 'Too many sends. Wait a while and try again.', 'rate_limited')
    const row = connection(user.id)
    if (!row) throw new HttpError(409, 'Connect Gmail first.', 'gmail_not_connected')
    return { user, row, gmail }
  }

  /** The email fields from the browser, validated. Throws a 400 naming each bad field. */
  function emailFields(input: Record<string, unknown>) {
    const projectId = typeof input.projectId === 'string' ? input.projectId : ''
    const findingId = typeof input.findingId === 'string' ? input.findingId : ''
    const to = typeof input.to === 'string' ? input.to.trim() : ''
    const cc = Array.isArray(input.cc) ? input.cc.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean) : []
    const subject = typeof input.subject === 'string' ? input.subject : ''
    const body = typeof input.body === 'string' ? input.body : ''
    const fields: Record<string, string> = {}
    if (!isEmailAddress(to)) fields.to = 'Enter the vendor’s email address.'
    if (cc.length > 5 || !cc.every(isEmailAddress)) fields.cc = 'Enter up to five valid addresses, separated by commas.'
    if (!subject.trim() || subject.length > 300 || /[\r\n]/.test(subject)) fields.subject = 'Enter a one-line subject.'
    if (!body.trim() || body.length > 20_000) fields.body = 'Enter the message.'
    if (!/^[\w-]+$/.test(projectId) || !findingId) throw new HttpError(400, 'The case data is malformed.', 'validation')
    if (Object.keys(fields).length) throw new HttpError(400, 'Check the highlighted fields.', 'validation', fields)
    return { projectId, findingId, to, cc, subject, body }
  }

  /**
   * Mints an access token and sends, after the caller has reserved the send.
   * `settle` records the outcome on the reservation: null deletes it (nothing
   * went out), 'uncertain' keeps it so a retry needs the customer's word.
   */
  async function deliver(ctx: ReturnType<typeof precheck>, email: OutgoingEmail, threadId: string | null, settle: (status: 'sent' | 'uncertain' | null, sent?: { id: string; threadId: string | null }) => void) {
    const { user, row } = ctx
    let accessToken: string
    try {
      accessToken = await ctx.gmail.client.accessToken(refreshToken(user.id, row))
    } catch (err) {
      settle(null)
      if (err instanceof GmailReconnectError) {
        drop(user.id)
        throw new HttpError(409, 'Gmail needs to be connected again. Nothing was sent.', 'gmail_reconnect')
      }
      console.error('gmail token refresh failed:', err instanceof Error ? err.message : 'unknown error')
      throw new HttpError(502, 'Couldn’t reach Google. Nothing was sent; try again in a minute.', 'gmail_failed')
    }
    try {
      settle('sent', await ctx.gmail.client.send(accessToken, buildRawMessage(email), threadId))
    } catch (err) {
      if (err instanceof GmailReconnectError) {
        settle(null)
        drop(user.id)
        throw new HttpError(409, 'Gmail needs to be connected again. Nothing was sent.', 'gmail_reconnect')
      }
      if (err instanceof GmailSendError && err.kind === 'rejected') {
        settle(null)
        throw new HttpError(502, err.message, 'gmail_rejected')
      }
      settle('uncertain')
      console.error('gmail send uncertain:', err instanceof Error ? err.message : 'unknown error')
      throw new HttpError(502, `${err instanceof GmailSendError ? err.message : 'Gmail didn’t confirm the send.'} Check your Gmail Sent folder before trying again.`, 'gmail_send_uncertain')
    }
  }

  async function route(req: Request): Promise<Response | null> {
    const path = req.url.pathname
    if (path !== GMAIL_PATH && !path.startsWith(`${GMAIL_PATH}/`)) return null
    const method = req.method

    if (path === GMAIL_PATH && method === 'GET') {
      const user = requireUser(req)
      if (!gmail) return json(200, { available: false })
      const row = connection(user.id)
      return json(200, { available: true, connected: Boolean(row), email: row?.company_name ?? null, connectedAt: row?.connected_at ?? null })
    }

    if (path === `${GMAIL_PATH}/connect` && method === 'GET') {
      const next = safeNext(req.url.searchParams.get('next'))
      const user = deps.userFor(req)
      if (!user) return redirect(`/login?next=${encodeURIComponent(next)}`)
      if (!gmail) return redirect(withStatus(next, 'unavailable'))
      const { token: state } = newToken()
      // The state names the account that started, so a callback can only finish its own user's connection.
      const cookie = `${state}.${user.id}.${Buffer.from(next, 'utf8').toString('base64url')}`
      return redirect(gmail.client.authorizationUrl({ redirectUri, state }), {
        'Set-Cookie': serializeCookie(GMAIL_STATE_COOKIE, cookie, { maxAge: 600, secure: deps.production, path: GMAIL_PATH }),
      })
    }

    if (path === `${GMAIL_PATH}/callback` && method === 'GET') {
      const [expectedState, expectedUser, nextB64] = (req.cookies[GMAIL_STATE_COOKIE] ?? '').split('.')
      const next = safeNext(nextB64 ? Buffer.from(nextB64, 'base64url').toString('utf8') : null)
      const clearState = serializeCookie(GMAIL_STATE_COOKIE, '', { maxAge: 0, secure: deps.production, path: GMAIL_PATH })
      const back = (status: string) => redirect(withStatus(next, status), { 'Set-Cookie': clearState })
      if (!gmail) return back('unavailable')
      const user = deps.userFor(req)
      if (!user) return back('signed_out')
      const params = req.url.searchParams
      if (params.get('error') === 'access_denied') return back('cancelled')
      if (params.get('error')) return back('failed')
      const code = params.get('code')
      const state = params.get('state')
      if (!code || !state || !expectedState || state !== expectedState || expectedUser !== user.id) return back('state')
      try {
        const grant = await gmail.client.exchangeCode({ code, redirectUri })
        db.prepare(`INSERT INTO integration_connections (user_id, provider, realm_id, company_name, tokens_sealed, connected_at, last_sync_at)
          VALUES (?, 'gmail', ?, ?, ?, ?, NULL)
          ON CONFLICT(user_id, provider) DO UPDATE SET realm_id = excluded.realm_id, company_name = excluded.company_name,
            tokens_sealed = excluded.tokens_sealed, connected_at = excluded.connected_at`)
          .run(user.id, grant.sub, grant.email.slice(0, 254), sealSecret(grant.refreshToken, gmail.tokenKey, sealContext(user.id, grant.sub)), now())
        return back('connected')
      } catch (err) {
        if (err instanceof GmailScopeError) return back('scope')
        console.error('gmail connect failed:', err instanceof Error ? err.message : 'unknown error')
        return back('failed')
      }
    }

    if (path === `${GMAIL_PATH}/disconnect` && method === 'POST') {
      const user = requireUser(req)
      await revoke(user.id)
      return json(200, { ok: true })
    }

    if (path === `${GMAIL_PATH}/send` && method === 'POST') {
      const ctx = precheck(req)
      const { user, row } = ctx
      const input = await req.json<Record<string, unknown>>()
      const { projectId, findingId, to, cc, subject, body } = emailFields(input)
      const amount = typeof input.amountRequested === 'number' ? input.amountRequested : NaN
      if (!Number.isFinite(amount)) throw new HttpError(400, 'The case data is malformed.', 'validation')

      const facts = authorizedSendFacts(deps.getProject(user.id, projectId), findingId, amount)
      // Asked before the approval checks, so a case already sent through Gmail reports that instead of "not approved".
      const earlier = db.prepare('SELECT status, message_id, thread_id, from_email, to_email, cc, sent_at FROM gmail_sends WHERE user_id = ? AND project_id = ? AND finding_id = ?').get(user.id, projectId, findingId) as SendRow | undefined
      if (earlier?.status === 'sent') return json(409, { message: 'This request was already sent from Gmail.', code: 'gmail_already_sent', send: sendView(earlier) })
      if (earlier?.status === 'sending') throw new HttpError(409, 'This request is being sent right now.', 'gmail_send_in_progress')
      if (earlier?.status === 'uncertain' && input.retryUncertain !== true) {
        throw new HttpError(409, 'The last attempt may have gone out. Check your Gmail Sent folder before trying again.', 'gmail_send_uncertain')
      }
      if (!facts.ok) throw new HttpError(403, facts.reason, 'recovery_not_authorized')
      // Only what the customer approved goes out: the same words, to the same address.
      const approved = facts.approved
      if (approved.subject !== subject || approved.body !== body) {
        throw new HttpError(409, 'The email differs from the approved version. Approve this version first.', 'not_approved_version')
      }
      if ((approved.recipientEmail ?? '').trim().toLowerCase() !== to.toLowerCase()) {
        throw new HttpError(409, 'The vendor email differs from the approved one. Approve the request with this address first.', 'not_approved_version')
      }

      const key = [user.id, projectId, findingId] as const
      const reserved = earlier?.status === 'uncertain'
        ? db.prepare("UPDATE gmail_sends SET status = 'sending', from_email = ?, to_email = ?, cc = ?, amount_minor = ?, created_at = ? WHERE user_id = ? AND project_id = ? AND finding_id = ? AND status = 'uncertain'")
            .run(row.company_name, to, cc.join(','), Math.round(amount * 100), now(), ...key)
        : db.prepare("INSERT INTO gmail_sends (user_id, project_id, finding_id, status, from_email, to_email, cc, amount_minor, created_at) VALUES (?, ?, ?, 'sending', ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
            .run(...key, row.company_name, to, cc.join(','), Math.round(amount * 100), now())
      if (Number(reserved.changes) !== 1) throw new HttpError(409, 'This request is being sent right now.', 'gmail_send_in_progress')
      await deliver(ctx, { from: row.company_name, fromName: `${user.first_name} ${user.last_name}`.trim(), to, cc, subject, body }, null, (status, sent) => {
        if (status === null) db.prepare('DELETE FROM gmail_sends WHERE user_id = ? AND project_id = ? AND finding_id = ?').run(...key)
        else db.prepare('UPDATE gmail_sends SET status = ?, message_id = ?, thread_id = ?, sent_at = ? WHERE user_id = ? AND project_id = ? AND finding_id = ?')
          .run(status, sent?.id ?? null, sent?.threadId ?? null, status === 'sent' ? now() : null, ...key)
      })
      const done = db.prepare('SELECT status, message_id, thread_id, from_email, to_email, cc, sent_at FROM gmail_sends WHERE user_id = ? AND project_id = ? AND finding_id = ?').get(...key) as SendRow
      return json(200, { send: sendView(done) })
    }

    // A follow-up on a request that has gone out and has no settlement for the
    // whole amount. Never automatic: the browser sends it only after the
    // customer has read and confirmed the text. Numbered per case, so a retry
    // or a double click can't email the vendor twice.
    if (path === `${GMAIL_PATH}/follow-up` && method === 'POST') {
      const ctx = precheck(req)
      const { user, row } = ctx
      const input = await req.json<Record<string, unknown>>()
      const { projectId, findingId, to, cc, subject, body } = emailFields(input)
      const seq = typeof input.sequence === 'number' && Number.isInteger(input.sequence) ? input.sequence : NaN
      if (!(seq >= 1)) throw new HttpError(400, 'The case data is malformed.', 'validation')
      const key = [user.id, projectId, findingId] as const

      const existing = db.prepare('SELECT seq, status, message_id, thread_id, from_email, to_email, cc, sent_at FROM gmail_follow_ups WHERE user_id = ? AND project_id = ? AND finding_id = ? ORDER BY seq').all(...key) as FollowUpRow[]
      const mine = existing.find((r) => r.seq === seq)
      if (mine?.status === 'sent') return json(409, { message: 'This follow-up was already sent from Gmail.', code: 'gmail_already_sent', send: { ...sendView(mine), sequence: seq } })
      if (existing.some((r) => r.status === 'sending')) throw new HttpError(409, 'A follow-up is being sent right now.', 'gmail_send_in_progress')
      if (mine?.status === 'uncertain' && input.retryUncertain !== true) {
        throw new HttpError(409, 'The last attempt may have gone out. Check your Gmail Sent folder before trying again.', 'gmail_send_uncertain')
      }
      const facts = authorizedFollowUpFacts(deps.getProject(user.id, projectId), findingId)
      if (!facts.ok) throw new HttpError(403, facts.reason, 'recovery_not_authorized')
      const sentCount = existing.filter((r) => r.status === 'sent').length
      if (!mine && seq !== sentCount + 1) throw new HttpError(409, 'The case changed since this follow-up was written. Reload it and try again.', 'gmail_follow_up_stale')
      if (!mine && sentCount >= MAX_FOLLOW_UPS) throw new HttpError(409, `This case already has ${MAX_FOLLOW_UPS} follow-ups. Call the vendor or close the case instead.`, 'gmail_follow_up_limit')

      // The last email Reclaim knows went out on this case: the request (from
      // Gmail, or the time the customer recorded sending it), or a follow-up.
      const original = db.prepare("SELECT status, message_id, thread_id, from_email, to_email, cc, sent_at FROM gmail_sends WHERE user_id = ? AND project_id = ? AND finding_id = ? AND status = 'sent'").get(...key) as SendRow | undefined
      const last = Math.max(facts.requestedAt ?? 0, original?.sent_at ?? 0, ...existing.filter((r) => r.status === 'sent').map((r) => r.sent_at ?? 0))
      if (now() - last < MIN_FOLLOW_UP_GAP_MS) throw new HttpError(409, 'The vendor was emailed less than a day ago. Give them a little longer.', 'gmail_follow_up_too_soon')
      // Same Gmail conversation as the request, or as the last follow-up.
      const threadId = [...existing].reverse().find((r) => r.status === 'sent' && r.thread_id)?.thread_id ?? original?.thread_id ?? null

      const reserved = mine
        ? db.prepare("UPDATE gmail_follow_ups SET status = 'sending', from_email = ?, to_email = ?, cc = ?, created_at = ? WHERE user_id = ? AND project_id = ? AND finding_id = ? AND seq = ? AND status = 'uncertain'")
            .run(row.company_name, to, cc.join(','), now(), ...key, seq)
        : db.prepare("INSERT INTO gmail_follow_ups (user_id, project_id, finding_id, seq, status, from_email, to_email, cc, created_at) VALUES (?, ?, ?, ?, 'sending', ?, ?, ?, ?) ON CONFLICT DO NOTHING")
            .run(...key, seq, row.company_name, to, cc.join(','), now())
      if (Number(reserved.changes) !== 1) throw new HttpError(409, 'A follow-up is being sent right now.', 'gmail_send_in_progress')
      await deliver(ctx, { from: row.company_name, fromName: `${user.first_name} ${user.last_name}`.trim(), to, cc, subject, body }, threadId, (status, sent) => {
        if (status === null) db.prepare('DELETE FROM gmail_follow_ups WHERE user_id = ? AND project_id = ? AND finding_id = ? AND seq = ?').run(...key, seq)
        else db.prepare('UPDATE gmail_follow_ups SET status = ?, message_id = ?, thread_id = ?, sent_at = ? WHERE user_id = ? AND project_id = ? AND finding_id = ? AND seq = ?')
          .run(status, sent?.id ?? null, sent?.threadId ?? null, status === 'sent' ? now() : null, ...key, seq)
      })
      const done = db.prepare('SELECT seq, status, message_id, thread_id, from_email, to_email, cc, sent_at FROM gmail_follow_ups WHERE user_id = ? AND project_id = ? AND finding_id = ? AND seq = ?').get(...key, seq) as FollowUpRow
      return json(200, { send: { ...sendView(done), sequence: seq } })
    }

    throw new HttpError(404, 'Not found.')
  }

  return { route, revoke }
}
