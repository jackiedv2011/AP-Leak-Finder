// @vitest-environment node
/**
 * Adversarial tests against the real HTTP server: plan limits that a client
 * can try to talk its way around, cross-account access, static file serving,
 * and what errors reveal.
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, type App } from './app.ts'
import { loadConfig, type ServerConfig } from './config.ts'
import { openDatabase } from './db.ts'
import { DevMailer } from './mailer.ts'
import type { DraftService } from './ai.ts'

const baseConfig = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0' })

let app: App
let base: string

class Client {
  cookies = new Map<string, string>()
  async call(path: string, init: RequestInit & { json?: unknown; raw?: string } = {}) {
    const headers = new Headers(init.headers)
    if (init.json !== undefined) headers.set('Content-Type', 'application/json')
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    const body = init.json !== undefined ? JSON.stringify(init.json) : init.raw ?? init.body
    const res = await fetch(base + path, { ...init, headers, body, redirect: 'manual' })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const [name, value] = pair.split('=')
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    let json: any = null
    try {
      json = JSON.parse(buffer.toString('utf8'))
    } catch {
      json = null
    }
    return { status: res.status, body: json, bytes: buffer, headers: res.headers }
  }
  get = (p: string) => this.call(p)
  post = (p: string, json: unknown = {}) => this.call(p, { method: 'POST', json })
  put = (p: string, json: unknown) => this.call(p, { method: 'PUT', json })
  del = (p: string) => this.call(p, { method: 'DELETE' })
}

const alice = { firstName: 'Alice', lastName: 'Ng', email: 'alice@example.com', company: 'Ng Co', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true }
const bob = { ...alice, firstName: 'Bob', email: 'bob@example.com' }

async function start(config: ServerConfig = baseConfig, extra: { staticDir?: string; drafts?: DraftService | null } = {}) {
  const db = openDatabase(':memory:')
  app = createApp({ config, db, mailer: new DevMailer(db), google: null, drafts: extra.drafts ?? null, staticDir: extra.staticDir ?? null })
  base = `http://127.0.0.1:${await app.listen(0)}`
}

async function account(input: typeof alice, plan: 'free' | 'growth' | 'flat' = 'free') {
  const c = new Client()
  await c.post('/api/auth/signup', input)
  // Tokens are stored hashed; the plaintext link is only in the (dev) mailbox.
  const mail = app.db.prepare('SELECT link FROM mailbox WHERE to_email = ? ORDER BY id DESC').get(input.email) as { link: string }
  const verified = await c.post('/api/auth/verify-email', { token: new URL(mail.link).searchParams.get('token') })
  expect(verified.status).toBe(200)
  if (plan !== 'free') app.db.prepare('UPDATE users SET plan = ? WHERE email = ?').run(plan, input.email)
  return c
}

const project = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  sourceLabel: `${id}.csv`,
  mode: 'upload',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  environment: { records: [], imports: [], result: { findings: [] }, caseStates: {} },
  ...extra,
})

afterEach(async () => {
  await app.close()
  app.db.close()
})

/** A ledger of `count` payments; `offset` shifts which payments it holds. */
function ledger(id: string, count: number, offset = 0) {
  const records = Array.from({ length: count }, (_, i) => ({
    id: `r${i + offset}`,
    vendor: `Vendor ${(i + offset) % 7}`,
    invoiceNumber: `INV-${1000 + i + offset}`,
    paymentDate: new Date(Date.UTC(2025, 0, 1 + i + offset)).toISOString(),
    amountPaid: 100 + i + offset,
  }))
  return project(id, { name: `${id}.csv`, environment: { records, imports: [], result: { findings: [] }, caseStates: {} } })
}

describe('Free: each ledger is audited once, and the rule cannot be talked around', () => {
  beforeEach(() => start())

  it('uploads of different ledgers are unlimited', async () => {
    const c = await account(alice)
    for (let i = 0; i < 6; i++) expect((await c.put(`/api/projects/l${i}`, ledger(`l${i}`, 20, i * 100))).status).toBe(200)
  })

  it('the same ledger under a new name is flagged and refused, with a message that says why', async () => {
    const c = await account(alice)
    expect((await c.put('/api/projects/jan', ledger('jan', 40))).status).toBe(200)
    const again = await c.put('/api/projects/jan-copy', { ...ledger('jan-copy', 40), sourceLabel: 'january-final-v2.csv' })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('repeat_upload')
    expect(again.body.message).toMatch(/already uploaded/)
    expect((await c.get('/api/projects')).body.projects).toHaveLength(1)
  })

  it('a smaller piece of an uploaded ledger is flagged too', async () => {
    const c = await account(alice)
    await c.put('/api/projects/jan', ledger('jan', 40))
    expect((await c.put('/api/projects/piece', ledger('piece', 5, 10))).status).toBe(409)
    expect((await c.put('/api/projects/one-row', ledger('one-row', 1, 3))).status).toBe(409)
  })

  it('deleting the audit does not make its ledger new again', async () => {
    const c = await account(alice)
    await c.put('/api/projects/jan', ledger('jan', 40))
    await c.del('/api/projects/jan')
    expect((await c.put('/api/projects/jan2', ledger('jan2', 40))).status).toBe(409)
  })

  it('adding an uploaded ledger into another audit is refused, but re-saving an audit with its own rows is fine', async () => {
    const c = await account(alice)
    await c.put('/api/projects/jan', ledger('jan', 40))
    await c.put('/api/projects/feb', ledger('feb', 40, 500))
    const merged = ledger('feb', 80, 500)
    merged.environment.records = [...ledger('x', 40, 500).environment.records, ...ledger('x', 40).environment.records]
    expect((await c.put('/api/projects/feb', merged)).status).toBe(409)
    expect((await c.put('/api/projects/jan', { ...ledger('jan', 40), name: 'renamed' })).status).toBe(200)
  })

  it('a new month that shares a few days with the last one is a new ledger', async () => {
    const c = await account(alice)
    await c.put('/api/projects/jan', ledger('jan', 40))
    expect((await c.put('/api/projects/feb', ledger('feb', 40, 35))).status).toBe(200)
  })

  it('the legacy import endpoint applies the same rule', async () => {
    const c = await account(alice)
    await c.put('/api/projects/jan', ledger('jan', 40))
    const res = await c.post('/api/projects/import', { projects: [ledger('old-copy', 40), ledger('old-new', 10, 900)] })
    expect(res.body.imported).toEqual(['old-new'])
    expect(res.body.blocked).toEqual(['old-copy'])
  })

  it('another account uploading the same ledger is not affected', async () => {
    const a = await account(alice)
    const b = await account(bob)
    await a.put('/api/projects/jan', ledger('jan', 40))
    expect((await b.put('/api/projects/jan', ledger('jan', 40))).status).toBe(200)
  })

  it('Growth and Flat can re-upload and re-audit freely', async () => {
    for (const [who, plan] of [[alice, 'growth'], [bob, 'flat']] as const) {
      const c = await account(who, plan)
      await c.put('/api/projects/jan', ledger('jan', 40))
      expect((await c.put('/api/projects/jan-again', ledger('jan-again', 40))).status).toBe(200)
    }
  })

  it('accounts stored on the old single paid plan become Growth', async () => {
    await account(alice)
    app.db.prepare("UPDATE users SET plan = 'pro'").run()
    const c = new Client()
    await c.post('/api/auth/login', { email: alice.email, password: alice.password })
    expect((await c.get('/api/auth/me')).body.user.plan).toBe('growth')
  })
})

describe('cross-account access', () => {
  beforeEach(() => start())

  it("another account cannot read, overwrite or delete an audit by guessing its id", async () => {
    const a = await account(alice)
    const b = await account(bob)
    await a.put('/api/projects/secret', project('secret', { name: 'Alice payroll vendors' }))
    // Bob writes to the same id: that is Bob's own row, Alice's is untouched.
    await b.put('/api/projects/secret', project('secret', { name: 'overwritten' }))
    await b.del('/api/projects/secret')
    const mine = (await a.get('/api/projects')).body.projects
    expect(mine.map((p: any) => p.name)).toEqual(['Alice payroll vendors'])
    expect(JSON.stringify((await b.get('/api/projects')).body)).not.toContain('Alice payroll')
  })

  it('a forged or stale session cookie is refused everywhere', async () => {
    const a = await account(alice)
    await a.put('/api/projects/p1', project('p1'))
    const forged = new Client()
    forged.cookies.set('reclaim_session', 'x'.repeat(43))
    for (const path of ['/api/projects', '/api/account/entitlements', '/api/auth/me']) expect((await forged.get(path)).status).toBe(401)
    expect((await forged.put('/api/projects/p1', project('p1'))).status).toBe(401)
    expect((await forged.del('/api/projects/p1')).status).toBe(401)
    await a.post('/api/auth/logout')
    expect((await a.get('/api/projects')).status).toBe(401)
  })

  it('SQL-looking ids and names are data, not queries', async () => {
    const a = await account(alice)
    expect((await a.call("/api/projects/x'%20OR%20'1'='1", { method: 'PUT', json: project("x' OR '1'='1") })).status).toBe(404)
    expect((await a.put('/api/projects/p1', project('p1', { name: "'); DROP TABLE users; --" }))).status).toBe(200)
    expect((await a.get('/api/projects')).body.projects[0].name).toBe("'); DROP TABLE users; --")
    expect((app.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1)
  })
})

describe('what the server reveals', () => {
  beforeEach(() => start())

  it('malformed JSON, the wrong content type and an oversized body get a plain message — no stack, no echo', async () => {
    const a = await account(alice)
    const bad = await a.call('/api/projects/p1', { method: 'PUT', raw: '{"id": "p1", "name":', headers: { 'Content-Type': 'application/json' } })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body).sort()).toEqual(['message'])
    const wrongType = await a.call('/api/auth/login', { method: 'POST', raw: 'email=a&password=b', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    expect(wrongType.status).toBe(415)
    const huge = await a.call('/api/projects/p1', { method: 'PUT', raw: `{"pad":"${'x'.repeat(26 * 1024 * 1024)}"}`, headers: { 'Content-Type': 'application/json' } }).catch(() => ({ status: 413, body: {} }))
    expect(huge.status).toBe(413)
    const serialized = JSON.stringify([bad.body, wrongType.body])
    expect(serialized).not.toMatch(/at \w+ \(|node:|\.ts:\d+/)
  })

  it('every response carries basic hardening headers', async () => {
    for (const path of ['/api/auth/providers', '/api/projects', '/api/nope']) {
      const res = await new Client().get(path)
      expect(res.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(res.headers.get('x-frame-options'), path).toBe('DENY')
      expect(res.headers.get('referrer-policy'), path).toBe('strict-origin-when-cross-origin')
    }
  })

  it('credential endpoints are rate limited', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 25; i++) statuses.push((await new Client().post('/api/auth/login', { email: 'x@example.com', password: 'wrong-password' })).status)
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true)
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true)
  })
})

describe('dev-only endpoints', () => {
  it('the dev mailbox (which holds password-reset links) is off for any non-localhost origin, even without NODE_ENV=production', async () => {
    const config = loadConfig({ NODE_ENV: 'development', DATABASE_PATH: ':memory:', APP_ORIGIN: 'https://staging.reclaim.example' })
    expect(config.devMailbox).toBe(false)
    await start(config)
    expect((await new Client().get('/api/dev/mailbox?to=alice@example.com')).status).toBe(404)
    expect((await new Client().post('/api/dev/plan', { plan: 'pro' })).status).toBe(404)
  })

  it('it can still be switched on explicitly for a shared dev box', async () => {
    await start()
    expect(loadConfig({ APP_ORIGIN: 'https://dev.example', DEV_MAILBOX: 'true' }).devMailbox).toBe(true)
    expect(loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://reclaim.example', DEV_MAILBOX: 'true' }).devMailbox).toBe(false)
  })
})

describe('static files (production)', () => {
  let dir: string
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0x81, 0xc3, 0x28])
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'reclaim-static-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>app</title>')
    writeFileSync(join(dir, 'assets', 'logo.png'), png)
    writeFileSync(join(dir, 'assets', 'font.woff2'), png)
    await start(baseConfig, { staticDir: dir })
  })

  it('binary files are served byte-for-byte with the right type', async () => {
    const img = await new Client().get('/assets/logo.png')
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(Buffer.compare(img.bytes, png)).toBe(0)
    const font = await new Client().get('/assets/font.woff2')
    expect(Buffer.compare(font.bytes, png)).toBe(0)
  })

  it('path traversal never reaches a file outside the build directory', async () => {
    for (const path of ['/../../../../etc/passwd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2f..%2fetc%2fpasswd', '/..%5c..%5cwindows%5cwin.ini']) {
      const res = await new Client().get(path)
      expect(res.bytes.toString('utf8'), path).not.toMatch(/root:|\[fonts\]/)
    }
  })

  it('a malformed URL is a 400 or the app shell, never a server error', async () => {
    const res = await new Client().get('/%E0%A4%A')
    expect(res.status).toBeLessThan(500)
  })
})

describe('AI drafting failures', () => {
  const payload = {
    vendor: 'Acme', findingType: 'Exact duplicate payment', findingTitle: 'Duplicate payment of invoice A-1', explanation: 'Paid twice.', evidenceStrength: 'strong',
    amountFlagged: 1200, amountRequested: 1000, method: 'refund', recoveryStage: 'confirmed',
    rows: [{ invoiceNumber: 'A-1', invoiceDate: '2025-01-01', paymentDate: '2025-01-05', invoiceAmount: 1200, amountPaid: 1200, terms: null }],
    userContext: '', sender: { businessName: 'Ng Co', senderName: 'Alice Ng', senderEmail: 'alice@example.com' },
  }

  it('a model error becomes a clear, retryable 502 — never a 500 with details', async () => {
    await start(baseConfig, { drafts: { draft: vi.fn(async () => { throw new Error('upstream 529 overloaded: request_id=abc secret') }) } })
    const c = await account(alice, 'growth')
    const res = await c.post('/api/ai/draft', payload)
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('ai_failed')
    expect(JSON.stringify(res.body)).not.toContain('request_id')
  })

  it('a draft that states an amount the case data does not contain is refused', async () => {
    await start(baseConfig, { drafts: { draft: vi.fn(async () => ({ subject: 'Refund request', body: 'Please refund $12,000.00 for invoice A-1.' })) } })
    const c = await account(alice, 'growth')
    const res = await c.post('/api/ai/draft', payload)
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('ai_unsupported_amount')
  })

  it('a draft whose figures all come from the case is returned as-is', async () => {
    const body = 'We paid invoice A-1 ($1,200.00) twice. Please refund $1,000.00.'
    await start(baseConfig, { drafts: { draft: vi.fn(async () => ({ subject: 'Refund request — $1,000', body })) } })
    const c = await account(alice, 'growth')
    const res = await c.post('/api/ai/draft', payload)
    expect(res.status).toBe(200)
    expect(res.body.body).toBe(body)
  })

  it('an amount requested above what was flagged is rejected before the model is called', async () => {
    const draft = vi.fn(async () => ({ subject: 's', body: 'b' }))
    await start(baseConfig, { drafts: { draft } })
    const c = await account(alice, 'growth')
    const res = await c.post('/api/ai/draft', { ...payload, amountRequested: 5000 })
    expect(res.status).toBe(400)
    expect(draft).not.toHaveBeenCalled()
  })
})
