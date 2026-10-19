/**
 * Adversarial cases for every detection rule. Expectations were written
 * before running the engine; each block names the trap it sets:
 *   POS — must be caught          NEG — must stay quiet
 *   FP  — looks like a leak, isn't FN — a leak that is easy to miss
 *   EDGE — boundary, precision or malformed input
 */
import { describe, expect, it } from 'vitest'
import { detectFindings, recurringSeriesOf } from '@/lib/detection'
import { referenceStrength } from '@/lib/sourceIdentity'
import type { APRecord, Finding, FindingType } from '@/types'

let seq = 0
function rec(overrides: Partial<APRecord> & { vendor: string; amountPaid: number }): APRecord {
  const rowIndex = seq++
  return {
    id: overrides.id ?? `a${rowIndex}`,
    importBatchId: 'adv',
    vendor: overrides.vendor,
    invoiceNumber: overrides.invoiceNumber ?? null,
    invoiceDate: overrides.invoiceDate ?? null,
    paymentDate: overrides.paymentDate ?? new Date(2025, 0, 1),
    invoiceAmount: overrides.invoiceAmount ?? null,
    amountPaid: overrides.amountPaid,
    terms: overrides.terms ?? null,
    bankAccountLast4: overrides.bankAccountLast4 ?? null,
    category: overrides.category ?? null,
    rowIndex,
  }
}
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const run = (records: APRecord[]) => detectFindings(records).findings
const ofType = (findings: Finding[], type: FindingType) => findings.filter((f) => f.type === type)
/** What the rules flag from ledger rows alone. It is never potential recovery without the evidence gate. */
const recoverableSum = (findings: Finding[]) =>
  findings.filter((f) => f.ruleClass === 'recoverable').reduce((s, f) => s + (f.flaggedAmount ?? f.dollarImpact), 0)
const cents = (n: number) => Math.round(n * 100)

describe('every finding is a sane money figure', () => {
  it('EDGE: an empty ledger and a one-row ledger produce nothing and zero totals', () => {
    expect(detectFindings([])).toEqual({ findings: [], recoverableTotal: 0, reviewTotal: 0, opportunityTotal: 0, recurringSeries: [] })
    const one = detectFindings([rec({ vendor: 'Solo', amountPaid: 100, invoiceNumber: 'S1', invoiceAmount: 100 })])
    expect(one.findings).toHaveLength(0)
  })

  it('EDGE: every dollar impact is positive, finite and a whole number of cents', () => {
    const findings = run([
      // unclaimed 2% of 1,234.25 = 24.685 — has to land on a cent
      rec({ vendor: 'Disc', invoiceNumber: 'D1', invoiceDate: d(2025, 1, 1), paymentDate: d(2025, 1, 5), invoiceAmount: 1234.25, amountPaid: 1234.25, terms: '2/10 net 30' }),
      // missed 1.5% of 999.99
      rec({ vendor: 'Disc', invoiceNumber: 'D2', invoiceDate: d(2025, 1, 1), paymentDate: d(2025, 2, 20), invoiceAmount: 999.99, amountPaid: 999.99, terms: '1.5/10 net 30' }),
      // duplicate of an awkward float
      rec({ vendor: 'Float', invoiceNumber: 'F1', amountPaid: 19.99, paymentDate: d(2025, 1, 1) }),
      rec({ vendor: 'Float', invoiceNumber: 'F1', amountPaid: 19.99, paymentDate: d(2025, 1, 2) }),
      rec({ vendor: 'Float', invoiceNumber: 'F1', amountPaid: 19.99, paymentDate: d(2025, 1, 3) }),
      // outlier impact (amount − typical) is a fraction of a cent unless rounded
      ...[100.01, 99.97, 100.03, 99.99, 100.02, 99.98, 100.0, 100.01, 99.99].map((a, i) =>
        rec({ vendor: 'Steady', invoiceNumber: `ST${i}`, amountPaid: a, paymentDate: d(2025, 1 + (i % 12), 1 + i) })
      ),
      rec({ vendor: 'Steady', invoiceNumber: 'ST-BIG', amountPaid: 1700.33, paymentDate: d(2025, 11, 3) }),
    ])
    expect(findings.length).toBeGreaterThan(0)
    for (const f of findings) {
      expect(Number.isFinite(f.dollarImpact), f.id).toBe(true)
      expect(f.dollarImpact, f.id).toBeGreaterThan(0)
      expect(Math.abs(f.dollarImpact * 100 - Math.round(f.dollarImpact * 100)), `${f.id} = ${f.dollarImpact}`).toBeLessThan(1e-6)
    }
    const unclaimed = ofType(findings, 'unclaimed_discount')[0]
    expect(unclaimed.dollarImpact).toBe(24.69)
    expect(ofType(findings, 'exact_duplicate')[0].dollarImpact).toBe(39.98)
  })

  it('EDGE: very small and very large amounts are exact to the cent', () => {
    const findings = run([
      rec({ vendor: 'Tiny', invoiceNumber: 'T1', amountPaid: 0.01 }),
      rec({ vendor: 'Tiny', invoiceNumber: 'T1', amountPaid: 0.01, paymentDate: d(2025, 1, 2) }),
      rec({ vendor: 'Huge', invoiceNumber: 'H1', amountPaid: 12_345_678.91 }),
      rec({ vendor: 'Huge', invoiceNumber: 'H1', amountPaid: 12_345_678.91, paymentDate: d(2025, 1, 2) }),
    ])
    const dup = ofType(findings, 'exact_duplicate')
    expect(dup.map((f) => f.dollarImpact).sort((a, b) => a - b)).toEqual([0.01, 12_345_678.91])
  })
})

describe('Rule 1 — exact duplicates: overlap and refunds', () => {
  it('POS: a case or spacing change is a reference variant for review, not an exact raw match', () => {
    const findings = run([
      rec({ vendor: 'Case Co', invoiceNumber: 'INV-100', amountPaid: 500 }),
      rec({ vendor: 'Case Co', invoiceNumber: '  inv-100 ', amountPaid: 500, paymentDate: d(2025, 1, 9) }),
    ])
    expect(ofType(findings, 'exact_duplicate')).toHaveLength(0)
    const variant = findings.filter((f) => f.ruleId === 'invoice_reference_variant_v1')
    expect(variant).toHaveLength(1)
    expect(variant[0].classification).toBe('review_needed')
  })

  it('FP/over-claim: two repeated-amount clusters never claim more than was overpaid on the invoice', () => {
    // 900 invoice, paid 300+300+200+200 = 1,000 → only 100 went out beyond the invoice.
    const findings = run([
      rec({ vendor: 'Split Co', invoiceNumber: 'SP-1', invoiceAmount: 900, amountPaid: 300, paymentDate: d(2025, 1, 1) }),
      rec({ vendor: 'Split Co', invoiceNumber: 'SP-1', invoiceAmount: 900, amountPaid: 300, paymentDate: d(2025, 1, 15) }),
      rec({ vendor: 'Split Co', invoiceNumber: 'SP-1', invoiceAmount: 900, amountPaid: 200, paymentDate: d(2025, 2, 1) }),
      rec({ vendor: 'Split Co', invoiceNumber: 'SP-1', invoiceAmount: 900, amountPaid: 200, paymentDate: d(2025, 2, 15) }),
    ])
    const onInvoice = findings.filter((f) => f.type === 'exact_duplicate' || f.type === 'overpayment')
    const claimed = onInvoice.reduce((s, f) => s + f.dollarImpact, 0)
    expect(cents(claimed)).toBeLessThanOrEqual(10000)
    expect(cents(recoverableSum(findings))).toBe(10000)
  })

  it('FP/over-claim: a refund is netted once per invoice, not once per duplicate cluster', () => {
    // No invoice amount. Two duplicated amounts (100×2, 50×2) and one 30 refund:
    // 150 went out twice, 30 came back → 120 still owed.
    const findings = run([
      rec({ vendor: 'Refundo', invoiceNumber: 'R-1', amountPaid: 100, paymentDate: d(2025, 1, 1) }),
      rec({ vendor: 'Refundo', invoiceNumber: 'R-1', amountPaid: 100, paymentDate: d(2025, 1, 2) }),
      rec({ vendor: 'Refundo', invoiceNumber: 'R-1', amountPaid: 50, paymentDate: d(2025, 1, 3) }),
      rec({ vendor: 'Refundo', invoiceNumber: 'R-1', amountPaid: 50, paymentDate: d(2025, 1, 4) }),
      rec({ vendor: 'Refundo', invoiceNumber: 'R-1', amountPaid: -30, paymentDate: d(2025, 1, 20) }),
    ])
    expect(cents(recoverableSum(findings))).toBe(12000)
  })

  it('NEG: a refund that fully covers the duplicate leaves nothing to claim', () => {
    const findings = run([
      rec({ vendor: 'Settled', invoiceNumber: 'X-1', amountPaid: 800, invoiceAmount: 800 }),
      rec({ vendor: 'Settled', invoiceNumber: 'X-1', amountPaid: 800, invoiceAmount: 800, paymentDate: d(2025, 1, 5) }),
      rec({ vendor: 'Settled', invoiceNumber: 'X-1', amountPaid: -800, paymentDate: d(2025, 2, 1) }),
    ])
    expect(findings.filter((f) => f.class === 'recoverable')).toHaveLength(0)
  })

  it('NEG: an invoice paid with a credit memo row and a payment row that together equal the invoice is not a duplicate', () => {
    const findings = run([
      rec({ vendor: 'Memo', invoiceNumber: 'M-1', invoiceAmount: 1000, amountPaid: 1000 }),
      rec({ vendor: 'Memo', invoiceNumber: 'M-1', invoiceAmount: 1000, amountPaid: 0, paymentDate: d(2025, 1, 2) }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('FP: a one-character reference shared by payments of different amounts is not one invoice (QuickBooks check numbers)', () => {
    const findings = run([
      rec({ vendor: "Chin's Gas and Oil", invoiceNumber: '1', amountPaid: 65, paymentDate: d(2026, 9, 4) }),
      rec({ vendor: "Chin's Gas and Oil", invoiceNumber: '1', amountPaid: 52.56, paymentDate: d(2026, 9, 19) }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('POS: a short reference paid twice at the same amount is still an exact duplicate', () => {
    const findings = run([
      rec({ vendor: 'Small Shop', invoiceNumber: '12', amountPaid: 1250, paymentDate: d(2025, 4, 1) }),
      rec({ vendor: 'Small Shop', invoiceNumber: '12', amountPaid: 1250, paymentDate: d(2025, 4, 9) }),
      rec({ vendor: 'Small Shop', invoiceNumber: '12', amountPaid: 80, paymentDate: d(2025, 4, 20) }),
    ])
    const exact = ofType(findings, 'exact_duplicate')
    expect(exact).toHaveLength(1)
    expect(exact[0].ruleId).toBe('exact_repeated_payment_v1')
    expect(exact[0].relatedRecords.map((r) => r.amountPaid)).toEqual([1250, 1250])
  })

  it('POS: a row whose short reference is shared at another amount can still pair with a same-amount payment', () => {
    const later = rec({ vendor: 'Fuel Stop', amountPaid: 52.56, paymentDate: d(2026, 9, 21) })
    const findings = run([
      rec({ vendor: 'Fuel Stop', invoiceNumber: '1', amountPaid: 65, paymentDate: d(2026, 9, 4) }),
      rec({ vendor: 'Fuel Stop', invoiceNumber: '1', amountPaid: 52.56, paymentDate: d(2026, 9, 19) }),
      later,
    ])
    expect(ofType(findings, 'exact_duplicate')).toHaveLength(0)
    const near = ofType(findings, 'near_duplicate')
    expect(near).toHaveLength(1)
    expect(near[0].relatedRecords.map((r) => r.id)).toContain(later.id)
  })

  it('NEG: a placeholder such as "Debit" or "N/A" in the reference column is no reference at all', () => {
    const findings = run([
      rec({ vendor: 'Card Co', invoiceNumber: 'Debit', amountPaid: 40, paymentDate: d(2025, 5, 1) }),
      rec({ vendor: 'Card Co', invoiceNumber: 'Debit', amountPaid: 75, paymentDate: d(2025, 5, 8) }),
      rec({ vendor: 'Card Co', invoiceNumber: 'N/A', amountPaid: 40, paymentDate: d(2025, 5, 3) }),
    ])
    expect(ofType(findings, 'exact_duplicate')).toHaveLength(0)
    // The two $40 rows are still a same-amount pair, at the weaker review level.
    const near = ofType(findings, 'near_duplicate')
    expect(near).toHaveLength(1)
    expect(near[0].ruleId).toBe('same_vendor_amount_near_duplicate_v1')
  })

  it('EDGE: reference strength', () => {
    expect(referenceStrength(null)).toBe('none')
    expect(referenceStrength('  ')).toBe('none')
    expect(referenceStrength('Debit')).toBe('none')
    expect(referenceStrength('n/a')).toBe('none')
    expect(referenceStrength('0000')).toBe('none')
    expect(referenceStrength('1')).toBe('short')
    expect(referenceStrength('INV-12')).toBe('short')
    expect(referenceStrength('108')).toBe('strong')
    expect(referenceStrength('INV-3305')).toBe('strong')
  })
})

describe('Rule 2 — near duplicates', () => {
  it('FP: a weekly standing order (same amount, sequential invoice numbers) is recurring, not a chain of duplicates', () => {
    const weekly = Array.from({ length: 8 }, (_, i) =>
      rec({ vendor: 'Valley Dairy', invoiceNumber: `VD-${1001 + i}`, amountPaid: 186.4, paymentDate: d(2025, 3, 3 + i * 7) })
    )
    expect(ofType(run(weekly), 'near_duplicate')).toHaveLength(0)
  })

  it('POS: a duplicate slipped into a weekly series two days after a real payment is still caught', () => {
    const weekly = Array.from({ length: 6 }, (_, i) =>
      rec({ vendor: 'Valley Dairy', invoiceNumber: `VD-${1001 + i}`, amountPaid: 186.4, paymentDate: d(2025, 3, 3 + i * 7) })
    )
    const slipped = rec({ vendor: 'Valley Dairy', invoiceNumber: 'VD-1O03', amountPaid: 186.4, paymentDate: d(2025, 3, 19) })
    const near = ofType(run([...weekly, slipped]), 'near_duplicate')
    expect(near.some((f) => f.relatedRecords.some((r) => r.id === slipped.id))).toBe(true)
  })

  it('NEG: same vendor, near-identical invoice numbers, but different amounts', () => {
    const findings = run([
      rec({ vendor: 'Near Co', invoiceNumber: 'N-5501', amountPaid: 410 }),
      rec({ vendor: 'Near Co', invoiceNumber: 'N-5510', amountPaid: 411, paymentDate: d(2025, 1, 10) }),
    ])
    expect(ofType(findings, 'near_duplicate')).toHaveLength(0)
  })

  it('NEG: identical amount and similar invoice number but different vendors', () => {
    const findings = run([
      rec({ vendor: 'Alpha Freight', invoiceNumber: 'A-100', amountPaid: 250 }),
      rec({ vendor: 'Omega Bakery', invoiceNumber: 'A-101', amountPaid: 250, paymentDate: d(2025, 1, 3) }),
    ])
    expect(ofType(findings, 'near_duplicate')).toHaveLength(0)
  })

  it('FP: a weekly card charge with no invoice reference is recurring, not three near-duplicates (QuickBooks car wash)', () => {
    const findings = run([
      rec({ vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 10) }),
      rec({ vendor: 'Squeaky Kleen Car Wash', invoiceNumber: 'Debit', amountPaid: 19.99, paymentDate: d(2026, 9, 17) }),
      rec({ vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 24) }),
      rec({ vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 10, 1) }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('EDGE: a recurring series left out of near-duplicates is reported on the result', () => {
    const records = [
      rec({ id: 'cw1', vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 10) }),
      rec({ id: 'cw2', vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 17) }),
      rec({ id: 'cw3', vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 24) }),
      rec({ id: 'cw4', vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 10, 1) }),
      rec({ id: 'extra', vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 11) }),
    ]
    const result = detectFindings(records)
    expect(result.recurringSeries).toEqual([
      { vendor: 'Squeaky Kleen Car Wash', amount: 19.99, currency: null, cadenceDays: 7, paymentCount: 4, firstPaymentDate: '2026-09-10', lastPaymentDate: '2026-10-01', recordIds: ['cw1', 'cw2', 'cw3', 'cw4'] },
    ])
    // The off-series charge is still flagged, and is not part of the series.
    expect(ofType(result.findings, 'near_duplicate').map((f) => f.relatedRecords.map((r) => r.id))).toEqual([['cw1', 'extra']])
    expect(recurringSeriesOf(result)).toBe(result.recurringSeries)
    expect(recurringSeriesOf({ findings: [], recoverableTotal: 0, reviewTotal: 0, opportunityTotal: 0 })).toEqual([])
  })

  it('POS: a second charge the day after a weekly no-reference charge is still caught', () => {
    const weekly = [10, 17, 24].map((day) => rec({ vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, day) }))
    const extra = rec({ vendor: 'Squeaky Kleen Car Wash', amountPaid: 19.99, paymentDate: d(2026, 9, 11) })
    const near = ofType(run([...weekly, extra]), 'near_duplicate')
    expect(near).toHaveLength(1)
    expect(near[0].relatedRecords.map((r) => r.id)).toContain(extra.id)
  })

  it('NEG: two payments with no reference are not recurring when they are only two', () => {
    const near = ofType(
      run([
        rec({ vendor: 'Two Times', amountPaid: 19.99, paymentDate: d(2026, 9, 10) }),
        rec({ vendor: 'Two Times', amountPaid: 19.99, paymentDate: d(2026, 9, 17) }),
      ]),
      'near_duplicate'
    )
    expect(near).toHaveLength(1)
  })

  it('FP: two round-amount card purchases three weeks apart, neither with a reference, are not near-duplicates', () => {
    const findings = run([
      rec({ vendor: 'Corner Fuel', amountPaid: 50, paymentDate: d(2026, 9, 1) }),
      rec({ vendor: 'Corner Fuel', invoiceNumber: 'Debit', amountPaid: 50, paymentDate: d(2026, 9, 21) }),
    ])
    expect(ofType(findings, 'near_duplicate')).toHaveLength(0)
  })

  it('POS: the same two card purchases three days apart are still a near-duplicate, and say which window applied', () => {
    const near = ofType(
      run([
        rec({ vendor: 'Corner Fuel', amountPaid: 50, paymentDate: d(2026, 9, 1) }),
        rec({ vendor: 'Corner Fuel', amountPaid: 50, paymentDate: d(2026, 9, 4) }),
      ]),
      'near_duplicate'
    )
    expect(near).toHaveLength(1)
    expect(near[0].explanation).toContain('within 14 days')
  })

  it('POS: when one of the two payments has a reference, the full 45-day window still applies', () => {
    const near = ofType(
      run([
        rec({ vendor: 'Hicks Hardware', invoiceNumber: 'HH-2041', amountPaid: 228.75, paymentDate: d(2026, 8, 20) }),
        rec({ vendor: 'Hicks Hardware', amountPaid: 228.75, paymentDate: d(2026, 9, 19) }),
      ]),
      'near_duplicate'
    )
    expect(near).toHaveLength(1)
    expect(near[0].explanation).toContain('within 45 days')
  })

  it('FP: a twice-weekly standing order, each delivery with its own invoice, is recurring', () => {
    const deliveries = Array.from({ length: 16 }, (_, i) =>
      rec({ vendor: 'Sunrise Bakery', invoiceNumber: `SB${String(i + 1).padStart(4, '0')}`, amountPaid: 186.4, paymentDate: d(2025, 1, 7 + Math.floor(i / 2) * 7 + (i % 2) * 3) })
    )
    const result = detectFindings(deliveries)
    expect(ofType(result.findings, 'near_duplicate')).toHaveLength(0)
    expect(result.recurringSeries).toHaveLength(1)
  })

  it('FP: fuel fill-ups at the same few prices, no reference and no schedule, are routine', () => {
    const fortyDays = [2, 4, 13, 14, 31, 33, 52, 70, 71]
    const seventyFiveDays = [5, 6, 20, 41, 44, 45, 66, 90]
    const fills = [
      ...fortyDays.map((n) => rec({ vendor: 'Chevron', amountPaid: 40, paymentDate: d(2025, 1, n) })),
      ...seventyFiveDays.map((n) => rec({ vendor: 'Chevron', amountPaid: 75, paymentDate: d(2025, 1, n) })),
    ]
    const result = detectFindings(fills)
    expect(ofType(result.findings, 'near_duplicate')).toHaveLength(0)
    expect(result.recurringSeries).toHaveLength(0)
  })

  it('POS: an unusual amount charged twice at a vendor with routine prices is still caught', () => {
    const fills = [2, 9, 16, 21, 30].map((n) => rec({ vendor: 'Chevron', amountPaid: 40, paymentDate: d(2025, 1, n) }))
    const repair = rec({ vendor: 'Chevron', amountPaid: 312.48, paymentDate: d(2025, 1, 12) })
    const again = rec({ vendor: 'Chevron', amountPaid: 312.48, paymentDate: d(2025, 1, 13) })
    const near = ofType(run([...fills, repair, again]), 'near_duplicate')
    expect(near).toHaveLength(1)
    expect(near[0].relatedRecords.map((r) => r.id)).toEqual([repair.id, again.id])
  })

  it('NEG (accepted trade-off): a routine price charged twice in a row is not flagged', () => {
    const fills = [2, 4, 13, 31, 52].map((n) => rec({ vendor: 'Chevron', amountPaid: 40, paymentDate: d(2025, 1, n) }))
    const doubled = rec({ vendor: 'Chevron', amountPaid: 40, paymentDate: d(2025, 1, 14) })
    expect(ofType(run([...fills, doubled]), 'near_duplicate')).toHaveLength(0)
  })

  it('POS: a bill paid by check and again by card with no reference is caught', () => {
    const card = rec({ vendor: 'Hicks Hardware', amountPaid: 228.75, paymentDate: d(2026, 9, 19) })
    const near = ofType(
      run([rec({ vendor: 'Hicks Hardware', invoiceNumber: 'QBO-Bill-2', invoiceAmount: 228.75, amountPaid: 228.75, paymentDate: d(2026, 9, 15) }), card]),
      'near_duplicate'
    )
    expect(near).toHaveLength(1)
    expect(near[0].relatedRecords.map((r) => r.id)).toContain(card.id)
  })
})

describe('Rule 3 — overpayment', () => {
  it('NEG: an overpayment the vendor already refunded is not claimed again', () => {
    const findings = run([
      rec({ vendor: 'Overpaid', invoiceNumber: 'O-1', invoiceAmount: 1000, amountPaid: 1200 }),
      rec({ vendor: 'Overpaid', invoiceNumber: 'O-1', amountPaid: -200, paymentDate: d(2025, 2, 1) }),
    ])
    expect(findings.filter((f) => f.class === 'recoverable')).toHaveLength(0)
  })

  it('POS: a partially refunded overpayment claims only what is still out', () => {
    const findings = run([
      rec({ vendor: 'Overpaid', invoiceNumber: 'O-2', invoiceAmount: 1000, amountPaid: 1200 }),
      rec({ vendor: 'Overpaid', invoiceNumber: 'O-2', amountPaid: -50, paymentDate: d(2025, 2, 1) }),
    ])
    const over = ofType(findings, 'overpayment')
    expect(over).toHaveLength(1)
    expect(over[0].dollarImpact).toBe(150)
  })

  it('NEG: an underpayment, and a payment equal to the invoice, are not findings', () => {
    const findings = run([
      rec({ vendor: 'Under', invoiceNumber: 'U-1', invoiceAmount: 1000, amountPaid: 990 }),
      rec({ vendor: 'Exact', invoiceNumber: 'E-1', invoiceAmount: 1000, amountPaid: 1000 }),
    ])
    expect(findings).toHaveLength(0)
  })
})

describe('Rules 4 & 5 — early-payment discounts', () => {
  const base = { vendor: 'Terms Co', invoiceAmount: 1000, amountPaid: 1000, invoiceDate: d(2025, 1, 1) }

  it('POS: common ways of writing the same 2/10 net 30 terms are all understood', () => {
    const spellings = ['2/10 net 30', '2/10 Net 30', '2/10, net 30', '2/10, n/30', '2/10 n30', '2% 10 net 30', '2%/10 net 30', '2/10/net 30']
    const findings = run(
      spellings.map((terms, i) => rec({ ...base, invoiceNumber: `T-${i}`, terms, paymentDate: d(2025, 1, 5), vendor: `Terms ${i}` }))
    )
    const unclaimed = ofType(findings, 'unclaimed_discount')
    expect(unclaimed.map((f) => f.relatedRecords[0].terms).sort()).toEqual([...spellings].sort())
    for (const f of unclaimed) expect(f.dollarImpact).toBe(20)
  })

  it('NEG: plain net terms and nonsense terms never produce a discount finding', () => {
    const findings = run(
      ['Net 30', 'net 15', 'Due on receipt', 'COD', '2/10', '0/10 net 30', '100/10 net 30'].map((terms, i) =>
        rec({ ...base, invoiceNumber: `N-${i}`, terms, paymentDate: d(2025, 1, 5), vendor: `NetOnly ${i}` })
      )
    )
    expect(ofType(findings, 'unclaimed_discount')).toHaveLength(0)
    expect(ofType(findings, 'missed_discount')).toHaveLength(0)
  })

  it('EDGE: paying on day 10 is inside a 10-day window; day 11 is outside', () => {
    const findings = run([
      rec({ ...base, invoiceNumber: 'W-10', terms: '2/10 net 30', paymentDate: d(2025, 1, 11) }),
      rec({ ...base, invoiceNumber: 'W-11', terms: '2/10 net 30', paymentDate: d(2025, 1, 12), vendor: 'Terms Late' }),
    ])
    expect(ofType(findings, 'unclaimed_discount').map((f) => f.relatedRecords[0].invoiceNumber)).toEqual(['W-10'])
    expect(ofType(findings, 'missed_discount').map((f) => f.relatedRecords[0].invoiceNumber)).toEqual(['W-11'])
  })

  it('NEG: a payment dated before its invoice is a data problem, not a discount claim', () => {
    const findings = run([rec({ ...base, invoiceNumber: 'PRE-1', terms: '2/10 net 30', paymentDate: d(2024, 12, 20) })])
    expect(ofType(findings, 'unclaimed_discount')).toHaveLength(0)
  })

  it('NEG: a duplicated invoice does not also claim the discount twice', () => {
    const findings = run([
      rec({ ...base, invoiceNumber: 'DD-1', terms: '2/10 net 30', paymentDate: d(2025, 1, 5) }),
      rec({ ...base, invoiceNumber: 'DD-1', terms: '2/10 net 30', paymentDate: d(2025, 1, 6) }),
    ])
    // 1,000 duplicate + 20 unclaimed discount on the first payment — never 1,040.
    expect(cents(recoverableSum(findings))).toBe(102000)
  })
})

describe('Rule 6 — bank-account changes', () => {
  it('FP: the same account written differently is not a change', () => {
    const formats = ['1234', '****1234', 'x1234', 'XXXX-1234', 'acct ending 1234', ' 1234 ', '...1234']
    const findings = run(
      formats.map((bankAccountLast4, i) => rec({ vendor: 'Format Co', invoiceNumber: `F${i}`, amountPaid: 100 + i, bankAccountLast4, paymentDate: d(2025, 1, 1 + i) }))
    )
    expect(ofType(findings, 'bank_account_change')).toHaveLength(0)
  })

  it('FP: a spreadsheet dropping a leading zero ("0457" → "457") is not a change', () => {
    const findings = run([
      rec({ vendor: 'Zero Co', invoiceNumber: 'Z1', amountPaid: 100, bankAccountLast4: '0457', paymentDate: d(2025, 1, 1) }),
      rec({ vendor: 'Zero Co', invoiceNumber: 'Z2', amountPaid: 100, bankAccountLast4: '457', paymentDate: d(2025, 2, 1) }),
    ])
    expect(ofType(findings, 'bank_account_change')).toHaveLength(0)
  })

  it('POS: a real change is flagged once, on the first payment to the new account', () => {
    const findings = run([
      rec({ vendor: 'Mover', invoiceNumber: 'M1', amountPaid: 900, bankAccountLast4: '1111', paymentDate: d(2025, 1, 1) }),
      rec({ vendor: 'Mover', invoiceNumber: 'M2', amountPaid: 900, bankAccountLast4: '1111', paymentDate: d(2025, 2, 1) }),
      rec({ vendor: 'Mover', invoiceNumber: 'M3', amountPaid: 900, bankAccountLast4: '2222', paymentDate: d(2025, 3, 1) }),
      rec({ vendor: 'Mover', invoiceNumber: 'M4', amountPaid: 900, bankAccountLast4: '2222', paymentDate: d(2025, 4, 1) }),
    ])
    const changes = ofType(findings, 'bank_account_change')
    expect(changes).toHaveLength(1)
    expect(changes[0].relatedRecords.at(-1)!.invoiceNumber).toBe('M3')
  })

  it('FP: a vendor that alternates between two known accounts is flagged only when an account is first seen', () => {
    const accounts = ['1111', '2222', '1111', '2222', '1111']
    const findings = run(
      accounts.map((acct, i) => rec({ vendor: 'Two Banks', invoiceNumber: `TB${i}`, amountPaid: 300, bankAccountLast4: acct, paymentDate: d(2025, 1 + i, 1) }))
    )
    expect(ofType(findings, 'bank_account_change')).toHaveLength(1)
  })

  it('POS: switching to a third, never-seen account after alternating is flagged again', () => {
    const accounts = ['1111', '2222', '1111', '9999']
    const findings = run(
      accounts.map((acct, i) => rec({ vendor: 'Two Banks', invoiceNumber: `TB${i}`, amountPaid: 300, bankAccountLast4: acct, paymentDate: d(2025, 1 + i, 1) }))
    )
    expect(ofType(findings, 'bank_account_change').map((f) => f.relatedRecords.at(-1)!.bankAccountLast4)).toEqual(['2222', '9999'])
  })

  it('NEG: rows without an account are skipped, not treated as a change', () => {
    const findings = run([
      rec({ vendor: 'Gappy', invoiceNumber: 'G1', amountPaid: 100, bankAccountLast4: '5555', paymentDate: d(2025, 1, 1) }),
      rec({ vendor: 'Gappy', invoiceNumber: 'G2', amountPaid: 100, bankAccountLast4: null, paymentDate: d(2025, 2, 1) }),
      rec({ vendor: 'Gappy', invoiceNumber: 'G3', amountPaid: 100, bankAccountLast4: '5555', paymentDate: d(2025, 3, 1) }),
    ])
    expect(ofType(findings, 'bank_account_change')).toHaveLength(0)
  })
})

describe('Rule 7 — amount outliers', () => {
  it('FN: a 20× payment is caught even when the vendor has only a handful of payments', () => {
    const findings = run([
      ...[100, 105, 95, 102].map((amountPaid, i) => rec({ vendor: 'Few Co', invoiceNumber: `FC${i}`, amountPaid, paymentDate: d(2025, 1 + i, 1) })),
      rec({ vendor: 'Few Co', invoiceNumber: 'FC-BIG', amountPaid: 2000, paymentDate: d(2025, 6, 1) }),
    ])
    const outliers = ofType(findings, 'amount_outlier')
    expect(outliers).toHaveLength(1)
    expect(outliers[0].relatedRecords[0].invoiceNumber).toBe('FC-BIG')
  })

  it('FP: a vendor with naturally variable bills is not flagged for an ordinary high month', () => {
    const utility = [212.4, 180.1, 245.9, 310.55, 198.0, 275.35, 330.2, 190.75, 260.0, 355.1]
    const findings = run(utility.map((amountPaid, i) => rec({ vendor: 'City Power', invoiceNumber: `CP${i}`, amountPaid, paymentDate: d(2025, 1 + i, 3) })))
    expect(ofType(findings, 'amount_outlier')).toHaveLength(0)
  })

  it('FP: a tiny wobble over an otherwise identical price is not an outlier', () => {
    const findings = run([
      ...[100, 100, 100, 100].map((amountPaid, i) => rec({ vendor: 'Flat Co', invoiceNumber: `FL${i}`, amountPaid, paymentDate: d(2025, 1 + i, 1) })),
      rec({ vendor: 'Flat Co', invoiceNumber: 'FL-X', amountPaid: 104, paymentDate: d(2025, 6, 1) }),
    ])
    expect(ofType(findings, 'amount_outlier')).toHaveLength(0)
  })

  it('NEG: four payments are not enough history to call anything an outlier', () => {
    const findings = run([100, 100, 100, 5000].map((amountPaid, i) => rec({ vendor: 'Short', invoiceNumber: `SH${i}`, amountPaid, paymentDate: d(2025, 1 + i, 1) })))
    expect(ofType(findings, 'amount_outlier')).toHaveLength(0)
  })

  it('FP: one bigger order from a vendor whose order sizes already vary is not an outlier', () => {
    // Packaging orders of 1,000–2,000 and one 4,500 order (≈2.75× the 1,635 median).
    const findings = run(
      [1000, 2000, 1470, 980, 1800, 4500].map((amountPaid, i) => rec({ vendor: 'Bag Co', invoiceNumber: `BG${i}`, amountPaid, paymentDate: d(2025, 1 + i, 1) }))
    )
    expect(ofType(findings, 'amount_outlier')).toHaveLength(0)
  })

  it('POS: two identical 20× payments do not hide each other', () => {
    const findings = run(
      [100, 100, 100, 100, 2000, 2000].map((amountPaid, i) => rec({ vendor: 'Masked Co', invoiceNumber: `MK${i}`, amountPaid, paymentDate: d(2025, 1 + i, 1) }))
    )
    expect(ofType(findings, 'amount_outlier')).toHaveLength(2)
  })
})

describe('Rule 8 — shared invoice numbers', () => {
  it('NEG: the same vendor spelled two ways does not count as two vendors sharing a number', () => {
    const findings = run([
      rec({ vendor: 'Acme Supply', invoiceNumber: 'AC-9', amountPaid: 100 }),
      rec({ vendor: 'ACME SUPPLY', invoiceNumber: 'AC-9', amountPaid: 200, paymentDate: d(2025, 1, 4) }),
    ])
    expect(ofType(findings, 'shared_invoice_number')).toHaveLength(0)
  })

  it('NEG: credits sharing a number with another vendor are not counted', () => {
    const findings = run([
      rec({ vendor: 'Vendor One', invoiceNumber: '1001', amountPaid: 100 }),
      rec({ vendor: 'Vendor Two', invoiceNumber: '1001', amountPaid: -100, paymentDate: d(2025, 1, 4) }),
    ])
    expect(ofType(findings, 'shared_invoice_number')).toHaveLength(0)
  })

  it('NEG: two vendors whose payments both carry check number "1" or "12" are not sharing an invoice number', () => {
    const findings = run([
      rec({ vendor: "Chin's Gas and Oil", invoiceNumber: '1', amountPaid: 65 }),
      rec({ vendor: 'Hicks Hardware', invoiceNumber: '1', amountPaid: 88.09, paymentDate: d(2025, 1, 4) }),
      rec({ vendor: 'Robertson & Associates', invoiceNumber: '12', amountPaid: 250, paymentDate: d(2025, 1, 6) }),
      rec({ vendor: 'Books by Bessie', invoiceNumber: '12', amountPaid: 55, paymentDate: d(2025, 1, 8) }),
    ])
    expect(ofType(findings, 'shared_invoice_number')).toHaveLength(0)
  })
})
