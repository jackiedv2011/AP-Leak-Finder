import type { Finding } from '@/types'

/** The three outcomes a human can record against a case. */
export type DecisionValue = 'confirmed' | 'needs_info' | 'expected'

/** The real commercial lifecycle after a person confirms a potential case. */
export type RecoveryStage = 'confirmed' | 'requested' | 'recovered' | 'not_recovered'
export type RecoveryMethod = 'refund' | 'credit' | 'offset'

export type VendorUpdateStatus = 'acknowledged' | 'accepted' | 'partial_acceptance' | 'already_refunded' | 'payment_not_found' | 'no_action_required' | 'needs_documents' | 'disputed' | 'promised' | 'credit_issued' | 'wrong_contact' | 'no_response' | 'followed_up'
export interface VendorUpdate {
  at: number
  status: VendorUpdateStatus
  note: string
  amount?: number
  /** Full-claim acceptance implies the remaining amount when the vendor gave no separate figure. */
  amountInferred?: boolean
  method?: RecoveryMethod
  expectedAt?: number
}
export interface RecoveryVerification {
  amount: number
  method: RecoveryMethod
  source: 'bank' | 'accounting' | 'document' | 'manual'
  reference: string
  settledAt: number
  /** Required for credits and offsets: issuance alone is not returned value. */
  appliedToBill?: string
}

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

/**
 * One entry in a case's audit trail. Appended, never edited: every change to
 * the decision, the recovery stage or the money figures leaves a row saying
 * what changed, when, by whom, and (when it applies) how much and how.
 */
export interface CaseEvent {
  at: number
  /** Short machine label for the transition, e.g. `decision:confirmed`, `stage:requested`. */
  action: string
  /** Human-readable summary of what happened. */
  summary: string
  from: { decision: DecisionValue | null; recoveryStage: RecoveryStage | null }
  to: { decision: DecisionValue | null; recoveryStage: RecoveryStage | null }
  amount?: number | null
  method?: RecoveryMethod | null
  /** The reviewer's note or reason at the time, when one was given. */
  note?: string | null
  /** Who did it — the signed-in account's name or email; null for a guest session. */
  actor?: string | null
}

export interface CaseState {
  decision: DecisionValue | null
  reason: string | null
  decidedAt: number | null
  recoveryStage: RecoveryStage | null
  /** The amount the vendor was actually asked for. Defaults to the finding's amount when the request goes out. */
  requestedAmount?: number | null
  /** How the money actually came back, which may differ from what was asked for. */
  recoveredVia?: RecoveryMethod | null
  /** Append-only audit trail. Older ledgers have none; the timeline falls back to the timestamps. */
  history?: CaseEvent[]
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
  /** Customer approval to pursue the first vendor contact. Older cases may have no approval record. */
  approvedAt?: number | null
  knownBeforeReclaim?: boolean | null
  /** Customer disclosure supporting a prior-knowledge answer at approval. */
  knownBeforeNote?: string | null
  contactHold?: string | null
  nextFollowUpAt?: number | null
  vendorUpdates?: VendorUpdate[]
  /** Individual customer-recorded settlements; older cases may only have recoveryVerification. */
  recoverySettlements?: RecoveryVerification[] | null
  recoveryVerification?: RecoveryVerification | null
  reconciledAt?: number | null
  reconciliationNote?: string | null
  rootCause?: string | null
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
  update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod; requestedAmount?: number }
): CaseState {
  return {
    ...state,
    recoverySubject: update.subject ?? state.recoverySubject,
    recoveryDraft: update.body ?? state.recoveryDraft,
    recoveryRecipientEmail: update.recipientEmail ?? state.recoveryRecipientEmail,
    requestedResolution: update.requestedResolution ?? state.requestedResolution,
    requestedAmount: update.requestedAmount ?? state.requestedAmount,
  }
}

/**
 * The request has gone out. `requestedAmount` is what the letter asked for —
 * normally the finding's full amount, but a reviewer can ask for less (never
 * more than the finding supports).
 */
export function markRecoveryRequested(state: CaseState, requestedAmount?: number | null): CaseState {
  if (state.recoveryStage !== 'confirmed') return state
  return {
    ...state,
    recoveryStage: 'requested',
    recoveryRequestedAt: Date.now(),
    requestedAmount: requestedAmount ?? state.requestedAmount ?? null,
  }
}

/** Why a recovered amount cannot be recorded, or null when it can. */
export function validateRecoveredAmount(input: string | number, max: number): string | null {
  const raw = typeof input === 'number' ? input : Number(String(input).replace(/[$,\s]/g, ''))
  if (String(input).trim() === '' || Number.isNaN(raw) || !Number.isFinite(raw)) return 'Enter the amount that actually came back.'
  if (raw < 0) return 'A recovered amount cannot be negative.'
  if (Math.round(raw * 100) > Math.round(max * 100)) return `That is more than the ${max.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} that was requested.`
  return null
}

export function recordRecoveryOutcome(
  state: CaseState,
  outcome: 'recovered' | 'not_recovered',
  recoveredAmount: number | null,
  note: string | null,
  recoveredVia: RecoveryMethod | null = null
): CaseState {
  if (state.recoveryStage !== 'requested' && state.recoveryStage !== 'recovered' && state.recoveryStage !== 'not_recovered') return state
  return {
    ...state,
    recoveryStage: outcome,
    recoveredAmount: outcome === 'recovered' ? Math.max(0, recoveredAmount ?? 0) : null,
    recoveredVia: outcome === 'recovered' ? recoveredVia ?? state.requestedResolution ?? null : null,
    recoveryOutcomeNote: note,
    recoveryResolvedAt: Date.now(),
  }
}

/**
 * Compare two states and, if anything that matters changed, append an audit
 * event describing it. Called by the one place that persists case state, so
 * every transition — including reopenings — is on the record.
 */
export function withHistory(previous: CaseState, next: CaseState, actor: string | null, internal = false): CaseState {
  const decisionChanged = previous.decision !== next.decision
  const stageChanged = previous.recoveryStage !== next.recoveryStage
  const amountChanged = (previous.recoveredAmount ?? null) !== (next.recoveredAmount ?? null)
  const requestedChanged = (previous.requestedAmount ?? null) !== (next.requestedAmount ?? null)
  const approvalChanged = (previous.approvedAt ?? null) !== (next.approvedAt ?? null)
  const attributionChanged = (previous.knownBeforeReclaim ?? null) !== (next.knownBeforeReclaim ?? null) || (previous.knownBeforeNote ?? null) !== (next.knownBeforeNote ?? null)
  const holdChanged = (previous.contactHold ?? null) !== (next.contactHold ?? null)
  const vendorChanged = (previous.vendorUpdates?.length ?? 0) !== (next.vendorUpdates?.length ?? 0)
  const settlementsChanged = (previous.recoverySettlements?.length ?? 0) !== (next.recoverySettlements?.length ?? 0)
  const settlementAdded = (next.recoverySettlements?.length ?? 0) > (previous.recoverySettlements?.length ?? 0)
  const followUpChanged = (previous.nextFollowUpAt ?? null) !== (next.nextFollowUpAt ?? null)
  const reconciliationChanged = (previous.reconciledAt ?? null) !== (next.reconciledAt ?? null)
  const reconciliationDetailsChanged = (previous.reconciliationNote ?? null) !== (next.reconciliationNote ?? null) || (previous.rootCause ?? null) !== (next.rootCause ?? null)
  if (!decisionChanged && !stageChanged && !amountChanged && !requestedChanged && !approvalChanged && !attributionChanged && !holdChanged && !vendorChanged && !settlementsChanged && !followUpChanged && !reconciliationChanged && !reconciliationDetailsChanged) return next

  let action: string
  let summary: string
  if (stageChanged && previous.recoveryStage === 'recovered' && next.recoveryStage === 'requested' && (previous.recoveredAmount ?? 0) > 0 && previous.recoveredAmount === next.recoveredAmount) {
    action = 'recovery:remainder_reopened'
    summary = 'Remaining balance reopened'
  } else if (stageChanged && next.recoveryStage === 'requested' && (previous.recoveryStage === 'recovered' || previous.recoveryStage === 'not_recovered')) {
    action = 'outcome:reopened'
    summary = 'Outcome reopened'
  } else if (settlementAdded) {
    action = 'recovery:settlement_recorded'
    summary = 'Money received recorded'
  } else if (stageChanged && next.recoveryStage === 'recovered' && (previous.recoveredAmount ?? 0) > 0) {
    action = 'recovery:remainder_closed'
    summary = 'Remaining balance closed'
  } else if (stageChanged && next.recoveryStage === 'recovered') {
    action = 'outcome:recovered'
    summary = 'Money received recorded'
  } else if (stageChanged && next.recoveryStage === 'not_recovered') {
    action = 'outcome:not_recovered'
    summary = 'Closed without recovery'
  } else if (stageChanged && next.recoveryStage === 'requested') {
    action = 'stage:requested'
    summary = 'Recovery request sent'
  } else if ((approvalChanged || attributionChanged) && next.approvedAt) {
    action = 'recovery:approved'
    summary = 'Customer approved recovery outreach'
  } else if (holdChanged) {
    action = next.contactHold ? 'recovery:contact_held' : 'recovery:contact_released'
    summary = next.contactHold ? 'Vendor contact put on hold' : 'Vendor contact hold removed'
  } else if (vendorChanged) {
    const status = next.vendorUpdates?.at(-1)?.status ?? 'update'
    action = `vendor:${status}`
    summary = `Vendor update: ${status.replace(/_/g, ' ')}`
  } else if (next.reconciledAt && !previous.reconciledAt) {
    action = 'accounting:reconciled'
    summary = 'Accounting reconciliation recorded'
  } else if (next.reconciledAt && (reconciliationChanged || reconciliationDetailsChanged)) {
    action = 'accounting:corrected'
    summary = 'Accounting reconciliation updated'
  } else if (followUpChanged) {
    action = 'recovery:followup_changed'
    summary = next.nextFollowUpAt ? 'Follow-up scheduled' : 'Follow-up cleared'
  } else if (decisionChanged && next.decision === null) {
    action = 'decision:reopened'
    summary = 'Decision taken back'
  } else if (decisionChanged) {
    action = `decision:${next.decision}`
    summary = next.decision === 'confirmed' ? 'Confirmed as real' : next.decision === 'needs_info' ? 'Marked as needing more information' : 'Dismissed as expected'
  } else if (amountChanged) {
    action = 'outcome:amount_changed'
    summary = 'Recovered amount corrected'
  } else {
    action = 'request:amount_changed'
    summary = 'Requested amount changed'
  }

  if (internal) {
    if (action === 'stage:requested') { action = 'review:filed'; summary = 'Internal review filed' }
    else if (action === 'outcome:not_recovered') { action = 'review:closed'; summary = 'Internal review closed' }
    else if (action === 'outcome:reopened') { action = 'review:reopened'; summary = 'Internal review reopened' }
  }

  const lastSettlement = next.recoverySettlements?.at(-1)
  const lastVendorUpdate = next.vendorUpdates?.at(-1)
  const remaining = next.requestedAmount == null ? null : Math.max(0, Math.round(next.requestedAmount * 100) - Math.round((next.recoveredAmount ?? 0) * 100)) / 100
  let eventAmount: number | null = null
  if (action === 'outcome:reopened') eventAmount = previous.recoveryStage === 'not_recovered' ? previous.requestedAmount ?? null : -(previous.recoveredAmount ?? 0)
  else if (action === 'recovery:remainder_reopened') eventAmount = Math.max(0, Math.round((previous.requestedAmount ?? 0) * 100) - Math.round((previous.recoveredAmount ?? 0) * 100)) / 100
  else if (action === 'recovery:remainder_closed' || action === 'outcome:not_recovered') eventAmount = remaining
  else if (action === 'recovery:settlement_recorded') eventAmount = lastSettlement?.amount ?? null
  else if (action.startsWith('vendor:')) eventAmount = lastVendorUpdate?.amount ?? null
  else if (action === 'recovery:approved' || action === 'stage:requested' || action === 'request:amount_changed') eventAmount = next.requestedAmount ?? null
  else if (action === 'outcome:recovered' || action === 'outcome:amount_changed' || action.startsWith('accounting:')) eventAmount = next.recoveredAmount ?? null
  let eventMethod: RecoveryMethod | null = null
  if (action === 'recovery:settlement_recorded') eventMethod = lastSettlement?.method ?? null
  else if (action.startsWith('vendor:')) eventMethod = lastVendorUpdate?.method ?? null
  else if (action === 'recovery:approved' || action === 'stage:requested' || action === 'request:amount_changed') eventMethod = next.requestedResolution ?? null
  else if (action === 'outcome:recovered' || action === 'outcome:amount_changed') eventMethod = next.recoveredVia ?? null
  let eventNote: string | null = null
  if (action === 'recovery:settlement_recorded') eventNote = lastSettlement?.reference ?? null
  else if (action.startsWith('accounting:')) eventNote = next.reconciliationNote ?? null
  else if (action.startsWith('vendor:')) eventNote = lastVendorUpdate?.note ?? null
  else if (action === 'recovery:contact_held') eventNote = next.contactHold ?? null
  else if (action === 'recovery:followup_changed' && next.nextFollowUpAt) eventNote = new Date(next.nextFollowUpAt).toLocaleDateString()
  else if (action === 'recovery:approved') eventNote = next.knownBeforeReclaim ? `Known before Reclaim: ${next.knownBeforeNote ?? 'No explanation recorded'}` : 'Newly identified by Reclaim'
  else if (action === 'recovery:remainder_closed' || action === 'outcome:not_recovered' || action === 'outcome:recovered' || action === 'review:closed') eventNote = next.recoveryOutcomeNote ?? null
  else if (action.startsWith('decision:')) eventNote = next.reason ?? null

  let eventAt = Date.now()
  if (settlementAdded && lastSettlement?.settledAt) eventAt = lastSettlement.settledAt
  else if ((reconciliationChanged || reconciliationDetailsChanged) && next.reconciledAt) eventAt = next.reconciledAt
  else if (approvalChanged && next.approvedAt) eventAt = next.approvedAt
  else if (vendorChanged && lastVendorUpdate?.at) eventAt = lastVendorUpdate.at
  else if (stageChanged && previous.recoveryStage === 'confirmed' && next.recoveryStage === 'requested' && next.recoveryRequestedAt) eventAt = next.recoveryRequestedAt
  else if (stageChanged && (next.recoveryStage === 'recovered' || next.recoveryStage === 'not_recovered') && next.recoveryResolvedAt) eventAt = next.recoveryResolvedAt
  const event: CaseEvent = {
    at: eventAt,
    action,
    summary,
    from: { decision: previous.decision, recoveryStage: previous.recoveryStage },
    to: { decision: next.decision, recoveryStage: next.recoveryStage },
    amount: eventAmount,
    method: eventMethod,
    note: eventNote,
    actor,
  }
  // One change can carry more than one customer-recorded fact (approving
  // while putting contact on hold, logging a reply alongside a settlement).
  // The chain above picks the headline; each other fact still gets its own
  // entry so nothing the customer did is silently dropped from the record.
  const stamp = { from: { decision: previous.decision, recoveryStage: previous.recoveryStage }, to: { decision: next.decision, recoveryStage: next.recoveryStage }, actor }
  const alongside: CaseEvent[] = []
  if (approvalChanged && next.approvedAt && action !== 'recovery:approved') {
    alongside.push({ ...stamp, at: next.approvedAt, action: 'recovery:approved', summary: 'Customer approved recovery outreach', amount: next.requestedAmount ?? null, method: next.requestedResolution ?? null, note: next.knownBeforeReclaim ? `Known before Reclaim: ${next.knownBeforeNote ?? 'No explanation recorded'}` : 'Newly identified by Reclaim' })
  }
  if (holdChanged && !action.startsWith('recovery:contact_')) {
    alongside.push({ ...stamp, at: eventAt, action: next.contactHold ? 'recovery:contact_held' : 'recovery:contact_released', summary: next.contactHold ? 'Vendor contact put on hold' : 'Vendor contact hold removed', amount: null, method: null, note: next.contactHold ?? null })
  }
  if (attributionChanged && action !== 'recovery:approved' && next.knownBeforeReclaim != null) {
    alongside.push({ ...stamp, at: eventAt, action: 'recovery:attribution_changed', summary: 'Prior-knowledge answer changed', amount: null, method: null, note: next.knownBeforeReclaim ? `Known before Reclaim: ${next.knownBeforeNote ?? 'No explanation recorded'}` : 'Newly identified by Reclaim' })
  }
  if (vendorChanged && !action.startsWith('vendor:') && lastVendorUpdate) {
    alongside.push({ ...stamp, at: lastVendorUpdate.at, action: `vendor:${lastVendorUpdate.status}`, summary: `Vendor update: ${lastVendorUpdate.status.replace(/_/g, ' ')}`, amount: lastVendorUpdate.amount ?? null, method: lastVendorUpdate.method ?? null, note: lastVendorUpdate.note })
  }
  if (settlementAdded && action !== 'recovery:settlement_recorded' && lastSettlement) {
    alongside.push({ ...stamp, at: lastSettlement.settledAt, action: 'recovery:settlement_recorded', summary: 'Money received recorded', amount: lastSettlement.amount, method: lastSettlement.method, note: lastSettlement.reference })
  }
  if ((reconciliationChanged || reconciliationDetailsChanged) && next.reconciledAt && !action.startsWith('accounting:')) {
    alongside.push({ ...stamp, at: next.reconciledAt, action: previous.reconciledAt ? 'accounting:corrected' : 'accounting:reconciled', summary: previous.reconciledAt ? 'Accounting reconciliation updated' : 'Accounting reconciliation recorded', amount: next.recoveredAmount ?? null, method: null, note: next.reconciliationNote ?? null })
  }

  const history = previous.history ?? []
  const backfilled: CaseEvent[] = []
  if (action === 'outcome:reopened' && (previous.recoveredAmount ?? 0) > 0) {
    const proofs = previous.recoverySettlements ?? (previous.recoveryVerification ? [previous.recoveryVerification] : [])
    for (const proof of proofs) {
      const recorded = history.some((earlier) =>
        earlier.action === 'recovery:settlement_recorded' && earlier.at === proof.settledAt &&
        earlier.amount === proof.amount && earlier.note === proof.reference
      )
      if (!recorded) backfilled.push({
        at: proof.settledAt,
        action: 'recovery:settlement_recorded',
        summary: 'Earlier money received recorded',
        from: { decision: previous.decision, recoveryStage: previous.recoveryStage },
        to: { decision: previous.decision, recoveryStage: previous.recoveryStage },
        amount: proof.amount,
        method: proof.method,
        note: proof.reference,
        actor: null,
      })
    }
    if (!proofs.length && !history.some((earlier) =>
      earlier.action === 'outcome:recovered' || earlier.action === 'recovery:settlement_recorded'
    )) {
      backfilled.push({
        at: previous.recoveryResolvedAt ?? Math.max(1, event.at - 1),
        action: 'outcome:recovered',
        summary: 'Earlier money received recorded',
        from: { decision: previous.decision, recoveryStage: previous.recoveryStage },
        to: { decision: previous.decision, recoveryStage: previous.recoveryStage },
        amount: previous.recoveredAmount,
        method: previous.recoveredVia ?? null,
        note: previous.recoveryOutcomeNote ?? null,
        actor: null,
      })
    }
  }
  if (action === 'outcome:reopened' && previous.recoveryStage === 'not_recovered' && !history.some((earlier) => earlier.action === 'outcome:not_recovered')) {
    backfilled.push({
      at: previous.recoveryResolvedAt ?? Math.max(1, event.at - 1),
      action: 'outcome:not_recovered',
      summary: 'Earlier balance closed without recovery',
      from: { decision: previous.decision, recoveryStage: previous.recoveryStage },
      to: { decision: previous.decision, recoveryStage: previous.recoveryStage },
      amount: previous.requestedAmount ?? null,
      method: null,
      note: previous.recoveryOutcomeNote ?? null,
      actor: null,
    })
  }
  const closedRemainder = previous.requestedAmount == null ? 0 : Math.max(0, Math.round(previous.requestedAmount * 100) - Math.round((previous.recoveredAmount ?? 0) * 100)) / 100
  if (action === 'outcome:reopened' && previous.recoveryStage === 'recovered' && (previous.recoveredAmount ?? 0) > 0 && closedRemainder > 0) {
    if (!history.some((earlier) => earlier.action === 'recovery:remainder_closed')) backfilled.push({
      at: previous.recoveryResolvedAt ?? Math.max(1, event.at - 1),
      action: 'recovery:remainder_closed',
      summary: 'Earlier remaining balance closed',
      from: { decision: previous.decision, recoveryStage: previous.recoveryStage },
      to: { decision: previous.decision, recoveryStage: previous.recoveryStage },
      amount: closedRemainder,
      method: null,
      note: previous.recoveryOutcomeNote ?? null,
      actor: null,
    })
    backfilled.push({
      at: event.at,
      action: 'recovery:remainder_reopened',
      summary: 'Remaining balance reopened',
      from: { decision: previous.decision, recoveryStage: previous.recoveryStage },
      to: { decision: next.decision, recoveryStage: next.recoveryStage },
      amount: closedRemainder,
      method: null,
      note: 'Outcome corrected',
      actor,
    })
  }
  // Same-moment facts keep their causal order: an approval reads before the send it allowed.
  const fresh = [event, ...alongside].sort((a, b) => a.at - b.at || Number(b.action === 'recovery:approved') - Number(a.action === 'recovery:approved'))
  return { ...next, history: [...history, ...backfilled, ...fresh] }
}

/**
 * Take a decision back. Allowed until a request has actually gone out — after
 * that the vendor has been contacted and the honest path is `reopenOutcome`.
 * Notes and the draft are kept so nothing typed is lost.
 */
export function reopenDecision(state: CaseState): CaseState {
  if (state.recoveryStage === 'requested' || state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered') return state
  return { ...EMPTY_CASE_STATE, reason: state.reason, recoveryDraft: state.recoveryDraft, recoverySubject: state.recoverySubject, recoveryRecipientEmail: state.recoveryRecipientEmail, requestedResolution: state.requestedResolution }
}

/** Undo a recorded outcome: the request is still out, and the money figure is cleared rather than kept as a stale claim. */
export function reopenOutcome(state: CaseState): CaseState {
  if (state.recoveryStage !== 'recovered' && state.recoveryStage !== 'not_recovered') return state
  return { ...state, recoveryStage: 'requested', recoveredAmount: null, recoveredVia: null, recoveryOutcomeNote: null, recoveryResolvedAt: null, recoveryVerification: null, recoverySettlements: null, reconciledAt: null, reconciliationNote: null, rootCause: null }
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
  recovered: 'Review closed',
  not_recovered: 'Review closed',
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
