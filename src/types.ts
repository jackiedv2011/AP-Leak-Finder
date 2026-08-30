export interface APRecord {
  /**
   * Stable identity, unique for the life of the record in the ledger.
   * Assigned by the ledger store when a parsed record is merged into the
   * persistent environment — detection and grouping logic must key off this,
   * never off array position, since records from different imports coexist.
   * A freshly parsed record (before it's been merged) carries a placeholder.
   */
  id: string
  /** Which import batch this record entered the ledger through. Empty until merged. */
  importBatchId: string
  vendor: string
  invoiceNumber: string | null
  invoiceDate: Date | null
  paymentDate: Date
  invoiceAmount: number | null
  amountPaid: number
  terms: string | null
  bankAccountLast4: string | null
  category: string | null
  /** Position within its own source file — display only ("Source row N"), not a stable identity. */
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
  | 'shared_invoice_number'

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
  /** Canonical column names Reclaim recognized in the header row (regardless of per-row validity). */
  detectedColumns: string[]
  /** Header cells present in the file that didn't match any recognized column. */
  unrecognizedHeaders: string[]
}
