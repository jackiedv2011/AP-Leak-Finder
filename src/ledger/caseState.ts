import type { Finding } from '@/types'

/** The three outcomes a human can record against a case. */
export type DecisionValue = 'confirmed' | 'needs_info' | 'expected'

/** Where a confirmed case stands operationally. Terminal at 'resolved'. */
export type RecoveryStage = 'ready_to_prepare' | 'ready_to_contact' | 'awaiting_response' | 'resolved'

/** Where an undecided (or needs-info) case sits in the Findings queue. */
export type QueueGroup = 'ready_to_verify' | 'needs_context' | 'worth_noting'

export interface CaseState {
  decision: DecisionValue | null
  reason: string | null
  decidedAt: number | null
  recoveryStage: RecoveryStage | null
  /** User-edited recovery copy. Optional so persisted v1 ledgers remain compatible. */
  recoveryDraft?: string | null
}

export const EMPTY_CASE_STATE: CaseState = { decision: null, reason: null, decidedAt: null, recoveryStage: null }

export function confirmCase(reason: string | null): CaseState {
  return { decision: 'confirmed', reason, decidedAt: Date.now(), recoveryStage: 'ready_to_prepare' }
}

export function markNeedsInfo(reason: string | null): CaseState {
  return { decision: 'needs_info', reason, decidedAt: Date.now(), recoveryStage: null }
}

export function markExpected(reason: string | null): CaseState {
  return { decision: 'expected', reason, decidedAt: Date.now(), recoveryStage: 'resolved' }
}

/** Update supporting notes without resetting the decision timestamp or recovery progress. */
export function updateCaseReason(state: CaseState, reason: string | null): CaseState {
  return { ...state, reason }
}

/** Persist recovery copy on the case so a restored draft resumes exactly where it left off. */
export function updateRecoveryDraft(state: CaseState, recoveryDraft: string): CaseState {
  return { ...state, recoveryDraft }
}

const RECOVERY_STAGE_ORDER: RecoveryStage[] = ['ready_to_prepare', 'ready_to_contact', 'awaiting_response', 'resolved']

/** Move a confirmed case to the next recovery stage. No-op once resolved or if never confirmed. */
export function advanceRecoveryStage(state: CaseState): CaseState {
  if (!state.recoveryStage) return state
  const index = RECOVERY_STAGE_ORDER.indexOf(state.recoveryStage)
  const next = RECOVERY_STAGE_ORDER[Math.min(index + 1, RECOVERY_STAGE_ORDER.length - 1)]
  return { ...state, recoveryStage: next }
}

export function queueGroupFor(finding: Finding, state: CaseState | undefined): QueueGroup {
  if (state?.decision === 'needs_info') return 'needs_context'
  if (finding.class === 'recoverable') return 'ready_to_verify'
  if (finding.class === 'review') return 'needs_context'
  return 'worth_noting'
}

export const QUEUE_GROUP_LABEL: Record<QueueGroup, string> = {
  ready_to_verify: 'Ready to verify',
  needs_context: 'Needs context',
  worth_noting: 'Worth noting',
}

export const RECOVERY_STAGE_LABEL: Record<RecoveryStage, string> = {
  ready_to_prepare: 'Ready to prepare',
  ready_to_contact: 'Ready to contact',
  awaiting_response: 'Awaiting response',
  resolved: 'Resolved',
}

export const DECISION_LABEL: Record<DecisionValue, string> = {
  confirmed: 'Confirmed',
  needs_info: 'Needs information',
  expected: 'Expected',
}

/** Still part of the active Findings queue — undecided, or waiting on more information. */
export function isInFindingsQueue(state: CaseState | undefined): boolean {
  if (!state || state.decision === null) return true
  return state.decision === 'needs_info'
}

/** Part of the Recovery track — confirmed (or resolved-as-expected) and carrying a stage. */
export function isInRecoveryQueue(state: CaseState | undefined): boolean {
  return state?.recoveryStage != null
}
