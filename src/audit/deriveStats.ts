import type { APRecord, DetectionResult, Finding, FindingClass } from '@/types'
import { normalizeVendor, parseTerms, formatDate } from '@/lib/format'
import type { AuditStats } from '@/audit/types'

const CLASS_PRIORITY: FindingClass[] = ['recoverable', 'review', 'opportunity']
export interface FindingClassSummary {
  recoverableCount: number
  reviewCount: number
  opportunityCount: number
  recoverableTotal: number
  reviewTotal: number
  opportunityTotal: number
  totalFindingCount: number
}

/** One shared classification rollup for Overview, receipts, and tests. */
export function summarizeFindingClasses(findings: Finding[]): FindingClassSummary {
  return findings.reduce<FindingClassSummary>(
    (summary, finding) => {
      summary.totalFindingCount += 1
      if (finding.class === 'recoverable') {
        summary.recoverableCount += 1
        summary.recoverableTotal += finding.dollarImpact
      } else if (finding.class === 'review') {
        summary.reviewCount += 1
        summary.reviewTotal += finding.dollarImpact
      } else {
        summary.opportunityCount += 1
        summary.opportunityTotal += finding.dollarImpact
      }
      return summary
    },
    {
      recoverableCount: 0,
      reviewCount: 0,
      opportunityCount: 0,
      recoverableTotal: 0,
      reviewTotal: 0,
      opportunityTotal: 0,
      totalFindingCount: 0,
    }
  )
}

function pickStrongestFinding(findings: Finding[]): Finding | null {
  for (const cls of CLASS_PRIORITY) {
    const inClass = findings.filter((finding) => finding.class === cls)
    if (inClass.length === 0) continue
    return inClass.reduce((best, candidate) => (candidate.dollarImpact > best.dollarImpact ? candidate : best))
  }
  return null
}

function countInvoiceGroups(records: APRecord[]): { groupCount: number; candidateRecordCount: number } {
  const groups = new Map<string, number>()
  for (const record of records) {
    if (record.invoiceNumber === null) continue
    const key = `${normalizeVendor(record.vendor)}|${record.invoiceNumber.toLowerCase().trim()}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  let groupCount = 0
  let candidateRecordCount = 0
  for (const size of groups.values()) {
    if (size < 2) continue
    groupCount += 1
    candidateRecordCount += size
  }
  return { groupCount, candidateRecordCount }
}

function dateRangeLabel(records: APRecord[]): string | null {
  if (records.length === 0) return null
  let min = records[0].paymentDate
  let max = records[0].paymentDate
  for (const record of records) {
    if (record.paymentDate < min) min = record.paymentDate
    if (record.paymentDate > max) max = record.paymentDate
  }
  if (min.getTime() === max.getTime()) return formatDate(min)
  return `${formatDate(min)} – ${formatDate(max)}`
}

export function computeAuditStats(records: APRecord[], skippedCount: number, result: DetectionResult): AuditStats {
  const vendorCount = new Set(records.map((record) => record.vendor)).size
  const { groupCount, candidateRecordCount } = countInvoiceGroups(records)
  const termsRecordCount = records.filter((record) => parseTerms(record.terms) !== null).length

  const findingSummary = summarizeFindingClasses(result.findings)

  return {
    recordCount: records.length,
    vendorCount,
    skippedCount,
    validCount: records.length,
    invoiceGroupCount: groupCount,
    duplicateCandidateCount: candidateRecordCount,
    termsRecordCount,
    dateRangeLabel: dateRangeLabel(records),
    ...findingSummary,
    strongestFinding: pickStrongestFinding(result.findings),
  }
}
