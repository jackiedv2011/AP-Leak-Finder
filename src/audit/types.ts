import type { Finding } from '@/types'

export type AuditEntryMode = 'sample' | 'upload'

export interface AuditStats {
  recordCount: number
  vendorCount: number
  skippedCount: number
  validCount: number
  invoiceGroupCount: number
  duplicateCandidateCount: number
  termsRecordCount: number
  dateRangeLabel: string | null
  recoverableCount: number
  reviewCount: number
  opportunityCount: number
  recoverableTotal: number
  reviewTotal: number
  opportunityTotal: number
  totalFindingCount: number
  strongestFinding: Finding | null
}
