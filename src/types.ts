export interface APRecord {
  vendor: string
  invoiceNumber: string | null
  invoiceDate: Date | null
  paymentDate: Date
  invoiceAmount: number | null
  amountPaid: number
  terms: string | null
  bankAccountLast4: string | null
  category: string | null
  rowIndex: number
}

export type FindingType =
  | 'exact_duplicate'
  | 'near_duplicate'
  | 'overpayment'
  | 'unclaimed_discount'
  | 'missed_discount'
  | 'bank_account_change'
  | 'amount_outlier'

export type FindingClass = 'recoverable' | 'review' | 'opportunity'

export type Severity = 'high' | 'medium' | 'low'

export interface Finding {
  id: string
  type: FindingType
  class: FindingClass
  severity: Severity
  vendor: string
  dollarImpact: number
  title: string
  explanation: string
  relatedRecords: APRecord[]
}

export interface DetectionResult {
  findings: Finding[]
  recoverableTotal: number
  reviewTotal: number
  opportunityTotal: number
}

export interface ParseResult {
  records: APRecord[]
  skippedCount: number
}
