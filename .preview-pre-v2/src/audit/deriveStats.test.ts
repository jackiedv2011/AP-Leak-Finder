import { describe, expect, it } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { computeAuditStats } from '@/audit/deriveStats'

describe('computeAuditStats', () => {
  it('derives real, non-fabricated stats from the sample ledger', () => {
    const { records, skippedCount } = getSampleLedger()
    const result = detectFindings(records)
    const stats = computeAuditStats(records, skippedCount, result)

    expect(stats.recordCount).toBe(records.length)
    expect(stats.vendorCount).toBe(12)
    expect(stats.skippedCount).toBe(0)
    expect(stats.recoverableTotal).toBe(result.recoverableTotal)
    expect(stats.reviewTotal).toBe(result.reviewTotal)
    expect(stats.opportunityTotal).toBe(result.opportunityTotal)
    expect(stats.totalFindingCount).toBe(result.findings.length)
    expect(stats.invoiceGroupCount).toBeGreaterThan(0)
    expect(stats.termsRecordCount).toBeGreaterThan(0)
    expect(stats.dateRangeLabel).not.toBeNull()

    // The strongest finding must be a real recoverable finding (the sample has some).
    expect(stats.strongestFinding).not.toBeNull()
    expect(stats.strongestFinding!.class).toBe('recoverable')
    expect(stats.strongestFinding!.dollarImpact).toBe(6800)
  })

  it('falls back to review, then opportunity, when no recoverable findings exist', () => {
    const reviewOnly = computeAuditStats([], 0, {
      findings: [
        {
          id: 'f1',
          type: 'amount_outlier',
          class: 'review',
          severity: 'medium',
          vendor: 'Acme',
          dollarImpact: 50,
          title: 'Outlier',
          explanation: 'x',
          relatedRecords: [],
        },
      ],
      recoverableTotal: 0,
      reviewTotal: 50,
      opportunityTotal: 0,
    })
    expect(reviewOnly.strongestFinding?.class).toBe('review')

    const none = computeAuditStats([], 0, {
      findings: [],
      recoverableTotal: 0,
      reviewTotal: 0,
      opportunityTotal: 0,
    })
    expect(none.strongestFinding).toBeNull()
  })
})
