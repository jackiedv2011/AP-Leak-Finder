import { describe, expect, it } from 'vitest'
import {
  advanceRecoveryStage,
  confirmCase,
  isInFindingsQueue,
  isInRecoveryQueue,
  markExpected,
  markNeedsInfo,
  queueGroupFor,
  updateCaseReason,
  updateRecoveryDraft,
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
  it('confirming a case puts it straight into the recovery track at "ready to prepare"', () => {
    const state = confirmCase('vendor confirmed')
    expect(state.decision).toBe('confirmed')
    expect(state.recoveryStage).toBe('ready_to_prepare')
    expect(isInFindingsQueue(state)).toBe(false)
    expect(isInRecoveryQueue(state)).toBe(true)
  })

  it('marking a case expected resolves it immediately without a recovery track', () => {
    const state = markExpected('scheduled split payment')
    expect(state.decision).toBe('expected')
    expect(state.recoveryStage).toBe('resolved')
    expect(isInFindingsQueue(state)).toBe(false)
    expect(isInRecoveryQueue(state)).toBe(true)
  })

  it('needs-information keeps the case in the findings queue, not the recovery track', () => {
    const state = markNeedsInfo('waiting on vendor statement')
    expect(state.decision).toBe('needs_info')
    expect(state.recoveryStage).toBeNull()
    expect(isInFindingsQueue(state)).toBe(true)
    expect(isInRecoveryQueue(state)).toBe(false)
  })

  it('advances through the recovery stages in order and stops at resolved', () => {
    let state = confirmCase(null)
    expect(state.recoveryStage).toBe('ready_to_prepare')
    state = advanceRecoveryStage(state)
    expect(state.recoveryStage).toBe('ready_to_contact')
    state = advanceRecoveryStage(state)
    expect(state.recoveryStage).toBe('awaiting_response')
    state = advanceRecoveryStage(state)
    expect(state.recoveryStage).toBe('resolved')
    state = advanceRecoveryStage(state)
    expect(state.recoveryStage).toBe('resolved')
  })

  it('updates a decision note without resetting recovery progress or its timestamp', () => {
    const confirmed = advanceRecoveryStage(confirmCase(null))
    const updated = updateCaseReason(confirmed, 'Verified against the vendor statement')

    expect(updated.reason).toBe('Verified against the vendor statement')
    expect(updated.recoveryStage).toBe('ready_to_contact')
    expect(updated.decidedAt).toBe(confirmed.decidedAt)
  })

  it('stores edited recovery copy without changing case status', () => {
    const confirmed = confirmCase(null)
    const updated = updateRecoveryDraft(confirmed, 'Custom recovery request')

    expect(updated.recoveryDraft).toBe('Custom recovery request')
    expect(updated.decision).toBe('confirmed')
    expect(updated.recoveryStage).toBe('ready_to_prepare')
  })

  it('an undecided case is grouped by finding class', () => {
    expect(queueGroupFor(finding({ class: 'recoverable' }), undefined)).toBe('ready_to_verify')
    expect(queueGroupFor(finding({ class: 'review' }), undefined)).toBe('needs_context')
    expect(queueGroupFor(finding({ class: 'opportunity' }), undefined)).toBe('worth_noting')
  })

  it('a needs-info decision always groups into needs-context, even for a recoverable-class finding', () => {
    const state = markNeedsInfo(null)
    expect(queueGroupFor(finding({ class: 'recoverable' }), state)).toBe('needs_context')
  })
})
