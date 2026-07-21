import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { detectFindings } from '@/lib/detection'
import { assessDataReadiness, assessFatalFile } from '@/audit/dataReadiness'

const HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category'

describe('arbitrary-file resilience', () => {
  it('skips rows with a missing vendor name instead of crashing or fabricating one', () => {
    const csv = [
      HEADER,
      'Acme,INV-1,2025-01-01,2025-01-10,100,100,,,',
      ',INV-2,2025-01-01,2025-01-10,100,100,,,', // missing vendor
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.skippedCount).toBe(1)
  })

  it('skips rows with malformed amounts (non-numeric, blank) rather than coercing them', () => {
    const csv = [
      HEADER,
      'Acme,INV-1,2025-01-01,2025-01-10,100,not-a-number,,,',
      'Acme,INV-2,2025-01-01,2025-01-10,100,,,,',
      'Acme,INV-3,2025-01-01,2025-01-10,100,100,,,',
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.skippedCount).toBe(2)
  })

  it('skips impossible dates (Feb 30) and unsupported date formats without throwing', () => {
    const csv = [
      HEADER,
      'Acme,INV-1,2025-01-01,2025-02-30,100,100,,,', // impossible date
      'Acme,INV-2,2025-01-01,01/15/2025,100,100,,,', // unsupported MM/DD/YYYY format
      'Acme,INV-3,2025-01-01,2025-01-15,100,100,,,', // valid
    ].join('\n')
    expect(() => parseCsv(csv)).not.toThrow()
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.skippedCount).toBe(2)
  })

  it('keeps rows with a missing invoice reference as null rather than dropping them', () => {
    const csv = [HEADER, 'Acme,,2025-01-01,2025-01-10,100,100,,,'].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].invoiceNumber).toBeNull()
    expect(() => detectFindings(result.records)).not.toThrow()
  })

  it('ignores truly empty lines entirely (not counted as skipped, not fabricated as records)', () => {
    const csv = [HEADER, 'Acme,INV-1,2025-01-01,2025-01-10,100,100,,,', ''].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.skippedCount).toBe(0)
  })

  it('reports a whitespace-only row as skipped rather than silently vanishing it', () => {
    const csv = [HEADER, 'Acme,INV-1,2025-01-01,2025-01-10,100,100,,,', '   ,,,,,,,,'].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.skippedCount).toBe(1)
  })

  it('handles duplicate raw export rows (identical line twice) as a real exact-duplicate finding', () => {
    const row = 'Acme,INV-1,2025-01-01,2025-01-10,100,100,,,'
    const csv = [HEADER, row, row].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(2)
    const findings = detectFindings(result.records)
    expect(findings.findings.some((f) => f.type === 'exact_duplicate' && f.class === 'recoverable')).toBe(true)
  })

  it('parses currency symbols and thousands separators', () => {
    const csv = [HEADER, 'Acme,INV-1,2025-01-01,2025-01-10,"$1,240.50","$1,240.50",,,'].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].amountPaid).toBe(1240.5)
  })

  it('tolerates reordered and extra unknown columns', () => {
    const csv = [
      'payment_date,amount_paid,vendor,unexpected_column',
      '2025-01-10,100,Acme,some future field',
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].vendor).toBe('Acme')
    expect(result.unrecognizedHeaders).toContain('unexpected_column')
  })

  it('reports a fatal file with unsupported headers instead of throwing, and names what is missing', () => {
    const csv = ['Supplier,Total', 'Acme,100'].join('\n')
    const result = parseCsv(csv)
    expect(result.records).toHaveLength(0)
    const guidance = assessFatalFile(result)
    expect(guidance.missingRequiredColumns).toEqual(expect.arrayContaining(['vendor', 'payment_date', 'amount_paid']))
  })

  it('handles very long vendor and invoice identifiers without truncation or crashing', () => {
    const longVendor = 'A'.repeat(300)
    const longInvoice = 'INV-' + '9'.repeat(200)
    const csv = [HEADER, `${longVendor},${longInvoice},2025-01-01,2025-01-10,100,100,,,`].join('\n')
    const result = parseCsv(csv)
    expect(result.records[0].vendor).toBe(longVendor)
    expect(result.records[0].invoiceNumber).toBe(longInvoice)
    expect(() => detectFindings(result.records)).not.toThrow()
  })

  it('handles a large record volume without throwing', () => {
    const rows = [HEADER]
    for (let i = 0; i < 2000; i++) {
      const day = String((i % 27) + 1).padStart(2, '0')
      rows.push(`Vendor ${i % 50},INV-${i},2025-01-01,2025-01-${day},100,100,,,`)
    }
    const csv = rows.join('\n')
    const result = parseCsv(csv)
    expect(result.records.length).toBeGreaterThan(1900)
    expect(() => detectFindings(result.records)).not.toThrow()
  })

  it('produces a needs-context-only result with no false recovery total (Dataset C)', () => {
    // Vendor bank account changes mid-stream — always a "review" finding, never recoverable.
    const rows = [HEADER]
    for (let i = 0; i < 3; i++) {
      rows.push(`Vendor X,INV-${i},2025-01-0${i + 1},2025-01-1${i},100,100,,111${i},`)
    }
    rows.push('Vendor X,INV-9,2025-02-01,2025-02-05,100,100,,9999,') // account change
    const csv = rows.join('\n')
    const result = parseCsv(csv)
    const detection = detectFindings(result.records)
    expect(detection.recoverableTotal).toBe(0)
    expect(detection.reviewTotal).toBeGreaterThan(0)
    expect(detection.findings.every((f) => f.class === 'review')).toBe(true)
  })

  it('produces an opportunity-only result framed as prevention, not recovery (Dataset D)', () => {
    // Paid after the discount window on every invoice — always "opportunity" (missed_discount), never recoverable.
    const csv = [HEADER, 'Vendor Y,INV-1,2025-01-01,2025-02-15,100,100,2/10 net 30,,'].join('\n')
    const result = parseCsv(csv)
    const detection = detectFindings(result.records)
    expect(detection.recoverableTotal).toBe(0)
    expect(detection.reviewTotal).toBe(0)
    expect(detection.opportunityTotal).toBeGreaterThan(0)
    expect(detection.findings.every((f) => f.class === 'opportunity')).toBe(true)
  })

  it('produces a clean no-findings result for a plain, unremarkable ledger', () => {
    const csv = [
      HEADER,
      'Vendor A,INV-1,2025-01-01,2025-01-05,100,100,,,',
      'Vendor B,INV-2,2025-01-02,2025-01-06,200,200,,,',
      'Vendor C,INV-3,2025-01-03,2025-01-07,150,150,,,',
    ].join('\n')
    const result = parseCsv(csv)
    const detection = detectFindings(result.records)
    expect(detection.findings).toHaveLength(0)
    expect(detection.recoverableTotal).toBe(0)
  })

  it('data-readiness assessment names which checks will be weaker for a file missing optional columns', () => {
    const csv = ['vendor,payment_date,amount_paid', 'Acme,2025-01-10,100', 'Beta,2025-01-11,200'].join('\n')
    const result = parseCsv(csv)
    const readiness = assessDataReadiness(result)
    expect(readiness.recordCount).toBe(2)
    expect(readiness.weakerChecks.length).toBeGreaterThan(0)
    expect(readiness.weakerChecks.some((c) => c.label.includes('Bank-account-change detection'))).toBe(true)
  })
})
