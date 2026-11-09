import { describe, expect, it } from 'vitest'
import type { CaseState } from '@/ledger/caseState'
import { activeReturned, authorizedOutstanding, verifiedReturned } from './financials'

describe('request generation balances', () => {
  it('counts prior returns once in the case total but excludes them from a new request balance', () => {
    const state = {
      decision: 'confirmed', reason: null, decidedAt: 1, recoveryStage: 'requested',
      approvedAt: 2, requestedAmount: 80, activeRequestGeneration: 2,
      recoverySettlements: [
        { amount: 20, method: 'refund', source: 'manual', reference: 'OLD-ACH', settledAt: 3 },
        { amount: 10, method: 'refund', source: 'manual', reference: 'NEW-ACH', settledAt: 4, requestGeneration: 2 },
      ],
    } as CaseState
    expect(verifiedReturned(state)).toBe(30)
    expect(authorizedOutstanding(state)).toBe(70)
    const lateOldReturn: CaseState = { ...state, recoverySettlements: [...state.recoverySettlements!, { amount: 5, method: 'refund', source: 'manual', reference: 'LATE-OLD-ACH', settledAt: 5, requestGeneration: 1 }] }
    expect(verifiedReturned(lateOldReturn)).toBe(35)
    expect(activeReturned(lateOldReturn)).toBe(10)
    expect(authorizedOutstanding(lateOldReturn)).toBe(70)
  })
})
