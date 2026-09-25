// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, type App } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db.ts'
import { DevMailer } from './mailer.ts'
import type { GoogleClient, GoogleIdentity } from './google.ts'
import type { DraftService } from './ai.ts'

const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0', SESSION_DAYS: '1', REMEMBER_ME_DAYS: '30' })

let app: App
let base: string

/** A cookie jar per "browser" so two users can be driven side by side. */
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
    return { status: res.status, body, headers: res.headers }
  }
  get = (p: string) => this.call(p)
  post = (p: string, json: unknown = {}) => this.call(p, { method: 'POST', json })
  put = (p: string, json: unknown) => this.call(p, { method: 'PUT', json })
  del = (p: string) => this.call(p, { method: 'DELETE' })
}

const alice = { firstName: 'Alice', lastName: 'Ng', email: 'Alice@Example.com', company: 'Ng Co', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true, termsVersion: '2026-01' }
const bob = { ...alice, firstName: 'Bob', lastName: 'Ray', email: 'bob@example.com', company: 'Ray LLC' }

async function inbox(email: string) {
  const res = await new Client().get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)
  return res.body.messages as Array<{ subject: string; link: string | null; body: string }>
}
const tokenFrom = (link: string | null) => new URL(link!).searchParams.get('token')!

async function signUpAndVerify(client: Client, input: typeof alice) {
  const res = await client.post('/api/auth/signup', input)
  expect(res.status).toBe(201)
  expect(res.body.requiresVerification).toBe(true)
  const [mail] = await inbox(input.email)
  const verified = await client.post('/api/auth/verify-email', { token: tokenFrom(mail.link) })
  expect(verified.status).toBe(200)
  return verified.body.user
}

let googleIdentity: GoogleIdentity | null
const fakeGoogle: GoogleClient = {
  authorizationUrl: ({ redirectUri, state }) => `https://accounts.google.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
  exchangeCode: async ({ code }) => {
    if (code !== 'good-code' || !googleIdentity) throw new Error('bad code')
    return googleIdentity
  },
}
const drafts: DraftService = { draft: vi.fn(async (req) => ({ subject: `Re: ${req.vendor}`, body: `Please refund ${req.amountRequested}.` })) }

beforeEach(async () => {
  const db = openDatabase(':memory:')
  app = createApp({ config, db, mailer: new DevMailer(db), google: fakeGoogle, drafts })
  const port = await app.listen(0)
  base = `http://127.0.0.1:${port}`
  googleIdentity = null
})
afterEach(async () => {
  await app.close()
  app.db.close()
})

describe('email/password accounts', () => {
  it('signup → verification email → verify → session; login is refused until verified', async () => {
    const c = new Client()
    const res = await c.post('/api/auth/signup', alice)
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ requiresVerification: true, email: 'alice@example.com' })
    expect(c.cookies.has('reclaim_session')).toBe(false)

    const early = await c.post('/api/auth/login', { email: alice.email, password: alice.password })
    expect(early.status).toBe(403)
    expect(early.body.code).toBe('email_unverified')

    const [mail] = await inbox(alice.email)
    expect(mail.subject).toMatch(/Confirm your email/)
    const verified = await c.post('/api/auth/verify-email', { token: tokenFrom(mail.link) })
    expect(verified.status).toBe(200)
    expect(verified.body.user).toMatchObject({ email: 'alice@example.com', firstName: 'Alice', company: 'Ng Co', emailVerified: true, methods: ['password'], termsVersion: '2026-01' })
    expect(c.cookies.has('reclaim_session')).toBe(true)
    expect((await c.get('/api/auth/me')).body.user.email).toBe('alice@example.com')

    // the verification link is single-use
    expect((await new Client().post('/api/auth/verify-email', { token: tokenFrom(mail.link) })).body.code).toBe('token_used')
  })

  it('validates the signup form field by field', async () => {
    const res = await new Client().post('/api/auth/signup', { ...alice, firstName: '', email: 'nope', password: 'short', confirmPassword: 'other', acceptedTerms: false })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.fields).sort()).toEqual(['acceptedTerms', 'confirmPassword', 'email', 'firstName', 'password'])
  })

  it('a second signup with the same email looks identical from outside and emails the owner instead', async () => {
    const first = await new Client().post('/api/auth/signup', alice)
    const second = await new Client().post('/api/auth/signup', { ...alice, password: 'another-password-1', confirmPassword: 'another-password-1' })
    expect(second.status).toBe(first.status)
    expect(second.body).toEqual(first.body)
    const mails = await inbox(alice.email)
    expect(mails.map((m) => m.subject)).toEqual(['You already have a Reclaim account', 'Confirm your email for Reclaim'])
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
  })

  it('stores a scrypt hash, never the password', async () => {
    await new Client().post('/api/auth/signup', alice)
    const row = app.db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }
    expect(row.password_hash.startsWith('scrypt$')).toBe(true)
    expect(row.password_hash).not.toContain(alice.password)
    expect(JSON.stringify(app.db.prepare('SELECT * FROM users').all())).not.toContain(alice.password)
  })

  it('login: wrong password and unknown email get the same answer; logout ends the session', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    await c.post('/api/auth/logout')
    expect((await c.get('/api/auth/me')).status).toBe(401)
    const wrong = await c.post('/api/auth/login', { email: alice.email, password: 'wrong-password-1' })
    const unknown = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-1' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    const ok = await c.post('/api/auth/login', { email: '  ALICE@example.com ', password: alice.password, rememberMe: true })
    expect(ok.status).toBe(200)
    expect((await c.get('/api/auth/me')).body.user.name).toBe('Alice Ng')
  })

  it('an expired session is refused and its cookie cleared', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    app.db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1000)
    const me = await c.get('/api/auth/me')
    expect(me.status).toBe(401)
    expect(c.cookies.has('reclaim_session')).toBe(false)
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 })
  })

  it('the session cookie is HttpOnly and SameSite=Lax', async () => {
    const c = new Client()
    const res = await c.post('/api/auth/signup', alice)
    expect(res.status).toBe(201)
    const [mail] = await inbox(alice.email)
    const verified = await c.post('/api/auth/verify-email', { token: tokenFrom(mail.link) })
    const cookie = verified.headers.getSetCookie().find((l) => l.startsWith('reclaim_session='))!
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })
})

describe('password reset', () => {
  it('forgot → mail → reset → old sessions gone → login with the new password', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    const stranger = await new Client().post('/api/auth/forgot-password', { email: 'nobody@example.com' })
    const real = await new Client().post('/api/auth/forgot-password', { email: alice.email })
    expect(stranger.status).toBe(200)
    expect(real.body).toEqual(stranger.body)
    expect(await inbox('nobody@example.com')).toHaveLength(0)

    const [mail] = await inbox(alice.email)
    expect(mail.subject).toMatch(/Reset your Reclaim password/)
    const token = tokenFrom(mail.link)
    const bad = await new Client().post('/api/auth/reset-password', { token, password: 'short', confirmPassword: 'short' })
    expect(bad.status).toBe(400)
    expect(bad.body.fields.password).toBeDefined()

    const fresh = new Client()
    const reset = await fresh.post('/api/auth/reset-password', { token, password: 'new-password-xyz', confirmPassword: 'new-password-xyz' })
    expect(reset.status).toBe(200)
    expect(fresh.cookies.has('reclaim_session')).toBe(true)
    // the old browser's session was revoked
    expect((await c.get('/api/auth/me')).status).toBe(401)
    // the token cannot be reused
    expect((await new Client().post('/api/auth/reset-password', { token, password: 'new-password-xyz', confirmPassword: 'new-password-xyz' })).body.code).toBe('token_used')
    // old password dead, new one works
    expect((await new Client().post('/api/auth/login', { email: alice.email, password: alice.password })).status).toBe(401)
    expect((await new Client().post('/api/auth/login', { email: alice.email, password: 'new-password-xyz' })).status).toBe(200)
  })

  it('rejects an invalid token and an expired token with distinct, safe messages', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    expect((await c.post('/api/auth/reset-password', { token: 'garbage', password: 'new-password-xyz', confirmPassword: 'new-password-xyz' })).body.code).toBe('token_invalid')
    await c.post('/api/auth/forgot-password', { email: alice.email })
    const [mail] = await inbox(alice.email)
    app.db.prepare("UPDATE tokens SET expires_at = ? WHERE kind = 'reset'").run(Date.now() - 1)
    const res = await c.post('/api/auth/reset-password', { token: tokenFrom(mail.link), password: 'new-password-xyz', confirmPassword: 'new-password-xyz' })
    expect(res.body.code).toBe('token_expired')
    expect(res.body.message).not.toContain(alice.email)
  })
})

describe('google sign-in', () => {
  it('redirects to Google with identity-only scopes and a state cookie', async () => {
    const c = new Client()
    const res = await c.get('/api/auth/google')
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    expect(location).toContain('accounts.google.test')
    expect(c.cookies.has('reclaim_oauth_state')).toBe(true)
    expect(location).toContain(`state=${c.cookies.get('reclaim_oauth_state')}`)
  })

  it('first-time Google user gets a verified, password-less account and lands on /audit', async () => {
    const c = new Client()
    await c.get('/api/auth/google')
    googleIdentity = { sub: 'g-1', email: 'carol@example.com', emailVerified: true, givenName: 'Carol', familyName: 'Diaz' }
    const cb = await c.get(`/api/auth/google/callback?code=good-code&state=${c.cookies.get('reclaim_oauth_state')}`)
    expect(cb.status).toBe(302)
    expect(cb.headers.get('location')).toBe('/audit')
    expect(c.cookies.has('reclaim_oauth_state')).toBe(false)
    const me = await c.get('/api/auth/me')
    expect(me.body.user).toMatchObject({ email: 'carol@example.com', firstName: 'Carol', emailVerified: true, methods: ['google'] })
  })

  it('an existing email/password account is linked, not duplicated', async () => {
    await signUpAndVerify(new Client(), alice)
    const c = new Client()
    await c.get('/api/auth/google')
    googleIdentity = { sub: 'g-alice', email: 'ALICE@example.com', emailVerified: true, givenName: 'Alice', familyName: 'Ng' }
    await c.get(`/api/auth/google/callback?code=good-code&state=${c.cookies.get('reclaim_oauth_state')}`)
    const me = await c.get('/api/auth/me')
    expect(me.body.user.methods).toEqual(['password', 'google'])
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
    // and signing in again with the same Google identity finds the same account
    const again = new Client()
    await again.get('/api/auth/google')
    await again.get(`/api/auth/google/callback?code=good-code&state=${again.cookies.get('reclaim_oauth_state')}`)
    expect((await again.get('/api/auth/me')).body.user.id).toBe(me.body.user.id)
  })

  it('cancelled, denied, tampered and unverified-email outcomes all bounce back to /login without a session', async () => {
    const c = new Client()
    await c.get('/api/auth/google')
    const state = c.cookies.get('reclaim_oauth_state')
    expect((await c.get('/api/auth/google/callback?error=access_denied')).headers.get('location')).toBe('/login?error=google_cancelled')
    await c.get('/api/auth/google')
    expect((await c.get('/api/auth/google/callback?error=server_error')).headers.get('location')).toBe('/login?error=google_failed')
    await c.get('/api/auth/google')
    expect((await c.get(`/api/auth/google/callback?code=good-code&state=wrong`)).headers.get('location')).toBe('/login?error=google_state')
    await c.get('/api/auth/google')
    googleIdentity = { sub: 'g-2', email: 'dan@example.com', emailVerified: false, givenName: 'Dan', familyName: 'Lo' }
    expect((await c.get(`/api/auth/google/callback?code=good-code&state=${c.cookies.get('reclaim_oauth_state')}`)).headers.get('location')).toBe('/login?error=google_email_unverified')
    await c.get('/api/auth/google')
    expect((await c.get(`/api/auth/google/callback?code=bad-code&state=${c.cookies.get('reclaim_oauth_state')}`)).headers.get('location')).toBe('/login?error=google_failed')
    expect(c.cookies.has('reclaim_session')).toBe(false)
    expect(state).toBeDefined()
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
  })

  it('reports itself unavailable when not configured', async () => {
    const bare = createApp({ config, db: openDatabase(':memory:'), mailer: new DevMailer(openDatabase(':memory:')), google: null, drafts: null })
    const port = await bare.listen(0)
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/google`, { redirect: 'manual' })
    expect(res.status).toBe(503)
    const providers = await (await fetch(`http://127.0.0.1:${port}/api/auth/providers`)).json()
    expect(providers).toMatchObject({ google: false, ai: false, emailDelivery: 'dev' })
    await bare.close()
  })
})

describe('account data isolation', () => {
  const project = (id: string, name: string) => ({ id, name, sourceLabel: `${name}.csv`, mode: 'upload', createdAt: 1, updatedAt: 2, environment: { records: [], imports: [], result: { findings: [] }, caseStates: {} } })

  it('each user sees only their own projects, by id and by listing', async () => {
    const a = new Client()
    const b = new Client()
    await signUpAndVerify(a, alice)
    await signUpAndVerify(b, bob)
    expect((await a.put('/api/projects/p1', project('p1', 'Alice March'))).status).toBe(200)
    expect((await b.put('/api/projects/p2', project('p2', 'Bob March'))).status).toBe(200)
    expect((await a.get('/api/projects')).body.projects.map((p: any) => p.name)).toEqual(['Alice March'])
    expect((await b.get('/api/projects')).body.projects.map((p: any) => p.name)).toEqual(['Bob March'])
    // same id in two accounts is two rows; deleting Bob's does not touch Alice's
    expect((await b.put('/api/projects/p1', project('p1', 'Bob copy'))).status).toBe(200)
    await b.del('/api/projects/p1')
    expect((await a.get('/api/projects')).body.projects.map((p: any) => p.name)).toEqual(['Alice March'])
    expect((await new Client().get('/api/projects')).status).toBe(401)
  })

  it('import preserves ids, skips duplicates, and is scoped to the caller', async () => {
    const a = new Client()
    await signUpAndVerify(a, alice)
    await a.put('/api/projects/p1', project('p1', 'Already there'))
    const res = await a.post('/api/projects/import', { projects: [project('p1', 'Legacy copy'), project('p9', 'Legacy new')] })
    expect(res.body).toEqual({ imported: ['p9'], skipped: ['p1'], blocked: [] })
    expect((await a.get('/api/projects')).body.projects.map((p: any) => p.name).sort()).toEqual(['Already there', 'Legacy new'])
  })
})

describe('plans and entitlements', () => {
  const project = (id: string) => ({ id, name: id, sourceLabel: `${id}.csv`, mode: 'upload', createdAt: Date.now(), updatedAt: Date.now(), environment: { records: [], imports: [], result: { findings: [] }, caseStates: {} } })

  it('every new account is Free, and entitlements come from the server with usage counted', async () => {
    const c = new Client()
    const user = await signUpAndVerify(c, alice)
    expect(user.plan).toBe('free')
    expect(user.onboardingSeenAt).toBeNull()
    const ent = await c.get('/api/account/entitlements')
    expect(ent.status).toBe(200)
    expect(ent.body).toMatchObject({ plan: 'free', limits: { auditsPerMonth: null, findingsVisible: 3, blocksRepeatUploads: true, aiDrafts: false, fullLetters: false, fullRecoveryWorkflow: false, advancedReports: false }, usage: { auditsThisMonth: 0 }, canStartAudit: true })
    expect((await new Client().get('/api/account/entitlements')).status).toBe(401)
  })

  it('Free has unlimited uploads of different ledgers, and existing audits can always be updated', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) expect((await c.put(`/api/projects/${id}`, project(id))).status).toBe(200)
    expect((await c.get('/api/account/entitlements')).body).toMatchObject({ usage: { auditsThisMonth: 5 }, canStartAudit: true })
    expect((await c.put('/api/projects/a1', { ...project('a1'), name: 'renamed' })).status).toBe(200)
    expect((await c.get('/api/projects')).body.projects).toHaveLength(5)
  })

  it('Growth unlocks every finding and AI drafts; Free is told AI is a paid feature before anything is sent to the model', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    const draftPayload = {
      vendor: 'V', findingType: 'T', findingTitle: 'X', explanation: 'E', evidenceStrength: 'strong', amountFlagged: 1, amountRequested: 1, method: 'refund', recoveryStage: 'confirmed',
      rows: [{ invoiceNumber: null, invoiceDate: null, paymentDate: '2025-01-01', invoiceAmount: null, amountPaid: 1, terms: null }],
      userContext: '', sender: { businessName: '', senderName: '', senderEmail: '' },
    }
    vi.mocked(drafts.draft).mockClear()
    const refused = await c.post('/api/ai/draft', draftPayload)
    expect(refused.status).toBe(402)
    expect(refused.body.fields).toEqual({ feature: 'ai' })
    expect(drafts.draft).not.toHaveBeenCalled()

    const upgraded = await c.post('/api/dev/plan', { plan: 'growth' })
    expect(upgraded.body.user.plan).toBe('growth')
    expect((await c.get('/api/auth/me')).body.user.plan).toBe('growth')
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) expect((await c.put(`/api/projects/${id}`, project(id))).status).toBe(200)
    expect((await c.get('/api/account/entitlements')).body).toMatchObject({ plan: 'growth', limits: { auditsPerMonth: null, findingsVisible: null, blocksRepeatUploads: false, aiDrafts: true }, canStartAudit: true })
    expect((await c.post('/api/ai/draft', draftPayload)).status).toBe(200)
    // a plan is per account: Bob is still Free
    const b = new Client()
    expect((await signUpAndVerify(b, bob)).plan).toBe('free')
  })

  it('upgrading is honestly "coming soon": no payment, no plan change', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    const res = await c.post('/api/account/upgrade')
    expect(res.status).toBe(501)
    expect(res.body.code).toBe('coming_soon')
    expect((await c.get('/api/auth/me')).body.user.plan).toBe('free')
  })

  it('the first-run tour is remembered on the account', async () => {
    const c = new Client()
    await signUpAndVerify(c, alice)
    const res = await c.post('/api/account/onboarding-seen')
    expect(res.body.user.onboardingSeenAt).toBeTypeOf('number')
    expect((await c.get('/api/auth/me')).body.user.onboardingSeenAt).toBeTypeOf('number')
  })

  it('the dev plan switch is not available in production', async () => {
    const prodConfig = { ...config, devMailbox: false }
    const prod = createApp({ config: prodConfig, db: openDatabase(':memory:'), mailer: new DevMailer(openDatabase(':memory:')), google: null, drafts: null })
    const port = await prod.listen(0)
    const res = await fetch(`http://127.0.0.1:${port}/api/dev/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"plan":"growth"}' })
    expect(res.status).toBe(404)
    await prod.close()
  })
})

describe('ai drafting', () => {
  it('requires a session, validates the payload, and returns the draft', async () => {
    const payload = {
      vendor: 'Sierra Coffee Supply', findingType: 'Exact duplicate payment', findingTitle: 'Duplicate payment of invoice INV-1', explanation: 'Paid twice.', evidenceStrength: 'strong',
      amountFlagged: 6800, amountRequested: 6800, method: 'refund', recoveryStage: 'confirmed',
      rows: [{ invoiceNumber: 'INV-1', invoiceDate: '2025-01-05', paymentDate: '2025-02-02', invoiceAmount: 6800, amountPaid: 6800, terms: null }],
      userContext: '', sender: { businessName: 'Bean Co', senderName: 'Alice Ng', senderEmail: 'alice@example.com' },
    }
    expect((await new Client().post('/api/ai/draft', payload)).status).toBe(401)
    const c = new Client()
    await signUpAndVerify(c, alice)
    await c.post('/api/dev/plan', { plan: 'growth' })
    expect((await c.post('/api/ai/draft', { ...payload, extra: 'smuggled' })).status).toBe(400)
    expect((await c.post('/api/ai/draft', { ...payload, rows: [{ ...payload.rows[0], bankAccountLast4: '1234' }] })).status).toBe(400)
    const ok = await c.post('/api/ai/draft', payload)
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ subject: 'Re: Sierra Coffee Supply', body: 'Please refund 6800.' })
    expect(drafts.draft).toHaveBeenLastCalledWith(expect.not.objectContaining({ extra: expect.anything() }))
  })
})
