import type { Finding } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'

const TODAY = () =>
  new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())

function invoiceList(f: Finding): string {
  const numbers = f.relatedRecords
    .map((r) => r.invoiceNumber)
    .filter((n): n is string => n !== null)
  const unique = Array.from(new Set(numbers))
  if (unique.length === 0) return 'the invoice referenced above'
  if (unique.length === 1) return `invoice ${unique[0]}`
  return `invoices ${unique.join(' and ')}`
}

function vendorLetter(f: Finding, subject: string, bodyLines: string[]): { subject: string; body: string } {
  const body = [
    TODAY(),
    '',
    f.vendor,
    'Accounts Payable Contact',
    '',
    `Re: ${subject}`,
    '',
    'To whom it may concern,',
    '',
    ...bodyLines,
    '',
    'Please confirm receipt of this request and let us know the expected timeline for resolution. We appreciate your prompt attention to this matter.',
    '',
    'Sincerely,',
    'Accounts Payable Team',
  ].join('\n')

  return { subject, body }
}

function internalNote(f: Finding, subject: string, bodyLines: string[]): { subject: string; body: string } {
  const body = [
    `INTERNAL REVIEW NOTE — ${TODAY()}`,
    '',
    `Vendor: ${f.vendor}`,
    `Finding: ${f.title}`,
    `Amount flagged: ${formatCurrency(f.dollarImpact)}`,
    '',
    ...bodyLines,
    '',
    'This is an internal note only — do not send to the vendor.',
  ].join('\n')

  return { subject, body }
}

export function generateLetter(finding: Finding): { subject: string; body: string } {
  switch (finding.type) {
    case 'exact_duplicate':
    case 'near_duplicate': {
      const invoices = invoiceList(finding)
      return vendorLetter(finding, `Request for refund — duplicate payment on ${invoices}`, [
        `Our records show ${finding.vendor} was paid more than once for ${invoices}, for a combined duplicate amount of ${formatCurrency(
          finding.dollarImpact
        )}.`,
        `${finding.explanation}`,
        `We request a refund or account credit for the duplicate payment of ${formatCurrency(finding.dollarImpact)}.`,
      ])
    }

    case 'overpayment': {
      const invoices = invoiceList(finding)
      return vendorLetter(finding, `Request for refund — overpayment on ${invoices}`, [
        `${finding.explanation}`,
        `We request a refund of the overpaid difference of ${formatCurrency(finding.dollarImpact)} on ${invoices}.`,
      ])
    }

    case 'unclaimed_discount': {
      const invoices = invoiceList(finding)
      return vendorLetter(finding, `Request for early-payment discount credit — ${invoices}`, [
        `${finding.explanation}`,
        `We request a credit of ${formatCurrency(finding.dollarImpact)} reflecting the early-payment discount we were entitled to under the agreed terms on ${invoices}.`,
      ])
    }

    case 'bank_account_change': {
      const changeRecord = finding.relatedRecords[finding.relatedRecords.length - 1]
      return internalNote(finding, `Verify new bank details before further payments — ${finding.vendor}`, [
        `${finding.explanation}`,
        '',
        `Action required: call ${finding.vendor} using a phone number on file from before ${formatDate(
          changeRecord.paymentDate
        )} (not a number from the invoice or email that requested the change) and verbally confirm the new account ending ${
          changeRecord.bankAccountLast4 ?? 'unknown'
        } before releasing any further payments. This is a common business-email-compromise pattern — do not rely on email confirmation alone.`,
      ])
    }

    case 'amount_outlier': {
      const record = finding.relatedRecords[0]
      return internalNote(finding, `Confirm pricing on unusually large payment — ${finding.vendor}`, [
        `${finding.explanation}`,
        '',
        `Action required: pull the contract or purchase order for invoice ${
          record.invoiceNumber ?? 'unknown'
        } and confirm the price and quantity match what was agreed before this pattern repeats.`,
      ])
    }

    case 'missed_discount': {
      const record = finding.relatedRecords[0]
      return internalNote(finding, `Pay earlier to capture future discounts — ${finding.vendor}`, [
        `${finding.explanation}`,
        '',
        `Action required: flag invoices from ${finding.vendor} for earlier processing so future payments land inside the discount window. This is a forward-looking process fix, not a recoverable amount — invoice ${
          record.invoiceNumber ?? 'unknown'
        } has already been paid.`,
      ])
    }
  }
}
