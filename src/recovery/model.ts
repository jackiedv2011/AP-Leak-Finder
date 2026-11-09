import { markRecoveryRequested, recordRecoveryOutcome, type ArchivedRequest, type CaseState, type RecoveryMethod, type RecoveryVerification, type SentEmail, type VendorUpdate } from '../ledger/caseState.ts'
import { normalizeVendor } from '../lib/format.ts'
import type { APRecord, Finding } from '../types.ts'
import { latestVendorPosition, VENDOR_STATUS } from './vendorStatus.ts'
import { activeReturned, verifiedReturned } from './financials.ts'

const DAY = 86_400_000

/** Preserve the original request before opening a separate, unapproved review. */
export function beginNewRequestReview(state: CaseState, at = Date.now()): CaseState {
  if (!state.requiresRevalidation || !['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '')) {
    throw new Error('Only a historical sent request needing revalidation can start a new request review.')
  }
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(state.requestedAmount) || (state.requestedAmount ?? 0) <= 0) {
    throw new Error('The original request amount and review time must be known before archiving it.')
  }
  if (Math.round(Math.max(state.legacyRecoveredAmount ?? 0, state.recoveredAmount ?? 0) * 100) > Math.round(verifiedReturned(state) * 100)) {
    throw new Error('Resolve the older unverified return amount before starting a new request.')
  }
  const generation = state.activeRequestGeneration ?? 1
  const archived: ArchivedRequest = {
    generation, archivedAt: at, returnedAmountAtArchive: activeReturned(state),
    decision: state.decision, reason: state.reason, decidedAt: state.decidedAt,
    recoveryStage: state.recoveryStage, requestedAmount: state.requestedAmount,
    approvedAt: state.approvedAt, legacyApprovedAt: state.legacyApprovedAt, knownBeforeReclaim: state.knownBeforeReclaim,
    knownBeforeNote: state.knownBeforeNote, recoveryDraft: state.recoveryDraft, recoveryEvidenceAttachment: state.recoveryEvidenceAttachment,
    recoverySubject: state.recoverySubject, recoveryRecipientEmail: state.recoveryRecipientEmail,
    requestedResolution: state.requestedResolution, recoveryRequestedAt: state.recoveryRequestedAt,
    recoverySentEmail: state.recoverySentEmail ? { ...state.recoverySentEmail, cc: [...state.recoverySentEmail.cc] } : null,
    recoveryFollowUps: state.recoveryFollowUps?.map((entry) => ({ ...entry, cc: [...entry.cc] })) ?? null,
    followUpAfterDays: state.followUpAfterDays,
    vendorUpdates: state.vendorUpdates?.map((entry) => ({ ...entry })) ?? [],
    recoveryResolvedAt: state.recoveryResolvedAt, recoveryOutcomeNote: state.recoveryOutcomeNote,
    reconciledAt: state.reconciledAt, reconciliationNote: state.reconciliationNote,
    rootCause: state.rootCause, legacyRecoveredAmount: state.legacyRecoveredAmount,
  }
  return {
    decision: null, reason: null, decidedAt: null, recoveryStage: null,
    approvedAt: null, requestedAmount: null,
    activeRequestGeneration: generation + 1,
    archivedRequests: [...(state.archivedRequests ?? []), archived],
    requiresRevalidation: true,
    recoverySettlements: [...(state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : []))],
    recoveryVerification: null,
    recoveredAmount: verifiedReturned(state),
    legacyRecoveredAmount: state.legacyRecoveredAmount,
    history: state.history,
  }
}

/** Preserve the customer's local time of day while skipping Saturday and Sunday. */
export function addBusinessDays(start: number, days: number): number {
  if (!Number.isInteger(days) || days < 0) throw new Error('Business days must be a nonnegative whole number.')
  const date = new Date(start)
  let remaining = days
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining--
  }
  return date.getTime()
}

export function setContactHold(state: CaseState, reason: string | null): CaseState {
  if (state.recoveryStage !== 'confirmed') throw new Error('Contact can be held only before outreach.')
  return { ...state, contactHold: reason?.trim() || null, approvedAt: reason ? null : state.approvedAt }
}

export function approveRecovery(state: CaseState, input: { at?: number; knownBeforeReclaim: boolean; knownBeforeNote?: string | null }): CaseState {
  if (state.recoveryStage !== 'confirmed') throw new Error('Only a prepared recovery case can be approved.')
  if (state.requiresRevalidation) throw new Error('Revalidate the evidence before approving a new request.')
  if (state.contactHold) throw new Error('Remove the vendor contact hold before approval.')
  const knownBeforeNote = input.knownBeforeNote?.trim() || null
  if (input.knownBeforeReclaim && !knownBeforeNote) throw new Error('Explain how your team already knew about this issue in a disclosure note.')
  return { ...state, approvedAt: input.at ?? Date.now(), knownBeforeReclaim: input.knownBeforeReclaim, knownBeforeNote: input.knownBeforeReclaim ? knownBeforeNote : null }
}

export function canRecordRequest(state: CaseState): boolean {
  return state.recoveryStage === 'confirmed' && Boolean(state.approvedAt) && !state.contactHold && !state.requiresRevalidation
}

export function startRecoveryRequest(state: CaseState, amount: number, at = Date.now(), supportedAmount?: number): CaseState {
  if (!canRecordRequest(state)) throw new Error('Customer approval is required before recording the first request.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('The requested amount must be greater than zero.')
  // The form checks this too; the rule lives here so no other caller can ask a vendor for more than the records support.
  if (supportedAmount !== undefined && Math.round(amount * 100) > Math.round(supportedAmount * 100) - Math.round((verifiedReturned(state) - activeReturned(state)) * 100)) throw new Error('The requested amount cannot be more than the records support after earlier returns.')
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw new Error('The requested amount must be recorded in whole cents.')
  return {
    ...markRecoveryRequested(state, amount),
    recoveryRequestedAt: at,
    recoveredAmount: (state.activeRequestGeneration ?? 1) > 1 ? verifiedReturned(state) : null,
    nextFollowUpAt: addBusinessDays(at, 5),
  }
}

/**
 * Gmail accepted the request: record it as sent, at Gmail's time, with its
 * message id. This records a fact that already happened, so unlike
 * `startRecoveryRequest` it does not re-ask for approval (the server checked
 * that before sending); it only refuses a case that isn't waiting to be sent.
 */
export function recordEmailSent(state: CaseState, sent: SentEmail, amount: number): CaseState {
  if (state.recoveryStage !== 'confirmed') throw new Error('Only a request waiting to be sent can be recorded as sent.')
  if (!sent.messageId || !Number.isFinite(sent.sentAt)) throw new Error('A sent email needs Gmail’s message id and time.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('The requested amount must be greater than zero.')
  return {
    ...markRecoveryRequested(state, amount),
    recoveryRequestedAt: sent.sentAt,
    recoveryRecipientEmail: sent.to,
    recoverySentEmail: sent,
    recoveredAmount: (state.activeRequestGeneration ?? 1) > 1 ? verifiedReturned(state) : null,
    nextFollowUpAt: sent.sentAt + followUpAfterDays(state) * DAY,
  }
}

export const DEFAULT_FOLLOW_UP_DAYS = 7
export const followUpAfterDays = (state: CaseState) => state.followUpAfterDays ?? DEFAULT_FOLLOW_UP_DAYS

/** The last email on the case: the request, a Gmail follow-up, or a follow-up the customer recorded sending. */
export function lastOutreachAt(state: CaseState): number | null {
  const times = [
    state.recoverySentEmail?.sentAt ?? state.recoveryRequestedAt ?? null,
    ...(state.recoveryFollowUps ?? []).map((f) => f.sentAt),
    ...(state.vendorUpdates ?? []).filter((u) => u.status === 'followed_up').map((u) => u.at),
  ].filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
  return times.length ? Math.max(...times) : null
}

export interface FollowUpStatus {
  /** When the last email went out. */
  lastOutreachAt: number
  /** When a follow-up is offered if nothing comes back. */
  dueAt: number
  /** A vendor reply recorded since the last email: no follow-up is offered. */
  repliedAt: number | null
  due: boolean
  /** Which follow-up this would be: 1 for the first. */
  sequence: number
}

/**
 * Whether to offer a follow-up on an open request. A reply is any vendor
 * update that moves the case (not "no response yet", not "I sent a
 * follow-up"). Only ever an offer: nothing here sends anything.
 */
export function followUpStatus(state: CaseState, now = Date.now()): FollowUpStatus | null {
  if (state.recoveryStage !== 'requested' || state.contactHold || state.requiresRevalidation) return null
  const last = lastOutreachAt(state)
  if (last === null) return null
  const reply = (state.vendorUpdates ?? []).filter((u) => VENDOR_STATUS[u.status].progress && u.at >= last).at(-1) ?? null
  const dueAt = state.nextFollowUpAt ?? last + followUpAfterDays(state) * DAY
  return { lastOutreachAt: last, dueAt, repliedAt: reply?.at ?? null, due: !reply && now >= dueAt, sequence: (state.recoveryFollowUps?.length ?? 0) + 1 }
}

/** "Follow up after N days": moves the next follow-up to N days after the last email. */
export function setFollowUpAfterDays(state: CaseState, days: number): CaseState {
  if (state.requiresRevalidation) throw new Error('Revalidate the historical request before scheduling another follow-up.')
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('Choose between 1 and 90 days.')
  const last = lastOutreachAt(state)
  return { ...state, followUpAfterDays: days, nextFollowUpAt: state.recoveryStage === 'requested' && last !== null ? last + days * DAY : state.nextFollowUpAt ?? null }
}

/** Gmail accepted a follow-up: add it to the case and restart the clock from it. */
export function recordFollowUpSent(state: CaseState, sent: SentEmail): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('Only an open request can be followed up.')
  if (!sent.messageId || !Number.isFinite(sent.sentAt)) throw new Error('A sent email needs Gmail’s message id and time.')
  return { ...state, recoveryFollowUps: [...(state.recoveryFollowUps ?? []), sent], nextFollowUpAt: sent.sentAt + followUpAfterDays(state) * DAY }
}

export function setNextFollowUp(state: CaseState, at: number | null): CaseState {
  if (state.requiresRevalidation) throw new Error('Revalidate the historical request before scheduling another follow-up.')
  if (state.recoveryStage !== 'requested') throw new Error('Only an active request can have a follow-up.')
  if (at !== null && (!Number.isFinite(at) || at <= 0)) throw new Error('Enter a valid follow-up date.')
  return { ...state, nextFollowUpAt: at }
}

/** A minute of slack for clocks that disagree; anything later is a typo, not a reply. */
const CLOCK_SLACK = 60_000

export function recordVendorUpdate(state: CaseState, update: VendorUpdate, now = Date.now()): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('Send the request before recording a vendor response.')
  if (state.requiresRevalidation && update.status === 'followed_up') throw new Error('Revalidate the historical request before recording another follow-up.')
  if (!update.note.trim()) throw new Error('Add a note describing the vendor response.')
  if (!Number.isFinite(update.at) || update.at > now + CLOCK_SLACK) throw new Error('A vendor reply cannot be dated in the future.')
  if (update.expectedAt !== undefined && (!Number.isFinite(update.expectedAt) || startOfDay(update.expectedAt) < startOfDay(update.at))) {
    throw new Error('The promised date cannot be before the reply.')
  }
  const info = VENDOR_STATUS[update.status]
  const remainingCents = Math.max(0, Math.round((state.requestedAmount ?? 0) * 100) - Math.round(activeReturned(state) * 100))
  if (info.amount === 'none' && update.amount !== undefined) throw new Error('This kind of reply does not carry an amount.')
  if (info.amount === 'required' && update.amount === undefined) throw new Error('Enter the amount the vendor accepted.')
  if (update.amount !== undefined && (!Number.isFinite(update.amount) || update.amount < 0 || update.amount > (state.requestedAmount ?? Infinity))) {
    throw new Error('The vendor amount must be within the requested amount.')
  }
  if (update.amount !== undefined && Math.abs(update.amount * 100 - Math.round(update.amount * 100)) > 0.000001) throw new Error('The vendor amount must be recorded in whole cents.')
  if (update.status === 'partial_acceptance' && update.amount !== undefined && (update.amount <= 0 || Math.round(update.amount * 100) >= remainingCents)) {
    throw new Error('A partial acceptance must be more than zero and less than the remaining claim. Record a full acceptance instead.')
  }
  const amountInferred = update.status === 'accepted' && update.amount === undefined && state.requestedAmount != null
  const acceptedAmount = amountInferred ? remainingCents / 100 : update.amount
  const nextFollowUpAt = update.expectedAt ?? (update.status === 'followed_up' ? addBusinessDays(update.at, 5) : info.clearsFollowUp ? null : state.nextFollowUpAt)
  return { ...state, vendorUpdates: [...(state.vendorUpdates ?? []), { ...update, amount: acceptedAmount, amountInferred, note: update.note.trim() }], nextFollowUpAt }
}

function startOfDay(time: number): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** A promise and a credit memo are evidence of progress, never settled value. */
export function verifyRecovery(state: CaseState, proof: RecoveryVerification): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('A request must be open before recording returned value.')
  const requested = state.requestedAmount ?? 0
  const alreadyReturned = activeReturned(state)
  const caseReturned = verifiedReturned(state)
  const remainingCents = Math.round(requested * 100) - Math.round(alreadyReturned * 100)
  const generation = state.activeRequestGeneration ?? 1
  const normalized: RecoveryVerification = {
    amount: proof.amount, method: proof.method, source: proof.source,
    reference: proof.reference.trim(), settledAt: proof.settledAt,
    appliedToBill: proof.appliedToBill?.trim(),
    ...(generation > 1 ? { requestGeneration: generation } : {}),
  }
  const prior = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
  if (prior.some((entry) => entry.method === normalized.method && entry.reference.toLowerCase() === normalized.reference.toLowerCase() && entry.appliedToBill === normalized.appliedToBill)) {
    throw new Error('This settlement reference was already recorded.')
  }
  if (!Number.isFinite(proof.amount) || Math.abs(proof.amount * 100 - Math.round(proof.amount * 100)) > 0.000001) throw new Error('Settled amount must be recorded in whole cents.')
  if (!Number.isFinite(proof.amount) || proof.amount <= 0 || Math.round(proof.amount * 100) > remainingCents) {
    throw new Error('Settled amount must be positive and no more than the remaining requested balance.')
  }
  if (!proof.reference.trim()) throw new Error('A settlement reference is required.')
  if ((proof.method === 'credit' || proof.method === 'offset') && !proof.appliedToBill?.trim()) {
    throw new Error('Enter the bill where this credit was actually applied.')
  }
  const returned = Math.round(caseReturned * 100 + proof.amount * 100) / 100
  const fullyReturned = Math.round(alreadyReturned * 100 + proof.amount * 100) === Math.round(requested * 100)
  return {
    ...state,
    recoveryStage: fullyReturned ? 'recovered' : 'requested',
    recoveredAmount: returned,
    legacyRecoveredAmount: state.legacyRecoveredAmount ?? (prior.length === 0 && (state.recoveredAmount ?? 0) > 0 ? state.recoveredAmount : null),
    recoveredVia: proof.method,
    recoveryOutcomeNote: normalized.reference,
    recoveryResolvedAt: fullyReturned ? proof.settledAt : null,
    recoveryVerification: normalized,
    recoverySettlements: [...prior, normalized],
    nextFollowUpAt: fullyReturned ? null : state.nextFollowUpAt,
  }
}

/** Attribute a late return to its original, archived request. */
export function recordHistoricalSettlement(state: CaseState, generation: number, proof: RecoveryVerification, supportedAmount?: number): CaseState {
  const archived = state.archivedRequests?.find((request) => request.generation === generation)
  if (!archived) throw new Error('Select an archived request for this return.')
  if (!Number.isFinite(proof.amount) || proof.amount <= 0 || Math.abs(proof.amount * 100 - Math.round(proof.amount * 100)) > 0.000001) throw new Error('Enter a positive settled amount in whole cents.')
  if (!proof.reference.trim() || !Number.isFinite(proof.settledAt) || proof.settledAt <= 0) throw new Error('A settlement reference and date are required.')
  if ((proof.method === 'credit' || proof.method === 'offset') && !proof.appliedToBill?.trim()) throw new Error('Enter the bill where this credit was actually applied.')
  const prior = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
  const normalized: RecoveryVerification = { amount: proof.amount, method: proof.method, source: proof.source, reference: proof.reference.trim(), settledAt: proof.settledAt, appliedToBill: proof.appliedToBill?.trim(), requestGeneration: generation }
  if (prior.some((entry) => entry.method === normalized.method && entry.reference.toLowerCase() === normalized.reference.toLowerCase() && (entry.appliedToBill ?? '') === (normalized.appliedToBill ?? ''))) throw new Error('This settlement reference was already recorded.')
  const oldReturned = prior.filter((entry) => (entry.requestGeneration ?? 1) === generation).reduce((sum, entry) => sum + entry.amount, 0)
  if (Math.round((oldReturned + proof.amount) * 100) > Math.round((archived.requestedAmount ?? 0) * 100)) throw new Error('The return exceeds the remaining amount of the earlier request.')
  const total = Math.round((verifiedReturned(state) + proof.amount) * 100) / 100
  const next: CaseState = { ...state, recoverySettlements: [...prior, normalized], recoveredAmount: total }
  if (supportedAmount !== undefined && ['confirmed', 'requested'].includes(state.recoveryStage ?? '') && Math.round(((state.requestedAmount ?? 0) - activeReturned(state)) * 100) > Math.round((supportedAmount - total) * 100)) {
    return { ...next, approvedAt: state.recoveryStage === 'confirmed' ? null : state.approvedAt, contactHold: 'Earlier request received a return; review the supported balance before further contact.', nextFollowUpAt: null }
  }
  return next
}

export function closeWithoutRecovery(state: CaseState, reason: string, at = Date.now()): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('A request must be open before closing without recovery.')
  if (!reason.trim()) throw new Error('Explain why the recovery was closed.')
  if (activeReturned(state) > 0) {
    return { ...state, recoveryStage: 'recovered', recoveryOutcomeNote: reason.trim(), recoveryResolvedAt: at, nextFollowUpAt: null }
  }
  return { ...recordRecoveryOutcome(state, 'not_recovered', null, reason.trim()), recoveryResolvedAt: at, nextFollowUpAt: null }
}

/** Resume pursuing an unpaid remainder while keeping its recorded settlements intact. */
export function reopenRemainingBalance(state: CaseState, at = Date.now()): CaseState {
  if (state.requiresRevalidation) throw new Error('Preserve the historical request before starting a new supplier review.')
  const requestedCents = Math.round((state.requestedAmount ?? 0) * 100)
  const returnedCents = Math.round(activeReturned(state) * 100)
  if (state.recoveryStage !== 'recovered' || returnedCents <= 0 || returnedCents >= requestedCents) {
    throw new Error('Only a closed case with a partially returned remaining balance can be reopened this way.')
  }
  return {
    ...state,
    recoveryStage: 'requested',
    recoveryOutcomeNote: null,
    recoveryResolvedAt: null,
    nextFollowUpAt: addBusinessDays(at, 5),
    reconciledAt: null,
    reconciliationNote: null,
    rootCause: null,
  }
}

export function reconcileRecovery(state: CaseState, input: { note: string; rootCause: string; at?: number }): CaseState {
  if (state.recoveryStage !== 'recovered') throw new Error('Record settled value before reconciliation.')
  if (activeReturned(state) <= 0) throw new Error('A recorded return with verified proof is required before reconciliation.')
  if (!input.note.trim()) throw new Error('Describe the accounting entry or reconciliation.')
  return { ...state, reconciledAt: input.at ?? Date.now(), reconciliationNote: input.note.trim(), rootCause: input.rootCause.trim() || null }
}

export interface RecoveryRecommendation { method: RecoveryMethod; reason: string }

/**
 * Suggest a method from observed vendor activity; the customer makes the final choice.
 * "Recent" is measured back from the ledger's last payment, not from today: a ledger
 * is an export of past months, and measuring from today would call every vendor
 * inactive and always suggest a refund.
 */
export function recommendRecoveryMethod(finding: Finding, records: APRecord[], asOf?: number): RecoveryRecommendation {
  const vendor = normalizeVendor(finding.vendor)
  const payments = records.filter((record) => normalizeVendor(record.vendor) === vendor)
  if (asOf === undefined) asOf = Math.max(0, ...records.map((record) => record.paymentDate.getTime()))
  const latest = Math.max(0, ...payments.map((record) => record.paymentDate.getTime()))
  const recentInvoices = new Set(payments.filter((record) => asOf - record.paymentDate.getTime() >= 0 && asOf - record.paymentDate.getTime() <= 90 * DAY).map((record) => record.invoiceNumber ?? record.id))
  if (latest <= asOf && recentInvoices.size >= 2) {
    return { method: 'credit', reason: `${recentInvoices.size} distinct payments to this vendor appear in the ledger's last 90 days. An applied credit may be practical; confirm a future bill exists.` }
  }
  return { method: 'refund', reason: 'The ledger does not show steady payments to this vendor in its last 90 days. A cash refund avoids leaving an unused credit.' }
}

export interface RecoveryAction { label: string; detail: string; dueAt?: number | null }

export function recoveryNextAction(state: CaseState, now = Date.now(), internal = false): RecoveryAction {
  if (state.requiresRevalidation && ['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '')) return { label: 'Review historical request', detail: 'The earlier request stays in case history. Supplier contact is paused until a new request can be reviewed and approved.' }
  if (internal && (state.recoveryStage === 'not_recovered' || state.recoveryStage === 'recovered')) return { label: 'Review closed', detail: 'The investigation outcome is recorded in case history.' }
  if (state.recoveryStage === 'confirmed') {
    if (internal) return { label: 'File internal note', detail: 'Review the investigation note and record it for your team.' }
    if (state.contactHold) return { label: 'Contact on hold', detail: state.contactHold }
    if (!state.approvedAt) return { label: 'Approve recovery', detail: 'Review the evidence, amount, recipient and proposed request.' }
    return { label: 'Send the request', detail: 'Copy the approved draft into your email, then record that you sent it.' }
  }
  if (state.recoveryStage === 'requested') {
    if (internal) return { label: 'Record investigation outcome', detail: 'Finish the internal review and record the result.' }
    if (activeReturned(state) > 0) return { label: 'Pursue remaining balance', detail: 'Record the next settled return, follow up with the vendor, or close the outstanding balance.', dueAt: state.nextFollowUpAt }
    const last = latestVendorPosition(state)
    if (last?.status === 'credit_issued') return { label: 'Verify credit application', detail: 'A credit memo is pending until it offsets a valid bill.' }
    if (last?.status === 'already_refunded') return { label: 'Verify refund settlement', detail: 'The vendor says a refund was sent. Match it to an actual bank or accounting record before counting recovery.' }
    if (last && VENDOR_STATUS[last.status].needsAction) return { label: 'Review vendor response', detail: last.note }
    if (last?.status === 'accepted') return last.expectedAt ? { label: 'Verify promised return', detail: 'The vendor accepted the claim. Confirm the return settles before recording it.', dueAt: last.expectedAt } : { label: 'Confirm return timing', detail: 'Ask the vendor when and how the accepted amount will be returned.' }
    if (last?.status === 'promised') return { label: 'Verify promised return', detail: 'Record a settled refund or applied credit only after it arrives.', dueAt: last.expectedAt ?? null }
    if (state.nextFollowUpAt && state.nextFollowUpAt <= now) return { label: 'Follow up with vendor', detail: 'The scheduled follow-up is due.', dueAt: state.nextFollowUpAt }
    return { label: 'Wait for vendor', detail: 'Track a reply or follow up on the scheduled date.', dueAt: state.nextFollowUpAt }
  }
  if (state.recoveryStage === 'recovered') {
    if (activeReturned(state) <= 0) return { label: 'Record missing return', detail: 'This older case has no verified return. Reopen it and record the settlement before reconciliation.' }
    if (!state.reconciledAt) return { label: 'Record it in your books', detail: 'Note where the money shows up in your accounting, and what caused the mistake, so the case can close.' }
    return { label: 'Case complete', detail: 'The money is back and recorded in your books. Nothing left to do.' }
  }
  return { label: 'Case closed', detail: 'No returned value was recorded.' }
}

export function requiresCustomerAction(state: CaseState, now = Date.now(), internal = false): boolean {
  if (internal && (state.recoveryStage === 'not_recovered' || state.recoveryStage === 'recovered')) return false
  if (state.recoveryStage === 'confirmed') return true
  if (state.recoveryStage === 'recovered') return activeReturned(state) <= 0 || !state.reconciledAt
  if (state.recoveryStage !== 'requested') return false
  if (internal) return true
  if (state.requiresRevalidation) return true
  if (activeReturned(state) > 0) return true
  const last = latestVendorPosition(state)
  return Boolean(last && (VENDOR_STATUS[last.status].needsAction || (last.status === 'accepted' && !last.expectedAt))) || Boolean(state.nextFollowUpAt && state.nextFollowUpAt <= now)
}

export function recoveryStatusLabel(state: CaseState, internal = false): string {
  if (internal && state.recoveryStage === 'confirmed') return 'Ready to file'
  if (internal && state.recoveryStage === 'requested') return 'Internal review open'
  if (internal && (state.recoveryStage === 'not_recovered' || state.recoveryStage === 'recovered')) return 'Review closed'
  if (state.recoveryStage === 'confirmed') return state.contactHold ? 'Contact on hold' : state.approvedAt ? 'Ready to send' : 'Awaiting approval'
  if (state.recoveryStage === 'requested') {
    if (state.requiresRevalidation) return 'Historical request · review needed'
    if (activeReturned(state) > 0) return 'Partially returned'
    const status = latestVendorPosition(state)?.status
    if (status && VENDOR_STATUS[status].caseStatus) return VENDOR_STATUS[status].caseStatus!
    return 'Waiting on vendor'
  }
  if (state.recoveryStage === 'recovered') return activeReturned(state) <= 0 ? 'Return amount missing' : state.reconciledAt ? 'Reconciled' : 'Returned, reconcile'
  return 'Closed, no money back'
}
