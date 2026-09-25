import type { Finding } from '@/types'
import { evaluateEligibility } from '@/recovery/eligibility'

export function reviewMetadata(finding: Finding, createdAt = Date.now()): Finding {
  const classification = finding.type === 'bank_account_change' ? 'preventive_security' : ['unclaimed_discount','missed_discount'].includes(finding.type) ? 'future_savings' : 'review_needed'
  const ids = finding.relatedRecords.map(r=>r.id).sort()
  const currencies = new Set(finding.relatedRecords.map(r=>r.currency ?? null))
  const currency = currencies.size === 1 ? [...currencies][0] : null
  const current: Finding = { ...finding, classification, class: classification === 'future_savings' ? 'opportunity' : 'review', ruleId: finding.ruleId ?? `${finding.type}_v1`, ruleVersion: 1, sourceRecordIds: ids, deduplicationGroup: finding.deduplicationGroup ?? `records:${ids.join('|')}`, sourceValues: finding.relatedRecords.flatMap(r=>r.source ? [r.source] : []), flaggedAmount: finding.dollarImpact, potentialAmountMinor: null, currency, evidenceState: 'records_supported', missingEvidence: [], contradictoryEvidence: [], suppressionReason: finding.suppressionReason ?? null, customerDecision: finding.customerDecision ?? null, createdAt: finding.createdAt ?? createdAt }
  const gate = evaluateEligibility(current)
  return { ...current, missingEvidence: gate.missingEvidence, contradictoryEvidence: gate.contradictoryEvidence, evidenceState: gate.evidenceState }
}
