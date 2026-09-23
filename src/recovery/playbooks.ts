import type { Finding } from '@/types'

export interface RecoveryPlaybook { title: string; checks: string[]; nextStep: string }

/** Human verification prompts keyed to existing findings; detection rules remain unchanged. */
export function playbookFor(finding: Finding): RecoveryPlaybook {
  switch (finding.type) {
    case 'exact_duplicate':
      return { title: 'Duplicate payment', checks: ['Confirm both payments settled and refer to the same obligation.', 'Check for an existing reversal, refund or vendor credit.', 'Confirm neither payment was an intentional deposit or installment.'], nextStep: 'Request a refund or an applied credit for the extra payment.' }
    case 'overpayment':
      return { title: 'Overpayment', checks: ['Confirm the invoice amount and any agreed tax, fee or adjustment.', 'Check whether the difference was already refunded or credited.'], nextStep: 'Request the supported difference with the invoice and payment details.' }
    case 'unclaimed_discount':
      return { title: 'Unclaimed discount', checks: ['Confirm the written discount terms applied to this invoice.', 'Confirm the payment landed inside the discount window.', 'Check whether the supplier already issued a discount credit.'], nextStep: 'Ask the supplier to honor the earned discount as a refund or usable credit.' }
    default:
      return { title: 'Review before recovery', checks: ['Confirm the records describe one real financial situation.', 'Check for reversals, credits, approved exceptions and existing resolution.', 'Resolve any missing business context before contacting the vendor.'], nextStep: 'Keep this as an internal review until the entitlement is clear.' }
  }
}
