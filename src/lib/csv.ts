import Papa from 'papaparse'
import type { APRecord, ParseResult } from '@/types'
import { parseCurrency, parseDate } from '@/lib/format'

const COLUMN_ALIASES: Record<string, string> = {
  vendor: 'vendor',
  invoice_number: 'invoice_number',
  invoicenumber: 'invoice_number',
  invoice_date: 'invoice_date',
  invoicedate: 'invoice_date',
  payment_date: 'payment_date',
  paymentdate: 'payment_date',
  invoice_amount: 'invoice_amount',
  invoiceamount: 'invoice_amount',
  amount_paid: 'amount_paid',
  amountpaid: 'amount_paid',
  terms: 'terms',
  bank_account_last4: 'bank_account_last4',
  bankaccountlast4: 'bank_account_last4',
  category: 'category',
}

function normalizeHeader(header: string): string | null {
  const key = header.trim().toLowerCase().replace(/\s+/g, '_')
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

  return { records, skippedCount }
}
