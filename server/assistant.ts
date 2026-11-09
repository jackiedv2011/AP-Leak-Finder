import type { DatabaseSync } from 'node:sqlite'
import type { ProjectStore } from './projectStore.ts'
import { HttpError } from './http.ts'
import { evaluateEligibility } from '../src/recovery/eligibility.ts'
import type { Finding } from '../src/types.ts'

export const HELP_VERSION = 'reclaim-help-2026-10-20'
const HELP = {
  check: 'A check flags records for review. Its flagged value is the payment value involved, not an amount known to be owed.',
  evidence: 'A person must identify the company, supplier, obligation, settled payments, and possible adjustments before a possible request amount is established.',
  approval: 'An approved request records the customer’s chosen amount and recipient. Approval does not prove a supplier owes the money.',
  return: 'A supplier promise is not a return. A customer-entered refund or applied credit is a recorded result, not an independent bank match.',
} as const

type Citation = { id: string; label: string }
type StoredFinding = Finding & { relatedRecords: Array<{ id: string }> }
type CaseState = { decision?: string | null; recoveryStage?: string | null; approvedAt?: number | null; requestedAmount?: number | null; recoverySettlements?: Array<{ amount: number; reference: string; method: string }> }
type Project = { environment?: { records?: Array<{ id: string }>; result?: { findings?: StoredFinding[] }; caseStates?: Record<string, CaseState> } }

export interface AssistantAnswer { answer: string; citations: Citation[]; limitation: string | null; helpVersion: string }
export interface CaseFacts { finding: Finding; state: CaseState; revision: number }

export function getCaseFacts(projects: ProjectStore, userId: string, projectId: string, findingId: string): CaseFacts {
  const project = projects.get(userId, projectId) as Project | null
  const env = project?.environment
  const row = env?.result?.findings?.find((finding) => finding.id === findingId)
  const revision = projects.revision(userId, projectId)
  if (!row || revision === null) throw new HttpError(404, 'That case is not in this account.')
  const records = new Map((env?.records ?? []).map((record) => [record.id, record]))
  const finding = { ...row, relatedRecords: row.relatedRecords.map((ref) => records.get(ref.id) ?? ref) } as Finding
  return { finding, state: env?.caseStates?.[findingId] ?? {}, revision }
}

export function getEvidenceGaps(facts: CaseFacts): string[] {
  return evaluateEligibility(facts.finding, facts.finding.evidence).missingEvidence
}

export function getRuleExplanation(facts: CaseFacts): string {
  const descriptions: Record<string, string> = {
    exact_duplicate: 'Two or more rows appear to pay the same invoice. The rule raises a check; separate settlement and adjustment evidence is required for a request.',
    near_duplicate: 'Similar payments close in time may be related. Invoice and payment identities need human review before a request.',
    overpayment: 'A row appears higher than its invoice amount. Splits, credits and applications can explain the difference; this remains a review signal.',
    unclaimed_discount: 'A possible missed discount is a future-savings check, not money already owed.',
    bank_account_change: 'A change in supplier bank details is a security review signal, not a recovery claim.',
  }
  return descriptions[facts.finding.type] ?? 'This rule identifies a review signal. It does not establish a supplier request.'
}

export function getAmountBreakdown(facts: CaseFacts): { text: string; citations: Citation[]; established: boolean } {
  const gate = evaluateEligibility(facts.finding, facts.finding.evidence)
  if (!gate.eligible || gate.potentialAmountMinor === null) return { text: 'I cannot establish a supplier request amount from these records yet.', citations: [{ id: `case:${facts.finding.id}`, label: 'Case evidence' }], established: false }
  const evidence = facts.finding.evidence!
  const payments = evidence.payments.reduce((total, payment) => total + payment.amountMinor, 0)
  const money = (minor: number) => `${gate.currency} ${(minor / 100).toFixed(2)}`
  return {
    text: `The reviewed settled payments total ${money(payments)}. The identified obligation is ${money(evidence.obligation.amountMinor)}. Their difference is ${money(gate.potentialAmountMinor)} as a possible request, subject to the customer's approval.`,
    citations: [...evidence.payments.map((payment) => ({ id: `record:${payment.recordId}`, label: `Payment ${payment.paymentId}` })), { id: `obligation:${evidence.obligation.obligationId}`, label: 'Reviewed obligation' }],
    established: true,
  }
}

export function getCaseTimeline(db: DatabaseSync, userId: string, projectId: string, findingId: string): Array<{ id: string; action: string; at: number; sourceRefs: string[] }> {
  const rows = db.prepare('SELECT command_id, action, at, source_refs FROM case_events WHERE user_id = ? AND project_id = ? AND finding_id = ? ORDER BY revision').all(userId, projectId, findingId) as Array<{ command_id: string; action: string; at: number; source_refs: string }>
  return rows.map((row) => ({ id: row.command_id, action: row.action, at: row.at, sourceRefs: JSON.parse(row.source_refs) as string[] }))
}

/** Read-only, citation-bound answers. Imported text never enters the answer template. */
export function answerCaseQuestion(db: DatabaseSync, projects: ProjectStore, userId: string, projectId: string, findingId: string, question: string): AssistantAnswer {
  const facts = getCaseFacts(projects, userId, projectId, findingId)
  const citations: Citation[] = [{ id: `case:${findingId}@${facts.revision}`, label: 'Saved case revision' }]
  const lower = question.toLowerCase()
  let answer: string
  let limitation: string | null = null
  if (/amount|calculat|how much|number|dollar/.test(lower)) {
    const breakdown = getAmountBreakdown(facts)
    answer = breakdown.text
    citations.push(...breakdown.citations)
    if (!breakdown.established) limitation = 'The missing evidence must be reviewed by a person; the assistant cannot supply the number.'
  } else if (/miss|evidence|proof|why|only a check/.test(lower)) {
    const gaps = getEvidenceGaps(facts)
    answer = gaps.length ? `${HELP.check} Missing evidence: ${gaps.slice(0, 8).join('; ')}.` : `${HELP.evidence} The recorded checks support a possible request; they remain customer attestations.`
    citations.push({ id: HELP_VERSION, label: 'Product definitions' }, ...facts.finding.relatedRecords.map((record) => ({ id: `record:${record.id}`, label: 'Source payment row' })))
    limitation = 'Evidence confirmations are reviewer assertions unless independently matched evidence is recorded.'
  } else if (/timeline|history|happen|event/.test(lower)) {
    const events = getCaseTimeline(db, userId, projectId, findingId)
    answer = events.length ? `Recorded case actions: ${events.map((event) => event.action.replaceAll('_', ' ')).join(', ')}.` : 'No server case actions are recorded for this case.'
    citations.push(...events.map((event) => ({ id: `event:${event.id}`, label: event.action.replaceAll('_', ' ') })))
  } else if (/rule|detec|check type/.test(lower)) {
    answer = `${getRuleExplanation(facts)} ${HELP.check}`
    citations.push({ id: `rule:${facts.finding.type}`, label: 'Detection rule' }, { id: HELP_VERSION, label: 'Product definitions' })
  } else if (/next|step|do|follow|contact|send/.test(lower)) {
    const stage = facts.state.recoveryStage
    answer = stage === 'requested' ? 'Review any supplier reply, follow up when due, and record a refund or applied credit only when it occurs.' : stage === 'confirmed' ? 'Review the evidence, amount, recipient and resolution, then approve the request before contacting the supplier.' : stage === 'recovered' ? 'Reconcile the recorded result and verify any remaining balance or reversal.' : 'Review the source rows and evidence gaps before deciding whether this check supports a request.'
    citations.push({ id: HELP_VERSION, label: 'Case workflow' })
  } else {
    answer = `${HELP.check} ${HELP.approval} ${HELP.return}`
    citations.push({ id: HELP_VERSION, label: 'Product definitions' })
  }
  return { answer, citations, limitation, helpVersion: HELP_VERSION }
}
