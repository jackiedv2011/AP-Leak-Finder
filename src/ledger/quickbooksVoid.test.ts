import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { isVoided, toLedgerImport, type QuickBooksPull } from '../../server/quickbooks.ts'
import type { QuickBooksSyncInfo } from '../../server/quickbooksFacts.ts'
import { evaluateEligibility } from '@/recovery/eligibility'
import { attestDuplicate } from '@/recovery/testEvidence'
import { EMPTY_CASE_STATE } from './caseState'
import { mergeQuickBooksSync } from './quickbooksSync'
import { setCaseState, type LedgerEnvironment } from './store'

/**
 * How a voided bill payment comes back from the QuickBooks API, and proof that
 * it never counts as a payment in a duplicate.
 *
 * Intuit voids with a sparse update (`POST …/billpayment?operation=update&include=void`
 * with `{ Id, SyncToken, sparse: true }`). The transaction stays; its amounts go
 * to zero and "Voided" is put at the start of PrivateNote, before any existing
 * text. The fixtures follow that, plus the variants seen in the wild: lines kept
 * at zero instead of cleared, and a change-data-capture row marked `status: "Voided"`.
 */
const REALM = '9341458505092846'
const T0 = Date.UTC(2026, 9, 1, 12)
const acme = { value: '56', name: 'Acme Supply' }
const paid = (Id: string, TxnDate: string) => ({
  Id, SyncToken: '0', TxnDate, TotalAmt: 1250, PayType: 'Check', VendorRef: acme, CurrencyRef: { value: 'USD' },
  CheckPayment: { BankAccountRef: { value: '35', name: 'Checking' } },
  Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }],
})
const VOIDED = {
  /** Intuit's documented void: zero total, lines cleared, "Voided" note. */
  documented: (Id: string, TxnDate: string) => ({ ...paid(Id, TxnDate), SyncToken: '1', TotalAmt: 0, Line: [], PrivateNote: 'Voided' }),
  /** "Voided" put in front of a note the payment already had. */
  noteKept: (Id: string, TxnDate: string) => ({ ...paid(Id, TxnDate), SyncToken: '1', TotalAmt: 0, Line: [], PrivateNote: 'Voided - Paid twice by mistake' }),
  /** Lines kept, amounts zeroed. */
  linesZeroed: (Id: string, TxnDate: string) => ({ ...paid(Id, TxnDate), SyncToken: '1', TotalAmt: 0, Line: [{ Amount: 0, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }], PrivateNote: 'Voided' }),
  /** Zeroed with no note at all: nothing was paid, whatever QuickBooks calls it. */
  zeroNoNote: (Id: string, TxnDate: string) => ({ ...paid(Id, TxnDate), SyncToken: '1', TotalAmt: 0, Line: [{ Amount: 0, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] }),
  /** A change-data-capture row flagged as voided. */
  cdcStatus: (Id: string, TxnDate: string) => ({ ...paid(Id, TxnDate), status: 'Voided' }),
}
const ledger = (billPayments: object[]): QuickBooksPull => ({
  company: { CompanyName: 'Sandbox Co' },
  entities: { Vendor: [], Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250, VendorRef: acme }], BillPayment: billPayments, VendorCredit: [], Deposit: [], Purchase: [] },
})
const full: QuickBooksSyncInfo = { realmId: REALM, mode: 'full', since: null, touched: [], removed: [] }
function sync(env: LedgerEnvironment | null, pull: QuickBooksPull, at: number, info: QuickBooksSyncInfo = full) {
  const { csv, facts } = toLedgerImport(pull, at, info)
  return mergeQuickBooksSync(env, { sourceLabel: 'quickbooks.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: facts }).env
}
const duplicates = (env: LedgerEnvironment) => env.result.findings.filter((f) => (f.type === 'exact_duplicate' || f.type === 'near_duplicate') && !f.suppressionReason)

describe('a voided bill payment from the QuickBooks API', () => {
  it.each(Object.keys(VOIDED) as Array<keyof typeof VOIDED>)('is recognised as voided: %s', (shape) => {
    expect(isVoided(VOIDED[shape]('202', '2026-08-23'))).toBe(true)
  })

  it('is not confused with a payment settled entirely by a vendor credit', () => {
    const creditOnly = { ...paid('204', '2026-08-26'), TotalAmt: 0, Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }, { Amount: 1250, LinkedTxn: [{ TxnId: '301', TxnType: 'VendorCredit' }] }] }
    expect(isVoided(creditOnly)).toBe(false)
    expect(isVoided(paid('201', '2026-08-20'))).toBe(false)
  })

  it.each(Object.keys(VOIDED) as Array<keyof typeof VOIDED>)('never becomes a ledger row, so never half of a duplicate: %s', (shape) => {
    const env = sync(null, ledger([paid('201', '2026-08-20'), VOIDED[shape]('202', '2026-08-23')]), T0)
    expect(env.records.map((r) => r.externalTransactionId)).toEqual(['qbo:BillPayment:201'])
    expect(duplicates(env)).toEqual([])
    // It is still on record as a void for the vendor, for the evidence searches.
    expect(env.imports[0].quickbooks?.vendors['56'].voided.map((v) => v.id)).toEqual(['202'])
  })

  it('two voided payments of the same bill are not a duplicate either', () => {
    const env = sync(null, ledger([VOIDED.documented('201', '2026-08-20'), VOIDED.linesZeroed('202', '2026-08-23'), paid('203', '2026-08-25')]), T0)
    expect(env.records).toHaveLength(1)
    expect(duplicates(env)).toEqual([])
  })
})

describe('a payment voided after it was imported', () => {
  const first = () => sync(null, ledger([paid('201', '2026-08-20'), paid('202', '2026-08-23')]), T0)
  const changes = (payments: object[], since = T0): QuickBooksSyncInfo => ({ realmId: REALM, mode: 'changes', since, touched: payments.map((p: any) => `BillPayment:${p.Id}`), removed: [] })

  it.each(['documented', 'cdcStatus'] as const)('drops out of the duplicate on the next change pull: %s', (shape) => {
    const env = first()
    expect(duplicates(env)).toHaveLength(1)
    const voided = VOIDED[shape]('202', '2026-08-23')
    const next = sync(env, ledger([voided]), T0 + 3600_000, changes([voided]))
    expect(next.records.map((r) => r.externalTransactionId)).toEqual(['qbo:BillPayment:201'])
    expect(next.retiredRecords?.map((r) => r.externalTransactionId)).toEqual(['qbo:BillPayment:202'])
    expect(duplicates(next)).toEqual([])
  })

  it('drops out on a full pull too', () => {
    const next = sync(first(), ledger([paid('201', '2026-08-20'), VOIDED.noteKept('202', '2026-08-23')]), T0 + 3600_000)
    expect(duplicates(next)).toEqual([])
  })

  it('a case already opened on the duplicate is kept for its history, but can no longer be claimed', () => {
    const env = first()
    const finding = duplicates(env)[0]
    // Even fully attested, the finding loses its claim once a payment is voided.
    const attested = attestDuplicate(finding)
    const withCase = setCaseState({ ...env, result: { ...env.result, findings: env.result.findings.map((f) => (f.id === finding.id ? attested : f)) } }, finding.id, { ...EMPTY_CASE_STATE, decision: 'confirmed' })
    const voided = VOIDED.documented('202', '2026-08-23')
    const next = sync(withCase, ledger([voided]), T0 + 3600_000, changes([voided]))
    const kept = next.result.findings.find((f) => f.id === finding.id)!
    expect(kept).toMatchObject({ classification: 'review_needed', potentialAmountMinor: null, requiresRevalidation: true, suppressionReason: expect.stringContaining('Source records changed') })
    expect(evaluateEligibility(kept, kept.evidence, next.result.findings).eligible).toBe(false)
    expect(next.caseStates[finding.id]?.requiresRevalidation).toBe(true)
  })
})
