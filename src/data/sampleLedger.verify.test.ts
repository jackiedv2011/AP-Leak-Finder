import { describe, it, expect } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { landingSamplePresentation } from '@/data/landingSamplePresentation'

describe('sample ledger sanity check', () => {
  it('produces a believable spread of findings', () => {
    const { records, skippedCount } = getSampleLedger()
    expect(skippedCount).toBe(0)

    const result = detectFindings(records)
    const vendors = new Set(records.map((r) => r.vendor))

    const byType: Record<string, number> = {}
    for (const f of result.findings) {
      byType[f.type] = (byType[f.type] ?? 0) + 1
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      rows: records.length,
      vendors: vendors.size,
      recoverableTotal: result.recoverableTotal,
      reviewTotal: result.reviewTotal,
      opportunityTotal: result.opportunityTotal,
      byType,
    }, null, 2))

    expect(records.length).toBeGreaterThanOrEqual(65)
    expect(records.length).toBeLessThanOrEqual(80)
    expect(vendors.size).toBe(12)
    // Ledger rows alone never make a recovery candidate; 11,684 is what the strongest rules flag for review.
    expect(result.recoverableTotal).toBe(0)
    expect(result.findings.filter((f) => f.ruleClass === 'recoverable').reduce((s, f) => s + (f.flaggedAmount ?? 0), 0)).toBe(11684)
    // Outlier excess is measured from the vendor's median payment (Cascade 996.50, Northwest Pastry 2,467.50).
    // Every ledger-only signal except missed discounts is a review signal, so the strong rules' 11,684 sits here too.
    expect(result.reviewTotal).toBe(21639)
    expect(result.opportunityTotal).toBe(384)
    expect(result.findings.filter((finding) => finding.ruleClass === 'recoverable')).toHaveLength(6)
    expect(result.findings.filter((finding) => finding.ruleClass === 'review')).toHaveLength(7)
    expect(result.findings.filter((finding) => finding.ruleClass === 'opportunity')).toHaveLength(3)
    expect(result.findings.some((finding) => finding.type === 'exact_duplicate' && finding.dollarImpact === 6800)).toBe(true)
    expect(landingSamplePresentation.recordCount).toBe(records.length)
    expect(landingSamplePresentation.recoverableTotal).toBe(result.recoverableTotal)

    for (const type of [
      'exact_duplicate',
      'near_duplicate',
      'overpayment',
      'unclaimed_discount',
      'missed_discount',
      'bank_account_change',
      'amount_outlier',
    ]) {
      expect(byType[type] ?? 0).toBeGreaterThan(0)
    }
  })
})
