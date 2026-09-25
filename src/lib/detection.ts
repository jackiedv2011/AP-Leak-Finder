import type { APRecord, Finding, FindingClass, DetectionResult } from '@/types'
import { normalizeVendor, normalizeAccountLast4, daysBetween, parseTerms, formatCurrency, formatDate, plural, toCents } from '@/lib/format'
import { damerauLevenshteinDistance } from '@/lib/stringDistance'

const EPSILON = 0.01
/** Max Damerau-Levenshtein distance between normalized invoice numbers to count as "near-identical" for Rule 2. */
const MAX_NEAR_DUPLICATE_INVOICE_DISTANCE = 2
/**
 * Rule 2 treats three or more identically priced payments to one vendor on a
 * steady cadence (weekly standing orders, rent, subscriptions, retainers) as a
 * recurring charge rather than a run of duplicates. The cadence is the median
 * gap; it must be at least a few days (daily deliveries are indistinguishable
 * from a burst of duplicates), and a payment that lands well inside the cadence
 * is off-series and still assessed as a possible duplicate.
 */
const RECURRING_MIN_CADENCE_DAYS = 5
const RECURRING_MAX_TOLERANCE_DAYS = 10
/** A one-cent difference is rounding, not an overpayment. */
const OVERPAYMENT_MIN_CENTS = 2
/**
 * Rule 7 uses the median and the median absolute deviation, which one large
 * payment cannot drag towards itself the way it drags a mean and a standard
 * deviation. 3.5 is the usual cut-off for the resulting modified z-score; the
 * payment must also be at least three times the vendor's typical amount, so a
 * flat price with a small wobble, or one bigger order from a vendor whose order
 * sizes vary, is never an "outlier". Five payments is the least history the
 * median can stand on.
 */
const OUTLIER_MODIFIED_Z = 3.5
const OUTLIER_MIN_MULTIPLE = 3
const OUTLIER_MIN_PAYMENTS = 5

const centsToDollars = (cents: number) => cents / 100

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Credits and refunds booked against an invoice, keyed like Rule 1's groups. Consumed as findings net them off, so a refund is only ever counted once. */
type RefundPool = Map<string, number>

function invoiceKey(r: APRecord): string {
  return `${normalizeVendor(r.vendor)}|${normalizeInvoiceNumber(r.invoiceNumber!)}`
}

function buildRefundPool(records: APRecord[]): RefundPool {
  const pool: RefundPool = new Map()
  for (const r of records) {
    if (r.invoiceNumber === null || r.amountPaid >= 0) continue
    const key = invoiceKey(r)
    pool.set(key, (pool.get(key) ?? 0) + toCents(-r.amountPaid))
  }
  return pool
}

/** Take up to `wantedCents` of refund off the pool for this invoice and return how much was taken. */
function drawRefund(pool: RefundPool, key: string, wantedCents: number): number {
  const available = pool.get(key) ?? 0
  const taken = Math.max(0, Math.min(available, wantedCents))
  if (taken > 0) pool.set(key, available - taken)
  return taken
}

/**
 * Credits, refunds and zero-dollar lines are never themselves a leak. They stay
 * in the ledger (and net against duplicates in Rule 1) but no rule assesses them.
 */
function isPayment(r: APRecord): boolean {
  return r.amountPaid > 0
}

/** The invoice amount the rows agree on, or null when the file didn't say (or the rows disagree). */
function agreedInvoiceAmount(rows: APRecord[]): number | null {
  const amounts = new Set(rows.map((r) => (r.invoiceAmount === null ? null : toCents(r.invoiceAmount))))
  if (amounts.size !== 1) return null
  const [only] = amounts
  return only === null ? null : only / 100
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
  // Money is reported, requested and recorded in whole cents; float residue never leaves the engine.
  return { ...params, dollarImpact: centsToDollars(toCents(params.dollarImpact)) }
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
function detectExactDuplicates(records: APRecord[], refundPool: RefundPool): {
  findings: FindingWithImpactRows[]
  allGroupedRecordIds: Set<string>
} {
  const findings: FindingWithImpactRows[] = []
  const allGroupedRecordIds = new Set<string>()

  const withInvoice = records.filter((r) => r.invoiceNumber !== null)
  const groups = groupBy(withInvoice, invoiceKey)

  for (const [key, allRows] of groups) {
    const group = allRows.filter(isPayment)
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
    sorted.forEach((r) => allGroupedRecordIds.add(r.id))

    const invoiceNumber = sorted[0].invoiceNumber
    const vendor = sorted[0].vendor
    const totalPaidCents = sorted.reduce((sum, r) => sum + toCents(r.amountPaid), 0)
    const invoiceAmount = agreedInvoiceAmount(sorted)

    // Instalments: several payments that together come to no more than the
    // invoice are how the invoice was paid, not a duplicate of it.
    if (invoiceAmount !== null && totalPaidCents <= toCents(invoiceAmount)) continue
    // The most that can have leaked from this invoice is what went out beyond
    // it (when we know it). Every finding on the invoice draws from that one
    // budget, and from one pool of refunds already booked against it — two
    // duplicated amounts must never claim the same overshoot twice.
    let budgetCents = invoiceAmount === null ? Infinity : totalPaidCents - toCents(invoiceAmount)

    const amountClusters = Array.from(groupBy(sorted, (r) => toCents(r.amountPaid).toString()).values())
    const duplicateClusters = amountClusters
      .filter((cluster) => cluster.length > 1)
      .sort((a, b) => toCents(b[0].amountPaid) * (b.length - 1) - toCents(a[0].amountPaid) * (a.length - 1))
    const singlePaymentRows = amountClusters.filter((cluster) => cluster.length === 1).flat()

    for (const cluster of duplicateClusters) {
      const duplicateRows = cluster.slice(1)
      const extraCents = duplicateRows.reduce((sum, r) => sum + toCents(r.amountPaid), 0)
      const grossCents = Math.min(extraCents, budgetCents)
      budgetCents -= grossCents
      const refundedCents = drawRefund(refundPool, key, grossCents)
      const dollarImpact = centsToDollars(grossCents - refundedCents)
      if (grossCents - refundedCents <= 0) continue
      const refundNote = refundedCents > 0 ? ` ${formatCurrency(centsToDollars(refundedCents))} has already been credited back, leaving` : ''
      findings.push({
        finding: makeFinding({
          id: `exact_duplicate-${cluster.map((r) => r.id).join('-')}`,
          type: 'exact_duplicate',
          class: 'recoverable',
          severity: 'high',
          vendor,
          dollarImpact,
          title: `Duplicate payment of invoice ${invoiceNumber}`,
          explanation: `Invoice ${invoiceNumber} from ${vendor} was paid ${cluster.length} times at ${formatCurrency(
            cluster[0].amountPaid
          )}.${refundNote} ${formatCurrency(dollarImpact)} across ${duplicateRows.length} extra ${plural(duplicateRows.length, 'payment')} is likely recoverable.`,
          relatedRecords: cluster,
        }),
        impactRecordIds: duplicateRows.map((r) => r.id),
      })
    }

    if (singlePaymentRows.length > 0) {
      const reviewRows = duplicateClusters.length > 0 ? singlePaymentRows : sorted.slice(1)
      const reviewCents = reviewRows.reduce((sum, r) => sum + toCents(r.amountPaid), 0)
      const grossCents = Math.min(reviewCents, budgetCents)
      budgetCents -= grossCents
      const netCents = grossCents - drawRefund(refundPool, key, grossCents)
      if (netCents <= 0) continue
      const dollarImpact = centsToDollars(netCents)
      const overInvoice = invoiceAmount === null ? '' : ` ${formatCurrency(centsToDollars(totalPaidCents))} was paid in total against a ${formatCurrency(invoiceAmount)} invoice.`
      findings.push({
        finding: makeFinding({
          id: `repeated_invoice_review-${sorted.map((r) => r.id).join('-')}`,
          type: 'exact_duplicate',
          class: 'review',
          severity: 'medium',
          vendor,
          dollarImpact,
          title: `Repeated payments for invoice ${invoiceNumber}`,
          explanation: `Invoice ${invoiceNumber} from ${vendor} appears in payments with different amounts.${overInvoice} Review ${formatCurrency(
            dollarImpact
          )} of additional payment activity before treating it as a potential duplicate.`,
          relatedRecords: sorted,
        }),
        impactRecordIds: reviewRows.map((r) => r.id),
      })
    }
  }

  return { findings, allGroupedRecordIds }
}

/**
 * Records that belong to a recurring series for this vendor: three or more
 * payments of the same amount, each with its own invoice number, on a steady
 * cadence. One vendor can have several such series (two subscriptions).
 *
 * The cadence is the median gap. Walking the series in date order, a payment
 * that arrives well before the next one is due is off-series — that is what a
 * duplicate slipped into a standing order looks like — and is left out, so it
 * is still assessed against its neighbours. A longer gap (a skipped week) keeps
 * the series going. If too little of the series keeps to the cadence, none of
 * it is treated as recurring.
 */
function recurringRecordIds(sortedByDate: APRecord[]): Set<string> {
  const recurring = new Set<string>()
  const byAmount = groupBy(
    sortedByDate.filter((r) => r.invoiceNumber !== null),
    (r) => toCents(r.amountPaid).toString()
  )
  for (const series of byAmount.values()) {
    if (series.length < 3) continue
    const invoiceNumbers = new Set(series.map((r) => normalizeInvoiceNumber(r.invoiceNumber!)))
    if (invoiceNumbers.size !== series.length) continue
    const gaps: number[] = []
    for (let i = 1; i < series.length; i++) gaps.push(daysBetween(series[i - 1].paymentDate, series[i].paymentDate))
    const cadence = median(gaps)
    if (cadence < RECURRING_MIN_CADENCE_DAYS) continue
    const tolerance = Math.min(RECURRING_MAX_TOLERANCE_DAYS, Math.max(2, Math.floor(cadence * 0.35)))

    const onCadence = [series[0]]
    for (const r of series.slice(1)) {
      const gap = daysBetween(onCadence[onCadence.length - 1].paymentDate, r.paymentDate)
      if (gap >= cadence - tolerance) onCadence.push(r)
    }
    if (onCadence.length < 3 || onCadence.length < Math.ceil(series.length * 0.6)) continue
    onCadence.forEach((r) => recurring.add(r.id))
  }
  return recurring
}

// Rule 2 — Near-duplicate payment (recoverable, high)
function detectNearDuplicates(
  records: APRecord[],
  excludeRecordIds: Set<string>
): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []
  const eligible = records.filter((r) => isPayment(r) && !excludeRecordIds.has(r.id))
  const groups = groupBy(eligible, (r) => normalizeVendor(r.vendor))
  const usedAsLater = new Set<string>()

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
    const recurring = recurringRecordIds(sorted)

    for (let i = 1; i < sorted.length; i++) {
      const later = sorted[i]
      if (usedAsLater.has(later.id)) continue
      if (later.invoiceNumber === null) continue

      let bestMatch: APRecord | null = null
      let bestGap = Infinity
      const laterInvoice = normalizeInvoiceNumber(later.invoiceNumber)

      for (let j = 0; j < i; j++) {
        const earlier = sorted[j]
        if (earlier.invoiceNumber === null) continue
        // Two payments that both keep to a recurring cadence are the series, not a duplicate of each other.
        if (recurring.has(earlier.id) && recurring.has(later.id)) continue
        if (earlier.invoiceNumber === later.invoiceNumber) continue
        if (toCents(earlier.amountPaid) !== toCents(later.amountPaid)) continue

        const earlierInvoice = normalizeInvoiceNumber(earlier.invoiceNumber)
        // Cheap bounds first: edit distance is at least the length difference, and
        // no real invoice reference is long enough to need a quadratic comparison.
        if (Math.abs(earlierInvoice.length - laterInvoice.length) > MAX_NEAR_DUPLICATE_INVOICE_DISTANCE) continue
        if (laterInvoice.length > 64) continue
        const invoiceDistance = damerauLevenshteinDistance(earlierInvoice, laterInvoice)
        if (invoiceDistance > MAX_NEAR_DUPLICATE_INVOICE_DISTANCE) continue

        const gap = Math.abs(daysBetween(earlier.paymentDate, later.paymentDate))
        if (gap > 45) continue

        if (gap < bestGap) {
          bestGap = gap
          bestMatch = earlier
        }
      }

      if (bestMatch) {
        usedAsLater.add(later.id)
        findings.push({
          finding: makeFinding({
            id: `near_duplicate-${bestMatch.id}-${later.id}`,
            type: 'near_duplicate',
            class: 'review',
            severity: 'medium',
            vendor: later.vendor,
            dollarImpact: later.amountPaid,
            title: `Suspected duplicate payment to ${later.vendor}`,
            explanation: `${later.vendor} was paid ${formatCurrency(later.amountPaid)} for invoice ${
              bestMatch.invoiceNumber
            } and again for invoice ${later.invoiceNumber}, ${bestGap} ${plural(bestGap, 'day')} apart. The identical amount and short gap suggest the second payment (${formatDate(
              later.paymentDate
            )}) may be an unintended duplicate.`,
            relatedRecords: [bestMatch, later],
          }),
          impactRecordIds: [later.id],
        })
      }
    }
  }

  return findings
}

// Rule 3 — Overpayment vs invoice (recoverable, high)
function detectOverpayments(records: APRecord[], refundPool: RefundPool): FindingWithImpactRows[] {
  const findings: FindingWithImpactRows[] = []

  for (const r of records) {
    if (!isPayment(r) || r.invoiceAmount === null) continue
    const overCents = toCents(r.amountPaid) - toCents(r.invoiceAmount)
    if (overCents >= OVERPAYMENT_MIN_CENTS) {
      // A refund already booked against this invoice has given some (or all) of it back.
      const refundedCents = r.invoiceNumber === null ? 0 : drawRefund(refundPool, invoiceKey(r), overCents)
      if (overCents - refundedCents < OVERPAYMENT_MIN_CENTS) continue
      const dollarImpact = centsToDollars(overCents - refundedCents)
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
          )}, but ${formatCurrency(r.amountPaid)} was paid — an overpayment of ${formatCurrency(centsToDollars(overCents))}.${
            refundedCents > 0 ? ` ${formatCurrency(centsToDollars(refundedCents))} has already been credited back, leaving ${formatCurrency(dollarImpact)}.` : ''
          }`,
          relatedRecords: [r],
        }),
        impactRecordIds: [r.id],
      })
    }
  }

  return findings
}

/** The discount in whole cents, rounded half-up on the cent value itself (24.685 → 24.69, not float-truncated to 24.68). */
function discountValue(invoiceAmount: number, discountPct: number): number {
  return centsToDollars(Math.round((toCents(invoiceAmount) * discountPct) / 100))
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
    // Paid before the invoice was even dated: the dates are wrong, and a claim built on them would be too.
    const paidInWindow = daysToPay >= 0 && daysToPay <= terms.discountDays
    const paidFull = r.amountPaid >= r.invoiceAmount - EPSILON

    if (paidInWindow && paidFull) {
      const dollarImpact = discountValue(r.invoiceAmount, terms.discountPct)
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
      const dollarImpact = discountValue(r.invoiceAmount, terms.discountPct)
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
    records.filter((r) => isPayment(r) && normalizeAccountLast4(r.bankAccountLast4) !== null),
    (r) => normalizeVendor(r.vendor)
  )

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())

    // Only an account this vendor has never been paid at before is a change
    // worth verifying; switching back to a known account is not new risk.
    let previous = sorted[0]
    const seen = new Set([normalizeAccountLast4(previous.bankAccountLast4)])
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const account = normalizeAccountLast4(current.bankAccountLast4)
      if (!seen.has(account)) {
        seen.add(account)
        findings.push(
          makeFinding({
            id: `bank_account_change-${current.id}`,
            type: 'bank_account_change',
            class: 'review',
            severity: 'high',
            vendor: current.vendor,
            dollarImpact: current.amountPaid,
            title: `Bank account changed for ${current.vendor}`,
            explanation: `${current.vendor}'s deposit account changed from account ending ${normalizeAccountLast4(
              previous.bankAccountLast4
            )} to account ending ${account}, an account not paid before, on ${formatDate(
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
    if (group.length < OUTLIER_MIN_PAYMENTS) continue

    const amounts = group.map((r) => r.amountPaid)
    const typical = median(amounts)
    const mad = median(amounts.map((a) => Math.abs(a - typical)))
    // 1.4826 scales the MAD to a standard deviation for normally distributed amounts.
    const spread = 1.4826 * mad
    if (typical <= 0) continue

    for (const r of group) {
      const farAboveSpread = spread === 0 ? r.amountPaid > typical : (r.amountPaid - typical) / spread > OUTLIER_MODIFIED_Z
      if (farAboveSpread && r.amountPaid >= typical * OUTLIER_MIN_MULTIPLE) {
        const dollarImpact = r.amountPaid - typical
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
              typical
            )} (the median of ${group.length} payments). This may be a pricing or keying error — pull the contract or PO to confirm.`,
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

/** Keep the higher-dollar finding when a record is claimed by more than one recoverable finding. */
function dedupeRecoverable(candidates: FindingWithImpactRows[]): Finding[] {
  const sorted = [...candidates].sort((a, b) => b.finding.dollarImpact - a.finding.dollarImpact)
  const claimed = new Set<string>()
  const kept: Finding[] = []

  for (const candidate of sorted) {
    const overlaps = candidate.impactRecordIds.some((id) => claimed.has(id))
    if (overlaps) continue
    candidate.impactRecordIds.forEach((id) => claimed.add(id))
    kept.push(candidate.finding)
  }

  return kept
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, medium: 1, low: 2 }

export function detectFindings(records: APRecord[]): DetectionResult {
  const refundPool = buildRefundPool(records)
  const { findings: exactDuplicates, allGroupedRecordIds } = detectExactDuplicates(records, refundPool)
  const nearDuplicates = detectNearDuplicates(records, allGroupedRecordIds)
  const overpayments = detectOverpayments(records, refundPool)
  const unclaimedDiscounts = detectUnclaimedDiscounts(records)

  const recoveryCandidates = [...exactDuplicates, ...overpayments, ...unclaimedDiscounts].filter(
    (candidate) => candidate.finding.class === 'recoverable'
  )
  const reviewCandidates = [...exactDuplicates, ...nearDuplicates].filter((candidate) => candidate.finding.class === 'review')
  const recoverableFindings = dedupeRecoverable(recoveryCandidates)

  const missedDiscounts = detectMissedDiscounts(records)
  const bankAccountChanges = detectBankAccountChanges(records)
  const amountOutliers = detectAmountOutliers(records)
  const sharedInvoiceNumbers = detectSharedInvoiceNumbers(records)

  const findings = [
    ...recoverableFindings,
    ...reviewCandidates.map((candidate) => candidate.finding),
    ...missedDiscounts,
    ...bankAccountChanges,
    ...amountOutliers,
    ...sharedInvoiceNumbers,
  ].sort(
    (a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      if (severityDiff !== 0) return severityDiff
      return b.dollarImpact - a.dollarImpact
    }
  )

  const sumBy = (cls: FindingClass) =>
    centsToDollars(findings.filter((f) => f.class === cls).reduce((sum, f) => sum + toCents(f.dollarImpact), 0))

  return {
    findings,
    recoverableTotal: sumBy('recoverable'),
    reviewTotal: sumBy('review'),
    opportunityTotal: sumBy('opportunity'),
  }
}
