import { evaluateEligibility } from '../src/recovery/eligibility.ts'
import type { Finding } from '../src/types.ts'
import type { DraftRequest } from './ai.ts'

type Row = DraftRequest['rows'][number]
type StoredRecord = Record<string, unknown> & { id: string }
type StoredState = { approvedAt?: number | null; requestedAmount?: number | null; contactHold?: string | null; requiresRevalidation?: boolean; recoveryStage?: string | null }

const iso = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)

/**
 * The case facts the AI draft may use, resolved from the account's own stored
 * project rather than from the browser. Recovery drafting needs a finding that
 * passes the evidence gate on the server's copy and a current customer
 * approval for the amount asked for; anything else is refused.
 */
export function authorizedDraftFacts(project: Record<string, unknown> | null, findingId: string, amountRequested: number):
  | { ok: true; vendor: string; amountFlagged: number; rows: Row[] }
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
  if (!state.approvedAt || state.contactHold || state.requiresRevalidation) return { ok: false, reason: 'The customer has not authorized this recovery request.' }
  if (state.requestedAmount == null || Math.round(state.requestedAmount * 100) !== cents) return { ok: false, reason: 'The requested amount does not match the authorized amount.' }
  if (cents > gate.potentialAmountMinor) return { ok: false, reason: 'The requested amount is more than the evidence supports.' }
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
  return { ok: true, vendor: finding.vendor, amountFlagged: gate.potentialAmountMinor / 100, rows }
}
