import type { RecoveryEvidence } from './recovery/eligibility.ts'

export type ImportRowStatus = 'newly_imported' | 'exact_duplicate' | 'possible_overlap' | 'rejected' | 'missing_identification_fields'
export interface SourceProvenance {
  schemaVersion: 2
  rawAvailable: boolean
  raw: Record<string, string> | null
  parsed: Record<string, string | number | null>
  normalized: { vendor: string; invoiceReference: string | null }
  transformations: Record<string, string[]>
  filename: string | null
  rowNumber: number
  batchId: string
}
export interface ImportRowResult {
  rowNumber: number
  status: ImportRowStatus
  reason: string
  raw: Record<string, string> | null
  fingerprint?: string
  existingRecordId?: string
}
export interface APRecord {
  source?: SourceProvenance
  canonicalVendorId?: string
  currency?: string | null
  externalTransactionId?: string | null
  sourceAccount?: string | null
  company?: string | null
  transactionType?: string | null
  rowFingerprint?: string
  identityKey?: string
  importStatus?: ImportRowStatus
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

export type FindingClassification = 'recovery_candidate' | 'review_needed' | 'preventive_security' | 'future_savings'
export type EvidenceState = 'insufficient' | 'records_supported' | 'contradicted' | 'suppressed' | 'customer_confirmed' | 'eligible'

export type Severity = 'high' | 'medium' | 'low'

export interface Finding {
  classification?: FindingClassification
  ruleId?: string
  ruleVersion?: number
  sourceRecordIds?: string[]
  deduplicationGroup?: string
  sourceValues?: SourceProvenance[]
  flaggedAmount?: number
  potentialAmountMinor?: number | null
  currency?: string | null
  evidenceState?: EvidenceState
  evidence?: RecoveryEvidence
  missingEvidence?: string[]
  contradictoryEvidence?: string[]
  suppressionReason?: string | null
  customerDecision?: string | null
  createdAt?: number
  supersedesFindingId?: string
  requiresRevalidation?: boolean
  id: string
  type: FindingType
  /** @deprecated Presentation compatibility only; never establishes financial eligibility. */
  class: FindingClass
  /**
   * The class the rule alone gave from ledger rows: how consistent the rows
   * are, never whether money is owed. Only the evidence gate sets `classification`.
   */
  ruleClass?: FindingClass
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
  schemaVersion?: 2
  fileChecksum?: string
  rowResults?: ImportRowResult[]
  records: APRecord[]
  skippedCount: number
  /** Canonical column names Reclaim recognized in the header row (regardless of per-row validity). */
  detectedColumns: string[]
  /** Header cells present in the file that didn't match any recognized column. */
  unrecognizedHeaders: string[]
}
