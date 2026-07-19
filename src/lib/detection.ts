import type { APRecord, Finding, FindingClass, DetectionResult } from '@/types'
import { normalizeVendor, daysBetween, parseTerms, formatCurrency, formatDate } from '@/lib/format'

const EPSILON = 0.01

function normalizeInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.toLowerCase().trim().replace(/\s+/g, ' ')
}

interface FindingWithImpactRows {
  finding: Finding
  impactRowIndexes: number[]
}

function makeFinding(params: {
  id: string
  type: Finding['type']
  class: FindingClass
  severity: Finding['severity']
  vendor: string
  dollarImpact: number
  title: string
  explanation: string
  relatedRecords: APRecord[]
}): Finding {
  return { ...params }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

// Rule 1 — Exact duplicate payment (recoverable, high)
function detectExactDuplicates(records: APRecord[]): {
  findings: FindingWithImpactRows[]
  allGroupedRowIndexes: Set<number>
} {
  const findings: FindingWithImpactRows[] = []
  const allGroupedRowIndexes = new Set<number>()

  const withInvoice = records.filter((r) => r.invoiceNumber !== null)
  const groups = groupBy(withInvoice, (r) => `${normalizeVendor(r.vendor)}|${normalizeInvoiceNumber(r.invoiceNumber!)}`)

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
    sorted.forEach((r) => allGroupedRowIndexes.add(r.rowIndex))

    const invoiceNumber = sorted[0].invoiceNumber
    const vendor = sorted[0].vendor
    const amountClusters = Array.from(groupBy(sorted, (r) => Math.round(r.amountPaid * 100).toString()).values())
    const duplicateClusters = amountClusters.filter((cluster) => cluster.length > 1)
    const singlePaymentRows = amountClusters.filter((cluster) => cluster.length === 1).flat()

    for (const cluster of duplicateClusters) {
      const duplicateRows = cluster.slice(1)
      const dollarImpact = duplicateRows.reduce((sum, r) => sum + r.amountPaid, 0)
      findings.push({
        finding: makeFinding({
          id: `exact_duplicate-${cluster.map((r) => r.rowIndex).join('-')}`,
          type: 'exact_duplicate',
          class: 'recoverable',
          severity: 'high',
          vendor,
          dollarImpact,
          title: `Duplicate payment of invoice ${invoiceNumber}`,
          explanation: `Invoice ${invoiceNumber} from ${vendor} was paid ${cluster.length} times at ${formatCurrency(
            cluster[0].amountPaid
          )}. ${formatCurrency(dollarImpact)} across ${duplicateRows.length} extra payment(s) is likely recoverable.`,
          relatedRecords: cluster,
        }),
        impactRowIndexes: duplicateRows.map((r) => r.rowIndex),
      })
    }

    if (singlePaymentRows.length > 0) {
      const reviewRows = duplicateClusters.length > 0 ? singlePaymentRows : sorted.slice(1)
      const dollarImpact = reviewRows.reduce((sum, r) => sum + r.amountPaid, 0)
      findings.push({
        finding: makeFinding({
          id: `repeated_invoice_review-${sorted.map((r) => r.rowIndex).join('-')}`,
          type: 'exact_duplicate',
          class: 'review',
          severity: 'medium',
          vendor,
          dollarImpact,
          title: `Repeated payments for invoice ${invoiceNumber}`,
          explanation: `Invoice ${invoiceNumber} from ${vendor} appears in payments with different amounts. Review ${formatCurrency(
            dollarImpact
          )} of additional payment activity before treating it as a potential duplicate.`,
          relatedRecords: sorted,
        }),
        impactRowIndexes: reviewRows.map((r) => r.rowIndex),
      })
    }
  }

  return { findings, allGroupedRowIndexes }
}

// Rule 2 — Near-duplicate payment (recoverable, high)
function detectNearDuplicates(
  records: APRecord[],
  excludeRowIndexes: Set<number>
): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []
  const eligible = records.filter((r) => !excludeRowIndexes.has(r.rowIndex))
  const groups = groupBy(eligible, (r) => normalizeVendor(r.vendor))
  const usedAsLater = new Set<number>()

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())

    for (let i = 1; i < sorted.length; i++) {
      const later = sorted[i]
      if (usedAsLater.has(later.rowIndex)) continue
      if (later.invoiceNumber === null) continue

      let bestMatch: APRecord | null = null
      let bestGap = Infinity

      for (let j = 0; j < i; j++) {
        const earlier = sorted[j]
        if (earlier.invoiceNumber === null) continue
        if (earlier.invoiceNumber === later.invoiceNumber) continue
        if (Math.abs(earlier.amountPaid - later.amountPaid) > EPSILON) continue

        const gap = Math.abs(daysBetween(earlier.paymentDate, later.paymentDate))
        if (gap > 45) continue

        if (gap < bestGap) {
          bestGap = gap
          bestMatch = earlier
        }
      }

      if (bestMatch) {
        usedAsLater.add(later.rowIndex)
        findings.push({
          finding: makeFinding({
            id: `near_duplicate-${bestMatch.rowIndex}-${later.rowIndex}`,
            type: 'near_duplicate',
            class: 'review',
            severity: 'medium',
            vendor: later.vendor,
            dollarImpact: later.amountPaid,
            title: `Suspected duplicate payment to ${later.vendor}`,
            explanation: `${later.vendor} was paid ${formatCurrency(later.amountPaid)} for invoice ${
              bestMatch.invoiceNumber
            } and again for invoice ${later.invoiceNumber}, ${bestGap} day(s) apart. The identical amount and short gap suggest the second payment (${formatDate(
              later.paymentDate
            )}) may be an unintended duplicate.`,
            relatedRecords: [bestMatch, later],
          }),
          impactRowIndexes: [later.rowIndex],
        })
      }
    }
  }

  return findings
}

// Rule 3 — Overpayment vs invoice (recoverable, high)
function detectOverpayments(records: APRecord[]): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []

  for (const r of records) {
    if (r.invoiceAmount === null) continue
    if (r.amountPaid > r.invoiceAmount + EPSILON) {
      const dollarImpact = r.amountPaid - r.invoiceAmount
      findings.push({
        finding: makeFinding({
          id: `overpayment-${r.rowIndex}`,
          type: 'overpayment',
          class: 'recoverable',
          severity: 'high',
          vendor: r.vendor,
          dollarImpact,
          title: `Overpayment on invoice ${r.invoiceNumber ?? 'unknown'}`,
          explanation: `Invoice ${r.invoiceNumber ?? 'unknown'} from ${r.vendor} was for ${formatCurrency(
            r.invoiceAmount
          )}, but ${formatCurrency(r.amountPaid)} was paid — an overpayment of ${formatCurrency(dollarImpact)}.`,
          relatedRecords: [r],
        }),
        impactRowIndexes: [r.rowIndex],
      })
    }
  }

  return findings
}

// Rule 4 — Unclaimed early-payment discount (recoverable, medium)
function detectUnclaimedDiscounts(records: APRecord[]): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []

  for (const r of records) {
    const terms = parseTerms(r.terms)
    if (!terms) continue
    if (r.invoiceDate === null || r.invoiceAmount === null) continue

    const daysToPay = daysBetween(r.invoiceDate, r.paymentDate)
    const paidInWindow = daysToPay <= terms.discountDays
    const paidFull = r.amountPaid >= r.invoiceAmount - EPSILON

    if (paidInWindow && paidFull) {
      const dollarImpact = r.invoiceAmount * (terms.discountPct / 100)
      findings.push({
        finding: makeFinding({
          id: `unclaimed_discount-${r.rowIndex}`,
          type: 'unclaimed_discount',
          class: 'recoverable',
          severity: 'medium',
          vendor: r.vendor,
          dollarImpact,
          title: `Unclaimed early-payment discount on invoice ${r.invoiceNumber ?? 'unknown'}`,
          explanation: `Terms of ${r.terms} entitled ${r.vendor} invoice ${
            r.invoiceNumber ?? 'unknown'
          } to a ${terms.discountPct}% discount for paying within ${terms.discountDays} days. Payment was made ${daysToPay} day(s) after the invoice date but at full price, leaving ${formatCurrency(
            dollarImpact
          )} of eligible discount unclaimed.`,
          relatedRecords: [r],
        }),
        impactRowIndexes: [r.rowIndex],
      })
    }
  }

  return findings
}

// Rule 5 — Missed early-payment discount (opportunity, low)
function detectMissedDiscounts(records: APRecord[]): Finding[] {
  const findings: Finding[] = []

  for (const r of records) {
    const terms = parseTerms(r.terms)
    if (!terms) continue
    if (r.invoiceDate === null || r.invoiceAmount === null) continue

    const daysToPay = daysBetween(r.invoiceDate, r.paymentDate)
    if (daysToPay > terms.discountDays) {
      const dollarImpact = r.invoiceAmount * (terms.discountPct / 100)
      findings.push(
        makeFinding({
          id: `missed_discount-${r.rowIndex}`,
          type: 'missed_discount',
          class: 'opportunity',
          severity: 'low',
          vendor: r.vendor,
          dollarImpact,
          title: `Missed early-payment discount on invoice ${r.invoiceNumber ?? 'unknown'}`,
          explanation: `Terms of ${r.terms} offered a ${terms.discountPct}% discount for paying within ${
            terms.discountDays
          } days, but invoice ${r.invoiceNumber ?? 'unknown'} from ${r.vendor} was paid ${daysToPay} day(s) after the invoice date. Paying earlier next time would save ${formatCurrency(
            dollarImpact
          )}.`,
          relatedRecords: [r],
        })
      )
    }
  }

  return findings
}

// Rule 6 — Vendor bank-account change (review, high)
function detectBankAccountChanges(records: APRecord[]): Finding[] {
  const findings: Finding[] = []
  const groups = groupBy(
    records.filter((r) => r.bankAccountLast4 !== null),
    (r) => normalizeVendor(r.vendor)
  )

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())

    let previous = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      if (current.bankAccountLast4 !== previous.bankAccountLast4) {
        findings.push(
          makeFinding({
            id: `bank_account_change-${current.rowIndex}`,
            type: 'bank_account_change',
            class: 'review',
            severity: 'high',
            vendor: current.vendor,
            dollarImpact: current.amountPaid,
            title: `Bank account changed for ${current.vendor}`,
            explanation: `${current.vendor}'s deposit account changed from account ending ${
              previous.bankAccountLast4
            } to account ending ${current.bankAccountLast4} on ${formatDate(
              current.paymentDate
            )}, when ${formatCurrency(
              current.amountPaid
            )} was paid. Bank-account changes are a common payment-fraud vector — verify the new account with the vendor by phone before further payments.`,
            relatedRecords: [previous, current],
          })
        )
      }
      previous = current
    }
  }

  return findings
}

// Rule 7 — Payment amount outlier (review, medium)
function detectAmountOutliers(records: APRecord[]): Finding[] {
  const findings: Finding[] = []
  const groups = groupBy(records, (r) => normalizeVendor(r.vendor))

  for (const group of groups.values()) {
    if (group.length < 4) continue

    const amounts = group.map((r) => r.amountPaid)
    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
    const variance =
      amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / (amounts.length - 1)
    const stdDev = Math.sqrt(variance)

    if (stdDev <= 0) continue

    const threshold = mean + 2.5 * stdDev
    for (const r of group) {
      if (r.amountPaid > threshold) {
        const dollarImpact = r.amountPaid - mean
        findings.push(
          makeFinding({
            id: `amount_outlier-${r.rowIndex}`,
            type: 'amount_outlier',
            class: 'review',
            severity: 'medium',
            vendor: r.vendor,
            dollarImpact,
            title: `Unusually large payment to ${r.vendor}`,
            explanation: `${r.vendor} was paid ${formatCurrency(
              r.amountPaid
            )} on ${formatDate(r.paymentDate)}, well above this vendor's typical payment of ${formatCurrency(
              mean
            )}. This may be a pricing or keying error — pull the contract or PO to confirm.`,
            relatedRecords: [r],
          })
        )
      }
    }
  }

  return findings
}

/** Keep the higher-dollar finding when a row is claimed by more than one recoverable finding. */
function dedupeRecoverable(candidates: FindingWithImpactRows[]): Finding[] {
  const sorted = [...candidates].sort((a, b) => b.finding.dollarImpact - a.finding.dollarImpact)
  const claimed = new Set<number>()
  const kept: Finding[] = []

  for (const candidate of sorted) {
    const overlaps = candidate.impactRowIndexes.some((idx) => claimed.has(idx))
    if (overlaps) continue
    candidate.impactRowIndexes.forEach((idx) => claimed.add(idx))
    kept.push(candidate.finding)
  }

  return kept
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, medium: 1, low: 2 }

export function detectFindings(records: APRecord[]): DetectionResult {
  const { findings: exactDuplicates, allGroupedRowIndexes } = detectExactDuplicates(records)
  const nearDuplicates = detectNearDuplicates(records, allGroupedRowIndexes)
  const overpayments = detectOverpayments(records)
  const unclaimedDiscounts = detectUnclaimedDiscounts(records)

  const recoveryCandidates = [...exactDuplicates, ...overpayments, ...unclaimedDiscounts].filter(
    (candidate) => candidate.finding.class === 'recoverable'
  )
  const reviewCandidates = [...exactDuplicates, ...nearDuplicates].filter((candidate) => candidate.finding.class === 'review')
  const recoverableFindings = dedupeRecoverable(recoveryCandidates)

  const missedDiscounts = detectMissedDiscounts(records)
  const bankAccountChanges = detectBankAccountChanges(records)
  const amountOutliers = detectAmountOutliers(records)

  const findings = [
    ...recoverableFindings,
    ...reviewCandidates.map((candidate) => candidate.finding),
    ...missedDiscounts,
    ...bankAccountChanges,
    ...amountOutliers,
  ].sort(
    (a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      if (severityDiff !== 0) return severityDiff
      return b.dollarImpact - a.dollarImpact
    }
  )

  const sumBy = (cls: FindingClass) =>
    findings.filter((f) => f.class === cls).reduce((sum, f) => sum + f.dollarImpact, 0)

  return {
    findings,
    recoverableTotal: sumBy('recoverable'),
    reviewTotal: sumBy('review'),
    opportunityTotal: sumBy('opportunity'),
  }
}
