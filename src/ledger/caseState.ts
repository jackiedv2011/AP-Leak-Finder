import type { Finding } from '@/types'

/** The three outcomes a human can record against a case. */
export type DecisionValue = 'confirmed' | 'needs_info' | 'expected'

/** The real commercial lifecycle after a person confirms a potential case. */
export type RecoveryStage = 'confirmed' | 'requested' | 'recovered' | 'not_recovered'
export type RecoveryMethod = 'refund' | 'credit' | 'offset'

/** Where an undecided (or needs-info) case sits in the Findings queue. */
export type QueueGroup = 'ready_to_verify' | 'needs_context' | 'worth_noting'

export interface CaseState {
  decision: DecisionValue | null
  reason: string | null
  decidedAt: number | null
  recoveryStage: RecoveryStage | null
  /** User-edited recovery package fields. Optional so persisted ledgers remain compatible. */
  recoveryDraft?: string | null
  recoverySubject?: string | null
  requestedResolution?: RecoveryMethod | null
  recoveryRequestedAt?: number | null
  recoveryResolvedAt?: number | null
  recoveredAmount?: number | null
  recoveryOutcomeNote?: string | null
}

export const EMPTY_CASE_STATE: CaseState = { decision: null, reason: null, decidedAt: null, recoveryStage: null }

export function confirmCase(reason: string | null): CaseState {
  return { decision: 'confirmed', reason, decidedAt: Date.now(), recoveryStage: 'confirmed' }
}

export function markNeedsInfo(reason: string | null): CaseState {
  return { decision: 'needs_info', reason, decidedAt: Date.now(), recoveryStage: null }
}

export function markExpected(reason: string | null): CaseState {
  return { decision: 'expected', reason, decidedAt: Date.now(), recoveryStage: null }
}

/** Update supporting notes without resetting the decision timestamp or recovery progress. */
export function updateCaseReason(state: CaseState, reason: string | null): CaseState {
  return { ...state, reason }
}

/** Persist recovery copy on the case so a restored draft resumes exactly where it left off. */
export function updateRecoveryDraft(state: CaseState, recoveryDraft: string): CaseState {
  return { ...state, recoveryDraft }
}

export function updateRecoveryPackage(
  state: CaseState,
  update: { subject?: string; body?: string; requestedResolution?: RecoveryMethod }
): CaseState {
  return {
    ...state,
    recoverySubject: update.subject ?? state.recoverySubject,
    recoveryDraft: update.body ?? state.recoveryDraft,
    requestedResolution: update.requestedResolution ?? state.requestedResolution,
  }
}

export function markRecoveryRequested(state: CaseState): CaseState {
  if (state.recoveryStage !== 'confirmed') return state
  return { ...state, recoveryStage: 'requested', recoveryRequestedAt: Date.now() }
}

export function recordRecoveryOutcome(
  state: CaseState,
  outcome: 'recovered' | 'not_recovered',
  recoveredAmount: number | null,
  note: string | null
): CaseState {
  if (state.recoveryStage !== 'requested' && state.recoveryStage !== 'recovered' && state.recoveryStage !== 'not_recovered') return state
  return {
    ...state,
    recoveryStage: outcome,
    recoveredAmount: outcome === 'recovered' ? Math.max(0, recoveredAmount ?? 0) : null,
    recoveryOutcomeNote: note,
    recoveryResolvedAt: Date.now(),
  }
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
  confirmed: 'Confirmed',
  requested: 'Requested',
  recovered: 'Recovered',
  not_recovered: 'Not recovered',
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

/** Part of the Recovery track: confirmed and carrying an explicit recovery outcome. */
export function isInRecoveryQueue(state: CaseState | undefined): boolean {
  return state?.recoveryStage != null
}

/** Normalize the temporary pre-commercial stage names saved by earlier builds. */
export function normalizeCaseState(state: CaseState): CaseState {
  const legacyStage = state.recoveryStage as string | null
  const recoveryStage: RecoveryStage | null = legacyStage === 'ready_to_prepare' || legacyStage === 'ready_to_contact'
    ? 'confirmed'
    : legacyStage === 'awaiting_response' || legacyStage === 'resolved'
      ? state.decision === 'expected' ? null : 'requested'
      : legacyStage as RecoveryStage | null
  return { ...state, recoveryStage }
}
