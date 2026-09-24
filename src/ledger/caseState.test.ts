import { describe, expect, it } from 'vitest'
import {
  confirmCase,
  isInFindingsQueue,
  isInRecoveryQueue,
  markExpected,
  markNeedsInfo,
  markRecoveryRequested,
  recordRecoveryOutcome,
  reopenDecision,
  reopenOutcome,
  validateRecoveredAmount,
  withHistory,
  queueGroupFor,
  updateCaseReason,
  updateDismissal,
  updateRecoveryDraft,
  updateRecoveryPackage,
  updateRequestedEvidence,
} from '@/ledger/caseState'
import type { Finding } from '@/types'

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1',
    type: 'amount_outlier',
    class: 'review',
    severity: 'medium',
    vendor: 'Acme',
    dollarImpact: 100,
    title: 'test',
    explanation: 'test',
    relatedRecords: [],
    ...overrides,
  }
}

describe('case-state transitions', () => {
  it('records an internal review closeout as an investigation with its note and no money event', () => {
    const confirmed = confirmCase('Bank details need checking')
    const filed = withHistory(confirmed, markRecoveryRequested(confirmed, 100), null, true)
    const closed = withHistory(filed, recordRecoveryOutcome(filed, 'not_recovered', null, 'Bank details confirmed internally'), null, true)
    expect(filed.history?.at(-1)).toMatchObject({ action: 'review:filed', summary: 'Internal review filed', amount: null })
    expect(closed.history?.at(-1)).toMatchObject({ action: 'review:closed', summary: 'Internal review closed', amount: null, note: 'Bank details confirmed internally' })
  })
  it('confirming a case puts it into the real recovery lifecycle', () => {
    const state = confirmCase('vendor confirmed')
    expect(state.decision).toBe('confirmed')
    expect(state.recoveryStage).toBe('confirmed')
    expect(isInFindingsQueue(state)).toBe(false)
    expect(isInRecoveryQueue(state)).toBe(true)
  })

  it('marking a case expected closes the finding without inventing a recovery outcome', () => {
    const state = markExpected('scheduled split payment')
    expect(state.decision).toBe('expected')
    expect(state.recoveryStage).toBeNull()
    expect(isInFindingsQueue(state)).toBe(false)
    expect(isInRecoveryQueue(state)).toBe(false)
  })

  it('needs-information keeps the case in the findings queue, not the recovery track', () => {
    const state = markNeedsInfo('waiting on vendor statement')
    expect(state.decision).toBe('needs_info')
    expect(state.recoveryStage).toBeNull()
    expect(isInFindingsQueue(state)).toBe(true)
    expect(isInRecoveryQueue(state)).toBe(false)
  })

  it('captures a structured dismissal reason alongside the freeform note', () => {
    const state = markExpected('vendor confirmed this was intentional', 'intentional')
    expect(state.decision).toBe('expected')
    expect(state.dismissalTag).toBe('intentional')
    expect(state.reason).toBe('vendor confirmed this was intentional')
  })

  it('defaults the dismissal tag to null when none is given', () => {
    const state = markExpected('no particular reason')
    expect(state.dismissalTag).toBeNull()
  })

  it('updates a dismissal reason without resetting the decision', () => {
    const dismissed = markExpected(null, 'other')
    const updated = updateDismissal(dismissed, 'detection_error', "actually it's a real bug in detection")
    expect(updated.decision).toBe('expected')
    expect(updated.dismissalTag).toBe('detection_error')
    expect(updated.reason).toBe("actually it's a real bug in detection")
    expect(updated.decidedAt).toBe(dismissed.decidedAt)
  })

  it('captures which evidence gaps a reviewer flagged as blocking', () => {
    const state = markNeedsInfo('need the vendor statement', ['Vendor statement'])
    expect(state.decision).toBe('needs_info')
    expect(state.requestedEvidence).toEqual(['Vendor statement'])
  })

  it('updates the requested-evidence checklist without resetting the decision', () => {
    const needsInfo = markNeedsInfo(null, ['Vendor statement'])
    const updated = updateRequestedEvidence(needsInfo, ['Vendor statement', 'Invoice copy'], 'both are missing')
    expect(updated.decision).toBe('needs_info')
    expect(updated.requestedEvidence).toEqual(['Vendor statement', 'Invoice copy'])
    expect(updated.reason).toBe('both are missing')
    expect(updated.decidedAt).toBe(needsInfo.decidedAt)
  })

  it('records an explicit request and then the verified money outcome', () => {
    let state = confirmCase(null)
    expect(state.recoveryStage).toBe('confirmed')
    state = markRecoveryRequested(state)
    expect(state.recoveryStage).toBe('requested')
    expect(state.recoveryRequestedAt).toBeTypeOf('number')
    state = recordRecoveryOutcome(state, 'recovered', 85, 'Credit memo CM-42')
    expect(state.recoveryStage).toBe('recovered')
    expect(state.recoveredAmount).toBe(85)
    expect(state.recoveryOutcomeNote).toBe('Credit memo CM-42')
  })

  it('can close a requested case without falsely recording recovered money', () => {
    const state = recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'not_recovered', 100, 'Vendor rejected the request')
    expect(state.recoveryStage).toBe('not_recovered')
    expect(state.recoveredAmount).toBeNull()
  })

  it('updates a decision note without resetting recovery progress or its timestamp', () => {
    const confirmed = markRecoveryRequested(confirmCase(null))
    const updated = updateCaseReason(confirmed, 'Verified against the vendor statement')

    expect(updated.reason).toBe('Verified against the vendor statement')
    expect(updated.recoveryStage).toBe('requested')
    expect(updated.decidedAt).toBe(confirmed.decidedAt)
  })

  it('stores edited recovery copy without changing case status', () => {
    const confirmed = confirmCase(null)
    const updated = updateRecoveryDraft(confirmed, 'Custom recovery request')

    expect(updated.recoveryDraft).toBe('Custom recovery request')
    expect(updated.decision).toBe('confirmed')
    expect(updated.recoveryStage).toBe('confirmed')
  })

  it('stores the editable subject, body, and requested resolution together', () => {
    const updated = updateRecoveryPackage(confirmCase(null), { subject: 'Invoice INV-1', body: 'Please review.', requestedResolution: 'credit' })
    expect(updated.recoverySubject).toBe('Invoice INV-1')
    expect(updated.recoveryDraft).toBe('Please review.')
    expect(updated.requestedResolution).toBe('credit')
  })

  it('an undecided case is grouped by finding class', () => {
    expect(queueGroupFor(finding({ class: 'recoverable' }), undefined)).toBe('claim')
    expect(queueGroupFor(finding({ class: 'review' }), undefined)).toBe('check')
    expect(queueGroupFor(finding({ class: 'opportunity' }), undefined)).toBe('prevent')
  })

  it('a needs-info decision always groups into needs-context, even for a recoverable-class finding', () => {
    const state = markNeedsInfo(null)
    expect(queueGroupFor(finding({ class: 'recoverable' }), state)).toBe('check')
  })
})

describe('changing your mind', () => {
  it('a decision can be taken back until a request is sent, keeping any notes typed so far', () => {
    const reopened = reopenDecision(updateRecoveryDraft(confirmCase('looks real'), 'Dear vendor…'))
    expect(reopened.decision).toBeNull()
    expect(reopened.recoveryStage).toBeNull()
    expect(reopened.reason).toBe('looks real')
    expect(reopened.recoveryDraft).toBe('Dear vendor…')
    expect(reopenDecision(markExpected('split')).decision).toBeNull()
  })

  it('once a request has gone out the decision is locked; only the outcome can be reopened', () => {
    const requested = markRecoveryRequested(confirmCase(null))
    expect(reopenDecision(requested)).toBe(requested)
    const recovered = recordRecoveryOutcome(requested, 'recovered', 300, 'CM-1')
    expect(reopenDecision(recovered)).toBe(recovered)
    const reopened = reopenOutcome(recovered)
    expect(reopened.recoveryStage).toBe('requested')
    expect(reopened.recoveredAmount).toBeNull()
    expect(reopened.recoveryOutcomeNote).toBeNull()
    expect(reopened.recoveryRequestedAt).toBe(requested.recoveryRequestedAt)
  })

  it('reopening an outcome does nothing to a case that has no outcome yet', () => {
    const confirmed = confirmCase(null)
    expect(reopenOutcome(confirmed)).toBe(confirmed)
  })

  it('a recorded outcome can be corrected: recovered → not recovered clears the money figure', () => {
    const recovered = recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'recovered', 300, null)
    const corrected = recordRecoveryOutcome(recovered, 'not_recovered', null, 'bounced')
    expect(corrected.recoveryStage).toBe('not_recovered')
    expect(corrected.recoveredAmount).toBeNull()
  })

  it('a recovered amount is never negative', () => {
    const state = recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'recovered', -50, null)
    expect(state.recoveredAmount).toBe(0)
  })
})

describe('partial recovery and the requested amount', () => {
  it('records what was asked for separately from what the finding supports', () => {
    const state = markRecoveryRequested(confirmCase(null), 600)
    expect(state.requestedAmount).toBe(600)
    expect(markRecoveryRequested(confirmCase(null)).requestedAmount).toBeNull()
  })

  it('a partial, full, or zero recovery is stored exactly as entered, with the method it came back as', () => {
    const requested = markRecoveryRequested(confirmCase(null), 1000)
    expect(recordRecoveryOutcome(requested, 'recovered', 400, null, 'credit')).toMatchObject({ recoveredAmount: 400, recoveredVia: 'credit' })
    expect(recordRecoveryOutcome(requested, 'recovered', 1000, null, 'refund')).toMatchObject({ recoveredAmount: 1000, recoveredVia: 'refund' })
    expect(recordRecoveryOutcome(requested, 'recovered', 0, 'nothing yet', null)).toMatchObject({ recoveredAmount: 0 })
    expect(recordRecoveryOutcome(requested, 'not_recovered', 400, null, 'refund')).toMatchObject({ recoveredAmount: null, recoveredVia: null })
  })

  it('validates recovered amounts: blank, junk, negative and over-the-request are rejected', () => {
    expect(validateRecoveredAmount('', 1000)).toMatch(/Enter the amount/)
    expect(validateRecoveredAmount('abc', 1000)).toMatch(/Enter the amount/)
    expect(validateRecoveredAmount('-5', 1000)).toMatch(/negative/)
    expect(validateRecoveredAmount('1000.01', 1000)).toMatch(/more than/)
    expect(validateRecoveredAmount('0', 1000)).toBeNull()
    expect(validateRecoveredAmount('$1,000.00', 1000)).toBeNull()
    expect(validateRecoveredAmount('999.99', 1000)).toBeNull()
  })
})

describe('audit trail', () => {
  const alice = 'alice@example.com'

  it('every transition appends one event with before/after, actor, and the money where it applies', () => {
    let state = withHistory({ decision: null, reason: null, decidedAt: null, recoveryStage: null }, confirmCase('looks real'), alice)
    state = withHistory(state, markRecoveryRequested(updateRecoveryPackage(state, { requestedResolution: 'credit' }), 750), alice)
    state = withHistory(state, recordRecoveryOutcome(state, 'recovered', 500, 'CM-7', 'credit'), alice)
    const history = state.history!
    expect(history.map((e) => e.action)).toEqual(['decision:confirmed', 'stage:requested', 'outcome:recovered'])
    expect(history[0]).toMatchObject({ from: { decision: null, recoveryStage: null }, to: { decision: 'confirmed', recoveryStage: 'confirmed' }, note: 'looks real', actor: alice })
    expect(history[1]).toMatchObject({ amount: 750, method: 'credit', to: { recoveryStage: 'requested' } })
    expect(history[2]).toMatchObject({ amount: 500, method: 'credit', note: 'CM-7', from: { recoveryStage: 'requested' }, to: { recoveryStage: 'recovered' } })
    for (const e of history) expect(e.at).toBeTypeOf('number')
  })

  it('reopenings are on the record too, and a no-op change adds nothing', () => {
    let state = withHistory({ decision: null, reason: null, decidedAt: null, recoveryStage: null }, markExpected('split'), null)
    state = withHistory(state, reopenDecision(state), null)
    expect(state.history!.map((e) => e.action)).toEqual(['decision:expected', 'decision:reopened'])
    expect(state.history![1].actor).toBeNull()
    const same = withHistory(state, updateCaseReason(state, 'new note'), null)
    expect(same.history).toHaveLength(2)
    let done = withHistory(state, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null), 100), 'not_recovered', null, null), null)
    done = withHistory(done, reopenOutcome(done), null)
    expect(done.history!.at(-1)!.action).toBe('outcome:reopened')
  })

  it('correcting a recovered amount is recorded as a separate event', () => {
    let state = withHistory({ decision: null, reason: null, decidedAt: null, recoveryStage: null }, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null), 100), 'recovered', 60, null), null)
    state = withHistory(state, recordRecoveryOutcome(state, 'recovered', 80, null), null)
    expect(state.history!.at(-1)).toMatchObject({ action: 'outcome:amount_changed', amount: 80 })
  })
})
