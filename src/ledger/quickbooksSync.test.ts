// @vitest-environment jsdom-server
import { afterEach, describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { toLedgerImport, type QuickBooksPull } from '../../server/quickbooks.ts'
import type { QuickBooksSyncInfo } from '../../server/quickbooksFacts.ts'
import { deserializeEnvironment, serializeEnvironment, setCaseState, type LedgerEnvironment } from './store'
import { describeQuickBooksSync, lastQuickBooksPull, mergeQuickBooksSync } from './quickbooksSync'
import { quickBooksEvidence } from '@/recovery/quickbooksEvidence'
import { EMPTY_CASE_STATE } from './caseState'
import { startLiveServer, type LiveServer } from '@/test/liveServer'

const REALM = '9341458505092846'
const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 1, 12)
const payment = (Id: string, TxnDate: string, amount: number, bill = '101', extra: Record<string, unknown> = {}) => ({
  Id, TxnDate, TotalAmt: amount, PayType: 'Check', VendorRef: { value: '56', name: 'Acme Supply' }, CurrencyRef: { value: 'USD' },
  Line: [{ Amount: amount, LinkedTxn: [{ TxnId: bill, TxnType: 'Bill' }] }], ...extra,
})
const company = { CompanyName: 'Sandbox Co' }
const bills = [
  { Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250 },
  { Id: '102', DocNumber: 'INV-7790', TxnDate: '2026-08-05', TotalAmt: 400 },
  { Id: '103', DocNumber: 'INV-7802', TxnDate: '2026-09-02', TotalAmt: 75 },
]
function ledger(billPayments: object[], more: Partial<QuickBooksPull['entities']> = {}): QuickBooksPull {
  return { company, entities: { Vendor: [], Bill: bills, BillPayment: billPayments, VendorCredit: [], Deposit: [], Purchase: [], ...more } }
}
const full: QuickBooksSyncInfo = { realmId: REALM, mode: 'full', since: null, touched: [], removed: [] }

function sync(env: LedgerEnvironment | null, pull: QuickBooksPull, pulledAt: number, info: QuickBooksSyncInfo = full) {
  const { csv, facts } = toLedgerImport(pull, pulledAt, info)
  return mergeQuickBooksSync(env, { sourceLabel: 'quickbooks-sandbox-co.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: facts })
}

const first = () => sync(null, ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-23', 1250), payment('203', '2026-08-25', 400)]), T0)
const byTxn = (env: LedgerEnvironment) => new Map(env.records.map((r) => [r.externalTransactionId, r]))

describe('importing the same QuickBooks company again', () => {
  it('a first import adds every payment', () => {
    const { env, summary } = first()
    expect(summary).toEqual({ mode: 'first', added: 3, changed: 0, removed: 0, unchanged: 0 })
    expect(describeQuickBooksSync(summary)).toBe('3 payments, all new to this audit')
    expect(env.records).toHaveLength(3)
    expect(env.imports[0].quickbooksSync).toEqual(summary)
    expect(lastQuickBooksPull(env, 'Sandbox Co')).toBe(T0)
  })

  it('an unchanged ledger adds nothing and leaves the audit as it was', () => {
    const { env } = first()
    const again = sync(env, ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-23', 1250), payment('203', '2026-08-25', 400)]), T0 + DAY)
    expect(again.summary).toEqual({ mode: 'full', added: 0, changed: 0, removed: 0, unchanged: 3 })
    expect(again.env).toBe(env)
    expect(describeQuickBooksSync(again.summary)).toBe('0 new payments, 0 changed, 3 already in this audit')
  })

  it('a full pull adds new payments, updates changed ones in place, and retires voided ones', () => {
    const { env } = first()
    const ids = byTxn(env)
    const withCase = setCaseState(env, env.result.findings.find((f) => f.type === 'exact_duplicate')!.id, { ...EMPTY_CASE_STATE, decision: 'confirmed' })
    const next = sync(withCase, ledger([
      payment('201', '2026-08-20', 1250),
      payment('202', '2026-08-23', 1200), // amount corrected in QuickBooks
      payment('203', '2026-08-25', 0, '102', { Line: [], PrivateNote: 'Voided' }),
      payment('204', '2026-09-10', 75, '103'),
    ]), T0 + DAY)
    expect(next.summary).toEqual({ mode: 'full', added: 1, changed: 1, removed: 1, unchanged: 1 })
    expect(describeQuickBooksSync(next.summary)).toBe('1 new payment, 1 changed, 1 voided or deleted, 1 already in this audit')

    const after = byTxn(next.env)
    // The changed payment keeps its record id, so its finding and case stay attached.
    expect(after.get('qbo:BillPayment:202')).toMatchObject({ id: ids.get('qbo:BillPayment:202')!.id, amountPaid: 1200 })
    expect(after.has('qbo:BillPayment:203')).toBe(false)
    expect(next.env.retiredRecords?.map((r) => r.externalTransactionId)).toEqual(['qbo:BillPayment:203'])
    expect(after.get('qbo:BillPayment:204')?.invoiceNumber).toBe('INV-7802')
    expect(next.env.records).toHaveLength(3)

    // The exact duplicate no longer holds at $1,200 vs $1,250; its case is kept and flagged for revalidation.
    const caseId = env.result.findings.find((f) => f.type === 'exact_duplicate')!.id
    expect(next.env.result.findings.find((f) => f.id === caseId)).toMatchObject({ requiresRevalidation: true, suppressionReason: expect.stringContaining('Source records changed') })
    expect(next.env.caseStates[caseId]?.requiresRevalidation).toBe(true)

    // Retired rows still resolve after a save and reload.
    const reloaded = deserializeEnvironment(serializeEnvironment(next.env))
    expect(reloaded.retiredRecords?.[0].paymentDate).toBeInstanceOf(Date)
  })

  it('a change that keeps the finding still asks for its evidence to be revalidated', () => {
    const { env } = first()
    const finding = env.result.findings.find((f) => f.type === 'exact_duplicate')!
    const next = sync(env, ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-24', 1250), payment('203', '2026-08-25', 400)]), T0 + DAY)
    expect(next.summary).toMatchObject({ changed: 1, added: 0 })
    expect(next.env.result.findings.find((f) => f.id === finding.id)?.requiresRevalidation).toBe(true)
  })

  it('a change pull only speaks for what it mentions, and extends the vendor searches', () => {
    const { env } = first()
    const changes = ledger(
      [payment('202', '2026-08-23', 1200), payment('205', '2026-10-02', 75, '103')],
      { VendorCredit: [{ Id: '301', TxnDate: '2026-10-01', TotalAmt: 50, VendorRef: { value: '56' } }] },
    )
    const info: QuickBooksSyncInfo = { realmId: REALM, mode: 'changes', since: T0, touched: ['BillPayment:202', 'BillPayment:205', 'BillPayment:203', 'VendorCredit:301'], removed: [{ txnType: 'BillPayment', id: '203' }] }
    const { csv, facts } = toLedgerImport(changes, T0 + DAY, info)
    const next = mergeQuickBooksSync(env, { sourceLabel: 'quickbooks-sandbox-co.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: { ...facts, searched: { vendorCredits: 1, deposits: 0, purchases: 0, billPayments: 1 } } })
    // 201 isn't in the change set: it is simply still there.
    expect(next.summary).toEqual({ mode: 'changes', added: 1, changed: 1, removed: 1, unchanged: 1 })
    expect([...byTxn(next.env).keys()].sort()).toEqual(['qbo:BillPayment:201', 'qbo:BillPayment:202', 'qbo:BillPayment:205'])

    const latest = next.env.imports.at(-1)!.quickbooks!
    expect(latest.vendors['56'].credits.map((c) => c.id)).toEqual(['301'])
    expect(latest.searched).toEqual({ vendorCredits: 1, deposits: 0, purchases: 0, billPayments: 4 })
    expect(latest.sync?.mode).toBe('changes')
    expect(lastQuickBooksPull(next.env, 'Sandbox Co')).toBe(T0 + DAY)
  })

  it('evidence pre-fill after a sync uses the merged searches', () => {
    const base = sync(null, ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-23', 1250)]), T0).env
    const info: QuickBooksSyncInfo = { realmId: REALM, mode: 'changes', since: T0, touched: ['VendorCredit:301', 'BillPayment:206'], removed: [] }
    const { csv, facts } = toLedgerImport(ledger([payment('206', '2026-10-03', 75, '103')], { VendorCredit: [{ Id: '301', TxnDate: '2026-08-28', TotalAmt: 1250, VendorRef: { value: '56' } }] }), T0 + DAY, info)
    const next = mergeQuickBooksSync(base, { sourceLabel: 'q.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: facts }).env
    const finding = next.result.findings.find((f) => f.type === 'exact_duplicate')!
    expect(quickBooksEvidence(finding, next.imports)?.checks.credit).toMatchObject({ confirmed: false, reference: expect.stringContaining('VendorCredit 301') })
  })
})

describe('Free plan: re-importing a QuickBooks company is a sync, not a repeat upload', () => {
  let server: LiveServer
  afterEach(async () => server?.close())

  it('the server accepts the synced audit, and would refuse the same company as a second audit', async () => {
    server = await startLiveServer()
    const email = 'free-qbo@example.test'
    const pw = 'correct-horse-battery'
    expect((await server.api('/api/auth/signup', { method: 'POST', json: { firstName: 'Free', lastName: 'Test', email, company: 'Free Co', password: pw, confirmPassword: pw, acceptedTerms: true, termsVersion: '2026-01' } })).status).toBe(201)
    const [mail] = await server.inbox(email)
    expect((await server.api('/api/auth/verify-email', { method: 'POST', json: { token: server.tokenFrom(mail.link) } })).status).toBe(200)
    const put = (id: string, env: LedgerEnvironment) => server.api(`/api/projects/${id}`, { method: 'PUT', json: { id, name: 'Sandbox Co', sourceLabel: 'quickbooks-sandbox-co.csv', mode: 'upload', createdAt: T0, updatedAt: Date.now(), environment: JSON.parse(serializeEnvironment(env)) } })

    const { env } = first()
    expect((await put('qbo-audit', env)).status).toBe(200)
    const next = sync(env, ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-23', 1200), payment('203', '2026-08-25', 400), payment('204', '2026-09-10', 75, '103')]), T0 + DAY)
    expect(next.summary).toMatchObject({ added: 1, changed: 1 })
    expect((await put('qbo-audit', next.env)).status).toBe(200)

    // Why the app routes a re-import into the company's existing audit: as a new audit it is a repeat.
    const again = await put('qbo-audit-2', sync(null, ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-23', 1200), payment('203', '2026-08-25', 400)]), T0 + DAY).env)
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('repeat_upload')
  })
})
