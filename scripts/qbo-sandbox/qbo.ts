// REC-12 sandbox proof: read a QuickBooks Online *sandbox* company, map it to the
// CSV shape Reclaim already imports, and run the app's own parser and detector.
//
//   node --env-file=.env.local --import ./scripts/qbo-sandbox/resolve.mjs scripts/qbo-sandbox/qbo.ts connect
//   node --env-file=.env.local --import ./scripts/qbo-sandbox/resolve.mjs scripts/qbo-sandbox/qbo.ts pull
//   node --env-file=.env.local --import ./scripts/qbo-sandbox/resolve.mjs scripts/qbo-sandbox/qbo.ts report
//
// Read-only by construction: the API helper only issues GET requests, and only to
// Intuit's sandbox host. Tokens and pulled data stay in data/qbo-sandbox/ (git-ignored).
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '@/lib/csv'
import { detectFindings } from '@/lib/detection'
import type { APRecord } from '@/types'
import { toLedgerCsv } from '../../server/quickbooks.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const OUT = path.join(ROOT, 'data', 'qbo-sandbox')
const TOKENS = path.join(OUT, 'tokens.json')
const RAW = path.join(OUT, 'raw.json')
const CSV = path.join(OUT, 'qbo-export.csv')

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const API_BASE = 'https://sandbox-quickbooks.api.intuit.com'
const MINOR_VERSION = '75'
const SCOPE = 'com.intuit.quickbooks.accounting'

interface Tokens { access_token: string; refresh_token: string; expires_at: number; refresh_expires_at: number; realmId: string }
type QboObject = Record<string, any>
interface Raw { pulledAt: string; realmId: string; company: QboObject; entities: Record<string, QboObject[]> }

function env(name: string): string {
  const value = process.env[name]
  if (!value || value.startsWith('paste-')) throw new Error(`${name} is missing from .env.local`)
  return value
}

function save(file: string, data: unknown) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2), { mode: 0o600 })
}

async function tokenRequest(body: Record<string, string>, realmId: string): Promise<Tokens> {
  const basic = Buffer.from(`${env('QBO_CLIENT_ID')}:${env('QBO_CLIENT_SECRET')}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number }
  const now = Date.now()
  const tokens = { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: now + json.expires_in * 1000, refresh_expires_at: now + json.x_refresh_token_expires_in * 1000, realmId }
  save(TOKENS, tokens)
  return tokens
}

async function connect() {
  const redirectUri = env('QBO_REDIRECT_URI')
  const { port, pathname } = new URL(redirectUri)
  const state = randomBytes(16).toString('hex')
  const url = `${AUTHORIZE_URL}?${new URLSearchParams({ client_id: env('QBO_CLIENT_ID'), response_type: 'code', scope: SCOPE, redirect_uri: redirectUri, state })}`

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const callback = new URL(req.url ?? '/', redirectUri)
      if (callback.pathname !== pathname) { res.writeHead(404).end(); return }
      const code = callback.searchParams.get('code')
      const realmId = callback.searchParams.get('realmId')
      try {
        if (callback.searchParams.get('state') !== state) throw new Error('State mismatch; start connect again.')
        if (!code || !realmId) throw new Error(`Intuit returned no code: ${callback.searchParams.get('error') ?? 'unknown error'}`)
        await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }, realmId)
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Connected to the QuickBooks sandbox. You can close this tab.')
        console.log(`Connected to sandbox company ${realmId}. Tokens saved to data/qbo-sandbox/tokens.json`)
        server.close(); resolve()
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(String(error))
        server.close(); reject(error)
      }
    })
    server.listen(Number(port), '127.0.0.1', () => {
      console.log('Opening Intuit sign-in in your browser. Choose your sandbox company, then Connect.')
      console.log(`If nothing opens, visit:\n${url}`)
      execFile('open', [url])
    })
  })
}

async function tokens(): Promise<Tokens> {
  if (!existsSync(TOKENS)) throw new Error('Not connected yet. Run the connect command first.')
  const current = JSON.parse(readFileSync(TOKENS, 'utf8')) as Tokens
  if (current.expires_at - Date.now() > 60_000) return current
  if (current.refresh_expires_at < Date.now()) throw new Error('Refresh token expired. Run connect again.')
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: current.refresh_token }, current.realmId)
}

/** GET only, sandbox host only. */
async function get(resource: string, params: Record<string, string> = {}): Promise<QboObject> {
  const t = await tokens()
  const url = new URL(`/v3/company/${t.realmId}/${resource}`, API_BASE)
  for (const [k, v] of Object.entries({ ...params, minorversion: MINOR_VERSION })) url.searchParams.set(k, v)
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' } })
  if (res.status === 429) { await new Promise((r) => setTimeout(r, 60_000)); return get(resource, params) }
  if (!res.ok) throw new Error(`GET ${resource} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function queryAll(entity: string): Promise<QboObject[]> {
  const rows: QboObject[] = []
  for (let start = 1; ; start += 1000) {
    const json = await get('query', { query: `select * from ${entity} startposition ${start} maxresults 1000` })
    const page = (json.QueryResponse?.[entity] ?? []) as QboObject[]
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

const ENTITIES = ['Vendor', 'Bill', 'BillPayment', 'VendorCredit', 'Deposit', 'Purchase', 'JournalEntry']

async function pull() {
  const t = await tokens()
  const company = (await get(`companyinfo/${t.realmId}`)).CompanyInfo
  const entities: Record<string, QboObject[]> = {}
  for (const entity of ENTITIES) {
    entities[entity] = await queryAll(entity)
    console.log(`${entity}: ${entities[entity].length}`)
  }
  save(RAW, { pulledAt: new Date().toISOString(), realmId: t.realmId, company, entities } satisfies Raw)
  console.log(`Saved data/qbo-sandbox/raw.json for "${company.CompanyName}".`)
}

const linksOf = (line: QboObject) => (line.LinkedTxn ?? []) as Array<{ TxnId: string; TxnType: string }>

function keysMatching(objects: QboObject[], pattern: RegExp, prefix = '', found = new Set<string>()) {
  for (const o of objects) for (const [k, v] of Object.entries(o ?? {})) {
    if (pattern.test(k)) found.add(prefix + k)
    if (v && typeof v === 'object') keysMatching(Array.isArray(v) ? v : [v], pattern, `${prefix}${k}.`, found)
  }
  return found
}

function report() {
  if (!existsSync(RAW)) throw new Error('No pulled data yet. Run the pull command first.')
  const raw = JSON.parse(readFileSync(RAW, 'utf8')) as Raw
  const e = raw.entities
  const csv = toLedgerCsv(raw)
  save(CSV, csv)

  const bpLines = e.BillPayment.flatMap((bp) => bp.Line ?? [])
  const linkTypes = new Map<string, number>()
  for (const l of bpLines) for (const x of linksOf(l)) linkTypes.set(x.TxnType, (linkTypes.get(x.TxnType) ?? 0) + 1)
  const voided = e.BillPayment.filter((bp) => /void/i.test(bp.PrivateNote ?? '') || (bp.TotalAmt === 0 && (bp.Line ?? []).length === 0))
  const creditsUsed = e.VendorCredit.filter((vc) => (vc.LinkedTxn ?? []).some((x: QboObject) => x.TxnType === 'BillPayment'))
  const vendorRefunds = e.Purchase.filter((p) => p.EntityRef?.type === 'Vendor' && p.Credit)
  const clearedKeys = keysMatching([...e.BillPayment, ...e.Purchase, ...e.Deposit], /clear|reconcil/i)

  console.log(`\nSandbox company: ${raw.company.CompanyName} (pulled ${raw.pulledAt})`)
  console.log(Object.entries(e).map(([k, v]) => `  ${k}: ${v.length}`).join('\n'))
  console.log('\nEvidence available from source')
  console.log(`  Bill payment lines: ${bpLines.length}; links by type: ${[...linkTypes].map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`)
  console.log(`  Vendor credits applied through a bill payment: ${creditsUsed.length} of ${e.VendorCredit.length}`)
  console.log(`  Vendor refunds (credit-card or check credits from a vendor): ${vendorRefunds.length}`)
  console.log(`  Bill payments that look voided: ${voided.length}${voided.length ? ` (${voided.map((v) => v.Id).join(', ')})` : ''}`)
  console.log(`  Fields mentioning cleared/reconciled: ${clearedKeys.size ? [...clearedKeys].join(', ') : 'none (settlement status not exposed)'}`)

  const parsed = parseCsv(csv)
  const records: APRecord[] = parsed.records.map((r, i) => ({ ...r, id: `qbo-row-${i + 1}`, importBatchId: 'qbo-sandbox' }))
  const { findings } = detectFindings(records)
  console.log(`\nReclaim import: ${records.length} records accepted, ${parsed.skippedCount} rejected. Detector findings: ${findings.length}`)
  for (const f of findings) {
    const ids = f.relatedRecords.map((r) => r.externalTransactionId).join(' + ')
    console.log(`  [${f.type}] ${f.vendor}  $${f.dollarImpact.toFixed(2)}  ${ids}`)
  }
  console.log('\nWrote data/qbo-sandbox/qbo-export.csv (can be uploaded into the app as a normal import).')
}

const command = process.argv[2]
const commands: Record<string, () => unknown> = { connect, pull, report }
if (!commands[command]) {
  console.log('Usage: qbo.ts connect | pull | report')
  process.exit(1)
}
await commands[command]()
