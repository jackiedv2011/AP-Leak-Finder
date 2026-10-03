import type { Finding } from '@/types'
import { EVIDENCE_CHECKS, evaluateEligibility } from './eligibility'
/** Explicit synthetic customer attestations for positive workflow tests. */
export function attestDuplicate(finding: Finding): Finding {
  const stamp = { reference: 'Synthetic accounting trace', confirmedBy: 'Test customer', confirmedAt: 100 }
  const currency = 'USD'
  const obligationId = finding.id
  const relatedRecords = finding.relatedRecords.map(record => ({ ...record, currency }))
  const evidence = {
    payments: relatedRecords.map(record => ({ ...stamp, recordId: record.id, paymentId: record.id, amountMinor: Math.round(record.amountPaid * 100), currency, settled: true, obligationId })),
    obligation: { ...stamp, obligationId, amountMinor: Math.round(relatedRecords[0].amountPaid * 100), currency },
    checks: Object.fromEntries(EVIDENCE_CHECKS.map(([key]) => [key, { ...stamp, confirmed: true }])), contradictions: [], notes: 'Synthetic fixture only',
  }
  const gate = evaluateEligibility({ ...finding, relatedRecords }, evidence)
  if (!gate.eligible) throw new Error(gate.missingEvidence.join('; ') + gate.contradictoryEvidence.join('; '))
  return { ...finding, relatedRecords, evidence, currency, classification: 'recovery_candidate', class: 'recoverable', potentialAmountMinor: gate.potentialAmountMinor }
}
