import type { CaseState, VendorUpdateStatus } from '@/ledger/caseState'
import { recoveryStatusLabel } from './model'
import { VENDOR_STATUS, latestVendorPosition } from './vendorStatus'

/**
 * The colour family a case status wears. Named for who holds the ball, so a
 * glance at a page says what needs you, what is with the vendor, and what is
 * already money back.
 *
 *   action   your move: approve, send, answer, follow up
 *   waiting  the request is out; nothing needed from you
 *   agreed   the vendor said yes; the money has not landed yet
 *   problem  pushback or stuck: disputed, not found, overdue
 *   back     money actually returned (wears the viewer's accent)
 *   neutral  not started, or closed
 *   paused   deliberately held
 */
export type StatusTone = 'neutral' | 'action' | 'waiting' | 'agreed' | 'problem' | 'back' | 'paused'

export interface CaseStatus { label: string; tone: StatusTone }

/** Display order for anything that lists or charts the families. */
export const STATUS_TONES: StatusTone[] = ['action', 'waiting', 'agreed', 'problem', 'back', 'paused', 'neutral']

export const STATUS_TONE_LABEL: Record<StatusTone, string> = {
  action: 'Your move',
  waiting: 'Waiting on vendor',
  agreed: 'Agreed, not settled',
  problem: 'Problem',
  back: 'Money back',
  paused: 'On hold',
  neutral: 'Not started or closed',
}

/** Past a promised or scheduled date by more than this, a case reads as overdue rather than due. */
export const OVERDUE_GRACE_DAYS = 3
const DAY = 86_400_000

const VENDOR_TONE: Partial<Record<VendorUpdateStatus, StatusTone>> = {
  accepted: 'agreed',
  partial_acceptance: 'action',
  promised: 'agreed',
  credit_issued: 'agreed',
  already_refunded: 'agreed',
  needs_documents: 'action',
  disputed: 'problem',
  payment_not_found: 'problem',
  no_action_required: 'problem',
  wrong_contact: 'problem',
}

/** The family a vendor reply puts a case in; our own chasing and plain acknowledgements stay "waiting". */
export function vendorTone(status: VendorUpdateStatus): StatusTone {
  return VENDOR_TONE[status] ?? 'waiting'
}

function startOfDay(at: number): number {
  return new Date(at).setHours(0, 0, 0, 0)
}

function daysPast(dueAt: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(dueAt)) / DAY)
}

/**
 * A case's status as a label and a colour family. Labels match
 * `recoveryStatusLabel` everywhere it already had an answer; this adds the
 * states the data knew but the screen folded away: follow-up due, overdue,
 * acknowledged and follow-up sent.
 */
export function caseStatus(state: CaseState | undefined, now = Date.now(), internal = false): CaseStatus {
  if (!state || state.decision === null) return { label: 'Not reviewed', tone: 'neutral' }
  if (!state.recoveryStage) {
    if (state.decision === 'needs_info') return { label: 'Needs information', tone: 'action' }
    if (state.decision === 'expected') return { label: 'Expected', tone: 'neutral' }
    return { label: 'Confirmed', tone: 'action' }
  }

  const stage = state.recoveryStage
  if (internal) {
    const label = recoveryStatusLabel(state, true)
    return { label, tone: stage === 'confirmed' ? 'action' : stage === 'requested' ? 'waiting' : 'neutral' }
  }

  if (stage === 'confirmed') {
    if (state.contactHold) return { label: 'Contact on hold', tone: 'paused' }
    return { label: state.approvedAt ? 'Ready to send' : 'Awaiting approval', tone: 'action' }
  }

  if (stage === 'requested') {
    if ((state.recoveredAmount ?? 0) > 0) return { label: 'Partially returned', tone: 'back' }
    const last = latestVendorPosition(state)
    const info = last ? VENDOR_STATUS[last.status] : undefined
    if (last && info?.caseStatus) {
      const tone = vendorTone(last.status)
      if (tone === 'agreed' && last.expectedAt && daysPast(last.expectedAt, now) > OVERDUE_GRACE_DAYS) return { label: 'Return overdue', tone: 'problem' }
      return { label: info.caseStatus, tone }
    }
    if (state.nextFollowUpAt && state.nextFollowUpAt <= now) {
      return daysPast(state.nextFollowUpAt, now) > OVERDUE_GRACE_DAYS
        ? { label: 'Follow-up overdue', tone: 'problem' }
        : { label: 'Follow-up due', tone: 'action' }
    }
    if (state.vendorUpdates?.at(-1)?.status === 'followed_up') return { label: 'Follow-up sent', tone: 'waiting' }
    if (last?.status === 'acknowledged') return { label: 'Acknowledged', tone: 'waiting' }
    return { label: 'Waiting on vendor', tone: 'waiting' }
  }

  if (stage === 'recovered') {
    if ((state.recoveredAmount ?? 0) <= 0) return { label: 'Return amount missing', tone: 'action' }
    return { label: state.reconciledAt ? 'Reconciled' : 'Returned, reconcile', tone: 'back' }
  }

  return { label: 'Closed, no money back', tone: 'neutral' }
}

/** A due date as a chip: overdue past the grace window, due today or slightly late, or just scheduled. */
export function dueStatus(dueAt: number | null | undefined, now = Date.now(), format: (at: number) => string): CaseStatus | null {
  if (!dueAt) return null
  const late = daysPast(dueAt, now)
  if (late > OVERDUE_GRACE_DAYS) return { label: `${late}d overdue`, tone: 'problem' }
  if (late > 0) return { label: `${late}d late`, tone: 'action' }
  if (late === 0) return { label: 'Due today', tone: 'action' }
  return { label: `Due ${format(dueAt)}`, tone: 'neutral' }
}

/** How many cases sit in each family, in display order, skipping empty ones. */
export function countByTone(statuses: CaseStatus[]): Array<{ tone: StatusTone; count: number }> {
  return STATUS_TONES.map((tone) => ({ tone, count: statuses.filter((s) => s.tone === tone).length })).filter((t) => t.count > 0)
}
