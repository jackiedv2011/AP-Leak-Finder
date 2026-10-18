// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TERMS_VERSION } from '../src/legal/terms.ts'
import { createApp, type App } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db.ts'
import { DevMailer } from './mailer.ts'
import type { QuickBooksClient } from './quickbooks.ts'

const config = loadConfig({
  NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0', REQUIRE_EMAIL_VERIFICATION: 'false',
  QBO_CLIENT_ID: 'test-client', QBO_CLIENT_SECRET: 'test-secret', QBO_TOKEN_KEY: randomBytes(32).toString('base64'),
  DATA_KEY: randomBytes(32).toString('base64'),
})

const revoked: string[] = []
const quickbooks: QuickBooksClient = {
  environment: 'sandbox',
  authorizationUrl: ({ state }) => `https://appcenter.intuit.test/connect?state=${state}`,
  exchangeCode: async () => ({ accessToken: 'access-SECRET', refreshToken: 'refresh-SECRET', accessExpiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 8_640_000_000 }),
  refresh: async () => {
    throw new Error('not used')
  },
  revoke: async (token) => {
    revoked.push(token)
  },
  companyInfo: async () => ({ CompanyName: 'Sandbox Co' }),
  query: async () => ({ QueryResponse: {} }),
  changes: async () => ({ CDCResponse: [] }),
}

let app: App
let base: string

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

const audit = (id: string, vendor: string) => ({
  id, name: `${vendor} audit`, sourceLabel: `${vendor}.csv`, mode: 'upload', createdAt: 1, updatedAt: 2,
  environment: { records: [{ id: `${id}-r1`, vendor, invoiceNumber: 'INV-1', invoiceDate: '2026-08-01', paymentDate: '2026-08-02', invoiceAmount: 1250, amountPaid: 1250 }], imports: [], result: { findings: [] } },
})

async function signedUp(first: string, email: string, termsVersion = TERMS_VERSION) {
  const c = new Client()
  const res = await c.post('/api/auth/signup', { firstName: first, lastName: 'Test', email, company: `${first} Co`, password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true, termsVersion })
  expect(res.status).toBe(201)
  return c
}

async function connectQuickBooks(c: Client) {
  const start = await c.get('/api/integrations/quickbooks/connect')
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!
  await c.get(`/api/integrations/quickbooks/callback?code=good&state=${state}&realmId=9341458505092846`)
}

const count = (sql: string, ...params: string[]) => (app.db.prepare(sql).get(...params) as { n: number }).n

beforeEach(async () => {
  revoked.length = 0
  const db = openDatabase(':memory:')
  app = createApp({ config, db, mailer: new DevMailer(db), google: null, drafts: null, quickbooks })
  base = `http://127.0.0.1:${await app.listen(0)}`
})
afterEach(async () => {
  await app.close()
  app.db.close()
})

describe('stored audits', () => {
  it('are sealed at rest and come back intact through the API', async () => {
    const alice = await signedUp('Alice', 'alice@example.com')
    expect((await alice.put('/api/projects/a1', audit('a1', 'Acme Plaintext Supply'))).status).toBe(200)
    const row = app.db.prepare('SELECT payload, name, source_label FROM projects').get() as { payload: string; name: string; source_label: string }
    expect(row.payload.startsWith('v1.')).toBe(true)
    expect(JSON.stringify(row)).not.toContain('Acme Plaintext Supply')
    expect((await alice.get('/api/projects')).body.projects).toEqual([audit('a1', 'Acme Plaintext Supply')])
  })
})

describe('GET /api/account/export', () => {
  it('downloads the account and every audit as JSON, with no secrets', async () => {
    const alice = await signedUp('Alice', 'alice@example.com')
    await alice.put('/api/projects/a1', audit('a1', 'Acme Supply'))
    await alice.put('/api/projects/a2', audit('a2', 'Bolt Freight'))
    await connectQuickBooks(alice)
    const bob = await signedUp('Bob', 'bob@example.com')
    await bob.put('/api/projects/b1', audit('b1', 'Bob Only Vendor'))

    const res = await alice.get('/api/account/export')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="reclaim-export-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.body.account).toMatchObject({ email: 'alice@example.com', firstName: 'Alice', company: 'Alice Co', signInMethods: ['password'], termsVersion: TERMS_VERSION })
    expect(res.body.quickbooks).toMatchObject({ companyName: 'Sandbox Co' })
    expect(res.body.audits.map((a: { id: string }) => a.id).sort()).toEqual(['a1', 'a2'])
    expect(res.text).not.toContain('Bob Only Vendor')
    expect(res.text).not.toMatch(/SECRET|scrypt|password_hash|tokens_sealed/)
  })

  it('needs a session', async () => {
    expect((await new Client().get('/api/account/export')).status).toBe(401)
  })
})

describe('POST /api/account/delete', () => {
  it('refuses without the account email typed exactly, and deletes nothing', async () => {
    const alice = await signedUp('Alice', 'alice@example.com')
    await alice.put('/api/projects/a1', audit('a1', 'Acme Supply'))
    for (const confirmEmail of [undefined, '', 'bob@example.com', 'alice@example']) {
      const res = await alice.post('/api/account/delete', { confirmEmail })
      expect(res.status).toBe(400)
      expect(res.body.fields.confirmEmail).toBeTruthy()
    }
    expect(count('SELECT COUNT(*) AS n FROM projects')).toBe(1)
    expect((await alice.get('/api/auth/me')).status).toBe(200)
  })

  it('revokes QuickBooks with Intuit, then removes the user and everything tied to them, and only them', async () => {
    const alice = await signedUp('Alice', 'Alice@Example.com')
    await alice.put('/api/projects/a1', audit('a1', 'Acme Supply'))
    await connectQuickBooks(alice)
    const aliceOnOtherDevice = new Client()
    aliceOnOtherDevice.cookies = new Map(alice.cookies)
    const bob = await signedUp('Bob', 'bob@example.com')
    await bob.put('/api/projects/b1', audit('b1', 'Bolt Freight'))
    const aliceId = (await alice.get('/api/auth/me')).body.user.id as string

    // Case and spacing don't matter; the address does.
    const res = await alice.post('/api/account/delete', { confirmEmail: '  alice@example.COM ' })
    expect(res.status).toBe(200)
    expect(alice.cookies.size).toBe(0)
    expect(revoked).toEqual(['refresh-SECRET'])

    for (const table of ['users', 'sessions', 'tokens', 'identities', 'projects', 'upload_rows', 'audit_starts', 'integration_connections']) {
      const column = table === 'users' ? 'id' : 'user_id'
      expect(count(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, aliceId), table).toBe(0)
    }
    expect((await aliceOnOtherDevice.get('/api/projects')).status).toBe(401)
    expect((await bob.get('/api/projects')).body.projects).toHaveLength(1)
    expect((await bob.get('/api/integrations/quickbooks')).status).toBe(200)

    // The address is free again.
    await signedUp('Alice', 'alice@example.com')
  })

  it('still deletes when Intuit fails to answer', async () => {
    const alice = await signedUp('Alice', 'alice@example.com')
    await connectQuickBooks(alice)
    const original = quickbooks.revoke
    quickbooks.revoke = async () => {
      throw new Error('intuit down')
    }
    try {
      expect((await alice.post('/api/account/delete', { confirmEmail: 'alice@example.com' })).status).toBe(200)
    } finally {
      quickbooks.revoke = original
    }
    expect(count('SELECT COUNT(*) AS n FROM integration_connections')).toBe(0)
  })
})

describe('POST /api/account/accept-terms', () => {
  it('records acceptance of the current version only', async () => {
    const alice = await signedUp('Alice', 'alice@example.com', '2025-01-old')
    expect((await alice.get('/api/auth/me')).body.user.termsVersion).toBe('2025-01-old')

    const stale = await alice.post('/api/account/accept-terms', { termsVersion: '2025-01-old' })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('terms_outdated')

    const res = await alice.post('/api/account/accept-terms', { termsVersion: TERMS_VERSION })
    expect(res.status).toBe(200)
    expect(res.body.user.termsVersion).toBe(TERMS_VERSION)
    const me = (await alice.get('/api/auth/me')).body.user
    expect(me.termsVersion).toBe(TERMS_VERSION)
    expect(me.termsAcceptedAt).toBeGreaterThan(Date.now() - 60_000)
  })

  it('needs a session', async () => {
    expect((await new Client().post('/api/account/accept-terms', { termsVersion: TERMS_VERSION })).status).toBe(401)
  })
})
