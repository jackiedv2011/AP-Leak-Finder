import { expect, it } from 'vitest'
import { confirmCase, recordRecoveryOutcome, reopenOutcome, withHistory } from '@/ledger/caseState'
import { approveRecovery, closeWithoutRecovery, reconcileRecovery, recordVendorUpdate, reopenRemainingBalance, startRecoveryRequest, verifyRecovery } from './model'
import { recoveryLedger } from './ledger'

it('does not invent a return or closed balance for a legacy recovered status with no amount', () => {
  const state = { ...confirmCase(null), recoveryStage: 'recovered' as const, requestedAmount: 1000, recoveredAmount: null, recoveryResolvedAt: 500 }
  expect(recoveryLedger(state).filter((event) => event.kind === 'returned' || event.kind === 'unreturned_closed')).toEqual([])
})

it('keeps claimed, vendor-promised, unapplied-credit, and settled amounts separate', () => {
  let state = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  state = recordVendorUpdate(state, { status: 'promised', note: 'Will credit account', amount: 800, at: 300 })
  state = recordVendorUpdate(state, { status: 'credit_issued', note: 'CM-7', amount: 800, at: 400 })
  const pending = recoveryLedger(state)
  expect(pending.filter((event) => event.kind === 'returned')).toHaveLength(0)
  expect(pending.find((event) => event.kind === 'credit_issued')?.amount).toBe(800)
  state = verifyRecovery(state, { amount: 600, method: 'credit', source: 'accounting', reference: 'CM-7', appliedToBill: 'BILL-9', settledAt: 500 })
  expect(recoveryLedger(state).find((event) => event.kind === 'returned')).toMatchObject({ amount: 600, reference: 'CM-7' })
  state = verifyRecovery(state, { amount: 400, method: 'refund', source: 'bank', reference: 'ACH-8', settledAt: 600 })
  expect(recoveryLedger(state).filter((event) => event.kind === 'returned')).toMatchObject([
    { amount: 600, reference: 'CM-7' },
    { amount: 400, reference: 'ACH-8' },
  ])
})

it('keeps a legacy settlement visible when a later settlement has an activity event', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const legacyProof = { amount: 300, method: 'refund' as const, source: 'bank' as const, reference: 'ACH-OLD', settledAt: 300 }
  const legacy = { ...requested, recoveredAmount: 300, recoveryVerification: legacyProof, recoverySettlements: null }
  const final = withHistory(legacy, verifyRecovery(legacy, { amount: 700, method: 'refund', source: 'bank', reference: 'ACH-NEW', settledAt: 400 }), null)
  expect(recoveryLedger(final).filter((entry) => entry.kind === 'returned')).toMatchObject([
    { amount: 300, reference: 'ACH-OLD' },
    { amount: 700, reference: 'ACH-NEW' },
  ])
})

it('retains an earlier recorded return and its reversal after a legacy outcome is corrected', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const returned = withHistory(requested, recordRecoveryOutcome(requested, 'recovered', 1000, 'Bank refund'), null)
  const corrected = withHistory(returned, reopenOutcome(returned), null)
  expect(recoveryLedger(corrected).filter((entry) => entry.kind === 'returned' || entry.kind === 'reversed')).toMatchObject([
    { kind: 'returned', amount: 1000 },
    { kind: 'reversed', amount: -1000 },
  ])
})

it('retains a legacy proof and its reversal after reopening the outcome', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const proof = { amount: 1000, method: 'refund' as const, source: 'bank' as const, reference: 'ACH-OLD', settledAt: 300 }
  const legacy = { ...requested, recoveryStage: 'recovered' as const, recoveredAmount: 1000, recoveryVerification: proof, recoverySettlements: null }
  const reopened = withHistory(legacy, reopenOutcome(legacy), null)
  expect(recoveryLedger(reopened).filter((entry) => entry.kind === 'returned' || entry.kind === 'reversed')).toMatchObject([
    { kind: 'returned', amount: 1000, reference: 'ACH-OLD' },
    { kind: 'reversed', amount: -1000 },
  ])
})

it('distinguishes vendor agreement and a reported refund from a settled return', () => {
  let state = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  state = recordVendorUpdate(state, { status: 'acknowledged', note: 'Reviewing', at: 300 })
  state = recordVendorUpdate(state, { status: 'partial_acceptance', note: 'Agreed to 400', amount: 400, at: 400 })
  state = recordVendorUpdate(state, { status: 'already_refunded', note: 'Says ACH sent', amount: 400, at: 500 })
  expect(recoveryLedger(state).filter((event) => ['acknowledged', 'vendor_agreed', 'refund_reported', 'returned'].includes(event.kind))).toMatchObject([
    { kind: 'acknowledged', amount: null },
    { kind: 'vendor_agreed', amount: 400 },
    { kind: 'refund_reported', amount: 400 },
  ])
})

it('records the remaining claim when the vendor accepts it without repeating the amount', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const partial = verifyRecovery(requested, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 })
  const accepted = recordVendorUpdate(partial, { status: 'accepted', note: 'We accept the balance', at: 400 })
  expect(recoveryLedger(accepted).find((event) => event.kind === 'vendor_agreed')).toMatchObject({ amount: 700 })
})

it('keeps a corrected settlement and its reversal visible in the financial ledger', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const settled = withHistory(requested, verifyRecovery(requested, { amount: 1000, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 }), null)
  const reopened = withHistory(settled, reopenOutcome(settled), null)
  expect(reopened.recoveredAmount).toBeNull()
  expect(recoveryLedger(reopened).filter((event) => event.kind === 'returned' || event.kind === 'reversed')).toMatchObject([
    { kind: 'returned', amount: 1000, reference: 'ACH-1' },
    { kind: 'reversed', amount: -1000, reference: 'Prior recorded return reversed' },
  ])
})

it('shows an explicitly closed unpaid balance separately from returned value', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const partial = withHistory(requested, verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 }), null)
  const closed = withHistory(partial, closeWithoutRecovery(partial, 'Vendor refused the rest', 400), null)
  expect(recoveryLedger(closed).filter((event) => event.kind === 'returned' || event.kind === 'unreturned_closed')).toMatchObject([
    { kind: 'returned', amount: 600 },
    { kind: 'unreturned_closed', amount: 400, reference: 'Vendor refused the rest' },
  ])
})

it('shows a closed remainder being reopened without reversing the valid return', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const partial = withHistory(requested, verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 }), null)
  const closed = withHistory(partial, closeWithoutRecovery(partial, 'Vendor refused the rest', 400), null)
  const reopened = withHistory(closed, reopenRemainingBalance(closed, 500), null)
  expect(recoveryLedger(reopened).filter((event) => ['returned', 'reversed', 'unreturned_closed', 'balance_reopened'].includes(event.kind))).toMatchObject([
    { kind: 'returned', amount: 600 },
    { kind: 'unreturned_closed', amount: 400 },
    { kind: 'balance_reopened', amount: -400 },
  ])
})

it('reopens a fully unpaid balance without claiming a return was reversed', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const closed = withHistory(requested, closeWithoutRecovery(requested, 'Vendor could not locate the payment', 300), null)
  expect(closed.history?.at(-1)?.at).toBe(300)
  const reopened = withHistory(closed, reopenOutcome(closed), null)
  expect(recoveryLedger(reopened).filter((entry) => ['unreturned_closed', 'balance_reopened', 'reversed'].includes(entry.kind))).toMatchObject([
    { kind: 'unreturned_closed', amount: 1000 },
    { kind: 'balance_reopened', amount: -1000 },
  ])
})

it('preserves a legacy unpaid closure when it is reopened', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const legacy = { ...requested, recoveryStage: 'not_recovered' as const, recoveryResolvedAt: 300, recoveryOutcomeNote: 'Vendor disputed it' }
  const reopened = withHistory(legacy, reopenOutcome(legacy), null)
  expect(recoveryLedger(reopened).filter((entry) => ['unreturned_closed', 'balance_reopened'].includes(entry.kind))).toMatchObject([
    { kind: 'unreturned_closed', amount: 1000, reference: 'Vendor disputed it' },
    { kind: 'balance_reopened', amount: -1000 },
  ])
})

it('reads an older reopen event that stored zero instead of the closed balance', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const closed = withHistory(requested, closeWithoutRecovery(requested, 'Vendor declined', 300), null)
  const corrected = withHistory(closed, reopenOutcome(closed), null)
  const older = { ...corrected, history: corrected.history?.map((event) => event.action === 'outcome:reopened' ? { ...event, amount: 0 } : event) }
  expect(recoveryLedger(older).filter((entry) => entry.kind === 'balance_reopened')).toMatchObject([{ amount: -1000 }])
})

it('reopens the unpaid remainder when a partially returned outcome is corrected', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const partial = withHistory(requested, verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 }), null)
  const closed = withHistory(partial, closeWithoutRecovery(partial, 'Vendor refused the balance', 400), null)
  const corrected = withHistory(closed, reopenOutcome(closed), null)
  expect(recoveryLedger(corrected).filter((entry) => ['returned', 'reversed', 'unreturned_closed', 'balance_reopened'].includes(entry.kind))).toMatchObject([
    { kind: 'returned', amount: 600 },
    { kind: 'unreturned_closed', amount: 400 },
    { kind: 'balance_reopened', amount: -400 },
    { kind: 'reversed', amount: -600 },
  ])
})

it('keeps both sides of a legacy partial close when its return is corrected', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const proof = { amount: 600, method: 'refund' as const, source: 'bank' as const, reference: 'ACH-OLD', settledAt: 300 }
  const legacy = { ...requested, recoveryStage: 'recovered' as const, recoveredAmount: 600, recoveryVerification: proof, recoverySettlements: null, recoveryResolvedAt: 400, recoveryOutcomeNote: 'Vendor declined the rest' }
  const corrected = withHistory(legacy, reopenOutcome(legacy), null)
  expect(recoveryLedger(corrected).filter((entry) => ['returned', 'reversed', 'unreturned_closed', 'balance_reopened'].includes(entry.kind))).toMatchObject([
    { kind: 'returned', amount: 600, reference: 'ACH-OLD' },
    { kind: 'unreturned_closed', amount: 400 },
    { kind: 'balance_reopened', amount: -400 },
    { kind: 'reversed', amount: -600 },
  ])
})

it('preserves the original reconciliation and its later correction', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false, at: 100 }), 1000, 200)
  const settled = withHistory(requested, verifyRecovery(requested, { amount: 1000, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 }), null)
  const reconciled = withHistory(settled, reconcileRecovery(settled, { note: 'Original entry', rootCause: 'Payment retry', at: 400 }), null)
  const corrected = withHistory(reconciled, reconcileRecovery(reconciled, { note: 'Corrected entry', rootCause: 'Payment retry', at: 500 }), null)
  expect(recoveryLedger(corrected).filter((event) => event.kind === 'reconciled' || event.kind === 'reconciliation_corrected')).toMatchObject([
    { kind: 'reconciled', reference: 'Original entry' },
    { kind: 'reconciliation_corrected', reference: 'Corrected entry' },
  ])
})
