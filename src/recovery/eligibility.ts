import type { Finding } from '../types.ts'

export type EvidenceState = 'insufficient' | 'records_supported' | 'contradicted' | 'suppressed' | 'customer_confirmed' | 'eligible'
export interface EvidenceReference { reference: string; confirmedBy: string; confirmedAt: number }
export interface EvidenceConfirmation extends EvidenceReference { confirmed: boolean }
export interface PriorReturn extends EvidenceReference {
  method: 'refund' | 'credit'
  amountMinor: number
  appliedToBill?: string
}
export interface SupplierContact {
  email: string
  source: 'supplier_record' | 'document'
  reference: string
}
export const EVIDENCE_CHECKS = [
  ['duplicateImport', 'Duplicate import ruled out'], ['refund', 'Refund search complete'],
  ['credit', 'Credit search complete'], ['void', 'Void search: neither payment voided'],
  ['reversal', 'Reversal search: neither payment reversed'],
  ['installment', 'Not installments, splits or retainage'], ['recurring', 'Not separate recurring obligations'],
  ['customerConfirmation', 'Customer confirms the duplicate payment'],
] as const
export type EvidenceCheck = typeof EVIDENCE_CHECKS[number][0]
/** A field filled from a source system rather than typed. It informs the reviewer; it never counts as an attestation. */
export interface EvidenceAutofill { source: 'quickbooks'; pulledAt: number; txnIds: string[] }
export interface RecoveryEvidence {
  /** Reviewed company and stable supplier identities; CSV names alone do not establish either. */
  entity?: EvidenceReference & { entityId: string }
  supplier?: EvidenceReference & { supplierId: string; contact?: SupplierContact }
  payments: Array<EvidenceReference & { recordId: string; paymentId: string; amountMinor: number; currency: string; settled: boolean; obligationId: string }>
  obligation: EvidenceReference & { obligationId: string; amountMinor: number; currency: string }
  checks: Partial<Record<EvidenceCheck, EvidenceConfirmation>>
  /** Returns confirmed against source records before the request was opened. */
  priorReturns?: PriorReturn[]
  contradictions: string[]
  notes: string
  /** Keyed by field (see autofillKey in quickbooksEvidence.ts). Absent for evidence a person typed. */
  autofilled?: Record<string, EvidenceAutofill>
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
  const knownEntities = new Set(records.map((record) => record.company?.trim().toLowerCase()).filter(Boolean))
  if (knownEntities.size > 1) contradictoryEvidence.push('Payments belong to different companies.')
  if (!evidence?.entity || !attested(evidence.entity) || !evidence.entity.entityId.trim()) missingEvidence.push('Confirm the company or legal entity and cite where it is identified.')
  else if (knownEntities.size === 1 && !knownEntities.has(evidence.entity.entityId.trim().toLowerCase())) contradictoryEvidence.push('The confirmed company does not match the source rows.')
  const knownSupplierIds = new Set(records.map((record) => record.quickbooks?.vendorId ?? record.stableSupplierId).filter(Boolean))
  if (knownSupplierIds.size > 1) contradictoryEvidence.push('Payments have different supplier IDs in the source system.')
  if (!evidence?.supplier || !attested(evidence.supplier) || !evidence.supplier.supplierId.trim()) missingEvidence.push('Confirm one stable supplier ID and cite the supplier record.')
  else if (knownSupplierIds.size === 1 && !knownSupplierIds.has(evidence.supplier.supplierId.trim())) contradictoryEvidence.push('The confirmed supplier ID does not match the source records.')
  const payments = evidence?.payments ?? []
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
  let refundedMinor = 0
  let appliedCreditMinor = 0
  const returnReferences = new Set<string>()
  for (const entry of evidence?.priorReturns ?? []) {
    const ref = entry.reference?.trim().toLowerCase()
    if (!attested(entry) || !minor(entry.amountMinor) || !ref || returnReferences.has(ref) ||
      (entry.method !== 'refund' && (entry.method !== 'credit' || !entry.appliedToBill?.trim()))) {
      missingEvidence.push('Each prior return needs a unique confirmation reference, a positive amount, and the bill where any credit was applied.')
      continue
    }
    returnReferences.add(ref)
    if (entry.method === 'refund') refundedMinor += entry.amountMinor
    else appliedCreditMinor += entry.amountMinor
  }
  if (!Number.isSafeInteger(refundedMinor + appliedCreditMinor) || refundedMinor + appliedCreditMinor > amount && returnReferences.size > 0) {
    contradictoryEvidence.push('Confirmed prior returns exceed the original overpayment.')
  }
  const deduplicationGroup = obligation ? `${evidence?.entity?.entityId.trim().toLowerCase() ?? ''}|${evidence?.supplier?.supplierId.trim().toLowerCase() ?? ''}|${currency}|${obligation.obligationId.trim().toLowerCase()}` : finding.deduplicationGroup ?? finding.id
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
  const netEvidenceMinor = amount - refundedMinor - appliedCreditMinor
  // The detector can already net imported returns or allocate an invoice-level
  // budget across duplicate groups. Evidence review must not raise that ceiling.
  const flaggedMinor = Math.round(finding.dollarImpact * 100)
  const ledgerAdjustmentMinor = minor(flaggedMinor) ? Math.max(0, netEvidenceMinor - flaggedMinor) : 0
  const amountBreakdown = { overpaymentMinor: amount, refundedMinor, appliedCreditMinor, ledgerAdjustmentMinor }
  return { eligible, potentialAmountMinor: eligible ? netEvidenceMinor - ledgerAdjustmentMinor : null, amountBreakdown, currency: currency && supportedCurrency(currency) ? currency : null, evidenceState, missingEvidence, contradictoryEvidence, deduplicationGroup }
}

export function assertRecoveryEligible(finding: Finding, others: Finding[] = [], requestedAmount?: number) {
  const gate = evaluateEligibility(finding,finding.evidence,others)
  if (!gate.eligible) throw new Error('Complete the evidence review before authorizing recovery or contacting the vendor.')
  if (requestedAmount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || Math.abs(requestedAmount * 100 - Math.round(requestedAmount * 100)) > 0.000001 || Math.round(requestedAmount * 100) > gate.potentialAmountMinor!)) throw new Error('Requested amount must be within the evidenced potential recovery.')
  return gate
}
