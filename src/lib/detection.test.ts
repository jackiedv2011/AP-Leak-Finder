import { describe, it, expect } from 'vitest'
import { detectFindings } from '@/lib/detection'
import type { APRecord } from '@/types'

let nextRowIndex = 0
function makeRecord(overrides: Partial<APRecord> & { vendor: string; amountPaid: number }): APRecord {
  const rowIndex = overrides.rowIndex ?? nextRowIndex++
  return {
    id: overrides.id ?? `r${rowIndex}`,
    importBatchId: overrides.importBatchId ?? 'test-batch',
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

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

describe('Rule 1 — exact duplicate payment', () => {
  it('finds an exact duplicate and computes amountPaid × (count−1)', () => {
    const records = [
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-100', amountPaid: 500, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-100', amountPaid: 500, paymentDate: d(2025, 1, 15) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'exact_duplicate')
    expect(finding).toBeDefined()
    expect(finding!.dollarImpact).toBe(500)
    expect(finding!.class).toBe('recoverable')
    expect(finding!.severity).toBe('high')
    expect(result.recoverableTotal).toBe(500)
  })

  it('computes impact correctly for 3 payments of the same invoice', () => {
    const records = [
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-200', amountPaid: 300, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-200', amountPaid: 300, paymentDate: d(2025, 1, 5) }),
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-200', amountPaid: 300, paymentDate: d(2025, 1, 10) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'exact_duplicate')
    expect(finding!.dollarImpact).toBe(600) // 300 * (3-1)
    expect(finding!.relatedRecords).toHaveLength(3)
  })

  it('sends repeated invoices with different payment values to review', () => {
    const records = [
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-201', amountPaid: 300, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-201', amountPaid: 125, paymentDate: d(2025, 1, 5) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'exact_duplicate')
    expect(finding).toBeDefined()
    expect(finding!.class).toBe('review')
    expect(finding!.dollarImpact).toBe(125)
  })

  it('keeps an equal-value duplicate recoverable when another payment amount needs review', () => {
    const records = [
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-202', amountPaid: 500, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-202', amountPaid: 500, paymentDate: d(2025, 1, 5) }),
      makeRecord({ vendor: 'Acme Roasters', invoiceNumber: 'INV-202', amountPaid: 125, paymentDate: d(2025, 1, 9) }),
    ]
    const result = detectFindings(records)
    const recoverable = result.findings.find((f) => f.type === 'exact_duplicate' && f.class === 'recoverable')
    const review = result.findings.find((f) => f.type === 'exact_duplicate' && f.class === 'review')
    expect(recoverable?.dollarImpact).toBe(500)
    expect(review?.dollarImpact).toBe(125)
  })
})

describe('Rule 2 — near-duplicate payment', () => {
  it('finds a near-duplicate within 45 days', () => {
    const records = [
      makeRecord({ vendor: 'Blue Bag Packaging', invoiceNumber: 'INV-4471', amountPaid: 812.5, paymentDate: d(2025, 2, 1) }),
      makeRecord({ vendor: 'Blue Bag Packaging', invoiceNumber: 'INV-4471-R', amountPaid: 812.5, paymentDate: d(2025, 2, 20) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'near_duplicate')
    expect(finding).toBeDefined()
    expect(finding!.dollarImpact).toBe(812.5)
    expect(finding!.class).toBe('review')
  })

  it('ignores pairs more than 45 days apart', () => {
    const records = [
      makeRecord({ vendor: 'Blue Bag Packaging', invoiceNumber: 'INV-500', amountPaid: 400, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Blue Bag Packaging', invoiceNumber: 'INV-600', amountPaid: 400, paymentDate: d(2025, 3, 1) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'near_duplicate')
    expect(finding).toBeUndefined()
  })
})

describe('Rule 3 — overpayment vs invoice', () => {
  it('computes overpayment = paid − invoice', () => {
    const records = [
      makeRecord({
        vendor: 'Sierra Coffee Supply',
        invoiceNumber: 'INV-900',
        invoiceAmount: 1000,
        amountPaid: 1150,
        paymentDate: d(2025, 3, 1),
      }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'overpayment')
    expect(finding).toBeDefined()
    expect(finding!.dollarImpact).toBe(150)
  })

  it('does not flag payments that match the invoice amount', () => {
    const records = [
      makeRecord({
        vendor: 'Sierra Coffee Supply',
        invoiceNumber: 'INV-901',
        invoiceAmount: 1000,
        amountPaid: 1000,
        paymentDate: d(2025, 3, 1),
      }),
    ]
    const result = detectFindings(records)
    expect(result.findings.find((f) => f.type === 'overpayment')).toBeUndefined()
  })
})

describe('Rules 4 & 5 — early-payment discount', () => {
  it('Rule 4 fires when paid within the discount window at full price', () => {
    const records = [
      makeRecord({
        vendor: 'Milk & Honey Dairy',
        invoiceNumber: 'INV-10',
        invoiceAmount: 2000,
        amountPaid: 2000,
        terms: '2/10 net 30',
        invoiceDate: d(2025, 1, 1),
        paymentDate: d(2025, 1, 8),
      }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'unclaimed_discount')
    expect(finding).toBeDefined()
    expect(finding!.dollarImpact).toBe(40) // 2% of 2000
    expect(finding!.class).toBe('recoverable')
  })

  it('Rule 5 fires when paid too late to claim the discount', () => {
    const records = [
      makeRecord({
        vendor: 'Milk & Honey Dairy',
        invoiceNumber: 'INV-11',
        invoiceAmount: 2000,
        amountPaid: 2000,
        terms: '2/10 net 30',
        invoiceDate: d(2025, 1, 1),
        paymentDate: d(2025, 1, 25),
      }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'missed_discount')
    expect(finding).toBeDefined()
    expect(finding!.dollarImpact).toBe(40)
    expect(finding!.class).toBe('opportunity')
  })

  it('neither rule fires when terms do not offer a discount', () => {
    const records = [
      makeRecord({
        vendor: 'Milk & Honey Dairy',
        invoiceNumber: 'INV-12',
        invoiceAmount: 2000,
        amountPaid: 2000,
        terms: 'net 30',
        invoiceDate: d(2025, 1, 1),
        paymentDate: d(2025, 1, 5),
      }),
    ]
    const result = detectFindings(records)
    expect(result.findings.find((f) => f.type === 'unclaimed_discount')).toBeUndefined()
    expect(result.findings.find((f) => f.type === 'missed_discount')).toBeUndefined()
  })
})

describe('Rule 6 — vendor bank-account change', () => {
  it('flags the first payment to a changed bank account', () => {
    const records = [
      makeRecord({ vendor: 'Metro Utility Co', amountPaid: 300, bankAccountLast4: '1111', paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Metro Utility Co', amountPaid: 300, bankAccountLast4: '1111', paymentDate: d(2025, 2, 1) }),
      makeRecord({ vendor: 'Metro Utility Co', amountPaid: 300, bankAccountLast4: '9999', paymentDate: d(2025, 3, 1) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'bank_account_change')
    expect(finding).toBeDefined()
    expect(finding!.class).toBe('review')
    expect(finding!.dollarImpact).toBe(300)
    expect(finding!.relatedRecords[1].bankAccountLast4).toBe('9999')
  })

  it('does not flag a vendor whose bank account never changes', () => {
    const records = [
      makeRecord({ vendor: 'Metro Utility Co', amountPaid: 300, bankAccountLast4: '1111', paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Metro Utility Co', amountPaid: 300, bankAccountLast4: '1111', paymentDate: d(2025, 2, 1) }),
    ]
    const result = detectFindings(records)
    expect(result.findings.find((f) => f.type === 'bank_account_change')).toBeUndefined()
  })
})

describe('Rule 7 — payment amount outlier', () => {
  it('flags an outlier above mean + 2.5 stddev and ignores normal payments', () => {
    // A tight cluster of baseline payments plus one large outlier. With only a
    // handful of points, a single outlier inflates its own stddev enough to escape
    // detection ("outlier masking") — enough baseline points are included here so
    // the outlier reliably clears mean + 2.5*stddev.
    const records = [
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 2, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 3, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 4, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 5, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 6, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 7, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 8, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 1000, paymentDate: d(2025, 9, 1) }),
      makeRecord({ vendor: 'Golden Bean Exports', amountPaid: 6000, paymentDate: d(2025, 10, 1) }),
    ]
    const result = detectFindings(records)
    const finding = result.findings.find((f) => f.type === 'amount_outlier')
    expect(finding).toBeDefined()
    expect(finding!.class).toBe('review')
    expect(finding!.vendor).toBe('Golden Bean Exports')

    const normalFindings = result.findings.filter(
      (f) => f.type === 'amount_outlier' && f.dollarImpact !== finding!.dollarImpact
    )
    expect(normalFindings).toHaveLength(0)
  })

  it('does not flag vendors with fewer than 4 payments', () => {
    const records = [
      makeRecord({ vendor: 'Small Vendor', amountPaid: 100, paymentDate: d(2025, 1, 1) }),
      makeRecord({ vendor: 'Small Vendor', amountPaid: 100, paymentDate: d(2025, 2, 1) }),
      makeRecord({ vendor: 'Small Vendor', amountPaid: 9000, paymentDate: d(2025, 3, 1) }),
    ]
    const result = detectFindings(records)
    expect(result.findings.find((f) => f.type === 'amount_outlier')).toBeUndefined()
  })
})

describe('No double-counting across recoverable findings', () => {
  it('does not let the same row drive two recoverable findings', () => {
    // Same invoice paid twice AND both payments exceed the invoice amount, so the
    // second row is eligible to be flagged as both an exact duplicate and an overpayment.
    const records = [
      makeRecord({
        vendor: 'Overlap Vendor',
        invoiceNumber: 'INV-777',
        invoiceAmount: 400,
        amountPaid: 500,
        paymentDate: d(2025, 1, 1),
      }),
      makeRecord({
        vendor: 'Overlap Vendor',
        invoiceNumber: 'INV-777',
        invoiceAmount: 400,
        amountPaid: 500,
        paymentDate: d(2025, 1, 10),
      }),
    ]
    const result = detectFindings(records)
    const recoverableFindings = result.findings.filter((f) => f.class === 'recoverable')

    // The second (duplicate) row must only drive ONE recoverable finding — the
    // higher-dollar exact-duplicate finding (500) wins over its own overpayment (100).
    const findingsTouchingRow1 = recoverableFindings.filter((f) =>
      f.relatedRecords.some((r) => r.rowIndex === records[1].rowIndex)
    )
    expect(findingsTouchingRow1).toHaveLength(1)
    expect(findingsTouchingRow1[0].type).toBe('exact_duplicate')
    expect(findingsTouchingRow1[0].dollarImpact).toBe(500)

    // The first (kept) row is independently overpaid and is unaffected by the dedup.
    const findingsTouchingRow0 = recoverableFindings.filter((f) =>
      f.relatedRecords.some((r) => r.rowIndex === records[0].rowIndex) && f.type === 'overpayment'
    )
    expect(findingsTouchingRow0).toHaveLength(1)

    expect(result.recoverableTotal).toBe(600) // 500 (duplicate) + 100 (row0 overpayment)
  })
})
