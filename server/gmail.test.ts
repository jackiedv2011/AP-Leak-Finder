// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db.ts'
import { DevMailer } from './mailer.ts'
import { buildRawMessage, createGmailClient, GMAIL_SEND_SCOPE, GmailReconnectError, GmailSendError, type GmailClient } from './gmail.ts'
import { authorizedProject } from './testProject.ts'

// An isolated config: no SMTP, no Resend, nothing that could send real mail.
const tokenKey = randomBytes(32)
const config = loadConfig({
  NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0', SESSION_DAYS: '1', REMEMBER_ME_DAYS: '30',
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GMAIL_TOKEN_KEY: tokenKey.toString('base64'),
  // As in production: saved audits are sealed, so every send reads the case through the project store.
  DATA_KEY: randomBytes(32).toString('base64'),
})

/** A stand-in for Google that records every call. It never touches the network. */
function fakeGmail() {
  const state = {
    calls: [] as string[],
    sent: [] as string[],
    revoked: [] as string[],
    refreshRefused: false,
    sendFailure: null as null | 'rejected' | 'uncertain' | 'reconnect',
    issued: 0,
  }
  const client: GmailClient = {
    authorizationUrl: ({ redirectUri, state: s }) => `https://accounts.google.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${s}`,
    exchangeCode: async ({ code }) => {
      state.calls.push('exchange')
      if (code === 'no-scope') {
        const { GmailScopeError } = await import('./gmail.ts')
        throw new GmailScopeError('unticked')
      }
      if (code !== 'good-code') throw new Error('bad code')
      state.issued += 1
      return { refreshToken: `refresh-${state.issued}-SECRET`, accessToken: 'access-SECRET', email: 'owner@gmail.com', sub: 'google-sub-1' }
    },
    accessToken: async (refreshToken) => {
      state.calls.push(`refresh:${refreshToken}`)
      if (state.refreshRefused) throw new GmailReconnectError('revoked')
      return 'fresh-access-SECRET'
    },
    send: async (accessToken, raw) => {
      state.calls.push(`send:${accessToken}`)
      if (state.sendFailure === 'reconnect') throw new GmailReconnectError('401')
      if (state.sendFailure) throw new GmailSendError('failed', state.sendFailure)
      state.sent.push(raw)
      return { id: `msg-${state.sent.length}`, threadId: `thread-${state.sent.length}` }
    },
    revoke: async (t) => {
      state.calls.push('revoke')
      state.revoked.push(t)
    },
  }
  return { client, state }
}

let app: App
let base: string
let gmail: ReturnType<typeof fakeGmail>

class Client {
  cookies = new Map<string, string>()
  async call(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers)
    if (init.json !== undefined) headers.set('Content-Type', 'application/json')
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await fetch(base + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, redirect: 'manual' })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const [name, value] = pair.split('=')
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    const text = await res.text()
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    return { status: res.status, body, text, headers: res.headers }
  }
  get = (p: string) => this.call(p)
  post = (p: string, json: unknown = {}) => this.call(p, { method: 'POST', json })
  put = (p: string, json: unknown) => this.call(p, { method: 'PUT', json })
}

const person = (first: string, email: string) => ({ firstName: first, lastName: 'Test', email, company: `${first} Co`, password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true, termsVersion: '2026-01' })

async function signedIn(first: string, email: string) {
  const c = new Client()
  expect((await c.post('/api/auth/signup', person(first, email))).status).toBe(201)
  const { body } = await new Client().get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)
  const token = new URL(body.messages[0].link).searchParams.get('token')
  expect((await c.post('/api/auth/verify-email', { token })).status).toBe(200)
  return c
}

async function connect(c: Client, code = 'good-code', next?: string) {
  const start = await c.get(`/api/integrations/gmail/connect${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  expect(start.status).toBe(302)
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!
  return c.get(`/api/integrations/gmail/callback?code=${code}&state=${state}`)
}
const outcome = (res: { headers: Headers }) => new URL(res.headers.get('location')!, 'http://x').searchParams.get('gmail')

const LETTER = { subject: 'Duplicate payment of invoice INV-1', body: 'Hello,\n\nWe paid invoice INV-1 twice. Please refund $6,800.00.\n\nThanks,\nAlice' }

/** Saves an approved, evidence-backed case on the account, the way the browser would. Each id is its own invoice, so Free's repeat-upload rule doesn't apply. */
async function saveApprovedCase(c: Client, id = 's1', overrides: Record<string, unknown> = {}) {
  const { project, findingId } = authorizedProject(id, { vendor: 'Sierra Coffee Supply', invoice: `INV-${id}`, amount: 6800, requested: 6800 })
  Object.assign(project.environment.caseStates[findingId], { recoverySubject: LETTER.subject, recoveryDraft: LETTER.body, recoveryRecipientEmail: 'ap@sierra.test', ...overrides })
  expect((await c.put(`/api/projects/${id}`, project)).status).toBe(200)
  return { project, findingId, payload: { projectId: id, findingId, to: 'ap@sierra.test', cc: [], subject: LETTER.subject, body: LETTER.body, amountRequested: 6800 } }
}

beforeEach(async () => {
  const db = openDatabase(':memory:')
  gmail = fakeGmail()
  app = createApp({ config, db, mailer: new DevMailer(db), google: null, drafts: null, quickbooks: null, gmail: gmail.client })
  base = `http://127.0.0.1:${await app.listen(0)}`
})
afterEach(async () => {
  await app.close()
  app.db.close()
})

describe('the message Reclaim hands Gmail', () => {
  const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')

  it('is plain text from the connected address, with the approved subject and body', () => {
    const raw = buildRawMessage({ from: 'owner@gmail.com', fromName: 'Alice Test', to: 'ap@vendor.test', cc: ['books@us.test'], subject: 'Refund request', body: 'Line one\nLine two' })
    const mime = decode(raw)
    const [head, body] = mime.split('\r\n\r\n')
    expect(head).toContain('From: "Alice Test" <owner@gmail.com>')
    expect(head).toContain('To: ap@vendor.test')
    expect(head).toContain('Cc: books@us.test')
    expect(head).toContain('Subject: Refund request')
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('Line one\r\nLine two')
  })

  it('encodes non-ASCII subjects and names, and refuses header injection', () => {
    const mime = decode(buildRawMessage({ from: 'owner@gmail.com', fromName: 'Zoë', to: 'ap@vendor.test', cc: [], subject: 'Remboursement – facture', body: 'x' }))
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/)
    expect(mime).toMatch(/From: =\?UTF-8\?B\?.+\?= <owner@gmail.com>/)
    expect(mime).not.toContain('Cc:')
    expect(() => buildRawMessage({ from: 'owner@gmail.com', fromName: '', to: 'ap@vendor.test', cc: [], subject: 'Hi\r\nBcc: evil@x.test', body: 'x' })).toThrow()
    expect(() => buildRawMessage({ from: 'owner@gmail.com', fromName: '', to: 'ap@vendor.test\r\nBcc: evil@x.test', cc: [], subject: 'Hi', body: 'x' })).toThrow()
    expect(() => buildRawMessage({ from: 'owner@gmail.com', fromName: '', to: 'a@b.test, c@d.test', cc: [], subject: 'Hi', body: 'x' })).toThrow()
  })
})

describe('the Google client', () => {
  function recordingFetch(responses: Record<string, () => Response>) {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const impl = (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      const key = Object.keys(responses).find((k) => url.startsWith(k))
      if (!key) throw new Error(`unexpected ${url}`)
      return responses[key]()
    }) as typeof fetch
    return { impl, calls }
  }
  const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

  it('asks for send-only Gmail access, separately from sign-in', () => {
    const url = new URL(createGmailClient('id', 'secret').authorizationUrl({ redirectUri: 'http://localhost/cb', state: 's' }))
    expect(url.searchParams.get('scope')!.split(' ').sort()).toEqual(['email', 'openid', GMAIL_SEND_SCOPE].sort())
    expect(url.searchParams.get('scope')).not.toMatch(/readonly|modify|compose|mail\.google\.com|metadata/)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toContain('consent')
    expect(url.searchParams.has('include_granted_scopes')).toBe(false)
  })

  it('refuses (and revokes) a grant where the send permission was unticked', async () => {
    const { impl, calls } = recordingFetch({
      'https://oauth2.googleapis.com/token': ok({ access_token: 'a', refresh_token: 'r', scope: 'openid email' }),
      'https://oauth2.googleapis.com/revoke': () => new Response('', { status: 200 }),
    })
    await expect(createGmailClient('id', 'secret', impl).exchangeCode({ code: 'c', redirectUri: 'x' })).rejects.toThrow(/send permission/)
    expect(calls.map((c) => c.url)).toContain('https://oauth2.googleapis.com/revoke')
  })

  it('sends with users.messages.send and tells a refusal apart from an unknown outcome', async () => {
    const statusOf = (status: number, body: unknown = {}) => recordingFetch({ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send': () => new Response(JSON.stringify(body), { status }) })
    const good = statusOf(200, { id: 'm1', threadId: 't1' })
    expect(await createGmailClient('id', 's', good.impl).send('tok', 'raw')).toEqual({ id: 'm1', threadId: 't1' })
    expect(good.calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(good.calls[0].init?.body))).toEqual({ raw: 'raw' })
    await expect(createGmailClient('id', 's', statusOf(401).impl).send('t', 'r')).rejects.toBeInstanceOf(GmailReconnectError)
    await expect(createGmailClient('id', 's', statusOf(400).impl).send('t', 'r')).rejects.toMatchObject({ kind: 'rejected' })
    await expect(createGmailClient('id', 's', statusOf(500).impl).send('t', 'r')).rejects.toMatchObject({ kind: 'uncertain' })
    await expect(createGmailClient('id', 's', statusOf(200, {}).impl).send('t', 'r')).rejects.toMatchObject({ kind: 'uncertain' })
    const offline = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    await expect(createGmailClient('id', 's', offline).send('t', 'r')).rejects.toMatchObject({ kind: 'uncertain' })
  })
})

describe('connecting Gmail', () => {
  it('needs a signed-in account and a configured server', async () => {
    const guest = new Client()
    expect((await guest.get('/api/integrations/gmail')).status).toBe(401)
    const start = await guest.get('/api/integrations/gmail/connect')
    expect(start.headers.get('location')).toMatch(/^\/login\?next=/)
    expect(() => loadConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GMAIL_TOKEN_KEY: 'short' })).toThrow(/32 random bytes/)
    expect(loadConfig({ GMAIL_TOKEN_KEY: tokenKey.toString('base64') }).gmailSend).toBeNull()
  })

  it('round trip: Google consent, refresh token sealed, status shows only the address', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    expect((await alice.get('/api/integrations/gmail')).body).toEqual({ available: true, connected: false, email: null, connectedAt: null })
    const start = await alice.get('/api/integrations/gmail/connect')
    expect(new URL(start.headers.get('location')!).searchParams.get('redirect_uri')).toBe('http://localhost:0/api/integrations/gmail/callback')
    expect(start.headers.getSetCookie().join(';')).toMatch(/reclaim_gmail_state=.*Path=\/api\/integrations\/gmail.*HttpOnly/)
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const done = await alice.get(`/api/integrations/gmail/callback?code=good-code&state=${state}`)
    expect(outcome(done)).toBe('connected')
    expect(done.headers.get('location')).toMatch(/^\/audit\?mode=settings/)

    const row = app.db.prepare("SELECT * FROM integration_connections WHERE provider = 'gmail'").get() as Record<string, unknown>
    expect(row).toMatchObject({ realm_id: 'google-sub-1', company_name: 'owner@gmail.com' })
    expect(JSON.stringify(row)).not.toMatch(/SECRET/)
    const status = await alice.get('/api/integrations/gmail')
    expect(status.body).toMatchObject({ connected: true, email: 'owner@gmail.com' })
    expect(status.text).not.toMatch(/SECRET|refresh|access/i)
  })

  it('returns to the case it started from, but never off-site', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    expect((await connect(alice, 'good-code', '/audit?project=p1&case=f1')).headers.get('location')).toBe('/audit?project=p1&case=f1&gmail=connected')
    expect((await connect(alice, 'good-code', 'https://evil.test/x')).headers.get('location')).toBe('/audit?mode=settings&gmail=connected')
    expect((await connect(alice, 'good-code', '//evil.test')).headers.get('location')).toBe('/audit?mode=settings&gmail=connected')
  })

  it('refuses a wrong state, another account’s state, and an unticked send permission', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    const bob = await signedIn('Bob', 'bob@example.com')
    expect(outcome(await alice.get('/api/integrations/gmail/callback?code=good-code&state=nope'))).toBe('state')
    const start = await alice.get('/api/integrations/gmail/connect')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    bob.cookies.set('reclaim_gmail_state', alice.cookies.get('reclaim_gmail_state')!)
    expect(outcome(await bob.get(`/api/integrations/gmail/callback?code=good-code&state=${state}`))).toBe('state')
    expect(gmail.state.calls).not.toContain('exchange')
    expect(outcome(await connect(alice, 'no-scope'))).toBe('scope')
    expect(outcome(await alice.get('/api/integrations/gmail/callback?error=access_denied'))).toBe('cancelled')
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get()).toEqual({ n: 0 })
  })

  it('disconnect revokes the token with Google and deletes it', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    expect((await alice.post('/api/integrations/gmail/disconnect')).status).toBe(200)
    expect(gmail.state.revoked).toEqual(['refresh-1-SECRET'])
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get()).toEqual({ n: 0 })
    expect((await alice.get('/api/integrations/gmail')).body.connected).toBe(false)
  })

  it('a sealed token moved to another account cannot be used', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    const bob = await signedIn('Bob', 'bob@example.com')
    await connect(alice)
    const bobId = (await bob.get('/api/auth/me')).body.user.id
    app.db.prepare("UPDATE integration_connections SET user_id = ? WHERE provider = 'gmail'").run(bobId)
    const { payload } = await saveApprovedCase(bob)
    const res = await bob.post('/api/integrations/gmail/send', payload)
    expect(res.body.code).toBe('gmail_reconnect')
    expect(gmail.state.sent).toHaveLength(0)
  })
})

describe('sending a recovery request from Gmail', () => {
  it('works on Free: sends the approved email once and reports Gmail’s message id', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    expect((await alice.get('/api/account/entitlements')).body).toMatchObject({ plan: 'free', limits: { gmailSending: true, fullLetters: true, aiDrafts: false } })
    await connect(alice)
    const { payload } = await saveApprovedCase(alice)
    const res = await alice.post('/api/integrations/gmail/send', { ...payload, cc: ['books@alice.test'] })
    expect(res.status).toBe(200)
    expect(res.body.send).toMatchObject({ messageId: 'msg-1', from: 'owner@gmail.com', to: 'ap@sierra.test', cc: ['books@alice.test'] })
    expect(res.body.send.sentAt).toBeGreaterThan(0)
    expect(res.text).not.toMatch(/SECRET/)
    expect(gmail.state.calls).toContain('send:fresh-access-SECRET')
    const mime = Buffer.from(gmail.state.sent[0], 'base64url').toString('utf8')
    expect(mime).toContain('From: "Alice Test" <owner@gmail.com>')
    expect(mime).toContain('To: ap@sierra.test')
    expect(mime).toContain('Cc: books@alice.test')

    // A second click (or a client that never recorded the first) gets the first send back, not a second email.
    const again = await alice.post('/api/integrations/gmail/send', payload)
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ code: 'gmail_already_sent', send: { messageId: 'msg-1', to: 'ap@sierra.test' } })
    expect(gmail.state.sent).toHaveLength(1)
  })

  it('two sends at once still email the vendor once', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const { payload } = await saveApprovedCase(alice)
    const results = await Promise.all([alice.post('/api/integrations/gmail/send', payload), alice.post('/api/integrations/gmail/send', payload)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(gmail.state.sent).toHaveLength(1)
  })

  it('sends only what the customer approved, for a case that passed the checks', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const { payload } = await saveApprovedCase(alice)
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, body: `${LETTER.body}\nP.S. edited after approval` })).body.code).toBe('not_approved_version')
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, subject: 'Different' })).body.code).toBe('not_approved_version')
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, to: 'someone@else.test' })).body.code).toBe('not_approved_version')
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, amountRequested: 5000 })).body.code).toBe('recovery_not_authorized')
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, projectId: 'missing' })).body.code).toBe('recovery_not_authorized')

    await saveApprovedCase(alice, 's2', { approvedAt: null })
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, projectId: 's2' })).body.code).toBe('recovery_not_authorized')
    await saveApprovedCase(alice, 's3', { contactHold: 'Strategic supplier' })
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, projectId: 's3' })).body.code).toBe('recovery_not_authorized')
    await saveApprovedCase(alice, 's4', { recoveryStage: 'requested' })
    expect((await alice.post('/api/integrations/gmail/send', { ...payload, projectId: 's4' })).body.code).toBe('recovery_not_authorized')

    const bad = await alice.post('/api/integrations/gmail/send', { ...payload, to: 'not an address', cc: ['x'], subject: 'a\nBcc: evil@x.test' })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.fields).sort()).toEqual(['cc', 'subject', 'to'])
    expect(gmail.state.sent).toHaveLength(0)
  })

  it('another account cannot send from a case it does not own', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    const bob = await signedIn('Bob', 'bob@example.com')
    const { payload } = await saveApprovedCase(alice)
    await connect(bob)
    expect((await bob.post('/api/integrations/gmail/send', payload)).body.code).toBe('recovery_not_authorized')
    expect(gmail.state.sent).toHaveLength(0)
  })

  it('needs a connection, and asks to reconnect when Google refuses the stored grant', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    const { payload } = await saveApprovedCase(alice)
    expect((await alice.post('/api/integrations/gmail/send', payload)).body.code).toBe('gmail_not_connected')
    await connect(alice)
    gmail.state.refreshRefused = true
    expect((await alice.post('/api/integrations/gmail/send', payload)).body.code).toBe('gmail_reconnect')
    expect((await alice.get('/api/integrations/gmail')).body.connected).toBe(false)
    // Nothing was sent, so nothing is held back: reconnecting lets the same case go out.
    gmail.state.refreshRefused = false
    await connect(alice)
    expect((await alice.post('/api/integrations/gmail/send', payload)).status).toBe(200)
  })

  it('a refused send can be retried; an unknown outcome needs the customer to check first', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const { payload } = await saveApprovedCase(alice)
    gmail.state.sendFailure = 'rejected'
    expect((await alice.post('/api/integrations/gmail/send', payload)).body.code).toBe('gmail_rejected')
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM gmail_sends').get()).toEqual({ n: 0 })

    gmail.state.sendFailure = 'uncertain'
    const unsure = await alice.post('/api/integrations/gmail/send', payload)
    expect(unsure.status).toBe(502)
    expect(unsure.body.code).toBe('gmail_send_uncertain')
    expect(unsure.body.message).toMatch(/Sent folder/)
    gmail.state.sendFailure = null
    expect((await alice.post('/api/integrations/gmail/send', payload)).body.code).toBe('gmail_send_uncertain')
    expect(gmail.state.sent).toHaveLength(0)
    const retried = await alice.post('/api/integrations/gmail/send', { ...payload, retryUncertain: true })
    expect(retried.status).toBe(200)
    expect(gmail.state.sent).toHaveLength(1)
  })
})

describe('with stored audits encrypted (DATA_KEY)', () => {
  it('reads the approved case through the project store: the stored payload is sealed', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const { payload } = await saveApprovedCase(alice)
    expect((app.db.prepare('SELECT payload FROM projects').get() as { payload: string }).payload.startsWith('v1.')).toBe(true)
    expect((await alice.post('/api/integrations/gmail/send', payload)).status).toBe(200)
  })
})

describe('deleting the account', () => {
  it('revokes the Gmail grant with Google first, then removes the connection and the send log', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const { payload } = await saveApprovedCase(alice)
    expect((await alice.post('/api/integrations/gmail/send', payload)).status).toBe(200)
    expect((await alice.post('/api/account/delete', { confirmEmail: 'alice@example.com' })).status).toBe(200)
    expect(gmail.state.revoked).toEqual(['refresh-1-SECRET'])
    expect(app.db.prepare("SELECT COUNT(*) AS n FROM integration_connections WHERE provider = 'gmail'").get()).toEqual({ n: 0 })
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM gmail_sends').get()).toEqual({ n: 0 })
  })
})
