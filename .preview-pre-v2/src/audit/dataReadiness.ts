import type { APRecord, ParseResult } from '@/types'
import { formatDate, parseTerms } from '@/lib/format'

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
  availableCheckCount: number
  totalCheckCount: 7
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

/**
 * A truthful summary of the records a single import contributed and the
 * coverage those records can support. Column metadata is optional so older
 * persisted ledgers can still produce a receipt from their usable values.
 */
export function assessRecordReadiness(
  records: APRecord[],
  skippedCount: number,
  detectedColumns?: string[]
): DataReadiness {
  const vendorCount = new Set(records.map((r) => r.vendor)).size
  const missingInvoiceRefCount = records.filter((r) => r.invoiceNumber === null).length
  const hasInvoiceReferences = records.some((r) => r.invoiceNumber !== null)
  const hasInvoiceAmounts = records.some((r) => r.invoiceAmount !== null)
  const hasBankAccounts = records.some((r) => r.bankAccountLast4 !== null)
  const hasDiscountReadyRecord = records.some(
    (r) => parseTerms(r.terms) !== null && r.invoiceDate !== null && r.invoiceAmount !== null
  )
  const provided = new Set(detectedColumns)
  const knowsColumns = detectedColumns !== undefined
  const weakerChecks: WeakerCheck[] = []
  let availableCheckCount = 7

  if (!hasInvoiceReferences) {
    availableCheckCount -= 2
    weakerChecks.push({
      label: knowsColumns && !provided.has('invoice_number')
        ? 'Exact and near-duplicate detection are unavailable because no invoice-reference column was provided.'
        : 'Exact and near-duplicate detection are unavailable because no usable invoice references were found.',
    })
  } else if (missingInvoiceRefCount > 0) {
    weakerChecks.push({
      label: `Duplicate-invoice detection will be less precise for ${missingInvoiceRefCount} record${
        missingInvoiceRefCount === 1 ? '' : 's'
      } missing an invoice reference.`,
    })
  }

  if (!hasInvoiceAmounts) {
    availableCheckCount -= 1
    weakerChecks.push({
      label: knowsColumns && !provided.has('invoice_amount')
        ? 'Overpayment detection is unavailable because no invoice-amount column was provided.'
        : 'Overpayment detection is unavailable because no usable invoice amounts were found.',
    })
  }

  if (!hasBankAccounts) {
    availableCheckCount -= 1
    weakerChecks.push({
      label: knowsColumns && !provided.has('bank_account_last4')
        ? 'Bank-account-change detection is unavailable because no bank-account column was provided.'
        : 'Bank-account-change detection is unavailable because no usable bank-account values were found.',
    })
  }

  if (!hasDiscountReadyRecord) {
    availableCheckCount -= 2
    const missingColumns = [
      knowsColumns && !provided.has('terms') ? 'payment terms' : null,
      knowsColumns && !provided.has('invoice_date') ? 'invoice dates' : null,
      knowsColumns && !provided.has('invoice_amount') ? 'invoice amounts' : null,
    ].filter((value): value is string => value !== null)
    weakerChecks.push({
      label: missingColumns.length > 0
        ? `Early-payment discount checks are unavailable because the file did not provide ${missingColumns.join(', ')}.`
        : 'Early-payment discount checks are unavailable because no rows had usable discount terms, invoice dates, and invoice amounts together.',
    })
  }

  return {
    recordCount: records.length,
    vendorCount,
    dateRangeLabel: dateRangeLabel(records),
    skippedCount,
    missingInvoiceRefCount,
    availableCheckCount,
    totalCheckCount: 7,
    weakerChecks,
  }
}

/** A truthful summary of what Reclaim understood from a newly parsed file. */
export function assessDataReadiness(parsed: ParseResult): DataReadiness {
  return assessRecordReadiness(parsed.records, parsed.skippedCount, parsed.detectedColumns)
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
