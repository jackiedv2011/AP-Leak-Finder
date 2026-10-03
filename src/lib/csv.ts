import Papa from 'papaparse'
import type { APRecord, ParseResult, ImportRowResult } from '@/types'
import { parseCurrency, parseDate, normalizeVendor } from '@/lib/format'
import { resolveVendors } from '@/lib/vendorResolution'
import { checksum, normalizeReference, vendorTransformations, recordIdentity } from './sourceIdentity'

/** Header spellings seen in QuickBooks, Xero, Bill and hand-built AP exports, after normalizeHeader. */
const COLUMN_ALIASES: Record<string, string> = {
  vendor: 'vendor',
  vendor_name: 'vendor',
  supplier: 'vendor',
  supplier_name: 'vendor',
  payee: 'vendor',
  payee_name: 'vendor',
  invoice_number: 'invoice_number',
  invoicenumber: 'invoice_number',
  invoice_no: 'invoice_number',
  invoice_num: 'invoice_number',
  invoice_id: 'invoice_number',
  invoice: 'invoice_number',
  inv_no: 'invoice_number',
  bill_number: 'invoice_number',
  bill_no: 'invoice_number',
  invoice_date: 'invoice_date',
  invoicedate: 'invoice_date',
  bill_date: 'invoice_date',
  payment_date: 'payment_date',
  paymentdate: 'payment_date',
  date_paid: 'payment_date',
  paid_date: 'payment_date',
  pay_date: 'payment_date',
  invoice_amount: 'invoice_amount',
  invoiceamount: 'invoice_amount',
  invoice_total: 'invoice_amount',
  bill_amount: 'invoice_amount',
  amount_paid: 'amount_paid',
  amountpaid: 'amount_paid',
  payment_amount: 'amount_paid',
  paid_amount: 'amount_paid',
  terms: 'terms',
  payment_terms: 'terms',
  bank_account_last4: 'bank_account_last4',
  bank_account_last_4: 'bank_account_last4',
  bankaccountlast4: 'bank_account_last4',
  bank_last4: 'bank_account_last4',
  account_last4: 'bank_account_last4',
  category: 'category',
  gl_category: 'category',
  currency: 'currency',
  currency_code: 'currency',
  transaction_id: 'transaction_id',
  payment_id: 'transaction_id',
  external_transaction_id: 'transaction_id',
  company: 'company',
  company_id: 'company',
  source_account: 'source_account',
  source_system_account: 'source_account',
  transaction_type: 'transaction_type',
}

const CANONICAL_COLUMNS = new Set(Object.values(COLUMN_ALIASES))

/** "Invoice No.", " PAYMENT DATE ", "Invoice #" → invoice_no, payment_date, invoice. */
function normalizeHeader(header: string): string | null {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return COLUMN_ALIASES[key] ?? null
}

function cellOrNull(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'n/a') return null
  return trimmed
}

export function parseCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => normalizeHeader(header) ?? header,
  })

  const records: APRecord[] = []
  const rowResults: ImportRowResult[] = []
  let skippedCount = 0

  parsed.data.forEach((row, index) => {
    const vendor = cellOrNull(row.vendor)
    const paymentDateRaw = cellOrNull(row.payment_date)
    const amountPaidRaw = cellOrNull(row.amount_paid)

    const paymentDate = paymentDateRaw ? parseDate(paymentDateRaw) : null
    const amountPaid = amountPaidRaw ? parseCurrency(amountPaidRaw) : null

    if (!vendor || !paymentDate || amountPaid === null) {
      skippedCount += 1
      rowResults.push({ rowNumber: index + 2, status: 'rejected', reason: 'Vendor, valid payment date and payment amount are required.', raw: { ...row } })
      return
    }
    const reference = normalizeReference(row.invoice_number ?? null)
    const currency = cellOrNull(row.currency)?.toUpperCase() ?? null
    records.push({
      source: {
        schemaVersion: 2, rawAvailable: true, raw: { ...row },
        parsed: { vendor, invoiceReference: cellOrNull(row.invoice_number), paymentDate: paymentDate.toISOString(), amountPaid, invoiceAmount: parseCurrency(cellOrNull(row.invoice_amount)), currency },
        normalized: { vendor: normalizeVendor(vendor), invoiceReference: reference.value },
        transformations: { vendor: vendorTransformations(row.vendor), invoiceReference: reference.transformations, amountPaid: amountPaidRaw !== String(amountPaid) ? ['parse_amount'] : [], paymentDate: ['parse_date'], currency: currency !== (row.currency ?? null) ? ['trim_and_uppercase'] : [] },
        filename: null, rowNumber: index + 2, batchId: '',
      },
      currency,
      externalTransactionId: cellOrNull(row.transaction_id),
      company: cellOrNull(row.company),
      sourceAccount: cellOrNull(row.source_account),
      transactionType: cellOrNull(row.transaction_type),
      // Placeholder identity — the ledger store assigns the real global id
      // and importBatchId when this record is merged into the environment.
      id: `pending:${index}`,
      importBatchId: '',
      vendor,
      invoiceNumber: cellOrNull(row.invoice_number),
      invoiceDate: parseDate(cellOrNull(row.invoice_date)),
      paymentDate,
      invoiceAmount: parseCurrency(cellOrNull(row.invoice_amount)),
      amountPaid,
      terms: cellOrNull(row.terms),
      bankAccountLast4: cellOrNull(row.bank_account_last4),
      category: cellOrNull(row.category),
      rowIndex: index,
    })
  })

  const vendorResolution = resolveVendors(
    records.map((r) => ({ vendor: r.vendor, bankAccountLast4: r.bankAccountLast4 }))
  )
  for (const record of records) {
    // The display vendor is the resolved group name; the original spelling stays in source.raw.
    const resolved = vendorResolution.resolveVendorName(record.vendor)
    const canonical = normalizeVendor(resolved)
    record.canonicalVendorId = `vendor_${checksum(canonical)}`
    if (canonical !== record.source!.normalized.vendor) record.source!.transformations.vendor.push('suggested_fuzzy_vendor_group')
    record.vendor = resolved
    record.identityKey = recordIdentity(record)
    record.rowFingerprint = checksum(record.identityKey)
  }

  const fields = parsed.meta.fields ?? []
  const detectedColumns = fields.filter((f) => CANONICAL_COLUMNS.has(f))
  const unrecognizedHeaders = fields.filter((f) => !CANONICAL_COLUMNS.has(f))

  return { records, skippedCount, detectedColumns, unrecognizedHeaders, schemaVersion: 2, fileChecksum: checksum(csvText), rowResults }
}
