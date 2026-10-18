// @vitest-environment node
// The fixes from docs/security-review.md, each stated as the behaviour it guarantees.
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type App } from './app.ts'
import { loadConfig, type ServerConfig } from './config.ts'
import { openDatabase } from './db.ts'
import type { GoogleClient, GoogleIdentity } from './google.ts'
import { clientIp, isCrossSiteWrite, parseCookies, RateLimiter } from './http.ts'
import { DevMailer } from './mailer.ts'

const devConfig = (extra: Record<string, string> = {}) =>
  loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0', REQUIRE_EMAIL_VERIFICATION: 'false', ...extra })
const prodConfig = () =>
  loadConfig({ NODE_ENV: 'production', DATABASE_PATH: ':memory:', APP_ORIGIN: 'https://app.reclaim.example', RESEND_API_KEY: 're_test', EMAIL_FROM: 'no-reply@reclaim.example', DATA_KEY: randomBytes(32).toString('base64') })

let googleIdentity: GoogleIdentity | null = null
const fakeGoogle: GoogleClient = {
  authorizationUrl: ({ state }) => `https://accounts.google.test/auth?state=${state}`,
  exchangeCode: async ({ code }) => {
    if (code !== 'good-code' || !googleIdentity) throw new Error('bad code')
    return googleIdentity
  },
}

let app: App | null = null
let base = ''
async function start(config: ServerConfig) {
  const db = openDatabase(':memory:')
  // DevMailer in every case: nothing here can send real email.
  app = createApp({ config, db, mailer: new DevMailer(db), google: fakeGoogle, drafts: null, quickbooks: null, gmail: null })
  base = `http://127.0.0.1:${await app.listen(0)}`
}
afterEach(async () => {
  await app?.close()
  app?.db.close()
  app = null
  googleIdentity = null
})

class Client {
  cookies = new Map<string, string>()
  readonly extraHeaders: Record<string, string>
  constructor(extraHeaders: Record<string, string> = {}) {
    this.extraHeaders = extraHeaders
  }
  async call(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers({ ...this.extraHeaders, ...(init.headers as Record<string, string>) })
    if (init.json !== undefined) headers.set('Content-Type', 'application/json')
    if (this.cookies.size && !headers.has('Cookie')) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '))
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
  get = (p: string, headers?: Record<string, string>) => this.call(p, { headers })
  post = (p: string, json: unknown = {}, headers?: Record<string, string>) => this.call(p, { method: 'POST', json, headers })
}

const person = (email: string, password = 'correct-horse-battery') => ({ firstName: 'Pat', lastName: 'Lee', email, company: 'Lee Co', password, confirmPassword: password, acceptedTerms: true, termsVersion: 't' })

describe('cookies', () => {
  it('skip a malformed cookie instead of failing every request', async () => {
    expect(parseCookies('a=%E0%A4%A; b=ok')).toEqual({ b: 'ok' })
    await start(devConfig())
    expect((await new Client().get('/api/auth/me', { Cookie: 'tracker=%E0%A4%A' })).status).toBe(401)
  })
})

describe('client address behind a proxy (TRUST_PROXY)', () => {
  const req = (xff: string | undefined, socket = '10.0.0.1') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: socket } }) as never

  it('ignores X-Forwarded-For unless told how many proxies to trust', () => {
    expect(clientIp(req('203.0.113.9'), 0)).toBe('10.0.0.1')
    expect(devConfig().trustProxy).toBe(0)
  })

  it('takes the address the trusted proxy saw, not what the client claimed', () => {
    expect(clientIp(req('203.0.113.9'), 1)).toBe('203.0.113.9')
    expect(clientIp(req('6.6.6.6, 203.0.113.9'), 1)).toBe('203.0.113.9')
    expect(clientIp(req('6.6.6.6, 203.0.113.9, 10.1.1.1'), 2)).toBe('203.0.113.9')
    expect(clientIp(req('2001:db8::1'), 1)).toBe('2001:db8::1')
    expect(clientIp(req('<script>'), 1)).toBe('10.0.0.1')
    expect(clientIp(req(undefined), 1)).toBe('10.0.0.1')
  })

  it('accepts a hop count, and refuses anything else', () => {
    expect(devConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1)
    expect(devConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(1)
    expect(() => devConfig({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/)
    expect(() => devConfig({ TRUST_PROXY: '9' })).toThrow(/TRUST_PROXY/)
  })

  it('gives each visitor behind the proxy their own limit', async () => {
    await start(devConfig({ TRUST_PROXY: '1' }))
    const fromA = new Client({ 'X-Forwarded-For': '203.0.113.1' })
    for (let i = 0; i < 20; i++) await fromA.post('/api/auth/login', { email: `a${i}@example.com`, password: 'wrong-password' })
    expect((await fromA.post('/api/auth/login', { email: 'a99@example.com', password: 'wrong-password' })).status).toBe(429)
    const fromB = new Client({ 'X-Forwarded-For': '203.0.113.2' })
    expect((await fromB.post('/api/auth/login', { email: 'b@example.com', password: 'wrong-password' })).status).toBe(401)
  }, 20_000)
})

describe('per-address limits', () => {
  it('stops password guessing on one account spread across many addresses', async () => {
    await start(devConfig({ TRUST_PROXY: '1' }))
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await new Client({ 'X-Forwarded-For': `198.51.100.${i}` }).post('/api/auth/login', { email: 'victim@example.com', password: 'wrong-password' })).status)
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true)
  }, 20_000)

  it('won’t flood someone’s inbox with reset emails, and answers the same either way', async () => {
    await start(devConfig({ TRUST_PROXY: '1' }))
    await new Client().post('/api/auth/signup', person('pat@example.com'))
    for (let i = 0; i < 8; i++) {
      const res = await new Client({ 'X-Forwarded-For': `198.51.100.${i}` }).post('/api/auth/forgot-password', { email: 'pat@example.com' })
      expect(res.status).toBe(200)
    }
    const mails = app!.db.prepare("SELECT COUNT(*) AS n FROM mailbox WHERE subject LIKE 'Reset%'").get() as { n: number }
    expect(mails.n).toBe(5)
  }, 20_000)
})

describe('cross-site writes', () => {
  it('are refused when a browser says the request came from another site', () => {
    const r = (method: string, headers: Record<string, string>) => ({ method, headers }) as never
    expect(isCrossSiteWrite(r('POST', { 'sec-fetch-site': 'cross-site' }), 'http://localhost:5174', false)).toBe(true)
    expect(isCrossSiteWrite(r('POST', { 'sec-fetch-site': 'same-origin' }), 'http://localhost:5174', false)).toBe(false)
    expect(isCrossSiteWrite(r('GET', { 'sec-fetch-site': 'cross-site' }), 'http://localhost:5174', false)).toBe(false)
    // Production pins the origin, which also catches a sibling subdomain (same-site for SameSite=Lax).
    expect(isCrossSiteWrite(r('POST', { origin: 'https://evil.reclaim.example' }), 'https://app.reclaim.example', true)).toBe(true)
    expect(isCrossSiteWrite(r('POST', { origin: 'null' }), 'https://app.reclaim.example', true)).toBe(true)
    expect(isCrossSiteWrite(r('PUT', { origin: 'https://app.reclaim.example' }), 'https://app.reclaim.example', true)).toBe(false)
    // No browser headers at all: curl, or a provider's webhook. Not CSRF.
    expect(isCrossSiteWrite(r('POST', {}), 'https://app.reclaim.example', true)).toBe(false)
  })

  it('never reach a route in production', async () => {
    await start(prodConfig())
    const evil = await new Client().post('/api/auth/login', { email: 'a@example.com', password: 'x' }, { Origin: 'https://evil.example' })
    expect(evil.status).toBe(403)
    expect(evil.body.code).toBe('cross_site')
    const own = await new Client().post('/api/auth/login', { email: 'a@example.com', password: 'wrong-password' }, { Origin: 'https://app.reclaim.example' })
    expect(own.status).toBe(401)
  })
})

describe('security headers', () => {
  it('include a CSP (enforced basics, full policy report-only) and isolation headers', async () => {
    await start(devConfig())
    const res = await new Client().get('/api/auth/providers')
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
    expect(res.headers.get('content-security-policy-report-only')).toContain("default-src 'self'")
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(res.headers.get('strict-transport-security')).toBeNull()
  })

  it('send HSTS in production', async () => {
    await start(prodConfig())
    expect((await new Client().get('/api/auth/providers')).headers.get('strict-transport-security')).toContain('max-age=31536000')
  })
})

describe('Google sign-in onto an address someone registered first', () => {
  it('drops the unverified password, so the person who registered it can’t get in', async () => {
    await start(loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0' }))
    // A stranger registers the owner's address with their own password and never verifies it.
    expect((await new Client().post('/api/auth/signup', person('owner@example.com', 'strangers-password'))).status).toBe(201)

    // The real owner then signs in with Google, which has verified the address.
    googleIdentity = { sub: 'google-owner', email: 'owner@example.com', emailVerified: true, givenName: 'Owner', familyName: 'Real' }
    const owner = new Client()
    const startRes = await owner.get('/api/auth/google')
    const state = new URL(startRes.headers.get('location')!).searchParams.get('state')!
    const callback = await owner.get(`/api/auth/google/callback?code=good-code&state=${state}`)
    expect(callback.headers.get('location')).toBe('/audit')
    expect((await owner.get('/api/auth/me')).body.user.methods).toEqual(['google'])

    const stranger = await new Client().post('/api/auth/login', { email: 'owner@example.com', password: 'strangers-password' })
    expect(stranger.status).toBe(401)
  })
})

describe('password reset', () => {
  it('voids every other reset link already sent', async () => {
    await start(loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0', REQUIRE_EMAIL_VERIFICATION: 'false' }))
    await new Client().post('/api/auth/signup', person('pat@example.com'))
    await new Client().post('/api/auth/forgot-password', { email: 'pat@example.com' })
    await new Client().post('/api/auth/forgot-password', { email: 'pat@example.com' })
    const links = (app!.db.prepare("SELECT link FROM mailbox WHERE subject LIKE 'Reset%' ORDER BY id").all() as Array<{ link: string }>).map((m) => new URL(m.link).searchParams.get('token'))
    expect(links).toHaveLength(2)
    expect((await new Client().post('/api/auth/reset-password', { token: links[1], password: 'brand-new-password', confirmPassword: 'brand-new-password' })).status).toBe(200)
    const older = await new Client().post('/api/auth/reset-password', { token: links[0], password: 'another-password', confirmPassword: 'another-password' })
    expect(older.status).toBe(400)
    expect(older.body.code).toBe('token_used')
  })

  it('refuses an absurdly long password', async () => {
    await start(devConfig())
    expect((await new Client().post('/api/auth/login', { email: 'a@example.com', password: 'x'.repeat(5000) })).status).toBe(401)
  })
})

describe('rate limiter memory', () => {
  it('drops expired windows, so many one-off keys don’t pile up', () => {
    vi.useFakeTimers()
    try {
      const limiter = new RateLimiter(5, 1000)
      for (let i = 0; i < 100; i++) limiter.check(`ip-${i}`)
      vi.advanceTimersByTime(2000)
      limiter.check('later')
      expect((limiter as unknown as { hits: Map<string, unknown> }).hits.size).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
