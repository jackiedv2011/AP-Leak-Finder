import { describe, expect, it } from 'vitest'
import { confirmCase, markRecoveryRequested, reopenOutcome, updateRecoveryPackage, withHistory } from '@/ledger/caseState'
import type { APRecord, Finding } from '@/types'
import {
  addBusinessDays,
  approveRecovery,
  canRecordRequest,
  closeWithoutRecovery,
  recordVendorUpdate,
  requiresCustomerAction,
  recommendRecoveryMethod,
  reopenRemainingBalance,
  recoveryNextAction,
  recoveryStatusLabel,
  reconcileRecovery,
  setContactHold,
  startRecoveryRequest,
  verifyRecovery,
} from './model'

const monday = Date.UTC(2026, 8, 21, 12)
const caseFinding: Finding = {
  id: 'duplicate-1', type: 'exact_duplicate', class: 'recoverable', severity: 'high',
  vendor: 'Acme Supply', dollarImpact: 1000, title: 'Duplicate payment', explanation: 'Same invoice paid twice', relatedRecords: [],
}

describe('recovery lifecycle', () => {
  it('asks for a real return amount before reconciling a legacy recovered case', () => {
    const legacy = { ...confirmCase(null), recoveryStage: 'recovered' as const, requestedAmount: 1000, recoveredAmount: null }
    expect(recoveryStatusLabel(legacy)).toBe('Return amount missing')
    expect(recoveryNextAction(legacy).label).toBe('Record missing return')
    expect(requiresCustomerAction(legacy)).toBe(true)
    expect(() => reconcileRecovery(legacy, { note: 'Cleared vendor payable', rootCause: 'Payment retry' })).toThrow(/recorded return/i)
  })
  it('requires a human approval before the customer can record first outreach', () => {
    const unapproved = confirmCase(null)
    expect(canRecordRequest(unapproved)).toBe(false)
    expect(() => startRecoveryRequest(unapproved, 1000, monday)).toThrow(/approval/i)
    const approved = approveRecovery(unapproved, { at: monday, knownBeforeReclaim: false })
    expect(canRecordRequest(approved)).toBe(true)
    expect(() => startRecoveryRequest(approved, 1000.001, monday)).toThrow(/cents/i)
    const requested = startRecoveryRequest(approved, 1000, monday)
    expect(requested.recoveryStage).toBe('requested')
    expect(requested.nextFollowUpAt).toBe(addBusinessDays(monday, 5))
  })

  it('requires a disclosure note when the customer knew about the issue before Reclaim', () => {
    const prepared = confirmCase(null)
    expect(() => approveRecovery(prepared, { knownBeforeReclaim: true })).toThrow(/known.*note|explain/i)
    const approved = withHistory(prepared, approveRecovery(prepared, { knownBeforeReclaim: true, knownBeforeNote: 'AP flagged it in August', at: monday }), null)
    expect(approved.knownBeforeNote).toBe('AP flagged it in August')
    expect(approved.history?.at(-1)?.note).toContain('AP flagged it in August')
  })

  it('blocks outreach while a customer has put the vendor on hold', () => {
    const held = setContactHold(confirmCase(null), 'Strategic relationship', monday)
    expect(() => approveRecovery(held, { at: monday, knownBeforeReclaim: false })).toThrow(/hold/i)
    expect(canRecordRequest(held)).toBe(false)
    expect(setContactHold(held, null, monday).contactHold).toBeNull()
  })

  it('schedules a follow-up five business days after outreach', () => {
    const friday = Date.UTC(2026, 8, 25, 12)
    expect(new Date(addBusinessDays(friday, 5)).toISOString()).toBe('2026-10-02T12:00:00.000Z')
    const localFriday = new Date(2026, 8, 25, 12)
    const localFollowUp = new Date(addBusinessDays(localFriday.getTime(), 5))
    expect([localFollowUp.getFullYear(), localFollowUp.getMonth(), localFollowUp.getDate(), localFollowUp.getHours()]).toEqual([2026, 9, 2, 12])
  })

  it('reschedules the next follow-up after a customer records a follow-up sent', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const sentAt = addBusinessDays(monday, 5)
    const followed = recordVendorUpdate(requested, { status: 'followed_up', note: 'Sent a polite reminder', at: sentAt })
    expect(followed.nextFollowUpAt).toBe(addBusinessDays(sentAt, 5))
  })

  it('keeps vendor acknowledgement and an issued credit out of recovered money', () => {
    let state = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    state = recordVendorUpdate(state, { status: 'credit_issued', note: 'CM-14 issued, not applied', at: monday + 86400000, amount: 1000 })
    expect(state.recoveryStage).toBe('requested')
    expect(state.recoveredAmount).toBeNull()
    expect(recoveryNextAction(state, monday + 86400000).label).toMatch(/credit/i)
    expect(requiresCustomerAction(state, monday + 86400000)).toBe(true)
  })

  it.each([
    ['already_refunded', 'Verify refund settlement'],
    ['payment_not_found', 'Review vendor response'],
    ['partial_acceptance', 'Review vendor response'],
    ['no_action_required', 'Review vendor response'],
  ] as const)('keeps a %s vendor reply pending until the customer acts', (status, expectedAction) => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const replied = recordVendorUpdate(requested, { status, note: 'Supplier replied', amount: 400, at: monday + 1000 })
    expect(replied.recoveryStage).toBe('requested')
    expect(replied.recoveredAmount).toBeNull()
    expect(replied.nextFollowUpAt).toBeNull()
    expect(recoveryNextAction(replied, monday + 1000).label).toBe(expectedAction)
    expect(requiresCustomerAction(replied, monday + 1000)).toBe(true)
  })

  it('tracks vendor acceptance without claiming that money has returned', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const accepted = recordVendorUpdate(requested, { status: 'accepted', note: 'Agreed to refund', amount: 1000, at: monday + 1000 })
    expect(accepted.recoveredAmount).toBeNull()
    expect(recoveryNextAction(accepted, monday + 1000).label).toBe('Confirm return timing')
  })

  it('freezes a full acceptance at the outstanding amount when the vendor does not restate a number', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const partial = verifyRecovery(requested, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: monday + 1000 })
    const accepted = recordVendorUpdate(partial, { status: 'accepted', note: 'Accepted the remaining balance', at: monday + 2000 })
    expect(accepted.vendorUpdates?.at(-1)).toMatchObject({ amount: 700, amountInferred: true })
  })

  it('counts a vendor wait as an action only when follow-up is due', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    expect(requiresCustomerAction(requested, monday)).toBe(false)
    expect(requiresCustomerAction(requested, addBusinessDays(monday, 5))).toBe(true)
  })

  it.each(['accepted', 'promised'] as const)('surfaces a %s return when its vendor date arrives before the usual follow-up', (status) => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const expectedAt = monday + 86_400_000
    const waiting = recordVendorUpdate(requested, { status, note: 'Refund by tomorrow', amount: 1000, at: monday, expectedAt })
    expect(waiting.nextFollowUpAt).toBe(expectedAt)
    expect(requiresCustomerAction(waiting, expectedAt - 1)).toBe(false)
    expect(requiresCustomerAction(waiting, expectedAt)).toBe(true)
    expect(recoveryNextAction(waiting, expectedAt).dueAt).toBe(expectedAt)
  })

  it('requires settlement proof, and requires a bill reference when a credit is applied', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    expect(() => verifyRecovery(requested, { amount: 1000, method: 'credit', source: 'manual', reference: 'CM-14', settledAt: monday })).toThrow(/bill/i)
    expect(() => verifyRecovery(requested, { amount: 1000, method: 'refund', source: 'manual', reference: '', settledAt: monday })).toThrow(/reference/i)
    const verified = verifyRecovery(requested, { amount: 600, method: 'credit', source: 'manual', reference: 'CM-14', appliedToBill: 'BILL-7', settledAt: monday })
    expect(verified.recoveredAmount).toBe(600)
    expect(verified.recoveryStage).toBe('requested')
    expect(verified.recoveryVerification).toMatchObject({ appliedToBill: 'BILL-7', source: 'manual' })
    expect(recoveryNextAction(verified, monday).label).toMatch(/remaining/i)
    expect(() => reconcileRecovery(verified, { note: 'Cleared vendor payable', rootCause: 'Invoice entered twice', at: monday })).toThrow(/settled/i)
    const fullyReturned = verifyRecovery(verified, { amount: 400, method: 'refund', source: 'bank', reference: 'ACH-2', settledAt: monday + 1000 })
    expect(fullyReturned.recoveredAmount).toBe(1000)
    expect(fullyReturned.recoveryStage).toBe('recovered')
    expect(fullyReturned.recoverySettlements).toHaveLength(2)
    expect(recoveryNextAction(fullyReturned, monday).label).toMatch(/reconcil/i)
    expect(reconcileRecovery(fullyReturned, { note: 'Cleared vendor payable', rootCause: 'Invoice entered twice', at: monday }).reconciledAt).toBe(monday)
    const reopened = reopenOutcome(fullyReturned)
    expect(reopened.recoverySettlements).toBeNull()
    expect(withHistory(fullyReturned, reopened, 'controller@example.com').history?.at(-1)?.action).toBe('outcome:reopened')
  })

  it('keeps the unpaid balance active, prevents duplicate proof, and can close the remainder', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const partial = verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: monday })
    expect(partial.recoveryStage).toBe('requested')
    expect(partial.recoveredAmount).toBe(600)
    expect(() => verifyRecovery(partial, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: monday })).toThrow(/already recorded/i)
    expect(() => verifyRecovery(partial, { amount: 401, method: 'refund', source: 'bank', reference: 'ACH-2', settledAt: monday })).toThrow(/remaining/i)
    expect(() => verifyRecovery(partial, { amount: 0.001, method: 'refund', source: 'bank', reference: 'ACH-3', settledAt: monday })).toThrow(/cents/i)
    const closed = closeWithoutRecovery(partial, 'Vendor refused the rest', monday + 1000)
    expect(closed.recoveryStage).toBe('recovered')
    expect(closed.recoveredAmount).toBe(600)
    expect(closed.recoveryOutcomeNote).toBe('Vendor refused the rest')
    expect(withHistory(partial, closed, 'controller@example.com').history?.at(-1)?.summary).toBe('Remaining balance closed')
  })

  it('records closed and reopened balances in exact cents', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 0.30, monday)
    const partial = verifyRecovery(requested, { amount: 0.10, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: monday + 1000 })
    const closed = withHistory(partial, closeWithoutRecovery(partial, 'Vendor declined the rest', monday + 2000), null)
    expect(closed.history?.at(-1)?.amount).toBe(0.20)
    const reopened = withHistory(closed, reopenRemainingBalance(closed, monday + 3000), null)
    expect(reopened.history?.at(-1)?.amount).toBe(0.20)
  })

  it('reopens only a closed remainder without discarding the valid partial settlement', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    const partial = verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: monday + 1000 })
    const closed = reconcileRecovery(closeWithoutRecovery(partial, 'Vendor declined the rest', monday + 2000), { note: 'Booked the partial return', rootCause: 'Duplicate payment', at: monday + 3000 })
    const reopened = reopenRemainingBalance(closed, monday + 4000)
    expect(reopened).toMatchObject({ recoveryStage: 'requested', recoveredAmount: 600, reconciledAt: null, reconciliationNote: null, rootCause: null })
    expect(reopened.recoverySettlements).toEqual(partial.recoverySettlements)
    expect(reopened.nextFollowUpAt).toBe(addBusinessDays(monday + 4000, 5))
    expect(withHistory(closed, reopened, null).history?.at(-1)).toMatchObject({ action: 'recovery:remainder_reopened', amount: 400 })
    expect(() => reopenRemainingBalance(verifyRecovery(partial, { amount: 400, method: 'refund', source: 'bank', reference: 'ACH-2', settledAt: monday + 2000 }))).toThrow(/remaining balance/i)
  })

  it('does not let a settlement exceed the amount requested or close before outreach', () => {
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: monday, knownBeforeReclaim: false }), 1000, monday)
    expect(() => verifyRecovery(requested, { amount: 1000.01, method: 'refund', source: 'manual', reference: 'BANK-1', settledAt: monday })).toThrow(/requested/i)
    expect(() => closeWithoutRecovery(confirmCase(null), 'No response', monday)).toThrow(/request/i)
    expect(closeWithoutRecovery(requested, 'Vendor disputed', monday).recoveredAmount).toBeNull()
  })

  it('opens legacy requested cases without inventing an approval or sending history', () => {
    const legacy = markRecoveryRequested(confirmCase(null), 1000)
    expect(legacy.approvedAt).toBeUndefined()
    expect(recoveryNextAction(legacy, monday).label).toMatch(/vendor|follow/i)
    expect(canRecordRequest(legacy)).toBe(false)
  })

  it('describes an internal investigation without implying a vendor request', () => {
    const prepared = confirmCase(null)
    expect(recoveryNextAction(prepared, monday, true).label).toBe('File internal note')
    const filed = markRecoveryRequested(prepared, 1000)
    expect(recoveryNextAction(filed, monday, true).label).toBe('Record investigation outcome')
    expect(recoveryStatusLabel(filed, true)).toBe('Internal review open')
    expect(requiresCustomerAction(filed, monday, true)).toBe(true)
  })

  it('records approval, vendor update, and reconciliation in the case audit trail', () => {
    const initial = confirmCase(null)
    const approved = withHistory(initial, approveRecovery(updateRecoveryPackage(initial, { requestedAmount: 1000 }), { at: monday, knownBeforeReclaim: false }), 'controller@example.com')
    expect(approved.history?.at(-1)).toMatchObject({ action: 'recovery:approved', amount: 1000 })
    const requested = withHistory(approved, startRecoveryRequest(approved, 1000, monday), 'controller@example.com')
    expect(requested.history?.at(-1)?.at).toBe(monday)
    const replied = withHistory(requested, recordVendorUpdate(requested, { status: 'partial_acceptance', note: 'Will return only part', amount: 800, at: monday + 1000 }), 'controller@example.com')
    expect(replied.history?.at(-1)).toMatchObject({ action: 'vendor:partial_acceptance', amount: 800, actor: 'controller@example.com' })
    const followed = withHistory(replied, { ...replied, nextFollowUpAt: monday + 5000 }, 'controller@example.com')
    expect(followed.history?.at(-1)).toMatchObject({ action: 'recovery:followup_changed', amount: null })
    const settled = withHistory(followed, verifyRecovery(followed, { amount: 1000, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: monday + 2000 }), 'controller@example.com')
    const reconciled = withHistory(settled, reconcileRecovery(settled, { note: 'Cleared overpayment', rootCause: 'Payment retry', at: monday + 3000 }), 'controller@example.com')
    expect(reconciled.history?.at(-1)?.action).toBe('accounting:reconciled')
    expect(reconciled.history?.at(-1)?.note).toContain('Cleared overpayment')
    const corrected = withHistory(reconciled, reconcileRecovery(reconciled, { note: 'Corrected clearing reference', rootCause: 'Payment retry', at: monday + 4000 }), 'controller@example.com')
    expect(corrected.history?.at(-1)?.action).toBe('accounting:corrected')
  })
})

describe('recovery method recommendation', () => {
  const record = (date: string, id: string): APRecord => ({
    id, importBatchId: 'batch', vendor: 'Acme Supply', invoiceNumber: id, invoiceDate: null,
    paymentDate: new Date(date), invoiceAmount: 100, amountPaid: 100, terms: null,
    bankAccountLast4: null, category: null, rowIndex: 1,
  })

  it('suggests a refund when repeat vendor activity is absent', () => {
    expect(recommendRecoveryMethod(caseFinding, [record('2026-01-01', 'a')]).method).toBe('refund')
  })

  it('suggests applying a credit when the ledger shows ongoing vendor activity', () => {
    const recommendation = recommendRecoveryMethod(caseFinding, [record('2026-08-01', 'a'), record('2026-09-01', 'b'), record('2026-09-18', 'c')], monday)
    expect(recommendation.method).toBe('credit')
    expect(recommendation.reason).toMatch(/payments/i)
  })

  it('does not suggest a credit from an old cluster of payments with no current activity', () => {
    const recommendation = recommendRecoveryMethod(caseFinding, [record('2025-01-01', 'a'), record('2025-02-01', 'b'), record('2025-03-01', 'c')], monday)
    expect(recommendation.method).toBe('refund')
  })
})
