import Papa from 'papaparse'
import type { APRecord, ParseResult } from '@/types'
import { parseCurrency, parseDate } from '@/lib/format'
import { resolveVendors } from '@/lib/vendorResolution'

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
  let skippedCount = 0

  parsed.data.forEach((row, index) => {
    const vendor = cellOrNull(row.vendor)
    const paymentDateRaw = cellOrNull(row.payment_date)
    const amountPaidRaw = cellOrNull(row.amount_paid)

    const paymentDate = paymentDateRaw ? parseDate(paymentDateRaw) : null
    const amountPaid = amountPaidRaw ? parseCurrency(amountPaidRaw) : null

    if (!vendor || !paymentDate || amountPaid === null) {
      skippedCount += 1
      return
    }

    records.push({
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
    record.vendor = vendorResolution.resolveVendorName(record.vendor)
  }

  const fields = parsed.meta.fields ?? []
  const detectedColumns = fields.filter((f) => CANONICAL_COLUMNS.has(f))
  const unrecognizedHeaders = fields.filter((f) => !CANONICAL_COLUMNS.has(f))

  return { records, skippedCount, detectedColumns, unrecognizedHeaders }
}
