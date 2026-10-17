import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { mergeImport, type LedgerEnvironment } from '@/ledger/store'
import type { Finding } from '@/types'
import { toLedgerImport, type QuickBooksPull } from '../../server/quickbooks.ts'
import { EVIDENCE_CHECKS, evaluateEligibility, type RecoveryEvidence } from './eligibility'
import { autofillKey, quickBooksEvidence } from './quickbooksEvidence'

const PULLED_AT = Date.UTC(2026, 9, 16, 15)
const bp = (Id: string, TxnDate: string, lines: Array<[number, string, string]>, extra: Record<string, unknown> = {}) => ({
  Id, TxnDate, TotalAmt: lines.reduce((s, [amount, , type]) => s + (type === 'Bill' ? amount : -amount), 0), PayType: 'Check',
  VendorRef: { value: '56', name: 'Acme Supply' }, CurrencyRef: { value: 'USD' },
  Line: lines.map(([Amount, TxnId, TxnType]) => ({ Amount, LinkedTxn: [{ TxnId, TxnType }] })), ...extra,
})

/** Two bill payments on one bill: the duplicate QuickBooks can vouch for. */
function pull(overrides: Partial<QuickBooksPull['entities']> = {}): QuickBooksPull {
  return {
    company: { CompanyName: 'Sandbox Co' },
    entities: {
      Vendor: [{ Id: '56', DisplayName: 'Acme Supply' }, { Id: '57', DisplayName: 'Other Vendor' }],
      Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250, VendorRef: { value: '56', name: 'Acme Supply' } }],
      BillPayment: [bp('201', '2026-08-20', [[1250, '101', 'Bill']]), bp('202', '2026-08-23', [[1250, '101', 'Bill']])],
      VendorCredit: [],
      Deposit: [],
      Purchase: [],
      ...overrides,
    },
  }
}

function importPull(p: QuickBooksPull, env: LedgerEnvironment | null = null, pulledAt = PULLED_AT) {
  const { csv, facts } = toLedgerImport(p, pulledAt)
  return mergeImport(env, { sourceLabel: 'quickbooks-sandbox-co.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: facts })
}
const duplicateOf = (env: LedgerEnvironment): Finding => {
  const finding = env.result.findings.find((f) => f.type === 'exact_duplicate')
  expect(finding, 'the two bill payments should be found as a duplicate').toBeDefined()
  return finding!
}

/** What a reviewer adds by hand: their name and time, settlement, and the checks QuickBooks can't answer. */
function attest(evidence: RecoveryEvidence): RecoveryEvidence {
  const stamp = { confirmedBy: 'Jagan', confirmedAt: Date.UTC(2026, 9, 17) }
  return {
    ...evidence,
    payments: evidence.payments.map((p) => ({ ...p, ...stamp, settled: true })),
    obligation: { ...evidence.obligation, ...stamp },
    checks: Object.fromEntries(EVIDENCE_CHECKS.map(([key]) => [key, evidence.checks[key] ? { ...evidence.checks[key], ...stamp } : { reference: 'Checked by hand', confirmed: true, ...stamp }])),
  }
}

describe('QuickBooks import → recovery evidence', () => {
  it('pre-fills payment IDs, the shared bill and the refund and credit searches, each marked as from QuickBooks', () => {
    const env = importPull(pull())
    const finding = duplicateOf(env)
    const evidence = quickBooksEvidence(finding, env.imports)!

    expect(evidence.payments.map((p) => [p.paymentId, p.amountMinor, p.currency, p.obligationId])).toEqual([
      ['qbo:BillPayment:201', 125000, 'USD', 'qbo:Bill:101'],
      ['qbo:BillPayment:202', 125000, 'USD', 'qbo:Bill:101'],
    ])
    expect(evidence.payments[1].reference).toBe('QuickBooks BillPayment 202 · Check · 2026-08-23 · $1,250.00 paid to Bill 101 (INV-7781)')
    expect(evidence.obligation).toMatchObject({ obligationId: 'qbo:Bill:101', amountMinor: 125000, currency: 'USD' })
    expect(evidence.obligation.reference).toContain('QuickBooks links BillPayment 201 and BillPayment 202 to this bill')
    expect(evidence.checks.refund).toMatchObject({ confirmed: true, reference: expect.stringMatching(/^QuickBooks search, 2026-10-16: no vendor refunds from Acme Supply on or after 2026-08-20/) })
    expect(evidence.checks.credit).toMatchObject({ confirmed: true, reference: expect.stringContaining('no vendor credits') })

    const marked = Object.keys(evidence.autofilled!)
    for (const record of finding.relatedRecords) expect(marked).toContain(autofillKey.paymentId(record.id))
    expect(marked).toEqual(expect.arrayContaining([autofillKey.obligationId, autofillKey.obligationAmount, autofillKey.check('refund'), autofillKey.check('credit')]))
    expect(evidence.autofilled![autofillKey.obligationId]).toEqual({ source: 'quickbooks', pulledAt: PULLED_AT, txnIds: ['Bill 101', 'BillPayment 201', 'BillPayment 202'] })
    // Left to a person: QuickBooks can't say these.
    expect(Object.keys(evidence.checks).sort()).toEqual(['credit', 'refund'])
  })

  it('leaves settlement unconfirmed and attests nothing, so the gate still needs a person', () => {
    const env = importPull(pull())
    const finding = duplicateOf(env)
    const evidence = quickBooksEvidence(finding, env.imports)!
    expect(evidence.payments.every((p) => !p.settled && p.confirmedBy === '' && p.confirmedAt === 0)).toBe(true)
    expect(evidence.obligation.confirmedBy).toBe('')

    const before = evaluateEligibility(finding, evidence)
    expect(before.eligible).toBe(false)
    expect(before.missingEvidence).toEqual(expect.arrayContaining([
      expect.stringContaining('settlement confirmation is required'),
      expect.stringContaining('An attested invoice or obligation'),
      expect.stringContaining('Customer confirms the duplicate payment'),
      expect.stringContaining('Refund search'),
    ]))
    expect(before.contradictoryEvidence).toEqual([])

    // Once a reviewer confirms it, the pre-filled facts are enough for the rest of the gate.
    const after = evaluateEligibility(finding, attest(evidence))
    expect(after.eligible).toBe(true)
    expect(after.potentialAmountMinor).toBe(125000)
    expect(after.deduplicationGroup).toBe('acme supply|USD|qbo:bill:101')
  })

  it('lists a vendor credit applied in one of the payments, and leaves the credit check for the reviewer', () => {
    const env = importPull(pull({
      VendorCredit: [{ Id: '301', TxnDate: '2026-08-25', TotalAmt: 200, VendorRef: { value: '56', name: 'Acme Supply' } }],
      BillPayment: [bp('201', '2026-08-20', [[1250, '101', 'Bill']]), bp('202', '2026-08-23', [[1250, '101', 'Bill'], [200, '301', 'VendorCredit']])],
    }))
    const evidence = quickBooksEvidence(duplicateOf(env), env.imports)!
    expect(evidence.checks.credit).toMatchObject({ confirmed: false, reference: 'QuickBooks search, 2026-10-16: found VendorCredit 301 ($200.00, 2026-08-25). Check whether it resolves this duplicate before confirming.' })
    expect(evidence.autofilled![autofillKey.check('credit')].txnIds).toEqual(['VendorCredit 301'])
    expect(evidence.checks.refund?.confirmed).toBe(true)
  })

  it('finds vendor refunds recorded as a deposit from the vendor or a card credit, but not ones before the first payment', () => {
    const env = importPull(pull({
      Deposit: [
        { Id: '501', TxnDate: '2026-09-02', TotalAmt: 1250, Line: [{ Amount: 1250, DepositLineDetail: { Entity: { value: '56', name: 'Acme Supply', type: 'VENDOR' } } }] },
        { Id: '502', TxnDate: '2026-07-01', TotalAmt: 40, Line: [{ Amount: 40, DepositLineDetail: { Entity: { value: '56', type: 'Vendor' } } }] },
        { Id: '503', TxnDate: '2026-09-03', TotalAmt: 90, Line: [{ Amount: 90, DepositLineDetail: { Entity: { value: '57', type: 'Vendor' } } }] },
      ],
      Purchase: [{ Id: '402', TxnDate: '2026-09-06', TotalAmt: 20, Credit: true, PaymentType: 'CreditCard', EntityRef: { type: 'Vendor', value: '56', name: 'Acme Supply' } }],
    }))
    const evidence = quickBooksEvidence(duplicateOf(env), env.imports)!
    expect(evidence.checks.refund?.confirmed).toBe(false)
    expect(evidence.autofilled![autofillKey.check('refund')].txnIds).toEqual(['Deposit 501', 'Purchase 402'])
    expect(evidence.checks.refund?.reference).toContain('found Deposit 501 ($1,250.00, 2026-09-02) and Purchase 402 ($20.00, 2026-09-06)')
  })

  it('keeps voided bill payments out of the ledger, and flags a payment voided after it was imported', () => {
    const voided = bp('203', '2026-08-21', [], { TotalAmt: 0, Line: [], PrivateNote: 'Voided' })
    const first = importPull(pull({ BillPayment: [...pull().entities.BillPayment, voided] }))
    expect(first.records.map((r) => r.externalTransactionId)).toEqual(['qbo:BillPayment:201', 'qbo:BillPayment:202'])
    const evidence = quickBooksEvidence(duplicateOf(first), first.imports)!
    expect(evidence.checks.void).toMatchObject({ confirmed: false, reference: expect.stringContaining('BillPayment 203 ($0.00, 2026-08-21) is voided for this vendor') })
    expect(evidence.contradictions).toEqual([])

    // A later import: someone voided 202 in QuickBooks. The fresher search wins.
    const later = importPull(pull({ BillPayment: [bp('201', '2026-08-20', [[1250, '101', 'Bill']]), bp('202', '2026-08-23', [], { TotalAmt: 0, Line: [], PrivateNote: 'Voided - entered twice' })] }), first, PULLED_AT + 86_400_000)
    const again = quickBooksEvidence(duplicateOf(later), later.imports)!
    expect(again.contradictions).toEqual(['QuickBooks shows BillPayment 202 as voided (QuickBooks search, 2026-10-17).'])
    expect(evaluateEligibility(duplicateOf(later), attest(again)).eligible).toBe(false)
  })

  it('a zero-total payment with lines is a credit fully applied, not a void', () => {
    const { csv, facts } = toLedgerImport(pull({
      VendorCredit: [{ Id: '301', TxnDate: '2026-08-25', TotalAmt: 1250, VendorRef: { value: '56' } }],
      BillPayment: [bp('204', '2026-08-26', [[1250, '101', 'Bill'], [1250, '301', 'VendorCredit']])],
    }))
    expect(facts.vendors['56'].voided).toEqual([])
    expect(facts.payments['qbo:BillPayment:204'].creditsApplied).toEqual([{ txnType: 'VendorCredit', id: '301', txnDate: '2026-08-25', amountMinor: 125000 }])
    expect(csv).toContain('qbo:BillPayment:204')
  })

  it('leaves the obligation to a person when the payments paid different bills', () => {
    const env = importPull(pull({
      Bill: [
        { Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250 },
        // The same invoice entered twice: a classic duplicate, but QuickBooks can't say which bill is the real one.
        { Id: '102', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250 },
      ],
      BillPayment: [bp('201', '2026-08-20', [[1250, '101', 'Bill']]), bp('202', '2026-08-23', [[1250, '102', 'Bill']])],
    }))
    const evidence = quickBooksEvidence(duplicateOf(env), env.imports)!
    expect(evidence.obligation).toMatchObject({ obligationId: '', amountMinor: 0, reference: '' })
    expect(evidence.autofilled![autofillKey.obligationId]).toBeUndefined()
    expect(evidence.payments.map((p) => p.paymentId)).toEqual(['qbo:BillPayment:201', 'qbo:BillPayment:202'])
  })

  it('pre-fills nothing for a finding from an uploaded CSV', () => {
    const env = mergeImport(null, { sourceLabel: 'ledger.csv', mode: 'upload', parsed: parseCsv(toLedgerImport(pull()).csv) })
    expect(quickBooksEvidence(duplicateOf(env), env.imports)).toBeNull()
  })

  it('keeps the facts through a save and reload of the ledger', async () => {
    const { serializeEnvironment, deserializeEnvironment } = await import('@/ledger/store')
    const env = deserializeEnvironment(serializeEnvironment(importPull(pull())))
    expect(quickBooksEvidence(duplicateOf(env), env.imports)?.obligation.obligationId).toBe('qbo:Bill:101')
  })
})
