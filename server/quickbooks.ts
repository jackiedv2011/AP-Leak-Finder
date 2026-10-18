/**
 * QuickBooks Online, read-only, against Intuit's sandbox only.
 *
 * The customer approves on Intuit's own page; Intuit redirects back to the
 * server with a one-time code, and this module exchanges it (with the client
 * secret, which the browser never sees) for access and refresh tokens.
 *
 * Intuit's only accounting permission (`com.intuit.quickbooks.accounting`)
 * also allows writes, so read-only is enforced here, in code: every data call
 * goes through `apiGet`, which only issues GET requests, only to the sandbox
 * API host, and only for a query or the company-info record. Nothing in this
 * module can create, change or delete anything in a customer's books.
 */
import type { QuickBooksFacts, QuickBooksSyncInfo, QuickBooksTxnRef } from './quickbooksFacts.ts'

export interface QuickBooksTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms. */
  accessExpiresAt: number
  refreshExpiresAt: number
}

type QboObject = Record<string, any>
export interface QuickBooksPull {
  company: QboObject
  entities: Record<string, QboObject[]>
}

export interface QuickBooksClient {
  readonly environment: 'sandbox'
  authorizationUrl(params: { redirectUri: string; state: string }): string
  exchangeCode(params: { code: string; redirectUri: string }): Promise<QuickBooksTokens>
  refresh(refreshToken: string): Promise<QuickBooksTokens>
  /** Tells Intuit to cancel the connection. */
  revoke(refreshToken: string): Promise<void>
  companyInfo(realmId: string, accessToken: string): Promise<QboObject>
  query(realmId: string, accessToken: string, statement: string): Promise<QboObject>
  /** Change data capture: what changed in these entities since a moment in the last 30 days. */
  changes(realmId: string, accessToken: string, entities: readonly string[], since: Date): Promise<QboObject>
}

/** A refresh token Intuit no longer accepts: the customer has to connect again. */
export class QuickBooksReconnectError extends Error {}
/** The access token was refused; refresh and retry once. */
export class QuickBooksUnauthorizedError extends Error {}

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
/** Sandbox only. Production access is a separate, later decision (REC-21, REC-20). */
export const SANDBOX_API_BASE = 'https://sandbox-quickbooks.api.intuit.com'
const MINOR_VERSION = '75'
export const QUICKBOOKS_SCOPE = 'com.intuit.quickbooks.accounting'

/** The entities a case needs, and nothing else: no customers, invoices, payroll or attachments. */
export const LEDGER_ENTITIES = ['Vendor', 'Bill', 'BillPayment', 'VendorCredit', 'Deposit', 'Purchase'] as const

export function createQuickBooksClient(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): QuickBooksClient {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  async function tokenRequest(body: Record<string, string>): Promise<QuickBooksTokens> {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    // Never include the response body in errors: it can echo token material.
    if (res.status === 400 || res.status === 401) throw new QuickBooksReconnectError(`QuickBooks refused the token request (${res.status}).`)
    if (!res.ok) throw new Error(`QuickBooks token request failed (${res.status}).`)
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; x_refresh_token_expires_in?: number }
    if (!json.access_token || !json.refresh_token) throw new Error('QuickBooks returned no tokens.')
    const now = Date.now()
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      accessExpiresAt: now + (json.expires_in ?? 3600) * 1000,
      refreshExpiresAt: now + (json.x_refresh_token_expires_in ?? 0) * 1000,
    }
  }

  /** The only way this module reads company data. GET, sandbox host, fixed paths. */
  async function apiGet(realmId: string, accessToken: string, resource: string, params: Record<string, string> = {}): Promise<QboObject> {
    if (!/^\d+$/.test(realmId)) throw new Error('Invalid QuickBooks company id.')
    const url = new URL(`/v3/company/${realmId}/${resource}`, SANDBOX_API_BASE)
    if (url.origin !== SANDBOX_API_BASE) throw new Error('QuickBooks reads are limited to the sandbox API.')
    for (const [k, v] of Object.entries({ ...params, minorversion: MINOR_VERSION })) url.searchParams.set(k, v)
    const res = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
    if (res.status === 401) throw new QuickBooksUnauthorizedError('QuickBooks refused the access token.')
    if (!res.ok) throw new Error(`QuickBooks read failed (${res.status}).`)
    return res.json() as Promise<QboObject>
  }

  return {
    environment: 'sandbox',
    authorizationUrl({ redirectUri, state }) {
      const url = new URL(AUTHORIZE_URL)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', QUICKBOOKS_SCOPE)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('state', state)
      return url.toString()
    },
    exchangeCode: ({ code, redirectUri }) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    refresh: (refreshToken) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    async revoke(refreshToken) {
      const res = await fetchImpl(REVOKE_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: refreshToken }),
      })
      if (!res.ok) throw new Error(`QuickBooks revoke failed (${res.status}).`)
    },
    async companyInfo(realmId, accessToken) {
      return ((await apiGet(realmId, accessToken, `companyinfo/${realmId}`)).CompanyInfo ?? {}) as QboObject
    },
    async query(realmId, accessToken, statement) {
      // The query endpoint is read-only on Intuit's side too; still, only SELECT statements are sent.
      if (!/^select\s/i.test(statement)) throw new Error('Only SELECT queries are allowed.')
      return apiGet(realmId, accessToken, 'query', { query: statement })
    },
    async changes(realmId, accessToken, entities, since) {
      if (!entities.length || entities.some((e) => !(LEDGER_ENTITIES as readonly string[]).includes(e))) throw new Error('Change requests are limited to the ledger entities.')
      if (Number.isNaN(since.getTime())) throw new Error('Invalid change date.')
      return apiGet(realmId, accessToken, 'cdc', { entities: entities.join(','), changedSince: since.toISOString() })
    },
  }
}

/**
 * Intuit keeps changes for 30 days. A day short of that leaves room for clock
 * skew and a slow request; anything older gets a full pull.
 */
export const CHANGE_WINDOW_MS = 29 * 24 * 60 * 60 * 1000
/** Intuit returns at most 1,000 changed objects per entity; at that size, pull everything instead. */
const CHANGE_PAGE_LIMIT = 1000

export interface QuickBooksChanges extends QuickBooksPull {
  /** Every transaction the change set mentions, as "Type:Id", including deleted ones. */
  touched: string[]
  /** Transactions deleted in QuickBooks since the last pull. */
  removed: Array<{ txnType: string; id: string }>
  /** Entities created since the last pull, per kind, so the client can extend its search counts. */
  created: { vendorCredits: number; deposits: number; purchases: number; billPayments: number }
}

/**
 * What changed since `since`, or null when a full pull is needed instead (the
 * window has passed, or the change set hit Intuit's per-entity cap). Bills that
 * changed payments link to, but that didn't change themselves, are fetched by
 * id so each payment row still names its invoice.
 */
export async function pullChanges(client: QuickBooksClient, realmId: string, accessToken: string, since: number, now = Date.now()): Promise<QuickBooksChanges | null> {
  if (!Number.isFinite(since) || since > now || now - since > CHANGE_WINDOW_MS) return null
  const company = await client.companyInfo(realmId, accessToken)
  const json = await client.changes(realmId, accessToken, LEDGER_ENTITIES, new Date(since))
  const entities: Record<string, QboObject[]> = Object.fromEntries(LEDGER_ENTITIES.map((e) => [e, []]))
  const removed: QuickBooksChanges['removed'] = []
  const touched = new Set<string>()
  for (const block of (json.CDCResponse?.[0]?.QueryResponse ?? []) as QboObject[]) {
    for (const entity of LEDGER_ENTITIES) {
      const rows = block[entity] as QboObject[] | undefined
      if (!rows) continue
      if (rows.length >= CHANGE_PAGE_LIMIT) return null
      for (const row of rows) {
        touched.add(`${entity}:${row.Id}`)
        if (String(row.status ?? '').toLowerCase() === 'deleted') removed.push({ txnType: entity, id: String(row.Id) })
        else entities[entity].push(row)
      }
    }
  }
  const createdSince = (entity: string) => entities[entity].filter((r) => Date.parse(r.MetaData?.CreateTime ?? '') >= since).length
  const created = { vendorCredits: createdSince('VendorCredit'), deposits: createdSince('Deposit'), purchases: createdSince('Purchase'), billPayments: createdSince('BillPayment') }

  const haveBills = new Set(entities.Bill.map((b) => String(b.Id)))
  const missing = [...new Set(entities.BillPayment.flatMap((bp) => (bp.Line ?? []).flatMap((l: QboObject) => linksOf(l).filter((x) => x.TxnType === 'Bill').map((x) => String(x.TxnId)))))]
    .filter((id) => !haveBills.has(id) && /^\d+$/.test(id))
  const linkedBills: QboObject[] = []
  for (let i = 0; i < missing.length; i += 100) {
    const ids = missing.slice(i, i + 100).map((id) => `'${id}'`).join(',')
    const page = await client.query(realmId, accessToken, `select * from Bill where Id in (${ids}) maxresults 1000`)
    linkedBills.push(...((page.QueryResponse?.Bill ?? []) as QboObject[]))
  }
  // Linked bills only name invoices; they were not changed, so they are not "touched".
  entities.Bill.push(...linkedBills)
  return { company, entities, touched: [...touched], removed, created }
}

/** Every ledger entity, paged 1,000 at a time (Intuit's maximum per query). */
export async function pullLedger(client: QuickBooksClient, realmId: string, accessToken: string): Promise<QuickBooksPull> {
  const company = await client.companyInfo(realmId, accessToken)
  const entities: Record<string, QboObject[]> = {}
  for (const entity of LEDGER_ENTITIES) {
    const rows: QboObject[] = []
    for (let start = 1; ; start += 1000) {
      const json = await client.query(realmId, accessToken, `select * from ${entity} startposition ${start} maxresults 1000`)
      const page = (json.QueryResponse?.[entity] ?? []) as QboObject[]
      rows.push(...page)
      if (page.length < 1000) break
    }
    entities[entity] = rows
  }
  return { company, entities }
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const linksOf = (line: QboObject) => (line.LinkedTxn ?? []) as Array<{ TxnId: string; TxnType: string }>
const cents = (amount: unknown) => Math.round(Number(amount ?? 0) * 100)
const ref = (txnType: QuickBooksTxnRef['txnType'], t: QboObject | undefined, id: string, amount: unknown = t?.TotalAmt): QuickBooksTxnRef => ({ txnType, id, txnDate: t?.TxnDate ?? null, amountMinor: cents(amount) })

/**
 * A voided bill payment or purchase stays in QuickBooks with a zero total, its
 * lines cleared and "Voided" at the start of its private note. (Intuit's void
 * response; the sandbox company has no voided payment to confirm it against.)
 * A zero-total payment that still has lines is a credit fully applied, not a void.
 */
export const isVoided = (t: QboObject) => cents(t.TotalAmt) === 0 && (/^\s*voided/i.test(String(t.PrivateNote ?? '')) || !(t.Line ?? []).length)

/**
 * One row per payment against a bill, plus direct vendor checks and card
 * charges, in the columns Reclaim's CSV import already reads — so a
 * QuickBooks import runs through exactly the same parser, checks and review
 * as an uploaded file. Alongside, the facts the CSV can't carry, keyed by each
 * row's transaction_id: which bill it paid, the credits and refunds applied
 * with it, and each vendor's credits, refunds and voids.
 */
export function toLedgerImport(pull: QuickBooksPull, pulledAt = Date.now(), sync?: QuickBooksSyncInfo): { csv: string; facts: QuickBooksFacts } {
  const entities = pull.entities
  const bills = new Map((entities.Bill ?? []).map((b) => [b.Id, b]))
  const credits = new Map((entities.VendorCredit ?? []).map((c) => [c.Id, c]))
  const deposits = new Map((entities.Deposit ?? []).map((d) => [d.Id, d]))
  const company = pull.company.CompanyName ?? ''
  const header = ['vendor', 'invoice_number', 'invoice_date', 'invoice_amount', 'payment_date', 'amount_paid', 'terms', 'category', 'currency', 'transaction_id', 'company', 'source_account', 'transaction_type']
  const rows: unknown[][] = []
  const payments: QuickBooksFacts['payments'] = {}
  const vendors: QuickBooksFacts['vendors'] = {}
  const vendor = (id: string | undefined) => (id ? (vendors[id] ??= { credits: [], refunds: [], voided: [] }) : null)

  for (const c of entities.VendorCredit ?? []) vendor(c.VendorRef?.value)?.credits.push(ref('VendorCredit', c, c.Id))
  for (const d of entities.Deposit ?? []) {
    for (const line of d.Line ?? []) {
      const entity = line.DepositLineDetail?.Entity
      if (String(entity?.type ?? '').toLowerCase() === 'vendor') vendor(entity.value)?.refunds.push(ref('Deposit', d, d.Id, line.Amount))
    }
  }

  for (const bp of entities.BillPayment ?? []) {
    if (isVoided(bp)) {
      vendor(bp.VendorRef?.value)?.voided.push(ref('BillPayment', bp, bp.Id))
      continue
    }
    const lines = (bp.Line ?? []) as QboObject[]
    const linesOfType = (type: string) => lines.filter((l) => linksOf(l).some((x) => x.TxnType === type))
    const idOf = (line: QboObject, type: string) => linksOf(line).find((x) => x.TxnType === type)!.TxnId
    const creditsApplied = linesOfType('VendorCredit').map((l) => ref('VendorCredit', credits.get(idOf(l, 'VendorCredit')), idOf(l, 'VendorCredit'), l.Amount))
    const refundsApplied = linesOfType('Deposit').map((l) => ref('Deposit', deposits.get(idOf(l, 'Deposit')), idOf(l, 'Deposit'), l.Amount))
    // A refund applied through a bill payment is a refund from this vendor, wherever its deposit line points.
    for (const r of refundsApplied) {
      const activity = vendor(bp.VendorRef?.value)
      if (activity && !activity.refunds.some((x) => x.txnType === 'Deposit' && x.id === r.id)) activity.refunds.push(r)
    }
    const billLines = linesOfType('Bill')
    billLines.forEach((line, n) => {
      const billId = idOf(line, 'Bill')
      const bill = bills.get(billId)
      const transactionId = billLines.length > 1 ? `qbo:BillPayment:${bp.Id}:${n + 1}` : `qbo:BillPayment:${bp.Id}`
      const currency = bp.CurrencyRef?.value ?? 'USD'
      rows.push([
        bp.VendorRef?.name, bill?.DocNumber ?? `QBO-Bill-${bill?.Id ?? '?'}`, bill?.TxnDate, bill?.TotalAmt, bp.TxnDate, line.Amount,
        bill?.SalesTermRef?.name, bill?.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name, currency,
        transactionId, company, bp.CheckPayment?.BankAccountRef?.name ?? bp.CreditCardPayment?.CCAccountRef?.name, `Bill Payment (${bp.PayType})`,
      ])
      payments[transactionId] = {
        payment: { ...ref('BillPayment', bp, bp.Id, line.Amount), txnType: 'BillPayment', payType: bp.PayType ?? null },
        vendorId: bp.VendorRef?.value ?? null,
        currency,
        // Only a bill QuickBooks returned counts as the obligation; a dangling link is left for a person.
        bill: bill ? { ...ref('Bill', bill, billId), txnType: 'Bill', docNumber: bill.DocNumber ?? null } : null,
        creditsApplied,
        refundsApplied,
      }
    })
  }

  for (const p of entities.Purchase ?? []) {
    if (p.EntityRef?.type !== 'Vendor') continue
    if (p.Credit) {
      vendor(p.EntityRef.value)?.refunds.push(ref('Purchase', p, p.Id))
      continue
    }
    if (isVoided(p)) {
      vendor(p.EntityRef.value)?.voided.push(ref('Purchase', p, p.Id))
      continue
    }
    const transactionId = `qbo:Purchase:${p.Id}`
    const currency = p.CurrencyRef?.value ?? 'USD'
    // A Purchase's DocNumber is a check number or card reference ("1", "Debit"), not
    // the vendor's invoice number, so it must not feed invoice matching.
    rows.push([p.EntityRef.name, null, null, null, p.TxnDate, p.TotalAmt, null, p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name, currency, transactionId, company, p.AccountRef?.name, p.PaymentType])
    payments[transactionId] = {
      payment: { ...ref('Purchase', p, p.Id), txnType: 'Purchase', payType: p.PaymentType ?? null },
      vendorId: p.EntityRef.value ?? null,
      currency,
      bill: null,
      creditsApplied: [],
      refundsApplied: [],
    }
  }

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  const searched = { vendorCredits: credits.size, deposits: deposits.size, purchases: (entities.Purchase ?? []).length, billPayments: (entities.BillPayment ?? []).length }
  return { csv, facts: { schemaVersion: 1, companyName: company, pulledAt, payments, vendors, searched, ...(sync ? { sync } : {}) } }
}

export const toLedgerCsv = (pull: QuickBooksPull) => toLedgerImport(pull).csv

/**
 * The /sync answer: a change pull when the client's last pull of this company
 * is recent enough, otherwise the whole ledger.
 */
export async function syncLedger(client: QuickBooksClient, realmId: string, accessToken: string, since: number | null, now = Date.now()) {
  const changes = since !== null ? await pullChanges(client, realmId, accessToken, since, now) : null
  if (changes) {
    const { csv, facts } = toLedgerImport(changes, now, { realmId, mode: 'changes', since, touched: changes.touched, removed: changes.removed })
    return { csv, facts: { ...facts, searched: changes.created } }
  }
  return toLedgerImport(await pullLedger(client, realmId, accessToken), now, { realmId, mode: 'full', since: null, touched: [], removed: [] })
}
