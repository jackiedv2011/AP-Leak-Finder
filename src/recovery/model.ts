import { markRecoveryRequested, recordRecoveryOutcome, type CaseState, type RecoveryMethod, type RecoveryVerification, type VendorUpdate } from '@/ledger/caseState'
import { normalizeVendor } from '@/lib/format'
import type { APRecord, Finding } from '@/types'
import { latestVendorPosition, VENDOR_STATUS } from './vendorStatus'

const DAY = 86_400_000

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
  if (state.contactHold) throw new Error('Remove the vendor contact hold before approval.')
  const knownBeforeNote = input.knownBeforeNote?.trim() || null
  if (input.knownBeforeReclaim && !knownBeforeNote) throw new Error('Explain how your team already knew about this issue in a disclosure note.')
  return { ...state, approvedAt: input.at ?? Date.now(), knownBeforeReclaim: input.knownBeforeReclaim, knownBeforeNote: input.knownBeforeReclaim ? knownBeforeNote : null }
}

export function canRecordRequest(state: CaseState): boolean {
  return state.recoveryStage === 'confirmed' && Boolean(state.approvedAt) && !state.contactHold
}

export function startRecoveryRequest(state: CaseState, amount: number, at = Date.now()): CaseState {
  if (!canRecordRequest(state)) throw new Error('Customer approval is required before recording the first request.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('The requested amount must be greater than zero.')
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw new Error('The requested amount must be recorded in whole cents.')
  return {
    ...markRecoveryRequested(state, amount),
    recoveryRequestedAt: at,
    recoveredAmount: null,
    nextFollowUpAt: addBusinessDays(at, 5),
  }
}

export function setNextFollowUp(state: CaseState, at: number | null): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('Only an active request can have a follow-up.')
  if (at !== null && (!Number.isFinite(at) || at <= 0)) throw new Error('Enter a valid follow-up date.')
  return { ...state, nextFollowUpAt: at }
}

/** A minute of slack for clocks that disagree; anything later is a typo, not a reply. */
const CLOCK_SLACK = 60_000

export function recordVendorUpdate(state: CaseState, update: VendorUpdate, now = Date.now()): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('Send the request before recording a vendor response.')
  if (!update.note.trim()) throw new Error('Add a note describing the vendor response.')
  if (!Number.isFinite(update.at) || update.at > now + CLOCK_SLACK) throw new Error('A vendor reply cannot be dated in the future.')
  if (update.expectedAt !== undefined && (!Number.isFinite(update.expectedAt) || startOfDay(update.expectedAt) < startOfDay(update.at))) {
    throw new Error('The promised date cannot be before the reply.')
  }
  const info = VENDOR_STATUS[update.status]
  const remainingCents = Math.max(0, Math.round((state.requestedAmount ?? 0) * 100) - Math.round((state.recoveredAmount ?? 0) * 100))
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
  const alreadyReturned = state.recoveredAmount ?? 0
  const remainingCents = Math.round(requested * 100) - Math.round(alreadyReturned * 100)
  const normalized = { ...proof, reference: proof.reference.trim(), appliedToBill: proof.appliedToBill?.trim() }
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
  const returned = Math.round(alreadyReturned * 100 + proof.amount * 100) / 100
  const fullyReturned = Math.round(returned * 100) === Math.round(requested * 100)
  return {
    ...state,
    recoveryStage: fullyReturned ? 'recovered' : 'requested',
    recoveredAmount: returned,
    recoveredVia: proof.method,
    recoveryOutcomeNote: normalized.reference,
    recoveryResolvedAt: fullyReturned ? proof.settledAt : null,
    recoveryVerification: normalized,
    recoverySettlements: [...prior, normalized],
    nextFollowUpAt: fullyReturned ? null : state.nextFollowUpAt,
  }
}

export function closeWithoutRecovery(state: CaseState, reason: string, at = Date.now()): CaseState {
  if (state.recoveryStage !== 'requested') throw new Error('A request must be open before closing without recovery.')
  if (!reason.trim()) throw new Error('Explain why the recovery was closed.')
  if ((state.recoveredAmount ?? 0) > 0) {
    return { ...state, recoveryStage: 'recovered', recoveryOutcomeNote: reason.trim(), recoveryResolvedAt: at, nextFollowUpAt: null }
  }
  return { ...recordRecoveryOutcome(state, 'not_recovered', null, reason.trim()), recoveryResolvedAt: at, nextFollowUpAt: null }
}

/** Resume pursuing an unpaid remainder while keeping its recorded settlements intact. */
export function reopenRemainingBalance(state: CaseState, at = Date.now()): CaseState {
  const requestedCents = Math.round((state.requestedAmount ?? 0) * 100)
  const returnedCents = Math.round((state.recoveredAmount ?? 0) * 100)
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
  if (!Number.isFinite(state.recoveredAmount) || (state.recoveredAmount ?? 0) <= 0) throw new Error('A recorded return amount is required before reconciliation.')
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
  if (internal && (state.recoveryStage === 'not_recovered' || state.recoveryStage === 'recovered')) return { label: 'Review closed', detail: 'The investigation outcome is recorded in case history.' }
  if (state.recoveryStage === 'confirmed') {
    if (internal) return { label: 'File internal note', detail: 'Review the investigation note and record it for your team.' }
    if (state.contactHold) return { label: 'Contact on hold', detail: state.contactHold }
    if (!state.approvedAt) return { label: 'Approve recovery', detail: 'Review the evidence, amount, recipient and proposed request.' }
    return { label: 'Send the request', detail: 'Copy the approved draft into your email, then record that you sent it.' }
  }
  if (state.recoveryStage === 'requested') {
    if (internal) return { label: 'Record investigation outcome', detail: 'Finish the internal review and record the result.' }
    if ((state.recoveredAmount ?? 0) > 0) return { label: 'Pursue remaining balance', detail: 'Record the next settled return, follow up with the vendor, or close the outstanding balance.', dueAt: state.nextFollowUpAt }
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
    if ((state.recoveredAmount ?? 0) <= 0) return { label: 'Record missing return', detail: 'This older case has no recorded return amount. Reopen it and record the settlement before reconciliation.' }
    if (!state.reconciledAt) return { label: 'Reconcile in accounting', detail: 'Match the settled return to the original payable and record the root cause.' }
    return { label: 'Case complete', detail: 'Returned value and accounting reconciliation have been recorded.' }
  }
  return { label: 'Case closed', detail: 'No returned value was recorded.' }
}

export function requiresCustomerAction(state: CaseState, now = Date.now(), internal = false): boolean {
  if (internal && (state.recoveryStage === 'not_recovered' || state.recoveryStage === 'recovered')) return false
  if (state.recoveryStage === 'confirmed') return true
  if (state.recoveryStage === 'recovered') return (state.recoveredAmount ?? 0) <= 0 || !state.reconciledAt
  if (state.recoveryStage !== 'requested') return false
  if (internal) return true
  if ((state.recoveredAmount ?? 0) > 0) return true
  const last = latestVendorPosition(state)
  return Boolean(last && (VENDOR_STATUS[last.status].needsAction || (last.status === 'accepted' && !last.expectedAt))) || Boolean(state.nextFollowUpAt && state.nextFollowUpAt <= now)
}

export function recoveryStatusLabel(state: CaseState, internal = false): string {
  if (internal && state.recoveryStage === 'confirmed') return 'Ready to file'
  if (internal && state.recoveryStage === 'requested') return 'Internal review open'
  if (internal && (state.recoveryStage === 'not_recovered' || state.recoveryStage === 'recovered')) return 'Review closed'
  if (state.recoveryStage === 'confirmed') return state.contactHold ? 'Contact on hold' : state.approvedAt ? 'Ready to send' : 'Awaiting approval'
  if (state.recoveryStage === 'requested') {
    if ((state.recoveredAmount ?? 0) > 0) return 'Partially returned'
    const status = latestVendorPosition(state)?.status
    if (status && VENDOR_STATUS[status].caseStatus) return VENDOR_STATUS[status].caseStatus!
    return 'Waiting on vendor'
  }
  if (state.recoveryStage === 'recovered') return (state.recoveredAmount ?? 0) <= 0 ? 'Return amount missing' : state.reconciledAt ? 'Reconciled' : 'Returned, reconcile'
  return 'Closed, no money back'
}
