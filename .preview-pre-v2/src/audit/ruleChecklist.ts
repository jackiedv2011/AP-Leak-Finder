import type { Finding } from '@/types'

export interface RuleCheck {
  label: string
  /** true renders a ✓ (matching signal), false renders a ○ (a real, visible difference). */
  matched: boolean
}

const EPSILON = 0.01

/**
 * Plain-language breakdown of why a finding was flagged, built from the
 * actual related records rather than a confidence score. Every entry
 * reflects a condition the detection rule genuinely required (✓) or a
 * genuine difference that remains visible in the evidence (○).
 */
export function buildRuleChecklist(finding: Finding): RuleCheck[] {
  const [a, b] = finding.relatedRecords

  switch (finding.type) {
    case 'exact_duplicate': {
      const sameAmount = b ? Math.abs(a.amountPaid - b.amountPaid) < EPSILON : true
      const sameDate = b ? a.paymentDate.getTime() === b.paymentDate.getTime() : true
      return [
        { label: 'Same vendor', matched: true },
        { label: 'Same invoice reference', matched: true },
        { label: sameAmount ? 'Same amount' : 'Different amount', matched: sameAmount },
        { label: sameDate ? 'Same payment date' : 'Different payment date', matched: sameDate },
      ]
    }

    case 'near_duplicate': {
      return [
        { label: 'Same vendor', matched: true },
        { label: 'Different invoice reference', matched: false },
        { label: 'Same amount', matched: true },
        { label: 'Different payment date', matched: false },
      ]
    }

    case 'overpayment': {
      return [
        { label: 'Matches an invoice on file', matched: true },
        { label: 'Amount paid exceeds the invoice amount', matched: false },
      ]
    }

    case 'unclaimed_discount': {
      return [
        { label: 'Paid within the early-payment discount window', matched: true },
        { label: 'Full price paid — discount not applied', matched: false },
      ]
    }

    case 'missed_discount': {
      return [
        { label: 'Discount terms were available on this invoice', matched: true },
        { label: 'Paid after the discount window closed', matched: false },
      ]
    }

    case 'bank_account_change': {
      return [
        { label: 'Same vendor', matched: true },
        { label: 'Sequential payment history', matched: true },
        { label: 'Different bank account on file', matched: false },
      ]
    }

    case 'amount_outlier': {
      return [
        { label: "Same vendor's payment pattern", matched: true },
        { label: "Well above this vendor's typical payment", matched: false },
      ]
    }

    case 'shared_invoice_number': {
      return [
        { label: 'Same invoice number', matched: true },
        { label: 'Different vendor on file', matched: false },
      ]
    }
  }
}

export type EvidenceStrength = 'Strong' | 'Moderate' | 'Limited'

/**
 * A plain-language evidence-strength label derived from how many checklist
 * conditions actually matched, deliberately not a numeric confidence score.
 * Severity acts as a floor: a rule that inherently produces ambiguous
 * evidence (e.g. near-duplicate) never reads as "Strong".
 */
export function evidenceStrength(finding: Finding): EvidenceStrength {
  const checks = buildRuleChecklist(finding)
  const matchedRatio = checks.filter((c) => c.matched).length / checks.length
  if (finding.severity === 'low' || matchedRatio < 0.5) return 'Limited'
  if (finding.severity === 'high' && matchedRatio >= 0.75) return 'Strong'
  return 'Moderate'
}

/** The first unmatched checklist item — the case's key open uncertainty. */
export function keyUncertainty(finding: Finding): string | null {
  const unmatched = buildRuleChecklist(finding).find((c) => !c.matched)
  return unmatched ? unmatched.label : null
}
