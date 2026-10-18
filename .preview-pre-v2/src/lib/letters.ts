import type { Finding } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'
import type { SenderProfile } from '@/lib/senderProfile'
import type { RecoveryMethod } from '@/ledger/caseState'

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

/**
 * The one sentence that changes depending on how the business wants this
 * settled. Every vendor letter used to say "a refund or account credit"
 * regardless of what was actually selected in the form — the resolution
 * picker looked functional but never touched the letter.
 */
function resolutionNoun(method: RecoveryMethod): string {
  switch (method) {
    case 'refund':
      return 'refund'
    case 'credit':
      return 'credit'
    case 'offset':
      return 'payment offset'
  }
}

function resolutionAsk(method: RecoveryMethod, amount: number): string {
  const value = formatCurrency(amount)
  switch (method) {
    case 'refund':
      return `a refund of ${value}`
    case 'credit':
      return `an account credit of ${value}`
    case 'offset':
      return `a credit of ${value} applied against our next payment to you`
  }
}

/**
 * A real email, not a printed letter reformatted as one. The date, inside
 * address, and "Re:" line are conventions for paper correspondence — an
 * email client already stamps the date and carries the subject, so keeping
 * them just duplicated the Subject field and added clutter above the actual
 * request.
 */
function vendorLetter(subject: string, bodyLines: string[], sender?: SenderProfile): { subject: string; body: string } {
  const businessLine = sender?.businessName ? sender.businessName : null
  const signOff = sender?.senderName
    ? [sender.senderName, businessLine].filter((line): line is string => Boolean(line))
    : ['Accounts Payable Team', businessLine].filter((line): line is string => Boolean(line))

  const body = [
    'To whom it may concern,',
    '',
    ...bodyLines,
    '',
    'Please confirm receipt of this request and let us know your expected timeline for resolution. We appreciate your prompt attention to this matter.',
    '',
    'Best regards,',
    ...signOff,
    ...(sender?.senderEmail ? [sender.senderEmail] : []),
  ].join('\n')

  return { subject, body }
}

function internalNote(f: Finding, subject: string, bodyLines: string[], sender?: SenderProfile): { subject: string; body: string } {
  const body = [
    `INTERNAL REVIEW NOTE — ${TODAY()}`,
    '',
    `Vendor: ${f.vendor}`,
    `Finding: ${f.title}`,
    `Amount flagged: ${formatCurrency(f.dollarImpact)}`,
    ...(sender?.senderName ? [`Reviewed by: ${sender.senderName}`] : []),
    '',
    ...bodyLines,
    '',
    'This is an internal note only — do not send to the vendor.',
  ].join('\n')

  return { subject, body }
}

export function generateLetter(
  finding: Finding,
  sender?: SenderProfile,
  method: RecoveryMethod = 'refund'
): { subject: string; body: string } {
  const letter = (subject: string, bodyLines: string[]) => vendorLetter(subject, bodyLines, sender)
  const note = (subject: string, bodyLines: string[]) => internalNote(finding, subject, bodyLines, sender)

  switch (finding.type) {
    case 'exact_duplicate': {
      if (finding.class !== 'recoverable') {
        return note(`Review repeated payments before contacting ${finding.vendor}`, [
          finding.explanation,
          '',
          'Action required: confirm the invoice schedule and payment approvals before requesting a refund or credit from the vendor.',
        ])
      }
      const invoices = invoiceList(finding)
      return letter(`Request for ${resolutionNoun(method)} — duplicate payment on ${invoices}`, [
        `Our records show ${finding.vendor} was paid more than once for ${invoices}, for a combined duplicate amount of ${formatCurrency(
          finding.dollarImpact
        )}.`,
        `${finding.explanation}`,
        `We request ${resolutionAsk(method, finding.dollarImpact)} for the duplicate payment.`,
      ])
    }

    case 'near_duplicate': {
      return note(`Review suspected duplicate payment to ${finding.vendor}`, [
        finding.explanation,
        '',
        'Action required: compare the invoice descriptions, purchase orders, and payment approvals before contacting the vendor.',
      ])
    }

    case 'overpayment': {
      const invoices = invoiceList(finding)
      return letter(`Request for ${resolutionNoun(method)} — overpayment on ${invoices}`, [
        `${finding.explanation}`,
        `We request ${resolutionAsk(method, finding.dollarImpact)} for the overpaid difference on ${invoices}.`,
      ])
    }

    case 'unclaimed_discount': {
      const invoices = invoiceList(finding)
      return letter(`Request for early-payment discount credit — ${invoices}`, [
        `${finding.explanation}`,
        `We request ${resolutionAsk(method, finding.dollarImpact)}, reflecting the early-payment discount we were entitled to under the agreed terms on ${invoices}.`,
      ])
    }

    case 'bank_account_change': {
      const changeRecord = finding.relatedRecords[finding.relatedRecords.length - 1]
      return note(`Verify new bank details before further payments — ${finding.vendor}`, [
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
      return note(`Confirm pricing on unusually large payment — ${finding.vendor}`, [
        `${finding.explanation}`,
        '',
        `Action required: pull the contract or purchase order for invoice ${
          record.invoiceNumber ?? 'unknown'
        } and confirm the price and quantity match what was agreed before this pattern repeats.`,
      ])
    }

    case 'missed_discount': {
      const record = finding.relatedRecords[0]
      return note(`Pay earlier to capture future discounts — ${finding.vendor}`, [
        `${finding.explanation}`,
        '',
        `Action required: flag invoices from ${finding.vendor} for earlier processing so future payments land inside the discount window. This is a forward-looking process fix, not a recoverable amount — invoice ${
          record.invoiceNumber ?? 'unknown'
        } has already been paid.`,
      ])
    }

    case 'shared_invoice_number': {
      return note(`Confirm vendor identity before further review — invoice ${finding.relatedRecords[0].invoiceNumber ?? 'unknown'}`, [
        `${finding.explanation}`,
        '',
        'Action required: check the vendor master file for a duplicate or renumbered vendor record, and confirm which payment (if either) was made against the correct vendor before treating this as routine.',
      ])
    }
  }
}
