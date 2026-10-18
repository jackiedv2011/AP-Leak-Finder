import type { Finding } from '@/types'

/** The three outcomes a human can record against a case. */
export type DecisionValue = 'confirmed' | 'needs_info' | 'expected'

/** The real commercial lifecycle after a person confirms a potential case. */
export type RecoveryStage = 'confirmed' | 'requested' | 'recovered' | 'not_recovered'
export type RecoveryMethod = 'refund' | 'credit' | 'offset'

/**
 * Where an undecided (or needs-info) case sits in the queue.
 *
 * Named for what the business does about it, not for how the detector feels
 * about it — "ready_to_verify" / "needs_context" described Reclaim's internal
 * confidence, which meant nothing to the person reading it.
 */
export type QueueGroup = 'claim' | 'check' | 'prevent'

/** Why a reviewer dismissed a finding as expected — the specific "why", not just "no". */
export type DismissalTag = 'not_a_match' | 'intentional' | 'known_vendor_exception' | 'detection_error' | 'other'

export const DISMISSAL_TAG_LABEL: Record<DismissalTag, string> = {
  not_a_match: "These records don't actually match",
  intentional: 'This was intentional (a split payment, deposit, etc.)',
  known_vendor_exception: 'A known, approved exception with this vendor',
  detection_error: "Reclaim's detection got this wrong",
  other: 'Something else',
}

export interface CaseState {
  decision: DecisionValue | null
  reason: string | null
  decidedAt: number | null
  recoveryStage: RecoveryStage | null
  /** User-edited recovery package fields. Optional so persisted ledgers remain compatible. */
  recoveryDraft?: string | null
  recoverySubject?: string | null
  recoveryRecipientEmail?: string | null
  requestedResolution?: RecoveryMethod | null
  recoveryRequestedAt?: number | null
  recoveryResolvedAt?: number | null
  recoveredAmount?: number | null
  recoveryOutcomeNote?: string | null
  /** Structured reason captured when dismissing a finding — feedback for detection, not just "no". */
  dismissalTag?: DismissalTag | null
  /** Which evidence-gap labels (from buildEvidenceGaps) a reviewer actually flagged as blocking. */
  requestedEvidence?: string[] | null
}

export const EMPTY_CASE_STATE: CaseState = { decision: null, reason: null, decidedAt: null, recoveryStage: null }

export function confirmCase(reason: string | null): CaseState {
  return { decision: 'confirmed', reason, decidedAt: Date.now(), recoveryStage: 'confirmed' }
}

export function markNeedsInfo(reason: string | null, requestedEvidence: string[] | null = null): CaseState {
  return { decision: 'needs_info', reason, decidedAt: Date.now(), recoveryStage: null, requestedEvidence }
}

export function markExpected(reason: string | null, dismissalTag: DismissalTag | null = null): CaseState {
  return { decision: 'expected', reason, decidedAt: Date.now(), recoveryStage: null, dismissalTag }
}

/** Update supporting notes without resetting the decision timestamp or recovery progress. */
export function updateCaseReason(state: CaseState, reason: string | null): CaseState {
  return { ...state, reason }
}

/** Update the structured dismissal reason alongside the freeform note, without resetting the decision. */
export function updateDismissal(state: CaseState, dismissalTag: DismissalTag | null, reason: string | null): CaseState {
  return { ...state, dismissalTag, reason }
}

/** Update which evidence gaps are actually being requested, alongside the freeform note. */
export function updateRequestedEvidence(state: CaseState, requestedEvidence: string[], reason: string | null): CaseState {
  return { ...state, requestedEvidence, reason }
}

/** Persist recovery copy on the case so a restored draft resumes exactly where it left off. */
export function updateRecoveryDraft(state: CaseState, recoveryDraft: string): CaseState {
  return { ...state, recoveryDraft }
}

export function updateRecoveryPackage(
  state: CaseState,
  update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod }
): CaseState {
  return {
    ...state,
    recoverySubject: update.subject ?? state.recoverySubject,
    recoveryDraft: update.body ?? state.recoveryDraft,
    recoveryRecipientEmail: update.recipientEmail ?? state.recoveryRecipientEmail,
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
  if (state?.decision === 'needs_info') return 'check'
  if (finding.class === 'recoverable') return 'claim'
  if (finding.class === 'review') return 'check'
  return 'prevent'
}

export const QUEUE_GROUP_LABEL: Record<QueueGroup, string> = {
  claim: 'Ready to claim',
  check: 'Needs your input first',
  prevent: 'Fix the process, no claim',
}

/** One plain sentence explaining what this group actually asks of the reader. */
export const QUEUE_GROUP_SUBTEXT: Record<QueueGroup, string> = {
  claim: 'Evidence is strong enough to act on now — confirm it and send the vendor a request.',
  check: 'Real money might be involved, but you need to confirm one detail before anyone can claim it.',
  prevent: 'No money to recover here. Fixing this stops the same leak from happening again.',
}

export const RECOVERY_STAGE_LABEL: Record<RecoveryStage, string> = {
  confirmed: 'Ready to send',
  requested: 'Waiting on vendor',
  recovered: 'Money back',
  not_recovered: 'Closed, no money back',
}

/** Internal notes never go to a vendor, so "sent"/"waiting on vendor" is
 * wrong for them specifically — everything else in the map still applies. */
const INTERNAL_STAGE_LABEL: Partial<Record<RecoveryStage, string>> = {
  confirmed: 'Ready to file',
  requested: 'Filed, following up',
}

export function recoveryStageLabel(stage: RecoveryStage, isInternal: boolean): string {
  if (isInternal && INTERNAL_STAGE_LABEL[stage]) return INTERNAL_STAGE_LABEL[stage]
  return RECOVERY_STAGE_LABEL[stage]
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
