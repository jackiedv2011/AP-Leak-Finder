// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db.ts'
import { DevMailer } from './mailer.ts'
import { openSecret, sealSecret } from './crypto.ts'
import { createQuickBooksClient, pullLedger, QuickBooksReconnectError, SANDBOX_API_BASE, type QuickBooksClient, type QuickBooksTokens } from './quickbooks.ts'

const tokenKey = randomBytes(32)
const config = loadConfig({
  NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0', SESSION_DAYS: '1', REMEMBER_ME_DAYS: '30',
  QBO_CLIENT_ID: 'test-client', QBO_CLIENT_SECRET: 'test-secret', QBO_TOKEN_KEY: tokenKey.toString('base64'),
})

const REALM = '9341458505092846'
const SAMPLE = {
  company: { CompanyName: 'Sandbox Co' },
  entities: {
    Vendor: [{ Id: '56', DisplayName: 'Acme Supply' }],
    Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250, VendorRef: { value: '56', name: 'Acme Supply' } }],
    BillPayment: [
      { Id: '201', TxnDate: '2026-08-20', TotalAmt: 1250, PayType: 'Check', VendorRef: { name: 'Acme Supply' }, Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] },
      { Id: '202', TxnDate: '2026-08-23', TotalAmt: 1250, PayType: 'Check', VendorRef: { name: 'Acme Supply' }, Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] },
    ],
    VendorCredit: [],
    Deposit: [],
    Purchase: [{ Id: '401', TxnDate: '2026-09-05', TotalAmt: 80, DocNumber: '1', PaymentType: 'CreditCard', EntityRef: { type: 'Vendor', name: 'Acme Supply' } }],
  },
}

/** A stand-in for Intuit that records every call and hands out recognisable tokens. */
function fakeQuickBooks() {
  const calls: string[] = []
  let issued = 0
  const tokens = (expired = false): QuickBooksTokens => {
    issued += 1
    return { accessToken: `access-${issued}-SECRET`, refreshToken: `refresh-${issued}-SECRET`, accessExpiresAt: Date.now() + (expired ? -1 : 3_600_000), refreshExpiresAt: Date.now() + 8_640_000_000 }
  }
  const state = { expireFirst: false, refused: false, revoked: [] as string[], cdc: { CDCResponse: [{ QueryResponse: [] }] } as Record<string, unknown> }
  const client: QuickBooksClient = {
    environment: 'sandbox',
    authorizationUrl: ({ redirectUri, state: s }) => `https://appcenter.intuit.test/connect?redirect_uri=${encodeURIComponent(redirectUri)}&state=${s}`,
    exchangeCode: async ({ code }) => {
      calls.push('exchange')
      if (code !== 'good-code') throw new Error('bad code')
      return tokens(state.expireFirst)
    },
    refresh: async () => {
      calls.push('refresh')
      if (state.refused) throw new QuickBooksReconnectError('refused')
      return tokens()
    },
    revoke: async (refreshToken) => {
      calls.push('revoke')
      state.revoked.push(refreshToken)
    },
    companyInfo: async (realmId) => {
      calls.push(`companyinfo:${realmId}`)
      return SAMPLE.company
    },
    query: async (_realmId, accessToken, statement) => {
      calls.push(`query:${accessToken}`)
      const entity = statement.match(/from (\w+)/)![1] as keyof typeof SAMPLE.entities
      const ids = statement.match(/where Id in \(([^)]*)\)/)?.[1].replace(/'/g, '').split(',')
      return { QueryResponse: { [entity]: (SAMPLE.entities[entity] as Array<{ Id: string }>).filter((row) => !ids || ids.includes(row.Id)) } }
    },
    changes: async (_realmId, _accessToken, entities, since) => {
      calls.push(`cdc:${entities.join(',')}:${since.toISOString()}`)
      return state.cdc
    },
  }
  return { client, calls, state }
}

let app: App
let base: string
let qbo: ReturnType<typeof fakeQuickBooks>

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

/** Runs the whole connect round trip the way a browser would. */
async function connect(c: Client, code = 'good-code') {
  const start = await c.get('/api/integrations/quickbooks/connect')
  expect(start.status).toBe(302)
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!
  return c.get(`/api/integrations/quickbooks/callback?code=${code}&state=${state}&realmId=${REALM}`)
}

const outcome = (res: { headers: Headers }) => new URL(res.headers.get('location')!, 'http://x').searchParams.get('quickbooks')

beforeEach(async () => {
  const db = openDatabase(':memory:')
  qbo = fakeQuickBooks()
  app = createApp({ config, db, mailer: new DevMailer(db), google: null, drafts: null, quickbooks: qbo.client })
  base = `http://127.0.0.1:${await app.listen(0)}`
})
afterEach(async () => {
  await app.close()
  app.db.close()
})

describe('sealed secrets', () => {
  const key = randomBytes(32)
  it('round-trips, and refuses a changed value, another key or another owner', () => {
    const sealed = sealSecret('refresh-token-value', key, 'quickbooks:user_a:1')
    expect(sealed).not.toContain('refresh-token-value')
    expect(openSecret(sealed, key, 'quickbooks:user_a:1')).toBe('refresh-token-value')
    expect(() => openSecret(sealed, randomBytes(32), 'quickbooks:user_a:1')).toThrow()
    expect(() => openSecret(sealed, key, 'quickbooks:user_b:1')).toThrow()
    const [v, iv, tag, body] = sealed.split('.')
    const flipped = Buffer.from(body, 'base64url')
    flipped[0] ^= 1
    expect(() => openSecret([v, iv, tag, flipped.toString('base64url')].join('.'), key, 'quickbooks:user_a:1')).toThrow()
    expect(() => openSecret([v, iv, tag.slice(0, 8), body].join('.'), key, 'quickbooks:user_a:1')).toThrow()
  })

  it('requires a 32-byte key in the environment', () => {
    expect(() => loadConfig({ QBO_CLIENT_ID: 'a', QBO_CLIENT_SECRET: 'b', QBO_TOKEN_KEY: 'too-short' })).toThrow(/32 random bytes/)
    expect(loadConfig({ QBO_CLIENT_ID: 'a', QBO_CLIENT_SECRET: 'b' }).quickbooks).toBeNull()
  })
})

describe('connecting QuickBooks', () => {
  it('needs a signed-in account', async () => {
    const guest = new Client()
    expect((await guest.get('/api/integrations/quickbooks')).status).toBe(401)
    const start = await guest.get('/api/integrations/quickbooks/connect')
    expect(start.status).toBe(302)
    expect(start.headers.get('location')).toMatch(/^\/login/)
  })

  it('round trip: Intuit consent, tokens sealed at rest, status without any token', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    expect((await alice.get('/api/integrations/quickbooks')).body).toMatchObject({ available: true, environment: 'sandbox', connected: false })

    const start = await alice.get('/api/integrations/quickbooks/connect')
    const intuit = new URL(start.headers.get('location')!)
    expect(intuit.searchParams.get('redirect_uri')).toBe('http://localhost:0/api/integrations/quickbooks/callback')
    expect(start.headers.getSetCookie().join(';')).toMatch(/reclaim_qbo_state=.*Path=\/api\/integrations\/quickbooks.*HttpOnly/)

    const done = await alice.get(`/api/integrations/quickbooks/callback?code=good-code&state=${intuit.searchParams.get('state')}&realmId=${REALM}`)
    expect(outcome(done)).toBe('connected')
    expect(done.headers.get('location')).toMatch(/^\/audit\?entry=upload/)

    const row = app.db.prepare('SELECT * FROM integration_connections').get() as Record<string, unknown>
    expect(row).toMatchObject({ provider: 'quickbooks', realm_id: REALM, company_name: 'Sandbox Co' })
    expect(JSON.stringify(row)).not.toMatch(/SECRET/)

    const status = await alice.get('/api/integrations/quickbooks')
    expect(status.body).toMatchObject({ connected: true, companyName: 'Sandbox Co', lastSyncAt: null })
    expect(status.text).not.toMatch(/SECRET|access|refresh|realm/i)
  })

  it('refuses a callback whose state is missing, wrong, or was started by another account', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    const bob = await signedIn('Bob', 'bob@example.com')
    expect(outcome(await alice.get(`/api/integrations/quickbooks/callback?code=good-code&state=nope&realmId=${REALM}`))).toBe('state')

    const start = await alice.get('/api/integrations/quickbooks/connect')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    // Bob replays Alice's state cookie and code in his own session.
    bob.cookies.set('reclaim_qbo_state', alice.cookies.get('reclaim_qbo_state')!)
    expect(outcome(await bob.get(`/api/integrations/quickbooks/callback?code=good-code&state=${state}&realmId=${REALM}`))).toBe('state')
    expect(outcome(await alice.get(`/api/integrations/quickbooks/callback?code=good-code&state=${state}&realmId=not-a-number`))).toBe('state')
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get()).toEqual({ n: 0 })
    expect(qbo.calls).not.toContain('exchange')
  })

  it('reports a cancelled consent without storing anything', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await alice.get('/api/integrations/quickbooks/connect')
    expect(outcome(await alice.get('/api/integrations/quickbooks/callback?error=access_denied'))).toBe('cancelled')
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get()).toEqual({ n: 0 })
  })
})

describe('importing and disconnecting', () => {
  it('imports the ledger as CSV the normal parser accepts', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const res = await alice.post('/api/integrations/quickbooks/sync')
    expect(res.status).toBe(200)
    expect(res.body.companyName).toBe('Sandbox Co')
    const [header, ...rows] = (res.body.csv as string).trim().split('\n')
    expect(header).toBe('vendor,invoice_number,invoice_date,invoice_amount,payment_date,amount_paid,terms,category,currency,transaction_id,company,source_account,transaction_type')
    expect(rows).toHaveLength(3)
    // Beside the CSV, the links it can't carry: both payments paid Bill 101.
    expect(res.body.facts.schemaVersion).toBe(1)
    expect(res.body.facts.payments['qbo:BillPayment:202'].bill).toEqual({ txnType: 'Bill', id: '101', txnDate: '2026-08-01', amountMinor: 125000, docNumber: 'INV-7781' })
    expect(Object.keys(res.body.facts.payments)).toEqual(['qbo:BillPayment:201', 'qbo:BillPayment:202', 'qbo:Purchase:401'])
    expect((await alice.get('/api/integrations/quickbooks')).body.lastSyncAt).toEqual(expect.any(Number))
  })

  it('after a recent import, reads only what changed, and fetches the bills changed payments link to', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    qbo.state.cdc = { CDCResponse: [{ QueryResponse: [
      { BillPayment: [
        { Id: '202', TxnDate: '2026-08-23', TotalAmt: 1200, PayType: 'Check', VendorRef: { value: '56', name: 'Acme Supply' }, MetaData: { CreateTime: '2026-08-23T10:00:00Z' }, Line: [{ Amount: 1200, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] },
        { Id: '203', status: 'Deleted', MetaData: { LastUpdatedTime: '2026-10-10T10:00:00Z' } },
      ] },
      { Purchase: [{ Id: '402', TxnDate: '2026-10-12', TotalAmt: 45, PaymentType: 'Cash', EntityRef: { type: 'Vendor', value: '56', name: 'Acme Supply' }, MetaData: { CreateTime: new Date().toISOString() } }] },
    ] }] }
    const since = Date.now() - 3 * 86_400_000
    const res = await alice.call('/api/integrations/quickbooks/sync', { method: 'POST', json: { since } })
    expect(res.status).toBe(200)
    expect(qbo.calls).toContain(`cdc:Vendor,Bill,BillPayment,VendorCredit,Deposit,Purchase:${new Date(since).toISOString()}`)
    expect(res.body.facts.sync).toEqual({ realmId: REALM, mode: 'changes', since, touched: ['BillPayment:202', 'BillPayment:203', 'Purchase:402'], removed: [{ txnType: 'BillPayment', id: '203' }] })
    const rows = (res.body.csv as string).trim().split('\n').slice(1)
    // Bill 101 didn't change, but was fetched by id so the payment still names its invoice.
    expect(rows).toEqual([expect.stringMatching(/^Acme Supply,INV-7781,2026-08-01,1250,2026-08-23,1200,.*qbo:BillPayment:202,/), expect.stringContaining('qbo:Purchase:402')])
    expect(res.body.facts.searched).toEqual({ vendorCredits: 0, deposits: 0, purchases: 1, billPayments: 0 })
  })

  it('pulls the whole ledger when the last import is older than QuickBooks keeps changes', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const res = await alice.call('/api/integrations/quickbooks/sync', { method: 'POST', json: { since: Date.now() - 31 * 86_400_000 } })
    expect(res.body.facts.sync.mode).toBe('full')
    expect(qbo.calls.some((c) => c.startsWith('cdc:'))).toBe(false)
    expect((res.body.csv as string).trim().split('\n')).toHaveLength(4)
  })

  it('pulls the whole ledger when a change set is too large to be complete', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    qbo.state.cdc = { CDCResponse: [{ QueryResponse: [{ Purchase: Array.from({ length: 1000 }, (_, i) => ({ Id: String(i + 1) })) }] }] }
    const res = await alice.call('/api/integrations/quickbooks/sync', { method: 'POST', json: { since: Date.now() - 86_400_000 } })
    expect(res.body.facts.sync.mode).toBe('full')
    expect(qbo.calls.some((c) => c.startsWith('cdc:'))).toBe(true)
  })

  it('refreshes an expired access token and re-seals the new one', async () => {
    qbo.state.expireFirst = true
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const before = (app.db.prepare('SELECT tokens_sealed FROM integration_connections').get() as { tokens_sealed: string }).tokens_sealed
    expect((await alice.post('/api/integrations/quickbooks/sync')).status).toBe(200)
    expect(qbo.calls).toContain('refresh')
    expect(qbo.calls.filter((c) => c.startsWith('query:')).every((c) => c === 'query:access-2-SECRET')).toBe(true)
    expect((app.db.prepare('SELECT tokens_sealed FROM integration_connections').get() as { tokens_sealed: string }).tokens_sealed).not.toBe(before)
  })

  it('asks to reconnect, and forgets the connection, when Intuit refuses the refresh token', async () => {
    qbo.state.expireFirst = true
    qbo.state.refused = true
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    const res = await alice.post('/api/integrations/quickbooks/sync')
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('quickbooks_reconnect')
    expect((await alice.get('/api/integrations/quickbooks')).body.connected).toBe(false)
  })

  it('keeps accounts apart: another account sees nothing and cannot use moved tokens', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    const bob = await signedIn('Bob', 'bob@example.com')
    await connect(alice)
    expect((await bob.get('/api/integrations/quickbooks')).body.connected).toBe(false)
    expect((await bob.post('/api/integrations/quickbooks/sync')).status).toBe(409)

    // Someone with database access copies Alice's sealed tokens onto Bob's account.
    const bobId = (app.db.prepare("SELECT id FROM users WHERE email = 'bob@example.com'").get() as { id: string }).id
    app.db.prepare("INSERT INTO integration_connections (user_id, provider, realm_id, company_name, tokens_sealed, connected_at) SELECT ?, provider, realm_id, company_name, tokens_sealed, connected_at FROM integration_connections WHERE provider = 'quickbooks'").run(bobId)
    const stolen = await bob.post('/api/integrations/quickbooks/sync')
    expect(stolen.status).toBe(409)
    expect(stolen.body.code).toBe('quickbooks_reconnect')
    expect(qbo.calls.filter((c) => c.startsWith('query:'))).toHaveLength(0)
  })

  it('disconnect cancels access with Intuit and deletes the sealed tokens', async () => {
    const alice = await signedIn('Alice', 'alice@example.com')
    await connect(alice)
    expect((await alice.post('/api/integrations/quickbooks/disconnect')).status).toBe(200)
    expect(qbo.state.revoked).toEqual(['refresh-1-SECRET'])
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get()).toEqual({ n: 0 })
    expect((await alice.post('/api/integrations/quickbooks/sync')).status).toBe(409)
  })

  it('is unavailable, not broken, when the server has no QuickBooks keys', async () => {
    const bareDb = openDatabase(':memory:')
    const bare = createApp({ config: { ...config, quickbooks: null }, db: bareDb, mailer: new DevMailer(bareDb), google: null, drafts: null })
    const port = await bare.listen(0)
    const saved = base
    base = `http://127.0.0.1:${port}`
    try {
      const c = await signedIn('Cara', 'cara@example.com')
      expect((await c.get('/api/integrations/quickbooks')).body).toEqual({ available: false })
      expect(outcome(await c.get('/api/integrations/quickbooks/connect'))).toBe('unavailable')
    } finally {
      base = saved
      await bare.close()
    }
  })
})

describe('the QuickBooks client is read-only', () => {
  it('reads company data only with GET, only from the sandbox API, only with SELECT', async () => {
    const seen: Array<{ method: string; url: URL }> = []
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      seen.push({ method: init?.method ?? 'GET', url })
      if (url.pathname.endsWith('/tokens/bearer')) return Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600, x_refresh_token_expires_in: 8_640_000 })
      if (url.pathname.includes('/companyinfo/')) return Response.json({ CompanyInfo: SAMPLE.company })
      if (url.pathname.endsWith('/cdc')) return Response.json({ CDCResponse: [{ QueryResponse: [] }] })
      const entity = url.searchParams.get('query')!.match(/from (\w+)/)![1] as keyof typeof SAMPLE.entities
      return Response.json({ QueryResponse: { [entity]: SAMPLE.entities[entity] } })
    }) as typeof fetch
    const client = createQuickBooksClient('id', 'secret', fakeFetch)
    const tokens = await client.exchangeCode({ code: 'c', redirectUri: 'http://localhost/cb' })
    await pullLedger(client, REALM, tokens.accessToken)

    const data = seen.filter((s) => s.url.origin === SANDBOX_API_BASE)
    expect(data.length).toBeGreaterThan(5)
    expect(data.every((s) => s.method === 'GET')).toBe(true)
    // Anything sent with another method went to Intuit's sign-in service, never to company data.
    expect(seen.filter((s) => s.method !== 'GET').every((s) => s.url.hostname === 'oauth.platform.intuit.com')).toBe(true)
    expect(data.map((s) => s.url.searchParams.get('query')).filter(Boolean).every((q) => /^select \* from (Vendor|Bill|BillPayment|VendorCredit|Deposit|Purchase) /.test(q!))).toBe(true)

    seen.length = 0
    await client.changes(REALM, tokens.accessToken, ['BillPayment', 'Purchase'], new Date('2026-10-01T00:00:00Z'))
    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe('GET')
    expect(seen[0].url.origin + seen[0].url.pathname).toBe(`${SANDBOX_API_BASE}/v3/company/${REALM}/cdc`)
    expect(seen[0].url.searchParams.get('entities')).toBe('BillPayment,Purchase')
    expect(seen[0].url.searchParams.get('changedSince')).toBe('2026-10-01T00:00:00.000Z')
    await expect(client.changes(REALM, 'a', ['Invoice'], new Date())).rejects.toThrow(/ledger entities/)

    await expect(client.query(REALM, 'a', 'delete from Bill where Id = 1')).rejects.toThrow(/Only SELECT/)
    await expect(client.companyInfo('../../v3/company/1/bill', 'a')).rejects.toThrow(/company id/)
  })
})
