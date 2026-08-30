import { describe, expect, it } from 'vitest'
import {
  confirmCase,
  isInFindingsQueue,
  isInRecoveryQueue,
  markExpected,
  markNeedsInfo,
  markRecoveryRequested,
  recordRecoveryOutcome,
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
