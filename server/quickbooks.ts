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
  }
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

/**
 * One row per payment against a bill, plus direct vendor checks and card
 * charges, in the columns Reclaim's CSV import already reads — so a
 * QuickBooks import runs through exactly the same parser, checks and review
 * as an uploaded file.
 */
export function toLedgerCsv(pull: QuickBooksPull): string {
  const bills = new Map((pull.entities.Bill ?? []).map((b) => [b.Id, b]))
  const company = pull.company.CompanyName ?? ''
  const header = ['vendor', 'invoice_number', 'invoice_date', 'invoice_amount', 'payment_date', 'amount_paid', 'terms', 'category', 'currency', 'transaction_id', 'company', 'source_account', 'transaction_type']
  const rows: unknown[][] = []
  for (const bp of pull.entities.BillPayment ?? []) {
    const billLines = (bp.Line ?? []).filter((l: QboObject) => linksOf(l).some((x) => x.TxnType === 'Bill'))
    billLines.forEach((line: QboObject, n: number) => {
      const bill = bills.get(linksOf(line).find((x) => x.TxnType === 'Bill')!.TxnId)
      rows.push([
        bp.VendorRef?.name, bill?.DocNumber ?? `QBO-Bill-${bill?.Id ?? '?'}`, bill?.TxnDate, bill?.TotalAmt, bp.TxnDate, line.Amount,
        bill?.SalesTermRef?.name, bill?.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name, bp.CurrencyRef?.value ?? 'USD',
        billLines.length > 1 ? `qbo:BillPayment:${bp.Id}:${n + 1}` : `qbo:BillPayment:${bp.Id}`, company,
        bp.CheckPayment?.BankAccountRef?.name ?? bp.CreditCardPayment?.CCAccountRef?.name, `Bill Payment (${bp.PayType})`,
      ])
    })
  }
  for (const p of pull.entities.Purchase ?? []) {
    if (p.EntityRef?.type !== 'Vendor' || p.Credit) continue
    // A Purchase's DocNumber is a check number or card reference ("1", "Debit"), not
    // the vendor's invoice number, so it must not feed invoice matching.
    rows.push([p.EntityRef.name, null, null, null, p.TxnDate, p.TotalAmt, null, p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name, p.CurrencyRef?.value ?? 'USD', `qbo:Purchase:${p.Id}`, company, p.AccountRef?.name, p.PaymentType])
  }
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}
