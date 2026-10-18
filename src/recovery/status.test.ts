import { describe, expect, it } from 'vitest'
import { EMPTY_CASE_STATE, type CaseState, type RecoveryVerification, type VendorUpdate, type VendorUpdateStatus } from '@/ledger/caseState'
import { recoveryStatusLabel } from './model'
import { caseStatus, countByTone, dueStatus } from './status'

const DAY = 86_400_000
const NOW = new Date(2026, 9, 2, 12).getTime()
const fmt = () => 'Oct 9'

function requested(extra: Partial<CaseState> = {}): CaseState {
  return { ...EMPTY_CASE_STATE, decision: 'confirmed', decidedAt: NOW - 20 * DAY, recoveryStage: 'requested', requestedAmount: 1000, approvedAt: NOW - 19 * DAY, recoveryRequestedAt: NOW - 18 * DAY, ...extra }
}
/** Money back is a recorded settlement with its proof, not an amount typed on the case. */
function settled(amount: number): RecoveryVerification[] {
  return [{ amount, method: 'refund', source: 'bank', reference: 'RF-2041', settledAt: NOW - 2 * DAY }]
}
function reply(status: VendorUpdateStatus, extra: Partial<VendorUpdate> = {}): VendorUpdate {
  return { at: NOW - 5 * DAY, status, note: '', ...extra }
}

describe('caseStatus', () => {
  it('colours findings before recovery by decision', () => {
    expect(caseStatus(undefined)).toEqual({ label: 'Not reviewed', tone: 'neutral' })
    expect(caseStatus({ ...EMPTY_CASE_STATE, decision: 'needs_info' }).tone).toBe('action')
    expect(caseStatus({ ...EMPTY_CASE_STATE, decision: 'expected' }).tone).toBe('neutral')
  })

  it('puts prepared cases on your move, and a contact hold on pause', () => {
    const prepared: CaseState = { ...EMPTY_CASE_STATE, decision: 'confirmed', recoveryStage: 'confirmed' }
    expect(caseStatus(prepared)).toEqual({ label: 'Awaiting approval', tone: 'action' })
    expect(caseStatus({ ...prepared, approvedAt: NOW })).toEqual({ label: 'Ready to send', tone: 'action' })
    expect(caseStatus({ ...prepared, contactHold: 'Legal review' })).toEqual({ label: 'Contact on hold', tone: 'paused' })
  })

  it('maps every vendor reply to a family', () => {
    expect(caseStatus(requested({ vendorUpdates: [reply('disputed')] }), NOW).tone).toBe('problem')
    expect(caseStatus(requested({ vendorUpdates: [reply('needs_documents')] }), NOW).tone).toBe('action')
    expect(caseStatus(requested({ vendorUpdates: [reply('promised')] }), NOW).tone).toBe('agreed')
    expect(caseStatus(requested({ vendorUpdates: [reply('acknowledged')] }), NOW)).toEqual({ label: 'Acknowledged', tone: 'waiting' })
    expect(caseStatus(requested({ vendorUpdates: [reply('acknowledged'), reply('followed_up')] }), NOW)).toEqual({ label: 'Follow-up sent', tone: 'waiting' })
    expect(caseStatus(requested(), NOW)).toEqual({ label: 'Waiting on vendor', tone: 'waiting' })
  })

  it('turns a passed date into due, then overdue after the grace window', () => {
    expect(caseStatus(requested({ nextFollowUpAt: NOW - 1 * DAY }), NOW)).toEqual({ label: 'Follow-up due', tone: 'action' })
    expect(caseStatus(requested({ nextFollowUpAt: NOW - 5 * DAY }), NOW)).toEqual({ label: 'Follow-up overdue', tone: 'problem' })
    expect(caseStatus(requested({ vendorUpdates: [reply('promised', { expectedAt: NOW - 2 * DAY })] }), NOW).tone).toBe('agreed')
    expect(caseStatus(requested({ vendorUpdates: [reply('promised', { at: NOW - 10 * DAY, expectedAt: NOW - 6 * DAY })] }), NOW)).toEqual({ label: 'Return overdue', tone: 'problem' })
  })

  it('only counts settled money as money back', () => {
    expect(caseStatus(requested({ recoverySettlements: settled(200) }), NOW)).toEqual({ label: 'Partially returned', tone: 'back' })
    // an old amount typed on the case, with no settlement behind it, is not money back
    expect(caseStatus(requested({ recoveredAmount: 200 }), NOW).tone).toBe('waiting')
    const recovered = requested({ recoveryStage: 'recovered', recoverySettlements: settled(1000) })
    expect(caseStatus(recovered, NOW)).toEqual({ label: 'Returned, reconcile', tone: 'back' })
    expect(caseStatus({ ...recovered, reconciledAt: NOW }, NOW)).toEqual({ label: 'Reconciled', tone: 'back' })
    expect(caseStatus({ ...recovered, recoverySettlements: [] }, NOW).tone).toBe('action')
    expect(caseStatus(requested({ recoveryStage: 'not_recovered' }), NOW).tone).toBe('neutral')
  })

  it('keeps the existing label wherever the old function already had one', () => {
    const cases = [requested(), requested({ vendorUpdates: [reply('disputed')] }), requested({ vendorUpdates: [reply('credit_issued')] }), requested({ recoveryStage: 'recovered', recoverySettlements: settled(5) }), requested({ recoveryStage: 'recovered', recoveredAmount: 5 })]
    for (const state of cases) expect(caseStatus(state, NOW).label).toBe(recoveryStatusLabel(state))
  })
})

describe('dueStatus', () => {
  it('escalates from scheduled to due to overdue', () => {
    expect(dueStatus(null, NOW, fmt)).toBeNull()
    expect(dueStatus(NOW + 7 * DAY, NOW, fmt)).toEqual({ label: 'Due Oct 9', tone: 'neutral' })
    expect(dueStatus(NOW, NOW, fmt)).toEqual({ label: 'Due today', tone: 'action' })
    expect(dueStatus(NOW - 2 * DAY, NOW, fmt)).toEqual({ label: '2d late', tone: 'action' })
    expect(dueStatus(NOW - 9 * DAY, NOW, fmt)).toEqual({ label: '9d overdue', tone: 'problem' })
  })
})

describe('countByTone', () => {
  it('counts in display order and drops empty families', () => {
    expect(countByTone([{ label: 'a', tone: 'back' }, { label: 'b', tone: 'action' }, { label: 'c', tone: 'back' }])).toEqual([{ tone: 'action', count: 1 }, { tone: 'back', count: 2 }])
  })
})
