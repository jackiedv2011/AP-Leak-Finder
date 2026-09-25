import type { Finding, FindingType } from '@/types'

/**
 * Finding types whose dollar figure is not money a vendor owes back:
 *  - a missed discount is a process fix for next time (Protected, not recovery);
 *  - a bank-account change and an invoice number shared across vendors are
 *    payments to verify — the figure is what is at risk, not what is owed.
 * Counting any of them as "potential recovery" would inflate the one number
 * a business uses to decide whether Reclaim is worth it.
 */
const NOT_A_CLAIM: ReadonlySet<FindingType> = new Set<FindingType>(['missed_discount', 'bank_account_change', 'shared_invoice_number'])

/** Payments to verify rather than money owed. */
const AT_RISK: ReadonlySet<FindingType> = new Set<FindingType>(['bank_account_change', 'shared_invoice_number'])

/** Whether this finding could end with money coming back from the vendor. */
export function isClaim(finding: Pick<Finding, 'type'>): boolean {
  return !NOT_A_CLAIM.has(finding.type)
}

/** Whether the figure on this finding is money at risk (verify before paying again) rather than a claim. */
export function isAtRisk(finding: Pick<Finding, 'type'>): boolean {
  return AT_RISK.has(finding.type)
}

/** The most that could come back on this finding: its figure for a claim, nothing otherwise. */
export function claimValue(finding: Pick<Finding, 'type' | 'dollarImpact'>): number {
  return isClaim(finding) ? finding.dollarImpact : 0
}

/** Sum money in whole cents so a long list of findings never accumulates float residue. */
export function sumMoney(values: number[]): number {
  return values.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100
}
