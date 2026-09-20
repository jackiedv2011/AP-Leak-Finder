/**
 * Stress test: one realistic, messy AP export run through the real pipeline
 * (CSV → parse → vendor resolution → detection → priority), with the expected
 * outcome of every scenario written down *before* looking at what the engine
 * says. Each row of the fixture carries a memo naming its scenario:
 *   TPn — something Reclaim must catch
 *   FPn — something that looks suspicious but must NOT be flagged
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { detectFindings } from '@/lib/detection'
import { evidenceOf, priorityOf } from '@/workspace/selectors'
import type { Finding, FindingType } from '@/types'

const csv = readFileSync(resolve(process.cwd(), 'src/test/fixtures/messy-ap-ledger.csv'), 'utf8')
const parsed = parseCsv(csv)
// Mint stable ids the way the ledger store does, so finding ids are deterministic.
const records = parsed.records.map((r, i) => ({ ...r, id: `rec_${i}`, importBatchId: 'stress' }))
const result = detectFindings(records)
const findings = result.findings

const byVendor = (vendor: string) => findings.filter((f) => f.vendor.toLowerCase().includes(vendor.toLowerCase()))
const ofType = (type: FindingType, vendor?: string) =>
  (vendor ? byVendor(vendor) : findings).filter((f) => f.type === type)
const only = (list: Finding[]): Finding => {
  expect(list).toHaveLength(1)
  return list[0]
}

describe('messy ledger — parsing', () => {
  it('skips exactly the rows that cannot be assessed, and keeps everything else', () => {
    // missing vendor, impossible date, "not a date", blank amount, non-numeric amount
    expect(parsed.skippedCount).toBe(5)
    expect(parsed.records).toHaveLength(63)
  })

  it('accepts US and slash-separated dates as well as ISO', () => {
    const us = parsed.records.filter((r) => r.vendor === 'US Date Vendor')
    expect(us).toHaveLength(2)
    expect(us[0].paymentDate.getMonth()).toBe(2)
    expect(us[0].paymentDate.getDate()).toBe(15)
    expect(us[1].paymentDate.getDate()).toBe(20)
  })

  it('parses accounting-style negatives and currency formatting', () => {
    expect(parsed.records.find((r) => r.vendor === 'Paren Vendor')?.amountPaid).toBe(-150)
    expect(parsed.records.find((r) => r.vendor === 'Comma Vendor')?.amountPaid).toBe(12500)
  })

  it('collapses whitespace/case and legal-suffix variants onto one vendor, but keeps different vendors apart', () => {
    const sierra = parsed.records.filter((r) => r.vendor === 'Sierra Coffee Supply')
    expect(sierra).toHaveLength(4)
    const abc = new Set(parsed.records.filter((r) => /abc supply/i.test(r.vendor)).map((r) => r.vendor))
    // LLC and Inc. merge; "Co" is close enough to group for detection but is a different invoice anyway.
    expect(abc.size).toBeLessThanOrEqual(2)
    expect(parsed.records.some((r) => r.vendor === 'Northwest Bakery Co')).toBe(true)
    expect(parsed.records.some((r) => r.vendor === 'Northwest Pastry Co')).toBe(true)
    expect(parsed.records.some((r) => r.vendor === 'Acme Steel')).toBe(true)
    expect(parsed.records.some((r) => r.vendor === 'Acme Stone')).toBe(true)
  })

  it('keeps rows with no invoice number and flags nothing about them', () => {
    expect(parsed.records.filter((r) => r.vendor === 'Nameless Vendor Test')).toHaveLength(2)
    expect(byVendor('Nameless')).toHaveLength(0)
  })
})

describe('messy ledger — true positives', () => {
  it('TP1: a straight duplicate payment is recoverable for exactly one extra payment', () => {
    const f = only(ofType('exact_duplicate', 'Sierra'))
    expect(f.class).toBe('recoverable')
    expect(f.dollarImpact).toBe(6800)
    expect(f.relatedRecords).toHaveLength(2)
    expect(evidenceOf(f)).toBe('strong')
  })

  it('TP2: three payments of one invoice recover two of them', () => {
    const f = only(ofType('exact_duplicate', 'Harbor Point'))
    expect(f.dollarImpact).toBe(2500)
    expect(f.relatedRecords).toHaveLength(3)
  })

  it('TP3: "ABC Supply LLC" and "ABC Supply, Inc." are the same vendor, so the repeated invoice is a duplicate', () => {
    const f = only(ofType('exact_duplicate', 'ABC Supply'))
    expect(f.dollarImpact).toBe(900)
    // and the genuinely different "ABC Supply Co" invoice is not dragged in
    expect(ofType('shared_invoice_number', 'ABC')).toHaveLength(0)
    expect(byVendor('ABC')).toHaveLength(1)
  })

  it('TP4: a transposed invoice number with the same amount 19 days later is a near-duplicate for review', () => {
    const f = only(ofType('near_duplicate', 'CloudPOS'))
    expect(f.class).toBe('review')
    expect(f.dollarImpact).toBe(3100)
    expect(byVendor('CloudPOS')).toHaveLength(1)
  })

  it('TP5: an overpayment recovers exactly paid − invoice', () => {
    const f = only(ofType('overpayment', 'Golden Bean'))
    expect(f.dollarImpact).toBe(800)
    expect(byVendor('Golden Bean')).toHaveLength(1)
  })

  it('TP6/TP7: discount terms — unclaimed when paid in the window at full price, missed when paid late at full price', () => {
    const unclaimed = only(ofType('unclaimed_discount', 'Blue Bag'))
    expect(unclaimed.dollarImpact).toBeCloseTo(100, 2)
    expect(unclaimed.relatedRecords[0].invoiceNumber).toBe('INV-6006')
    const missed = only(ofType('missed_discount', 'Blue Bag'))
    expect(missed.dollarImpact).toBeCloseTo(40, 2)
    expect(missed.relatedRecords[0].invoiceNumber).toBe('INV-6007')
    expect(byVendor('Blue Bag')).toHaveLength(2)
  })

  it('TP8: a new deposit account after three consistent payments is flagged, once, on the changed payment', () => {
    const f = only(ofType('bank_account_change', 'Northwest Pastry'))
    expect(f.dollarImpact).toBe(662)
    expect(f.relatedRecords.map((r) => r.bankAccountLast4)).toEqual(['1111', '9999'])
    expect(byVendor('Northwest Pastry')).toHaveLength(1)
  })

  it('TP9: one payment 20× a vendor\'s normal amount is an outlier; none of the normal ones are', () => {
    const f = only(ofType('amount_outlier', 'Metro Utilities'))
    expect(f.relatedRecords[0].amountPaid).toBe(9500)
    expect(f.dollarImpact).toBeGreaterThan(8000)
    expect(f.dollarImpact).toBeLessThan(9500)
    expect(byVendor('Metro Utilities')).toHaveLength(1)
  })

  it('TP10: the same invoice number on two different vendors is flagged for review, and not as a duplicate', () => {
    const f = only(ofType('shared_invoice_number'))
    expect(f.vendor).toContain('Acme Steel')
    expect(f.vendor).toContain('Acme Stone')
    expect(f.dollarImpact).toBe(2000)
    expect(ofType('exact_duplicate', 'Acme')).toHaveLength(0)
    expect(ofType('near_duplicate', 'Acme')).toHaveLength(0)
  })

  it('TP11: an identical export line repeated is a real duplicate', () => {
    const f = only(ofType('exact_duplicate', 'Pine Valley'))
    expect(f.dollarImpact).toBe(760)
    expect(f.relatedRecords.every((r) => r.invoiceNumber === 'INV-8008')).toBe(true)
  })

  it('TP12: paying an invoice twice in full is a duplicate even though other invoices for the vendor were split', () => {
    const f = only(ofType('exact_duplicate', 'Lakeside'))
    expect(f.relatedRecords.every((r) => r.invoiceNumber === 'LP-503')).toBe(true)
    expect(f.dollarImpact).toBe(800)
  })
})

describe('messy ledger — false positives that must stay quiet', () => {
  it('FP1: six identical monthly rent payments with sequential invoice numbers are a recurring charge, not duplicates', () => {
    expect(byVendor('Summit Rent')).toHaveLength(0)
  })

  it('FP2: "Northwest Bakery Co" is not "Northwest Pastry Co"', () => {
    expect(byVendor('Northwest Bakery')).toHaveLength(0)
  })

  it('FP3: two partial payments that add up to the invoice are not a duplicate, whether equal or uneven', () => {
    const lakeside = byVendor('Lakeside')
    expect(lakeside.some((f) => f.relatedRecords.some((r) => r.invoiceNumber === 'LP-500'))).toBe(false)
    expect(lakeside.some((f) => f.relatedRecords.some((r) => r.invoiceNumber === 'LP-501'))).toBe(false)
  })

  it('FP4: an underpayment is not a finding', () => {
    expect(byVendor('Lakeside').some((f) => f.relatedRecords.some((r) => r.invoiceNumber === 'LP-502'))).toBe(false)
  })

  it('FP5/FP6: credit memos and zero-dollar rows never become findings', () => {
    const pine = byVendor('Pine Valley')
    expect(pine.some((f) => f.relatedRecords.some((r) => r.amountPaid <= 0))).toBe(false)
    expect(pine).toHaveLength(1)
    expect(findings.every((f) => f.dollarImpact > 0)).toBe(true)
  })

  it('FP discount: an invoice paid at the discounted price is neither unclaimed nor missed, even when paid late', () => {
    const blueBag = byVendor('Blue Bag')
    expect(blueBag.some((f) => f.relatedRecords.some((r) => r.invoiceNumber === 'INV-6008'))).toBe(false)
    expect(blueBag.some((f) => f.relatedRecords.some((r) => r.invoiceNumber === 'INV-6009'))).toBe(false)
  })

  it('FP11: a single very large or very small payment is not an outlier without a pattern to compare against', () => {
    expect(byVendor('Evergreen')).toHaveLength(0)
  })

  it('FP12: a one-cent rounding difference is not an overpayment', () => {
    expect(byVendor('Riverside')).toHaveLength(0)
  })

  it('negative and currency-formatted rows flag nothing on their own', () => {
    expect(byVendor('Paren')).toHaveLength(0)
    expect(byVendor('Comma')).toHaveLength(0)
    expect(byVendor('US Date')).toHaveLength(0)
  })
})

describe('messy ledger — totals, priority, evidence', () => {
  it('produces exactly the twelve expected findings and nothing else', () => {
    const summary = findings.map((f) => `${f.type}:${f.vendor}:${f.dollarImpact.toFixed(2)}`).sort()
    expect(summary).toEqual(
      [
        'amount_outlier:Metro Utilities:' + findings.find((f) => f.type === 'amount_outlier')!.dollarImpact.toFixed(2),
        'bank_account_change:Northwest Pastry Co:662.00',
        'exact_duplicate:ABC Supply LLC:900.00',
        'exact_duplicate:Harbor Point Roasting Equipment:2500.00',
        'exact_duplicate:Lakeside Printing:800.00',
        'exact_duplicate:Pine Valley Dairy:760.00',
        'exact_duplicate:Sierra Coffee Supply:6800.00',
        'missed_discount:Blue Bag Packaging:40.00',
        'near_duplicate:CloudPOS Software:3100.00',
        'overpayment:Golden Bean Exports:800.00',
        'shared_invoice_number:Acme Steel, Acme Stone:2000.00',
        'unclaimed_discount:Blue Bag Packaging:100.00',
      ].sort()
    )
  })

  it('class totals only ever add findings of their own class', () => {
    expect(result.recoverableTotal).toBeCloseTo(6800 + 2500 + 900 + 800 + 100 + 760 + 800, 2)
    expect(result.opportunityTotal).toBeCloseTo(40, 2)
    const review = findings.filter((f) => f.class === 'review').reduce((s, f) => s + f.dollarImpact, 0)
    expect(result.reviewTotal).toBeCloseTo(review, 2)
  })

  it('priority ranks a large strong duplicate above a larger but weaker outlier', () => {
    const dup = findings.find((f) => f.vendor === 'Sierra Coffee Supply')!
    const outlier = findings.find((f) => f.type === 'amount_outlier')!
    expect(outlier.dollarImpact).toBeGreaterThan(dup.dollarImpact)
    expect(priorityOf(dup, evidenceOf(dup))).toBeGreaterThan(priorityOf(outlier, evidenceOf(outlier)))
  })

  it('every finding carries the records that justify it, and each record it cites is in the ledger', () => {
    const ids = new Set(records.map((r) => r.id))
    for (const f of findings) {
      expect(f.relatedRecords.length).toBeGreaterThan(0)
      for (const r of f.relatedRecords) expect(ids.has(r.id)).toBe(true)
      expect(f.explanation.length).toBeGreaterThan(20)
    }
  })

  it('finding ids are unique and deterministic across two runs', () => {
    const ids = findings.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    const again = detectFindings(records).findings.map((f) => f.id)
    expect(again).toEqual(ids)
  })
})
