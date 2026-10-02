import { evaluateEligibility } from '../src/recovery/eligibility.ts'
import type { Finding } from '../src/types.ts'
import type { DraftRequest } from './ai.ts'

type StoredRecord = Record<string, unknown> & { id: string }
type StoredState = { approvedAt?: number | null; requestedAmount?: number | null; requestedResolution?: DraftRequest['method'] | null; contactHold?: string | null; requiresRevalidation?: boolean; recoveryStage?: DraftRequest['recoveryStage']; recoverySettlements?: Array<{ amount: number; reference: string; settledAt: number; source: string; method: string; appliedToBill?: string }>; recoveryVerification?: { amount: number; reference: string; settledAt: number; source: string; method: string; appliedToBill?: string } | null }
const settled = (s: StoredState) => Math.round((s.recoverySettlements ?? (s.recoveryVerification ? [s.recoveryVerification] : [])).filter(e => Number.isFinite(e.amount) && e.amount > 0 && Number.isFinite(e.settledAt) && e.settledAt > 0 && Boolean(e.reference?.trim()) && ['bank', 'accounting', 'document', 'manual'].includes(e.source) && (e.method === 'refund' || ((e.method === 'credit' || e.method === 'offset') && Boolean(e.appliedToBill?.trim())))).reduce((sum, e) => sum + e.amount, 0) * 100) / 100

const iso = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)

/**
 * The case facts the AI draft may use, resolved from the account's own stored
 * project rather than from the browser. Recovery drafting needs a finding that
 * passes the evidence gate on the server's copy and a current customer
 * approval for the amount asked for; anything else is refused.
 */
export function authorizedDraftFacts(project: Record<string, unknown> | null, findingId: string, amountRequested: number):
  | { ok: true; facts: Pick<DraftRequest, 'vendor' | 'findingType' | 'findingTitle' | 'explanation' | 'evidenceStrength' | 'amountFlagged' | 'amountRequested' | 'method' | 'recoveryStage' | 'rows'> }
  | { ok: false; reason: string } {
  if (!project) return { ok: false, reason: 'That project is not saved on this account.' }
  const env = project.environment as { records?: StoredRecord[]; result?: { findings?: Array<Record<string, unknown>> }; caseStates?: Record<string, StoredState> } | undefined
  const records = new Map((env?.records ?? []).map((r) => [r.id, r]))
  const findings = (env?.result?.findings ?? []).map((f) => ({
    ...f,
    relatedRecords: ((f.relatedRecords as Array<{ id: string }>) ?? []).map((r) => records.get(r.id) ?? r),
  })) as unknown as Finding[]
  const finding = findings.find((f) => f.id === findingId)
  if (!finding) return { ok: false, reason: 'That finding is not in the saved project.' }
  if (finding.classification !== 'recovery_candidate') return { ok: false, reason: 'Only recovery candidates can be drafted.' }
  const gate = evaluateEligibility(finding, finding.evidence, findings)
  if (!gate.eligible || gate.potentialAmountMinor === null) return { ok: false, reason: 'The saved evidence does not pass the recovery gate.' }
  const state = env?.caseStates?.[findingId] ?? {}
  const cents = Math.round(amountRequested * 100)
  if (state.recoveryStage !== 'confirmed') return { ok: false, reason: 'AI drafts are available only for an approved request before it is sent.' }
  if (!state.approvedAt || state.contactHold || state.requiresRevalidation) return { ok: false, reason: 'The customer has not authorized this recovery request.' }
  if (state.requestedAmount == null || Math.round(state.requestedAmount * 100) !== cents) return { ok: false, reason: 'The requested amount does not match the authorized amount.' }
  if (cents > gate.potentialAmountMinor) return { ok: false, reason: 'The requested amount is more than the evidence supports.' }
  if (Math.round(settled(state) * 100) >= cents) return { ok: false, reason: 'The authorized request has already been settled.' }
  if (!state.requestedResolution) return { ok: false, reason: 'The saved request has no authorized resolution method.' }
  const rows = finding.relatedRecords.map((r) => {
    const rec = r as unknown as Record<string, unknown>
    return {
      invoiceNumber: (rec.invoiceNumber as string | null) ?? null,
      invoiceDate: iso(rec.invoiceDate),
      paymentDate: iso(rec.paymentDate) ?? '',
      invoiceAmount: (rec.invoiceAmount as number | null) ?? null,
      amountPaid: Number(rec.amountPaid),
      terms: (rec.terms as string | null) ?? null,
    }
  })
  return { ok: true, facts: {
    vendor: finding.vendor,
    findingType: finding.type,
    findingTitle: finding.title,
    explanation: finding.explanation,
    evidenceStrength: finding.severity === 'high' ? 'strong' : finding.severity === 'medium' ? 'moderate' : 'review',
    amountFlagged: gate.potentialAmountMinor / 100,
    amountRequested: state.requestedAmount!,
    method: state.requestedResolution,
    recoveryStage: state.recoveryStage,
    rows,
  } }
}
