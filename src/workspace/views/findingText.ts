import type { Finding } from '@/types'

const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/**
 * The records behind a finding in the words a controller would use to look
 * them up: the invoice numbers and the payment dates. Never an internal id.
 */
export function findingReference(finding: Finding): string {
  const invoices = [...new Set(finding.relatedRecords.map((r) => r.invoiceNumber).filter((n): n is string => !!n))]
  const dates = [...new Set(finding.relatedRecords.map((r) => r.paymentDate.getTime()))].sort((a, b) => a - b).map((t) => short.format(t))
  const invoicePart = invoices.length === 0 ? null : invoices.length <= 2 ? invoices.join(', ') : `${invoices[0]} +${invoices.length - 1} more`
  const datePart = dates.length === 0 ? null : dates.length <= 2 ? `paid ${dates.join(' and ')}` : `${dates.length} payments`
  return [invoicePart, datePart].filter(Boolean).join(' · ') || `${finding.relatedRecords.length} records`
}
