import type { Finding, FindingClass } from '@/types'
import { computeAuditStats } from '@/audit/deriveStats'
import type { LedgerEnvironment } from '@/ledger/store'
import { getCaseState } from '@/ledger/store'
import {
  QUEUE_GROUP_LABEL,
  RECOVERY_STAGE_LABEL,
  isInFindingsQueue,
  isInRecoveryQueue,
  queueGroupFor,
  type CaseState,
  type QueueGroup,
  type RecoveryStage,
} from '@/ledger/caseState'

export interface CaseView {
  finding: Finding
  state: CaseState
  isNew: boolean
}

function toCaseView(env: LedgerEnvironment, finding: Finding): CaseView {
  return { finding, state: getCaseState(env, finding.id), isNew: env.newFindingIds.includes(finding.id) }
}

export function findCaseView(env: LedgerEnvironment, findingId: string): CaseView | null {
  const finding = env.result.findings.find((f) => f.id === findingId)
  return finding ? toCaseView(env, finding) : null
}

const CLASS_PRIORITY: FindingClass[] = ['recoverable', 'review', 'opportunity']

function pickNextRecommended(active: Finding[]): Finding | null {
  for (const cls of CLASS_PRIORITY) {
    const inClass = active.filter((f) => f.class === cls)
    if (inClass.length === 0) continue
    return inClass.reduce((best, candidate) => (candidate.dollarImpact > best.dollarImpact ? candidate : best))
  }
  return null
}

export interface OverviewSummary {
  recordCount: number
  vendorCount: number
  dateRangeLabel: string | null
  skippedCount: number
  importCount: number
  lastImportLabel: string | null
  totalFindingCount: number
  /** Dollar total for every case still awaiting a decision (any class). */
  worthInvestigatingTotal: number
  readyToVerifyCount: number
  needsContextCount: number
  worthNotingCount: number
  /** Confirmed cases still moving through recovery (not yet resolved). */
  recoveryActiveCount: number
  newSinceLastVisitCount: number
  nextRecommendedCase: CaseView | null
}

/** Overview lens — the environment compressed into what it means right now. */
export function overviewSummary(env: LedgerEnvironment): OverviewSummary {
  const skippedCount = env.imports.reduce((sum, batch) => sum + batch.skippedCount, 0)
  const stats = computeAuditStats(env.records, skippedCount, env.result)
  const findings = env.result.findings

  const active = findings.filter((f) => isInFindingsQueue(getCaseState(env, f.id)))
  const groupCounts: Record<QueueGroup, number> = { ready_to_verify: 0, needs_context: 0, worth_noting: 0 }
  for (const f of active) groupCounts[queueGroupFor(f, getCaseState(env, f.id))] += 1

  const worthInvestigatingTotal = active.reduce((sum, f) => sum + f.dollarImpact, 0)
  const recoveryActiveCount = findings.filter((f) => {
    const state = getCaseState(env, f.id)
    return isInRecoveryQueue(state) && state.recoveryStage !== 'resolved'
  }).length

  const nextRecommended = pickNextRecommended(active)

  return {
    recordCount: stats.recordCount,
    vendorCount: stats.vendorCount,
    dateRangeLabel: stats.dateRangeLabel,
    skippedCount,
    importCount: env.imports.length,
    lastImportLabel: env.imports.at(-1)?.sourceLabel ?? null,
    totalFindingCount: findings.length,
    worthInvestigatingTotal,
    readyToVerifyCount: groupCounts.ready_to_verify,
    needsContextCount: groupCounts.needs_context,
    worthNotingCount: groupCounts.worth_noting,
    recoveryActiveCount,
    newSinceLastVisitCount: env.newFindingIds.length,
    nextRecommendedCase: nextRecommended ? toCaseView(env, nextRecommended) : null,
  }
}

export interface FindingsQueueGroup {
  group: QueueGroup
  label: string
  cases: CaseView[]
}

const QUEUE_GROUP_ORDER: QueueGroup[] = ['ready_to_verify', 'needs_context', 'worth_noting']

/** Findings lens — every undecided (or needs-info) case, grouped by decision readiness. */
export function findingsQueue(env: LedgerEnvironment): FindingsQueueGroup[] {
  const active = env.result.findings.filter((f) => isInFindingsQueue(getCaseState(env, f.id)))
  return QUEUE_GROUP_ORDER.map((group) => {
    const cases = active
      .filter((f) => queueGroupFor(f, getCaseState(env, f.id)) === group)
      .sort((a, b) => b.dollarImpact - a.dollarImpact)
      .map((f) => toCaseView(env, f))
    return { group, label: QUEUE_GROUP_LABEL[group], cases }
  })
}

export interface RecoveryQueueGroup {
  stage: RecoveryStage
  label: string
  cases: CaseView[]
}

const RECOVERY_STAGE_ORDER: RecoveryStage[] = ['ready_to_prepare', 'ready_to_contact', 'awaiting_response', 'resolved']

/** Recovery lens — every confirmed (or resolved-as-expected) case, grouped by operational stage. */
export function recoveryQueue(env: LedgerEnvironment): RecoveryQueueGroup[] {
  const inRecovery = env.result.findings.filter((f) => isInRecoveryQueue(getCaseState(env, f.id)))
  return RECOVERY_STAGE_ORDER.map((stage) => {
    const cases = inRecovery
      .filter((f) => getCaseState(env, f.id).recoveryStage === stage)
      .sort((a, b) => b.dollarImpact - a.dollarImpact)
      .map((f) => toCaseView(env, f))
    return { stage, label: RECOVERY_STAGE_LABEL[stage], cases }
  })
}
