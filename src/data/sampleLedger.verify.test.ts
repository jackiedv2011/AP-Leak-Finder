import { describe, it, expect } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'

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
    expect(result.recoverableTotal).toBeGreaterThanOrEqual(14000)
    expect(result.recoverableTotal).toBeLessThanOrEqual(20000)

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
