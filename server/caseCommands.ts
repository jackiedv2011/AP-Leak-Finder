import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { HttpError } from './http.ts'
import type { ProjectStore } from './projectStore.ts'
import { confirmCase, markExpected, markNeedsInfo, recordEvidenceReview, reopenDecision, reopenOutcome, updateRecoveryPackage, withHistory, type CaseState, type RecoveryVerification, type VendorUpdate } from '../src/ledger/caseState.ts'
import { approveRecovery, beginNewRequestReview, closeWithoutRecovery, recordEmailSent, recordFollowUpSent, recordHistoricalSettlement, recordVendorUpdate, reconcileRecovery, reopenRemainingBalance, setContactHold, setFollowUpAfterDays, setNextFollowUp, startRecoveryRequest, verifyRecovery } from '../src/recovery/model.ts'
import { activeReturned, validSettlements, verifiedReturned } from '../src/recovery/financials.ts'
import { assertRecoveryEligible, evaluateEligibility, type RecoveryEvidence } from '../src/recovery/eligibility.ts'
import type { Finding } from '../src/types.ts'

const text = z.string().trim().max(5000)
const money = z.number().finite().positive().refine((n) => Number.isSafeInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 0.000001)
const method = z.enum(['refund', 'credit', 'offset'])
const packageSchema = z.object({ subject: text.min(1).max(300).refine((value) => !/[\r\n]/.test(value)), body: text.min(1), evidenceAttachment: text.min(1).nullable().optional(), recipientEmail: z.email().max(320), recipientConfirmed: z.literal(true), requestedAmount: money, method })
const reference = z.object({ reference: text.min(1).max(300) })
const evidenceSchema = z.object({
  entity: reference.extend({ entityId: text.min(1).max(150) }),
  supplier: reference.extend({ supplierId: text.min(1).max(150), contact: z.object({ email: text.max(320).pipe(z.email()), source: z.enum(['supplier_record', 'document']), reference: text.min(1).max(300) }).optional() }),
  payments: z.array(reference.extend({ recordId: text.min(1).max(150), paymentId: text.min(1).max(150), obligationId: text.min(1).max(150), amountMinor: z.number().int().positive(), currency: z.string().length(3), settled: z.boolean() })).min(2).max(30),
  obligation: reference.extend({ obligationId: text.min(1).max(150), amountMinor: z.number().int().positive(), currency: z.string().length(3) }),
  checks: z.record(z.string(), z.object({ reference: text, confirmed: z.boolean() })),
  priorReturns: z.array(reference.extend({ method: z.enum(['refund', 'credit']), amountMinor: z.number().int().positive(), appliedToBill: text.max(300).optional() })).max(30).optional(),
  contradictions: z.array(text.max(300)).max(30),
  notes: text,
})
const commandSchema = z.object({
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  findingId: z.string().min(1).max(150),
  type: z.enum(['decision', 'evidence', 'approve', 'approve_and_request', 'request', 'email_sent', 'followup_sent', 'followup_days', 'contact_hold', 'followup', 'vendor_update', 'settlement', 'historical_settlement', 'begin_new_request_review', 'close', 'reconcile', 'reopen', 'reopen_balance']),
  input: z.unknown(),
})
type Command = z.infer<typeof commandSchema>
type StoredEnvironment = { records?: Array<Record<string, unknown> & { id: string }>; result?: { findings?: Array<Record<string, unknown> & { id: string }> }; caseStates?: Record<string, CaseState>; historicalFindings?: unknown[] }
type EventRow = { command_hash: string; revision: number }

function factFinding(env: StoredEnvironment, findingId: string): Finding | null {
  const row = env.result?.findings?.find((f) => f.id === findingId)
  if (!row) return null
  const records = new Map((env.records ?? []).map((record) => [record.id, record]))
  return { ...row, relatedRecords: ((row.relatedRecords as Array<{ id: string }>) ?? []).map((ref) => records.get(ref.id) ?? ref) } as unknown as Finding
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new HttpError(400, 'The case command is malformed.', 'validation')
  return result.data
}

function applyCommand(db: DatabaseSync, userId: string, projectId: string, project: Record<string, unknown>, cmd: Command, actor: string, at: number): { project: Record<string, unknown>; sourceRefs: string[] } {
  const env = project.environment as StoredEnvironment | undefined
  const finding = env && factFinding(env, cmd.findingId)
  if (!env || !finding) throw new HttpError(404, 'That case is not in this account.')
  const states = env.caseStates ?? {}
  const prior = states[cmd.findingId] ?? { decision: null, reason: null, decidedAt: null, recoveryStage: null }
  const requestChange = ['decision', 'evidence', 'approve', 'approve_and_request', 'request', 'reopen'].includes(cmd.type)
  const priorGeneration = prior.activeRequestGeneration ?? 1
  if (requestChange && prior.recoveryStage === 'confirmed' &&
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gmail_sends'").get()) {
    const send = db.prepare("SELECT status FROM gmail_sends WHERE user_id = ? AND project_id = ? AND finding_id = ? AND generation = ? AND status IN ('sending', 'sent')")
      .get(userId, projectId, cmd.findingId, priorGeneration)
    if (send) throw new HttpError(409, 'A Gmail send is in progress or has a receipt waiting to be recorded. Check the send before changing the request.', 'gmail_receipt_pending')
  }
  if (prior.requiresRevalidation && (cmd.type === 'approve' || cmd.type === 'approve_and_request' || cmd.type === 'request')) {
    throw new HttpError(409, 'Revalidate the case evidence before approving or recording another request.', 'revalidation_required')
  }
  if (prior.requiresRevalidation && (cmd.type === 'followup' || cmd.type === 'followup_days')) {
    throw new HttpError(409, 'Review the historical request before scheduling another supplier follow-up.', 'revalidation_required')
  }
  let next: CaseState = prior
  let revisedFinding: Finding | null = null
  const all = (env.result?.findings ?? []).map((row) => factFinding(env, row.id)!).filter(Boolean)
  const priorReturnedMinor = Math.round((verifiedReturned(prior) - activeReturned(prior)) * 100)
  const checkNewAmount = (amount: number) => {
    const gate = evaluateEligibility(finding, finding.evidence, all)
    if (gate.potentialAmountMinor === null || Math.round(amount * 100) > gate.potentialAmountMinor - priorReturnedMinor) {
      throw new Error('The request exceeds the evidence-supported amount remaining after earlier returns.')
    }
  }
  try {
    switch (cmd.type) {
      case 'decision': {
        if (prior.recoveryStage === 'requested' || prior.recoveryStage === 'recovered' || prior.recoveryStage === 'not_recovered') throw new Error('A sent request must be resolved before changing the review decision.')
        const data = parse(z.object({ decision: z.enum(['confirmed', 'needs_info', 'expected']), reason: text.nullable() }), cmd.input)
        if (priorGeneration > 1 && prior.requiresRevalidation && data.decision === 'confirmed') throw new Error('Review fresh evidence before confirming a new request.')
        next = data.decision === 'confirmed' ? confirmCase(data.reason) : data.decision === 'needs_info' ? markNeedsInfo(data.reason) : markExpected(data.reason)
        if (priorGeneration > 1) next = { ...next, activeRequestGeneration: priorGeneration, archivedRequests: prior.archivedRequests, recoverySettlements: prior.recoverySettlements, recoveredAmount: verifiedReturned(prior), legacyRecoveredAmount: prior.legacyRecoveredAmount, requiresRevalidation: prior.requiresRevalidation, history: prior.history }
        next.decidedAt = at
        break
      }
      case 'begin_new_request_review': {
        const data = parse(z.object({ acknowledged: z.literal(true) }), cmd.input)
        if (!data.acknowledged) throw new Error('Review acknowledgement is required.')
        next = beginNewRequestReview(prior, at)
        break
      }
      case 'evidence': {
        if (prior.recoveryStage === 'requested' || prior.recoveryStage === 'recovered' || prior.recoveryStage === 'not_recovered') throw new Error('Resolve the open request before replacing its evidence.')
        const raw = parse(evidenceSchema, cmd.input)
        const sourceIds = finding.relatedRecords.map((record) => record.id).sort()
        if (raw.payments.map((payment) => payment.recordId).sort().join('|') !== sourceIds.join('|')) throw new Error('Payment evidence must refer to exactly the source rows in this check.')
        const returnRefs = new Set(validSettlements(prior).map((entry) => entry.reference.trim().toLowerCase()))
        if (raw.priorReturns?.some((entry) => returnRefs.has(entry.reference.toLowerCase()))) throw new Error('This return is already recorded against an earlier request.')
        const stamp = <T extends { reference: string }>(entry: T): T & { confirmedBy: string; confirmedAt: number } => ({ ...entry, confirmedBy: actor, confirmedAt: at })
        const evidence: RecoveryEvidence = {
          entity: stamp(raw.entity), supplier: stamp(raw.supplier),
          payments: raw.payments.map(stamp), obligation: stamp(raw.obligation),
          checks: Object.fromEntries(Object.entries(raw.checks).map(([key, value]) => [key, { ...stamp(value), confirmed: value.confirmed }])),
          priorReturns: raw.priorReturns?.map(stamp),
          contradictions: raw.contradictions, notes: raw.notes,
        }
        const candidate = { ...finding, evidence, contradictoryEvidence: [] }
        const gate = evaluateEligibility(candidate, evidence, all)
        revisedFinding = { ...candidate, ...gate, classification: gate.eligible ? 'recovery_candidate' : 'review_needed', class: gate.eligible ? 'recoverable' : 'review', requiresRevalidation: !gate.eligible }
        next = recordEvidenceReview(prior, gate.eligible, actor, at)
        break
      }
      case 'approve':
      case 'approve_and_request': {
        const data = parse(z.object({ package: packageSchema, knownBeforeReclaim: z.boolean(), knownBeforeNote: text.nullable() }), cmd.input)
        if (prior.decision !== 'confirmed' || prior.recoveryStage !== 'confirmed') throw new Error('Review the case before approval.')
        assertRecoveryEligible(finding, all, data.package.requestedAmount)
        checkNewAmount(data.package.requestedAmount)
        const approved = approveRecovery(updateRecoveryPackage(prior, { ...data.package, evidenceAttachment: data.package.evidenceAttachment ?? null, requestedResolution: data.package.method }), { at, knownBeforeReclaim: data.knownBeforeReclaim, knownBeforeNote: data.knownBeforeNote })
        next = cmd.type === 'approve_and_request' ? startRecoveryRequest(approved, data.package.requestedAmount, at, finding.dollarImpact) : approved
        break
      }
      case 'request': {
        const data = parse(packageSchema, cmd.input)
        assertRecoveryEligible(finding, all, data.requestedAmount)
        checkNewAmount(data.requestedAmount)
        if (prior.requestedAmount !== data.requestedAmount || prior.recoveryRecipientEmail !== data.recipientEmail || prior.recoverySubject !== data.subject ||
          prior.recoveryDraft !== data.body || prior.requestedResolution !== data.method || (prior.recoveryEvidenceAttachment ?? null) !== (data.evidenceAttachment ?? null)) {
          throw new Error('Approve the exact request before marking it sent.')
        }
        next = startRecoveryRequest(prior, data.requestedAmount, at, finding.dollarImpact)
        break
      }
      case 'vendor_update': {
        const data = parse(z.object({ status: z.string().min(1).max(50), note: text.min(1), at: z.number().finite(), amount: money.optional(), method: method.optional(), expectedAt: z.number().finite().optional() }), cmd.input)
        if (prior.requiresRevalidation && data.status === 'followed_up') throw new HttpError(409, 'Review the historical request before recording another supplier follow-up.', 'revalidation_required')
        next = recordVendorUpdate(prior, data as VendorUpdate, at)
        break
      }
      case 'email_sent':
      case 'followup_sent': {
        const data = parse(z.object({ messageId: text.min(1).max(300) }), cmd.input)
        const table = cmd.type === 'email_sent' ? 'gmail_sends' : 'gmail_follow_ups'
        const amountColumn = cmd.type === 'email_sent' ? 'amount_minor' : 'NULL AS amount_minor'
        const sent = db.prepare(`SELECT message_id, from_email, to_email, cc, sent_at, ${amountColumn} FROM ${table} WHERE user_id = ? AND project_id = ? AND finding_id = ? AND generation = ? AND message_id = ? AND status = 'sent'`)
          .get(userId, projectId, cmd.findingId, priorGeneration, data.messageId) as { message_id: string; from_email: string; to_email: string; cc: string; sent_at: number; amount_minor: number | null } | undefined
        if (!sent) throw new Error('This Gmail send is not recorded for this account and case.')
        const receipt = { channel: 'gmail' as const, messageId: sent.message_id, from: sent.from_email, to: sent.to_email, cc: sent.cc ? sent.cc.split(',') : [], sentAt: sent.sent_at }
        next = cmd.type === 'email_sent' ? recordEmailSent(prior, receipt, (sent.amount_minor ?? 0) / 100) : recordFollowUpSent(prior, receipt)
        break
      }
      case 'followup_days': {
        const data = parse(z.object({ days: z.number().int().min(1).max(90) }), cmd.input)
        next = setFollowUpAfterDays(prior, data.days)
        break
      }
      case 'contact_hold': {
        const data = parse(z.object({ reason: text.nullable() }), cmd.input)
        next = setContactHold(prior, data.reason)
        break
      }
      case 'followup': {
        const data = parse(z.object({ at: z.number().finite().positive().nullable() }), cmd.input)
        next = setNextFollowUp(prior, data.at)
        break
      }
      case 'settlement': {
        const data = parse(z.object({ amount: money, method, source: z.enum(['bank', 'accounting', 'document', 'manual']), reference: text.min(1).max(300), settledAt: z.number().finite().positive(), appliedToBill: text.optional() }), cmd.input)
        if (data.settledAt > at + 60_000) throw new Error('A return cannot be dated in the future.')
        if (finding.evidence?.priorReturns?.some((entry) => entry.reference.trim().toLowerCase() === data.reference.toLowerCase())) throw new Error('This return was already included in the evidence review.')
        const key = `${data.method}|${data.reference.toLowerCase()}|${data.appliedToBill?.toLowerCase() ?? ''}`
        const allStates = Object.entries(states)
        if (allStates.some(([id, state]) => id !== cmd.findingId && (state.recoverySettlements ?? []).some((entry) => `${entry.method}|${entry.reference.toLowerCase()}|${entry.appliedToBill?.toLowerCase() ?? ''}` === key))) throw new Error('This return reference is already used by another case in this project.')
        next = verifyRecovery(prior, data as RecoveryVerification)
        break
      }
      case 'historical_settlement': {
        const data = parse(z.object({ generation: z.number().int().positive(), amount: money, method, source: z.enum(['bank', 'accounting', 'document', 'manual']), reference: text.min(1).max(300), settledAt: z.number().finite().positive(), appliedToBill: text.optional() }), cmd.input)
        if (data.settledAt > at + 60_000) throw new Error('A return cannot be dated in the future.')
        if (finding.evidence?.priorReturns?.some((entry) => entry.reference.trim().toLowerCase() === data.reference.toLowerCase())) throw new Error('This return was already included in the evidence review.')
        const archived = prior.archivedRequests?.find((request) => request.generation === data.generation)
        if (!archived) throw new Error('Select an archived request for this return.')
        if ((data.method === 'credit' || data.method === 'offset') && !data.appliedToBill?.trim()) throw new Error('Enter the bill where the credit was applied.')
        const key = `${data.method}|${data.reference.toLowerCase()}|${data.appliedToBill?.toLowerCase() ?? ''}`
        if (Object.entries(states).some(([, state]) => validSettlements(state).some((entry) => `${entry.method}|${entry.reference.toLowerCase()}|${entry.appliedToBill?.toLowerCase() ?? ''}` === key))) throw new Error('This return reference was already recorded.')
        const oldReturnedMinor = Math.round(validSettlements(prior).filter((entry) => (entry.requestGeneration ?? 1) === data.generation).reduce((sum, entry) => sum + entry.amount, 0) * 100)
        if (Math.round(data.amount * 100) > Math.round((archived.requestedAmount ?? 0) * 100) - oldReturnedMinor) throw new Error('The return exceeds the remaining amount of the earlier request.')
        const proof: RecoveryVerification = { amount: data.amount, method: data.method, source: data.source, reference: data.reference, settledAt: data.settledAt, appliedToBill: data.appliedToBill }
        const gate = evaluateEligibility(finding, finding.evidence, all)
        next = recordHistoricalSettlement(prior, data.generation, proof, gate.potentialAmountMinor === null ? 0 : gate.potentialAmountMinor / 100)
        break
      }
      case 'reconcile': {
        const data = parse(z.object({ note: text.min(1), rootCause: text }), cmd.input)
        next = reconcileRecovery(prior, { ...data, at })
        break
      }
      case 'close': {
        const data = parse(z.object({ reason: text.min(1) }), cmd.input)
        next = closeWithoutRecovery(prior, data.reason, at)
        break
      }
      case 'reopen': {
        if (prior.requiresRevalidation && (prior.recoveryStage === 'recovered' || prior.recoveryStage === 'not_recovered')) throw new Error('Preserve the historical request before correcting its outcome.')
        next = prior.recoveryStage === 'recovered' || prior.recoveryStage === 'not_recovered' ? reopenOutcome(prior) : reopenDecision(prior)
        break
      }
      case 'reopen_balance': {
        next = reopenRemainingBalance(prior, at)
        break
      }
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(409, error instanceof Error ? error.message : 'Invalid case transition.', 'invalid_transition')
  }
  const changed = JSON.stringify(next) !== JSON.stringify(prior) || Boolean(revisedFinding)
  if (!changed) throw new HttpError(409, 'This command did not change the case.', 'no_change')
  const nextState = withHistory(prior, next, actor)
  const findingRows = env.result?.findings ?? []
  const nextEnv = { ...env, caseStates: { ...states, [cmd.findingId]: nextState }, result: { ...env.result, findings: findingRows.map((row) => row.id === cmd.findingId ? { ...(revisedFinding ?? row), relatedRecords: (revisedFinding ?? finding).relatedRecords.map((record) => ({ id: record.id })), customerDecision: nextState.decision } : row) }, updatedAt: at }
  return { project: { ...project, environment: nextEnv, updatedAt: at }, sourceRefs: finding.relatedRecords.map((record) => record.id) }
}

export class CaseCommands {
  private readonly db: DatabaseSync
  private readonly projects: ProjectStore

  constructor(db: DatabaseSync, projects: ProjectStore) {
    this.db = db
    this.projects = projects
  }

  migrateLegacy(): number {
    const rows = this.db.prepare('SELECT user_id, id, updated_at, revision FROM projects').all() as Array<{ user_id: string; id: string; updated_at: number; revision: number }>
    const insert = this.db.prepare("INSERT OR IGNORE INTO case_events (user_id, project_id, finding_id, command_id, command_hash, action, actor, at, prior_revision, revision, source_refs) VALUES (?, ?, ?, ?, ?, 'legacy_assertion', NULL, ?, ?, ?, ?)")
    let count = 0
    for (const row of rows) {
      const already = this.db.prepare('SELECT 1 FROM case_events WHERE user_id = ? AND project_id = ? LIMIT 1').get(row.user_id, row.id)
      if (already) continue
      const project = this.projects.get(row.user_id, row.id)
      const env = project?.environment as StoredEnvironment | undefined
      if (!project || !env || !Object.keys(env.caseStates ?? {}).length) continue
      this.db.exec('BEGIN IMMEDIATE')
      try {
      const migratedStates = Object.fromEntries(Object.entries(env.caseStates ?? {}).map(([id, state]) => [id, {
        ...state,
        ...(state.approvedAt ? { legacyApprovedAt: state.approvedAt } : {}),
        ...((state.recoveredAmount ?? 0) > 0 ? { legacyRecoveredAmount: state.recoveredAmount } : {}),
        requiresRevalidation: true,
        approvedAt: state.recoveryStage === 'confirmed' ? null : state.approvedAt,
      }]))
      const revision = this.projects.upsert(row.user_id, { ...project, environment: { ...env, caseStates: migratedStates } })
      for (const findingId of Object.keys(env?.caseStates ?? {})) {
        const finding = factFinding(env!, findingId)
        const result = insert.run(row.user_id, row.id, findingId, `legacy:${findingId}`, '', row.updated_at, row.revision, revision, JSON.stringify(finding?.relatedRecords.map((record) => record.id) ?? []))
        count += Number(result.changes)
      }
      this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    }
    return count
  }

  execute(userId: string, actor: string, projectId: string, untrusted: unknown): { revision: number; project: Record<string, unknown>; replayed: boolean } {
    const cmd = parse(commandSchema, untrusted)
    const hash = createHash('sha256').update(JSON.stringify(cmd)).digest('hex')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const duplicate = this.db.prepare('SELECT command_hash, revision FROM case_events WHERE user_id = ? AND project_id = ? AND command_id = ?').get(userId, projectId, cmd.commandId) as EventRow | undefined
      if (duplicate) {
        if (duplicate.command_hash !== hash) throw new HttpError(409, 'A command ID was reused with different content.', 'command_reused')
        const project = this.projects.get(userId, projectId)!
        this.db.exec('COMMIT')
        return { revision: this.projects.revision(userId, projectId)!, project, replayed: true }
      }
      const project = this.projects.get(userId, projectId)
      const revision = this.projects.revision(userId, projectId)
      if (!project || revision === null) throw new HttpError(404, 'That project is not in this account.')
      if (cmd.expectedRevision !== revision) throw new HttpError(409, 'This project changed on another device. Reload and review the newer version before retrying.', 'revision_conflict', { revision: String(revision) })
      const result = applyCommand(this.db, userId, projectId, project, cmd, actor, Date.now())
      const nextRevision = this.projects.upsert(userId, result.project)
      this.db.prepare('INSERT INTO case_events (user_id, project_id, finding_id, command_id, command_hash, action, actor, at, prior_revision, revision, source_refs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, projectId, cmd.findingId, cmd.commandId, hash, cmd.type, actor, Date.now(), revision, nextRevision, JSON.stringify(result.sourceRefs))
      this.db.exec('COMMIT')
      return { revision: nextRevision, project: result.project, replayed: false }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
