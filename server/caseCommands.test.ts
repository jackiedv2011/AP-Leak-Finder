// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './db.ts'
import { ProjectStore } from './projectStore.ts'
import { CaseCommands } from './caseCommands.ts'
import { authorizedProject } from './testProject.ts'
import type { CaseState } from '../src/ledger/caseState.ts'

describe('server case commands', () => {
  it('archives a sent request and requires a separate review with a reduced ceiling', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('alice', 'alice@example.test', 1)
    const projects = new ProjectStore(db, null)
    const commands = new CaseCommands(db, projects)
    const { project, findingId } = authorizedProject('generations', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 100 })
    const evidence = project.environment.result.findings[0].evidence
    Object.assign(project.environment.caseStates[findingId], {
      requiresRevalidation: true, decision: 'confirmed', recoveryStage: 'requested', recoveryRequestedAt: 100, legacyApprovedAt: 90,
      recoverySettlements: [{ amount: 30, method: 'refund', source: 'manual', reference: 'OLD-30', settledAt: 101 }],
    })
    projects.upsert('alice', project)
    const send = (type: string, input: unknown, expectedRevision: number, commandId = randomUUID()) =>
      commands.execute('alice', 'alice@example.test', 'generations', { commandId, expectedRevision, findingId, type, input })
    const archiveId = randomUUID()
    const archived = send('begin_new_request_review', { acknowledged: true }, 1, archiveId)
    expect(send('begin_new_request_review', { acknowledged: true }, 1, archiveId)).toMatchObject({ replayed: true, revision: 2 })
    expect(() => send('begin_new_request_review', { acknowledged: true }, 1)).toThrow(/another device/i)
    expect(() => commands.execute('bob', 'bob@example.test', 'generations', { commandId: randomUUID(), expectedRevision: 2, findingId, type: 'begin_new_request_review', input: { acknowledged: true } })).toThrow(/not in this account/i)
    const state = (archived.project.environment as { caseStates: Record<string, CaseState> }).caseStates[findingId]
    expect(state).toMatchObject({ activeRequestGeneration: 2, approvedAt: null, requestedAmount: null, decision: null })
    expect(state.archivedRequests?.[0]).toMatchObject({ generation: 1, requestedAmount: 100, returnedAmountAtArchive: 30, legacyApprovedAt: 90 })
    const pkg = { subject: 'New request', body: 'Please review.', recipientEmail: 'supplier@example.test', recipientConfirmed: true, requestedAmount: 70, method: 'refund' }
    expect(() => send('decision', { decision: 'confirmed', reason: 'Too early' }, 2)).toThrow(/fresh evidence/i)
    expect(() => send('approve', { package: pkg, knownBeforeReclaim: false, knownBeforeNote: null }, 2)).toThrow()
    send('evidence', evidence, 2)
    send('decision', { decision: 'confirmed', reason: 'Reviewed again' }, 3)
    expect(() => send('approve', { package: { ...pkg, requestedAmount: 71 }, knownBeforeReclaim: false, knownBeforeNote: null }, 4)).toThrow(/earlier returns/i)
    send('approve', { package: pkg, knownBeforeReclaim: false, knownBeforeNote: null }, 4)
    send('request', pkg, 5)
    const late = send('historical_settlement', { generation: 1, amount: 10, method: 'refund', source: 'manual', reference: 'OLD-LATE', settledAt: 102 }, 6)
    const current = (late.project.environment as { caseStates: Record<string, CaseState> }).caseStates[findingId]
    expect(current).toMatchObject({ activeRequestGeneration: 2, requestedAmount: 70, recoveredAmount: 40 })
    expect(current.contactHold).toMatch(/earlier request/i)
    expect(() => send('historical_settlement', { generation: 1, amount: 10, method: 'refund', source: 'manual', reference: 'OLD-LATE', settledAt: 102 }, 7)).toThrow(/already recorded/i)
    db.close()
  })

  it('quarantines existing approvals as legacy assertions without losing their history', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('alice', 'alice@example.test', 1)
    const projects = new ProjectStore(db, null)
    const { project, findingId } = authorizedProject('legacy', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 100 })
    projects.upsert('alice', project)
    const commands = new CaseCommands(db, projects)
    expect(commands.migrateLegacy()).toBe(1)
    const state = ((projects.get('alice', 'legacy')!.environment as { caseStates: Record<string, { approvedAt: number | null; legacyApprovedAt?: number; requiresRevalidation?: boolean }> }).caseStates[findingId])
    expect(state).toMatchObject({ approvedAt: null, legacyApprovedAt: 100, requiresRevalidation: true })
    expect(commands.migrateLegacy()).toBe(0)
    expect(db.prepare('SELECT action, actor FROM case_events').all()).toEqual([{ action: 'legacy_assertion', actor: null }])
    db.close()
  })

  it('refuses a fresh approval or request while a case still needs revalidation', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('alice', 'alice@example.test', 1)
    const projects = new ProjectStore(db, null)
    const commands = new CaseCommands(db, projects)
    const { project, findingId } = authorizedProject('stale', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 100 })
    Object.assign(project.environment.caseStates[findingId], { requiresRevalidation: true, decision: 'confirmed', reason: null, decidedAt: 100 })
    projects.upsert('alice', project)
    const send = (type: 'approve' | 'request', input: unknown) => commands.execute('alice', 'alice@example.test', 'stale', {
      commandId: randomUUID(), expectedRevision: 1, findingId, type, input,
    })
    const pkg = { subject: 'Duplicate payment', body: 'Please review the payments.', recipientEmail: 'supplier@example.test', recipientConfirmed: true, requestedAmount: 100, method: 'refund' }
    expect(() => send('approve', { package: pkg, knownBeforeReclaim: false, knownBeforeNote: null })).toThrow(/revalidat/i)
    expect(() => send('request', { requestedAmount: 100 })).toThrow(/revalidat/i)
    db.close()
  })

  it('blocks manual follow-up records and reminders on a historical sent request while preserving replies', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('alice', 'alice@example.test', 1)
    const projects = new ProjectStore(db, null)
    const commands = new CaseCommands(db, projects)
    const { project, findingId } = authorizedProject('old-request', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 100 })
    Object.assign(project.environment.caseStates[findingId], { requiresRevalidation: true, recoveryStage: 'requested', recoveryRequestedAt: 100 })
    projects.upsert('alice', project)
    const run = (type: 'vendor_update' | 'followup' | 'followup_days' | 'settlement' | 'close', input: unknown, expectedRevision = 1) => commands.execute('alice', 'alice@example.test', 'old-request', {
      commandId: randomUUID(), expectedRevision, findingId, type, input,
    })
    expect(() => run('vendor_update', { status: 'followed_up', note: 'Sent another email', at: 101 })).toThrow(/historical request/i)
    expect(() => run('followup', { at: 200 })).toThrow(/historical request/i)
    expect(() => run('followup_days', { days: 7 })).toThrow(/historical request/i)
    expect(run('vendor_update', { status: 'acknowledged', note: 'Vendor replied to the original request', at: 101 }).revision).toBe(2)
    expect(run('settlement', { amount: 25, method: 'refund', source: 'manual', reference: 'ACH-OLD-1', settledAt: 101 }, 2).revision).toBe(3)
    expect(run('close', { reason: 'Original request resolved; remaining amount needs fresh review' }, 3).revision).toBe(4)
    db.close()
  })

  it('owns transitions and amounts, rejects stale and cross-account writes, and replays a command once', () => {
    const db = openDatabase(':memory:')
    const addUser = db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
    addUser.run('alice', 'alice@example.test', 1)
    addUser.run('bob', 'bob@example.test', 1)
    const projects = new ProjectStore(db, null)
    const commands = new CaseCommands(db, projects)
    const { project, findingId } = authorizedProject('audit1', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 100 })
    const evidence = project.environment.result.findings[0].evidence
    delete (project.environment.result.findings[0] as { evidence?: unknown }).evidence
    project.environment.caseStates = {}
    expect(projects.upsert('alice', project)).toBe(1)
    const send = (type: string, input: unknown, expectedRevision: number, commandId = randomUUID()) =>
      commands.execute('alice', 'alice@example.test', 'audit1', { commandId, expectedRevision, findingId, type, input })

    const decision = send('decision', { decision: 'confirmed', reason: 'I reviewed the two rows.' }, 1)
    expect(decision.revision).toBe(2)
    const pkg = { subject: 'Duplicate payment', body: 'Please review the two payments.', recipientEmail: 'supplier@example.test', recipientConfirmed: true, requestedAmount: 100, method: 'refund' }
    expect(() => send('approve', { package: pkg, knownBeforeReclaim: false, knownBeforeNote: null }, 2)).toThrow(/complete the evidence review/i)
    const evidenceSaved = send('evidence', evidence, 2)
    expect(evidenceSaved.revision).toBe(3)
    for (const input of [{ ...pkg, recipientConfirmed: false }, { ...pkg, recipientEmail: '' }]) {
      expect(() => send('approve', { package: input, knownBeforeReclaim: false, knownBeforeNote: null }, 3)).toThrow(/malformed/i)
    }
    expect(() => send('approve', { package: { ...pkg, requestedAmount: 101 }, knownBeforeReclaim: false, knownBeforeNote: null }, 3)).toThrow(/evidenced|within/i)
    const approval = send('approve', { package: pkg, knownBeforeReclaim: false, knownBeforeNote: null }, 3)
    expect(approval.revision).toBe(4)
    expect(() => send('request', { ...pkg, evidenceAttachment: 'Changed after approval' }, 4)).toThrow(/approve the exact request/i)
    const id = randomUUID()
    const request = send('request', pkg, 4, id)
    expect(request.revision).toBe(5)
    expect(send('request', pkg, 4, id)).toMatchObject({ revision: 5, replayed: true })
    expect(() => send('settlement', { amount: 10, method: 'refund', source: 'manual', reference: 'RETURN-1', settledAt: Date.now() }, 4)).toThrow(/another device/i)
    expect(() => commands.execute('bob', 'bob@example.test', 'audit1', { commandId: randomUUID(), expectedRevision: 5, findingId, type: 'settlement', input: { amount: 100, method: 'refund', source: 'manual', reference: 'RETURN-1', settledAt: Date.now() } })).toThrow(/not in this account/i)
    const paid = send('settlement', { amount: 100, method: 'refund', source: 'manual', reference: 'RETURN-1', settledAt: Date.now() }, 5)
    expect(paid.revision).toBe(6)
    expect(((paid.project.environment as { caseStates: Record<string, { recoveredAmount?: number }> }).caseStates[findingId]).recoveredAmount).toBe(100)
    expect(() => send('settlement', { amount: 100, method: 'refund', source: 'manual', reference: 'RETURN-1', settledAt: Date.now() }, 6)).toThrow()
    expect(db.prepare('SELECT action, actor, prior_revision, revision FROM case_events ORDER BY revision').all()).toEqual([
      { action: 'decision', actor: 'alice@example.test', prior_revision: 1, revision: 2 },
      { action: 'evidence', actor: 'alice@example.test', prior_revision: 2, revision: 3 },
      { action: 'approve', actor: 'alice@example.test', prior_revision: 3, revision: 4 },
      { action: 'request', actor: 'alice@example.test', prior_revision: 4, revision: 5 },
      { action: 'settlement', actor: 'alice@example.test', prior_revision: 5, revision: 6 },
    ])
    db.close()
  })
})
