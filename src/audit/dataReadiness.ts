import type { APRecord, ParseResult } from '@/types'
import { formatDate } from '@/lib/format'

const REQUIRED_COLUMNS = ['vendor', 'payment_date', 'amount_paid']

export interface WeakerCheck {
  label: string
}

export interface DataReadiness {
  recordCount: number
  vendorCount: number
  dateRangeLabel: string | null
  skippedCount: number
  missingInvoiceRefCount: number
  weakerChecks: WeakerCheck[]
}

function dateRangeLabel(records: APRecord[]): string | null {
  if (records.length === 0) return null
  let min = records[0].paymentDate
  let max = records[0].paymentDate
  for (const record of records) {
    if (record.paymentDate < min) min = record.paymentDate
    if (record.paymentDate > max) max = record.paymentDate
  }
  if (min.getTime() === max.getTime()) return formatDate(min)
  return `${formatDate(min)} – ${formatDate(max)}`
}

/** A truthful summary of what Reclaim understood from a parsed file, and which checks will be weaker because of what's missing — derived only from the parsed records themselves. */
export function assessDataReadiness(parsed: ParseResult): DataReadiness {
  const { records, skippedCount } = parsed
  const vendorCount = new Set(records.map((r) => r.vendor)).size
  const missingInvoiceRefCount = records.filter((r) => r.invoiceNumber === null).length
  const missingBankAccount = records.every((r) => r.bankAccountLast4 === null)
  const missingTerms = records.every((r) => r.terms === null)

  const weakerChecks: WeakerCheck[] = []
  if (missingInvoiceRefCount > 0) {
    weakerChecks.push({
      label: `Duplicate-invoice detection will be less precise for ${missingInvoiceRefCount} record${
        missingInvoiceRefCount === 1 ? '' : 's'
      } missing an invoice reference.`,
    })
  }
  if (records.length > 0 && missingBankAccount) {
    weakerChecks.push({ label: 'Bank-account-change detection is unavailable — no bank account column was found.' })
  }
  if (records.length > 0 && missingTerms) {
    weakerChecks.push({ label: 'Early-payment discount checks are unavailable — no payment-terms column was found.' })
  }

  return {
    recordCount: records.length,
    vendorCount,
    dateRangeLabel: dateRangeLabel(records),
    skippedCount,
    missingInvoiceRefCount,
    weakerChecks,
  }
}

export interface FatalFileGuidance {
  detectedColumns: string[]
  missingRequiredColumns: string[]
  unrecognizedHeaders: string[]
}

/** When a file produced zero usable rows, explain what Reclaim did and didn't recognize instead of a dead-end error. */
export function assessFatalFile(parsed: ParseResult): FatalFileGuidance {
  const missingRequiredColumns = REQUIRED_COLUMNS.filter((col) => !parsed.detectedColumns.includes(col))
  return {
    detectedColumns: parsed.detectedColumns,
    missingRequiredColumns,
    unrecognizedHeaders: parsed.unrecognizedHeaders,
  }
}
