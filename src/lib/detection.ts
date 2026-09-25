import type { APRecord, Finding, FindingClass, DetectionResult } from '@/types'
import { normalizeVendor, daysBetween, parseTerms, formatCurrency, formatDate, plural, toCents } from '@/lib/format'
import { duplicateSignals } from './duplicateSignals'
import { reviewMetadata } from './findingMetadata'

const EPSILON = 0.01
/** A one-cent difference is rounding, not an overpayment. */
const OVERPAYMENT_MIN_CENTS = 2

/**
 * Credits, refunds and zero-dollar lines are never themselves a leak. They stay
 * in the ledger (and net against duplicates in Rule 1) but no rule assesses them.
 */
function isPayment(r: APRecord): boolean {
  return r.amountPaid > 0
}

function normalizeInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.toLowerCase().trim().replace(/\s+/g, ' ')
}

interface FindingWithImpactRows {
  finding: Finding
  /** Stable record ids this finding claims — used to resolve overlap between candidate findings. */
  impactRecordIds: string[]
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

// Rule 3 — Overpayment vs invoice (recoverable, high)
function detectOverpayments(records: APRecord[]): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []

  for (const r of records) {
    if (!isPayment(r) || r.invoiceAmount === null) continue
    if (toCents(r.amountPaid) - toCents(r.invoiceAmount) >= OVERPAYMENT_MIN_CENTS) {
      const dollarImpact = (toCents(r.amountPaid) - toCents(r.invoiceAmount)) / 100
      findings.push({
        finding: makeFinding({
          id: `overpayment-${r.id}`,
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
        impactRecordIds: [r.id],
      })
    }
  }

  return findings
}

// Rule 4 — Unclaimed early-payment discount (recoverable, medium)
function detectUnclaimedDiscounts(records: APRecord[]): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []

  for (const r of records) {
    if (!isPayment(r)) continue
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
          id: `unclaimed_discount-${r.id}`,
          type: 'unclaimed_discount',
          class: 'recoverable',
          severity: 'medium',
          vendor: r.vendor,
          dollarImpact,
          title: `Unclaimed early-payment discount on invoice ${r.invoiceNumber ?? 'unknown'}`,
          explanation: `Terms of ${r.terms} entitled ${r.vendor} invoice ${
            r.invoiceNumber ?? 'unknown'
          } to a ${terms.discountPct}% discount for paying within ${terms.discountDays} days. Payment was made ${daysToPay} ${plural(daysToPay, 'day')} after the invoice date but at full price, leaving ${formatCurrency(
            dollarImpact
          )} of eligible discount unclaimed.`,
          relatedRecords: [r],
        }),
        impactRecordIds: [r.id],
      })
    }
  }

  return findings
}

// Rule 5 — Missed early-payment discount (opportunity, low)
function detectMissedDiscounts(records: APRecord[]): Finding[] {
  const findings: Finding[] = []

  for (const r of records) {
    if (!isPayment(r)) continue
    const terms = parseTerms(r.terms)
    if (!terms) continue
    if (r.invoiceDate === null || r.invoiceAmount === null) continue

    const daysToPay = daysBetween(r.invoiceDate, r.paymentDate)
    // Paying the discounted amount late means the vendor honoured the discount
    // anyway — nothing was lost, so there is nothing to change next time.
    const paidFull = r.amountPaid >= r.invoiceAmount - EPSILON
    if (daysToPay > terms.discountDays && paidFull) {
      const dollarImpact = r.invoiceAmount * (terms.discountPct / 100)
      findings.push(
        makeFinding({
          id: `missed_discount-${r.id}`,
          type: 'missed_discount',
          class: 'opportunity',
          severity: 'low',
          vendor: r.vendor,
          dollarImpact,
          title: `Missed early-payment discount on invoice ${r.invoiceNumber ?? 'unknown'}`,
          explanation: `Terms of ${r.terms} offered a ${terms.discountPct}% discount for paying within ${
            terms.discountDays
          } days, but invoice ${r.invoiceNumber ?? 'unknown'} from ${r.vendor} was paid ${daysToPay} ${plural(daysToPay, 'day')} after the invoice date. Paying earlier next time would save ${formatCurrency(
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
    records.filter((r) => isPayment(r) && r.bankAccountLast4 !== null),
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
            id: `bank_account_change-${current.id}`,
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
  const groups = groupBy(records.filter(isPayment), (r) => normalizeVendor(r.vendor))

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
            id: `amount_outlier-${r.id}`,
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

// Rule 8 — Invoice number reused across different vendors (review, high)
function detectSharedInvoiceNumbers(records: APRecord[]): Finding[] {
  const findings: Finding[] = []
  const withInvoice = records.filter((r) => isPayment(r) && r.invoiceNumber !== null)
  const groups = groupBy(withInvoice, (r) => normalizeInvoiceNumber(r.invoiceNumber!))

  for (const group of groups.values()) {
    const vendorsInGroup = groupBy(group, (r) => normalizeVendor(r.vendor))
    if (vendorsInGroup.size < 2) continue

    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
    const vendorNames = Array.from(new Set(sorted.map((r) => r.vendor))).join(', ')
    const dollarImpact = sorted.reduce((sum, r) => sum + r.amountPaid, 0)

    findings.push(
      makeFinding({
        id: `shared_invoice_number-${sorted.map((r) => r.id).join('-')}`,
        type: 'shared_invoice_number',
        class: 'review',
        severity: 'high',
        vendor: vendorNames,
        dollarImpact,
        title: `Invoice ${sorted[0].invoiceNumber} used by more than one vendor`,
        explanation: `Invoice number ${sorted[0].invoiceNumber} appears on payments to ${vendorsInGroup.size} different vendors (${vendorNames}), totaling ${formatCurrency(
          dollarImpact
        )}. That's either a coincidental numbering overlap or a data-entry/vendor-identity issue worth confirming before treating either payment as routine.`,
        relatedRecords: sorted,
      })
    )
  }

  return findings
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, medium: 1, low: 2 }

export function detectFindings(records: APRecord[]): DetectionResult {
  const duplicates = duplicateSignals(records)
  const overpayments = detectOverpayments(records)
  const unclaimedDiscounts = detectUnclaimedDiscounts(records)
  const missedDiscounts = detectMissedDiscounts(records)
  const bankAccountChanges = detectBankAccountChanges(records)
  const amountOutliers = detectAmountOutliers(records)
  const sharedInvoiceNumbers = detectSharedInvoiceNumbers(records)

  const findings = [
    ...duplicates,
    ...overpayments.map(c=>c.finding),
    ...unclaimedDiscounts.map(c=>c.finding),
    ...missedDiscounts,
    ...bankAccountChanges,
    ...amountOutliers,
    ...sharedInvoiceNumbers,
  ].map(f=>reviewMetadata(f)).sort(
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
