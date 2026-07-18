import type { FindingType, FindingClass, Severity } from '@/types'

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  exact_duplicate: 'Exact duplicate payment',
  near_duplicate: 'Near-duplicate payment',
  overpayment: 'Overpayment vs. invoice',
  unclaimed_discount: 'Unclaimed early-payment discount',
  missed_discount: 'Missed early-payment discount',
  bank_account_change: 'Vendor bank-account change',
  amount_outlier: 'Payment amount outlier',
}

export const CLASS_LABELS: Record<FindingClass, string> = {
  recoverable: 'Recoverable',
  review: 'Review',
  opportunity: 'Opportunity',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
