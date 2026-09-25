import type { Finding } from '../types.ts'

export type EvidenceState = 'insufficient' | 'records_supported' | 'contradicted' | 'suppressed' | 'customer_confirmed' | 'eligible'
export interface EvidenceReference { reference: string; confirmedBy: string; confirmedAt: number }
export interface EvidenceConfirmation extends EvidenceReference { confirmed: boolean }
export const EVIDENCE_CHECKS = [
  ['duplicateImport', 'Duplicate import ruled out'], ['refund', 'Refund search: no resolving refund'],
  ['credit', 'Credit search: no resolving credit'], ['void', 'Void search: neither payment voided'],
  ['reversal', 'Reversal search: neither payment reversed'],
  ['installment', 'Not installments, splits or retainage'], ['recurring', 'Not separate recurring obligations'],
  ['customerConfirmation', 'Customer confirms the duplicate payment'],
] as const
export type EvidenceCheck = typeof EVIDENCE_CHECKS[number][0]
export interface RecoveryEvidence {
  payments: Array<EvidenceReference & { recordId: string; paymentId: string; amountMinor: number; currency: string; settled: boolean; obligationId: string }>
  obligation: EvidenceReference & { obligationId: string; amountMinor: number; currency: string }
  checks: Partial<Record<EvidenceCheck, EvidenceConfirmation>>
  contradictions: string[]
  notes: string
}
const attested = (item: EvidenceReference | undefined) => Boolean(item && typeof item.reference === 'string' && item.reference.trim() && typeof item.confirmedBy === 'string' && item.confirmedBy.trim() && Number.isFinite(item.confirmedAt) && item.confirmedAt > 0)
const minor = (n: number) => Number.isSafeInteger(n) && n > 0
// The initial recovery workflow and accounting ledger support two-decimal currencies.
const supportedCurrency = (code: string) => ['USD'].includes(code)

export function evaluateEligibility(finding: Finding, evidence: RecoveryEvidence | undefined = finding.evidence, otherFindings: Finding[] = []) {
  const missingEvidence: string[] = []
  const contradictoryEvidence = [...(evidence?.contradictions ?? []), ...(finding.contradictoryEvidence ?? [])].filter(Boolean)
  if (!['exact_duplicate','near_duplicate'].includes(finding.type)) missingEvidence.push('This rule has no supported recovery evidence gate.')
  if (finding.suppressionReason) contradictoryEvidence.push(finding.suppressionReason)
  const records = finding.relatedRecords
  const payments = evidence?.payments ?? []
  if (new Set(records.map(r => r.company?.trim().toLowerCase()).filter(Boolean)).size > 1) contradictoryEvidence.push('Payments belong to different companies.')
  const obligation = evidence?.obligation
  const currency = obligation?.currency?.trim().toUpperCase() ?? null
  if (!currency || !supportedCurrency(currency)) missingEvidence.push('USD currency is required; recovery for other currencies is not yet supported.')
  if (!obligation || !attested(obligation) || !obligation.obligationId?.trim() || !minor(obligation.amountMinor)) missingEvidence.push('An attested invoice or obligation and its amount are required.')
  if (records.length < 2 || payments.length !== records.length || new Set(payments.map(p => p.recordId)).size !== records.length || records.some(r => !payments.some(p => p.recordId === r.id))) missingEvidence.push('Supply payment evidence for every supporting ledger record.')
  if (new Set(payments.map(p => p.paymentId?.trim().toLowerCase())).size !== payments.length) contradictoryEvidence.push('Payment identities are not distinct.')
  for (const payment of payments) {
    const record = records.find(r => r.id === payment.recordId)
    if (!attested(payment) || !payment.paymentId?.trim()) missingEvidence.push(`Payment ${payment.recordId}: identity, trace reference, confirmer and time are required.`)
    if (!payment.settled) missingEvidence.push(`Payment ${payment.recordId}: settlement confirmation is required.`)
    if (!minor(payment.amountMinor) || !record || Math.round(record.amountPaid * 100) !== payment.amountMinor) contradictoryEvidence.push(`Payment ${payment.recordId}: amount does not match its ledger record.`)
    if (!payment.currency || payment.currency !== currency || (record?.currency && record.currency !== currency)) contradictoryEvidence.push(`Payment ${payment.recordId}: currencies must match.`)
    if (!obligation?.obligationId || payment.obligationId !== obligation.obligationId) contradictoryEvidence.push(`Payment ${payment.recordId}: same obligation must be confirmed.`)
    if (record?.importStatus && ['exact_duplicate','possible_overlap','rejected'].includes(record.importStatus)) missingEvidence.push(`Payment ${payment.recordId}: resolve import identification first.`)
  }
  for (const [key,label] of EVIDENCE_CHECKS) if (!evidence?.checks?.[key]?.confirmed || !attested(evidence.checks[key])) missingEvidence.push(label + ': confirmation, search/explanation reference, person and time required.')
  const total = payments.reduce((sum,p) => sum + p.amountMinor,0)
  if (!Number.isSafeInteger(total)) missingEvidence.push('Payment total exceeds supported exact arithmetic.')
  const amount = total - (obligation?.amountMinor ?? 0)
  if (!minor(amount)) missingEvidence.push('The settled payments must exceed the supported obligation by a positive amount.')
  const deduplicationGroup = obligation ? `${finding.vendor.trim().toLowerCase()}|${currency}|${obligation.obligationId.trim().toLowerCase()}` : finding.deduplicationGroup ?? finding.id
  const baseEligible = missingEvidence.length === 0 && contradictoryEvidence.length === 0
  if (baseEligible) {
    const identities = new Set(payments.map(p => p.paymentId.trim().toLowerCase()))
    const rank = (f: Finding) => `${String(f.evidence?.checks.customerConfirmation?.confirmedAt ?? Number.MAX_SAFE_INTEGER).padStart(16,'0')}|${f.id}`
    for (const other of otherFindings) {
      if (other.id === finding.id || other.classification !== 'recovery_candidate' || !other.evidence || rank(other) >= rank(finding)) continue
      const gate = evaluateEligibility(other,other.evidence,[])
      if (gate.eligible && (gate.deduplicationGroup === deduplicationGroup || other.evidence.payments.some(p => identities.has(p.paymentId.trim().toLowerCase()) || payments.some(own => own.recordId === p.recordId)))) {
        contradictoryEvidence.push(`Economic event already belongs to recovery candidate ${other.id}.`)
      }
    }
  }
  const eligible = baseEligible && contradictoryEvidence.length === 0
  const evidenceState: EvidenceState = eligible ? 'eligible' : finding.suppressionReason ? 'suppressed' : contradictoryEvidence.length ? 'contradicted' : records.length ? 'records_supported' : 'insufficient'
  return { eligible, potentialAmountMinor: eligible ? amount : null, currency: currency && supportedCurrency(currency) ? currency : null, evidenceState, missingEvidence, contradictoryEvidence, deduplicationGroup }
}

export function assertRecoveryEligible(finding: Finding, others: Finding[] = [], requestedAmount?: number) {
  const gate = evaluateEligibility(finding,finding.evidence,others)
  if (!gate.eligible) throw new Error('Complete the evidence review before authorizing recovery or contacting the vendor.')
  if (requestedAmount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || Math.abs(requestedAmount * 100 - Math.round(requestedAmount * 100)) > 0.000001 || Math.round(requestedAmount * 100) > gate.potentialAmountMinor!)) throw new Error('Requested amount must be within the evidenced potential recovery.')
  return gate
}
