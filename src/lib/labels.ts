import type { FindingType, FindingClass } from '@/types'

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  exact_duplicate: 'Exact duplicate payment',
  near_duplicate: 'Near-duplicate payment',
  overpayment: 'Overpayment vs. invoice',
  unclaimed_discount: 'Unclaimed early-payment discount',
  missed_discount: 'Missed early-payment discount',
  bank_account_change: 'Vendor bank-account change',
  amount_outlier: 'Payment amount outlier',
  shared_invoice_number: 'Invoice number shared across vendors',
}

/**
 * Every check Reclaim runs against a ledger, in a fixed order.
 *
 * Used to render the full checklist of detection rules (including the ones
 * that found nothing) rather than only the types that happened to trigger.
 */
export const FINDING_TYPE_ORDER: FindingType[] = [
  'exact_duplicate',
  'near_duplicate',
  'overpayment',
  'unclaimed_discount',
  'missed_discount',
  'bank_account_change',
  'amount_outlier',
  'shared_invoice_number',
]

export const CLASS_LABELS: Record<FindingClass, string> = {
  recoverable: 'Likely recoverable',
  review: 'Review',
  opportunity: 'Opportunity',
}
