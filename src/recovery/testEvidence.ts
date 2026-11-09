import type { Finding } from '@/types'
import { EVIDENCE_CHECKS, evaluateEligibility } from './eligibility'
/** Explicit synthetic customer attestations for positive workflow tests. */
export function attestDuplicate(finding: Finding): Finding {
  const stamp = { reference: 'Synthetic accounting trace', confirmedBy: 'Test customer', confirmedAt: 100 }
  const currency = 'USD'
  const obligationId = finding.relatedRecords[0]?.invoiceNumber ?? finding.id
  const company = finding.relatedRecords[0]?.company ?? 'Test company'
  const supplierId = finding.relatedRecords[0]?.quickbooks?.vendorId ?? 'TEST-VENDOR-1'
  const relatedRecords = finding.relatedRecords.map(record => ({ ...record, currency, company: record.company ?? company }))
  const evidence = {
    entity: { ...stamp, entityId: company }, supplier: { ...stamp, supplierId },
    payments: relatedRecords.map(record => ({ ...stamp, recordId: record.id, paymentId: record.id, amountMinor: Math.round(record.amountPaid * 100), currency, settled: true, obligationId })),
    obligation: { ...stamp, obligationId, amountMinor: Math.round(relatedRecords[0].amountPaid * 100), currency },
    checks: Object.fromEntries(EVIDENCE_CHECKS.map(([key]) => [key, { ...stamp, confirmed: true }])), contradictions: [], notes: 'Synthetic fixture only',
  }
  const gate = evaluateEligibility({ ...finding, relatedRecords }, evidence)
  if (!gate.eligible) throw new Error(gate.missingEvidence.join('; ') + gate.contradictoryEvidence.join('; '))
  return { ...finding, relatedRecords, evidence, currency, classification: 'recovery_candidate', class: 'recoverable', potentialAmountMinor: gate.potentialAmountMinor }
}
