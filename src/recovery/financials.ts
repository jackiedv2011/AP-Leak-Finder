import type { Finding } from '@/types'
import type { CaseState, RecoveryVerification } from '@/ledger/caseState'
import { evaluateEligibility } from '@/recovery/eligibility'

/** The current money displays support USD only; other currencies remain visible on evidence. */
export function eligiblePotential(finding: Finding, findings: Finding[]): number | null {
  if (finding.classification !== 'recovery_candidate') return null
  const result = evaluateEligibility(finding, finding.evidence, findings)
  return result.eligible && result.currency === 'USD' && result.potentialAmountMinor !== null ? result.potentialAmountMinor / 100 : null
}
export function validSettlements(state: CaseState): RecoveryVerification[] {
  return (state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])).filter((entry) =>
    Number.isFinite(entry.amount) && entry.amount > 0 && Number.isFinite(entry.settledAt) && entry.settledAt > 0 &&
    Boolean(entry.reference?.trim()) && ['bank', 'accounting', 'document', 'manual'].includes(entry.source) &&
    (entry.method === 'refund' || ((entry.method === 'credit' || entry.method === 'offset') && Boolean(entry.appliedToBill?.trim()))))
}
/** Old unverified amount fields remain historical data, never proof of receipt. */
export function verifiedReturned(state: CaseState): number {
  return Math.round(validSettlements(state).reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100
}
export function authorizedOutstanding(state: CaseState): number {
  return state.approvedAt && Number.isFinite(state.requestedAmount) && (state.requestedAmount ?? 0) > 0
    ? Math.max(0, Math.round(((state.requestedAmount ?? 0) - verifiedReturned(state)) * 100) / 100) : 0
}
