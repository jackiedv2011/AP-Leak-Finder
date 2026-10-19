import { describe, expect, it } from 'vitest'
import { validSettlements as serverValidSettlements } from '../../server/billing.ts'
import { validSettlements } from '@/recovery/financials'

/** The success fee is billed from the server's copy of this rule; it must match what the workspace shows as recovered. */
describe('returned value: server billing and workspace agree', () => {
  const refund = (amount: number, reference: string) => ({ amount, method: 'refund', source: 'bank', reference, settledAt: 1 })
  const cases = [
    { recoverySettlements: [refund(10, 'A')] },
    { recoverySettlements: [{ amount: 10, method: 'credit', source: 'document', reference: 'CM', settledAt: 1 }] },
    { recoverySettlements: [{ amount: 10, method: 'credit', source: 'document', reference: 'CM', settledAt: 1, appliedToBill: '  ' }] },
    { recoverySettlements: [{ amount: 10, method: 'offset', source: 'accounting', reference: 'OF', settledAt: 1, appliedToBill: 'B-1' }] },
    { recoverySettlements: [{ amount: 0, method: 'refund', source: 'bank', reference: 'Z', settledAt: 1 }] },
    { recoverySettlements: [{ amount: 10, method: 'refund', source: 'bank', reference: '  ', settledAt: 1 }] },
    { recoverySettlements: [{ amount: 10, method: 'refund', source: 'rumour', reference: 'R', settledAt: 1 }] },
    { recoverySettlements: [{ amount: 10, method: 'refund', source: 'bank', reference: 'R', settledAt: 0 }] },
    { recoveryVerification: refund(5, 'LEGACY') },
    { recoverySettlements: [], recoveryVerification: refund(5, 'IGNORED') },
  ]
  it.each(cases.map((c, i) => [i, c] as const))('case %i', (_i, state) => {
    expect(serverValidSettlements(state as never)).toEqual(validSettlements(state as never))
  })
})
