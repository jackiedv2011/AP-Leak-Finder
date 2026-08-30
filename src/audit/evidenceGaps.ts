import type { Finding } from '@/types'

export interface EvidenceGap {
  label: string
  whyItMatters: string
  source: 'internal' | 'vendor'
  nextStep: string
}

/**
 * What would resolve a case, derived from what is actually missing in its
 * related records — not a generic checklist. Only surfaces a gap when the
 * underlying data genuinely lacks that field.
 */
export function buildEvidenceGaps(finding: Finding): EvidenceGap[] {
  const gaps: EvidenceGap[] = []
  const missingInvoiceRef = finding.relatedRecords.some((r) => r.invoiceNumber === null)

  if (missingInvoiceRef) {
    gaps.push({
      label: 'Invoice copy',
      whyItMatters: 'An invoice copy would confirm whether these payments were meant to apply to the same invoice.',
      source: 'internal',
      nextStep: 'Pull the invoice from your AP system or vendor portal.',
    })
  }

  switch (finding.type) {
    case 'exact_duplicate':
    case 'near_duplicate':
      gaps.push({
        label: 'Vendor statement',
        whyItMatters: 'A vendor statement would show how both payments were applied on their side.',
        source: 'vendor',
        nextStep: 'Ask the vendor to confirm how each payment was applied against the invoice.',
      })
      break
    case 'overpayment':
      gaps.push({
        label: 'Purchase order',
        whyItMatters: 'A purchase order would confirm the agreed price and quantity behind the invoiced amount.',
        source: 'internal',
        nextStep: 'Pull the PO tied to this invoice and compare it to what was billed.',
      })
      break
    case 'amount_outlier':
      gaps.push({
        label: 'Purchase order or contract',
        whyItMatters: "A contract or PO would confirm this payment matches this vendor's agreed pricing.",
        source: 'internal',
        nextStep: 'Pull the contract or PO and compare the price and quantity to what was paid.',
      })
      break
    case 'bank_account_change':
      gaps.push({
        label: 'Vendor confirmation of new bank details',
        whyItMatters: 'Verbal confirmation from a known contact rules out a payment-fraud attempt.',
        source: 'vendor',
        nextStep: 'Call the vendor on a phone number from before the change and confirm the new account verbally.',
      })
      break
    case 'unclaimed_discount':
      gaps.push({
        label: 'Payment approval record',
        whyItMatters: 'Confirms whether the full-price payment was an intentional exception to the discount terms.',
        source: 'internal',
        nextStep: 'Check the payment approval for a note about waiving the discount.',
      })
      break
    case 'missed_discount':
      break
    case 'shared_invoice_number':
      gaps.push({
        label: 'Vendor master record',
        whyItMatters: 'Confirms whether these are genuinely two different vendors or one vendor entered twice under different names.',
        source: 'internal',
        nextStep: 'Check the vendor master file for duplicate vendor records or a recent renumbering.',
      })
      break
  }

  if (finding.relatedRecords.some((r) => r.category === null)) {
    gaps.push({
      label: 'GL category',
      whyItMatters: 'A category would help route this case to the right internal reviewer.',
      source: 'internal',
      nextStep: 'Confirm the GL category with accounting if it matters for routing.',
    })
  }

  return gaps
}
