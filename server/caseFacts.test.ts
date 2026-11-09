// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { authorizedFollowUpFacts, authorizedSendFacts } from './caseFacts.ts'
import { authorizedProject } from './testProject.ts'

describe('authorized request generations', () => {
  it('uses old returns for the new approval ceiling and active returns for follow-up', () => {
    const { project, findingId } = authorizedProject('new-generation', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 70 })
    const state = project.environment.caseStates[findingId] as typeof project.environment.caseStates[typeof findingId] & Record<string, unknown>
    Object.assign(state, {
      activeRequestGeneration: 2,
      recoverySubject: 'Fresh request', recoveryDraft: 'Please review.', recoveryRecipientEmail: 'vendor@example.test',
      recoverySettlements: [{ amount: 30, method: 'refund', source: 'manual', reference: 'OLD-30', settledAt: 10 }],
    })
    expect(authorizedSendFacts(project, findingId, 70).ok).toBe(true)
    state.recoveryStage = 'requested'
    expect(authorizedFollowUpFacts(project, findingId).ok).toBe(true)
    state.recoveryStage = 'confirmed'
    ;(state.recoverySettlements as Array<Record<string, unknown>>).push({ amount: 10, method: 'refund', source: 'manual', reference: 'OLD-LATE', settledAt: 20, requestGeneration: 1 })
    expect(authorizedSendFacts(project, findingId, 70)).toMatchObject({ ok: false, reason: expect.stringMatching(/earlier returns/i) })
  })
})
