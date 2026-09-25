/**
 * The V2 lens over the existing detection engine.
 *
 * Nothing here re-detects anything — `lib/detection.ts` already produces the
 * findings and `ledger/caseState.ts` already tracks what a reviewer did with
 * each one. This module only reframes both in the vocabulary the product spec
 * uses: a value ladder whose rungs are never added together (§3), an evidence
 * strength label rather than a fake confidence percentage (§12), and a
 * priority that ranks money by how gettable it is rather than by size (§13).
 */
import { getCaseState, type LedgerEnvironment } from '@/ledger/store'
import type { CaseState } from '@/ledger/caseState'
import { evidenceStrength, keyUncertainty } from '@/audit/ruleChecklist'
import { formatCurrency, normalizeVendor } from '@/lib/format'
import { claimValue, isAtRisk, isClaim, sumMoney } from '@/lib/claims'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import type { Finding, FindingType } from '@/types'

/**
 * §12 — three levels, not a percentage. "94% confident" means nothing to a
 * controller. This is not a new scale: `evidenceStrength` already scores each
 * finding against its own rule checklist (how many of the conditions that would
 * prove this case actually hold). We only rename its third level, because
 * "Limited" describes the evidence while "Needs review" describes what to do.
 */
export type EvidenceLevel = 'strong' | 'moderate' | 'review'

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  review: 'Needs review',
}

/**
 * Where a case sits on the ladder. These are reported side by side and never
 * summed — §3's whole point is that found money and returned money are
 * different numbers, and blurring them is how software starts lying.
 */
export type LadderStage = 'potential' | 'verified' | 'inRecovery' | 'recovered' | 'protected'

export interface Ladder {
  /**
   * Money still in play that could come back: every claim (see lib/claims)
   * that has not been dismissed and has not reached an outcome. Missed
   * discounts are Protected and bank-account / shared-invoice alerts are At
   * risk — neither is money a vendor owes, so neither is counted here. Money
   * that already came back leaves this figure — potential and recovered are
   * never the same dollars.
   */
  potential: number
  /** Every finding still open (not dismissed, no outcome), claim or not. */
  openCount: number
  /** Open bank-account-change and shared-invoice alerts: payments to verify, reported apart from recovery. */
  atRisk: number
  /**
   * The rules engine's verdict that the records support a recovery — not a
   * human's. Nothing here has been agreed to by a vendor, so this is the
   * ceiling on what could be claimed, never a forecast of what will come back.
   * A case leaves this rung once it is dismissed or once a request goes out.
   */
  verified: number
  /** Outstanding amount on requests still open with vendors. */
  inRecovery: number
  /** Money that actually came back — the only figure worth trusting. */
  recovered: number
  /** Stopped before payment. Zero until Reclaim has a prepayment intervention check. */
  protected: number
  counts: Record<LadderStage, number>
  /** Verified and still waiting on a person — §28's "what should I do". */
  awaitingDecision: number
}

/**
 * `RecoveryStage.confirmed` is the customer's decision to pursue a case.
 * Vendor agreement is separate and comes from recorded vendor updates in
 * `vendorCommitments`; neither it nor a promise is settled value.
 */

export interface Opportunity {
  finding: Finding
  state: CaseState
  evidence: EvidenceLevel
  /** Ranking score — see `priorityOf`. Not shown to the user, only sorted by. */
  priority: number
  typeLabel: string
}

export interface VendorRollup {
  vendor: string
  caseCount: number
  potential: number
  recovered: number
  /** Null when the vendor produced no findings at all. */
  strongest: EvidenceLevel | null
  recordCount: number
}

export interface RootCause {
  type: FindingType
  label: string
  count: number
  value: number
}

export function evidenceOf(finding: Finding): EvidenceLevel {
  switch (evidenceStrength(finding)) {
    case 'Strong':
      return 'strong'
    case 'Moderate':
      return 'moderate'
    default:
      return 'review'
  }
}

/** The first rule that didn't match — what a reviewer still has to settle. */
export function openQuestion(finding: Finding): string | null {
  return keyUncertainty(finding)
}

const EVIDENCE_WEIGHT: Record<EvidenceLevel, number> = { strong: 1, moderate: 0.6, review: 0.3 }
const CLASS_WEIGHT = { recoverable: 1, review: 0.5, opportunity: 0.4 } as const

/**
 * §13 — "Recovery Priority = value × recoverability × evidence ÷ effort".
 * Effort is proxied by how many records a reviewer has to read to agree.
 * The effect is that an $18k slam dunk outranks a $40k maybe, which is the
 * behaviour the spec explicitly asks for.
 */
export function priorityOf(finding: Finding, evidence: EvidenceLevel): number {
  const effort = 1 + Math.max(0, finding.relatedRecords.length - 2) * 0.15
  return (finding.dollarImpact * CLASS_WEIGHT[finding.class] * EVIDENCE_WEIGHT[evidence]) / effort
}

function toOpportunity(env: LedgerEnvironment, finding: Finding): Opportunity {
  const evidence = evidenceOf(finding)
  return {
    finding,
    state: getCaseState(env, finding.id),
    evidence,
    priority: priorityOf(finding, evidence),
    typeLabel: FINDING_TYPE_LABELS[finding.type] ?? finding.type,
  }
}

/** Everything the engine surfaced, highest priority first. */
export function opportunities(env: LedgerEnvironment): Opportunity[] {
  return env.result.findings
    .map((finding) => toOpportunity(env, finding))
    .sort((a, b) => b.priority - a.priority)
}

/** Vendor recovery cases; internal investigations stay in Findings. */
export function recoveries(env: LedgerEnvironment): Opportunity[] {
  return opportunities(env).filter(
    (o) => o.finding.class === 'recoverable' && o.state.recoveryStage !== null && o.state.recoveryStage !== undefined
  )
}

/** Nonrecoverable findings with an internal investigation still in progress. */
export function internalReviews(env: LedgerEnvironment): Opportunity[] {
  return opportunities(env).filter((o) => o.finding.class !== 'recoverable' && (o.state.recoveryStage === 'confirmed' || o.state.recoveryStage === 'requested'))
}

export type RecoveryAgeLabel = '0–14 days' | '15–30 days' | '31+ days' | 'Date unknown'
export interface RecoveryAgeBucket { label: RecoveryAgeLabel; count: number; outstanding: number }

/** Age open vendor requests by the date the customer recorded outreach. */
export function recoveryAging(env: LedgerEnvironment, asOf = Date.now()): RecoveryAgeBucket[] {
  const buckets: RecoveryAgeBucket[] = [
    { label: '0–14 days', count: 0, outstanding: 0 },
    { label: '15–30 days', count: 0, outstanding: 0 },
    { label: '31+ days', count: 0, outstanding: 0 },
    { label: 'Date unknown', count: 0, outstanding: 0 },
  ]
  const localDay = (time: number) => { const date = new Date(time); return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) }
  for (const finding of env.result.findings) {
    if (finding.class !== 'recoverable') continue
    const state = getCaseState(env, finding.id)
    if (state.recoveryStage !== 'requested') continue
    const outstandingCents = Math.max(0, Math.round((state.requestedAmount ?? finding.dollarImpact) * 100) - Math.round((state.recoveredAmount ?? 0) * 100))
    const start = state.recoveryRequestedAt
    const age = start != null && Number.isFinite(start) && start > 0 ? Math.max(0, Math.floor((localDay(asOf) - localDay(start)) / 86_400_000)) : null
    const bucket = buckets[age === null ? 3 : age <= 14 ? 0 : age <= 30 ? 1 : 2]
    bucket.count += 1
    bucket.outstanding += outstandingCents / 100
  }
  return buckets.map((bucket) => ({ ...bucket, outstanding: Math.round(bucket.outstanding * 100) / 100 }))
}

export interface RecentReturn { id: string; findingId: string; vendor: string; amount: number; settledAt: number; partial: boolean; reference: string | null }

/** One row per current recorded return, ordered by its own settlement date. */
export function recentReturns(env: LedgerEnvironment): RecentReturn[] {
  const rows: RecentReturn[] = []
  for (const finding of env.result.findings) {
    if (finding.class !== 'recoverable') continue
    const state = getCaseState(env, finding.id)
    if (state.recoveryStage !== 'requested' && state.recoveryStage !== 'recovered') continue
    const settlements = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
    if (settlements.length) {
      settlements.forEach((entry, index) => {
        if (!Number.isFinite(entry.amount) || entry.amount <= 0 || !Number.isFinite(entry.settledAt) || entry.settledAt <= 0) return
        rows.push({ id: `${finding.id}:${index}`, findingId: finding.id, vendor: finding.vendor, amount: entry.amount, settledAt: entry.settledAt, partial: state.recoveryStage === 'requested', reference: entry.reference })
      })
      continue
    }
    const amount = state.recoveredAmount ?? 0
    const settledAt = state.recoveryResolvedAt
    if (amount <= 0 || settledAt == null || !Number.isFinite(settledAt) || settledAt <= 0) continue
    rows.push({ id: `${finding.id}:legacy`, findingId: finding.id, vendor: finding.vendor, amount, settledAt, partial: state.recoveryStage === 'requested', reference: null })
  }
  return rows.sort((a, b) => b.settledAt - a.settledAt || b.amount - a.amount)
}

/** Verified, undecided, and waiting on a human — §28's "what should I do". */
export function awaitingDecision(env: LedgerEnvironment): Opportunity[] {
  return opportunities(env).filter((o) => o.state.decision === null && o.finding.class === 'recoverable')
}

export function ladder(env: LedgerEnvironment): Ladder {
  const empty = { potential: 0, verified: 0, inRecovery: 0, recovered: 0, protected: 0 }
  const counts: Record<LadderStage, number> = { ...empty }
  // Totals are kept in whole cents and converted once at the end.
  const cents = { ...empty }
  const add = (stage: LadderStage, amount: number) => {
    cents[stage] += Math.round(amount * 100)
    counts[stage] += 1
  }
  let awaitingCents = 0
  let atRiskCents = 0
  let openCount = 0

  for (const finding of env.result.findings) {
    const state = getCaseState(env, finding.id)
    const stage = state.recoveryStage
    const claim = isClaim(finding)
    if (finding.class === 'recoverable' && state.decision === null) {
      awaitingCents += Math.round(finding.dollarImpact * 100)
    }

    // Financial amounts occupy distinct buckets. A partial return can leave
    // one case with a returned portion and an outstanding portion.
    const dismissed = state.decision === 'expected'
    const resolved = stage === 'recovered' || stage === 'not_recovered'
    if (!dismissed && !resolved) {
      openCount += 1
      // Net of anything already returned on a partly settled case.
      if (claim) add('potential', Math.max(0, finding.dollarImpact - (state.recoveredAmount ?? 0)))
      else if (isAtRisk(finding)) atRiskCents += Math.round(finding.dollarImpact * 100)
    }

    // A future-savings signal is not a payment Reclaim actually prevented, so `protected` stays zero.
    if (finding.class === 'recoverable' && !dismissed && stage !== 'requested' && !resolved) add('verified', finding.dollarImpact)
    // Only a vendor claim is money in recovery: the outstanding part of what was asked for.
    if (finding.class === 'recoverable' && stage === 'requested') {
      add('inRecovery', Math.max(0, (state.requestedAmount ?? finding.dollarImpact) - (state.recoveredAmount ?? 0)))
    }
    // A promise isn't a recovery. Only amounts recorded as settled count, including partial returns on an open request.
    if (finding.class === 'recoverable' && (stage === 'recovered' || stage === 'requested') && (state.recoveredAmount ?? 0) > 0) {
      add('recovered', state.recoveredAmount ?? 0)
    }
  }

  const dollars = (value: number) => value / 100
  return {
    potential: dollars(cents.potential),
    verified: dollars(cents.verified),
    inRecovery: dollars(cents.inRecovery),
    recovered: dollars(cents.recovered),
    protected: dollars(cents.protected),
    openCount,
    atRisk: dollars(atRiskCents),
    counts,
    awaitingDecision: dollars(awaitingCents),
  }
}

export interface VendorCommitments {
  confirmed: number
  pendingReturn: number
  confirmedCases: number
  pendingCases: number
}

/** Customer-recorded vendor statements; neither bucket is settled money. */
export function vendorCommitments(env: LedgerEnvironment): VendorCommitments {
  const totals: VendorCommitments = { confirmed: 0, pendingReturn: 0, confirmedCases: 0, pendingCases: 0 }
  const agreedStatuses = new Set(['accepted', 'partial_acceptance', 'promised', 'credit_issued', 'already_refunded'])
  const pendingStatuses = new Set(['promised', 'credit_issued', 'already_refunded'])
  for (const finding of env.result.findings) {
    if (finding.class !== 'recoverable') continue
    const state = getCaseState(env, finding.id)
    if (state.recoveryStage !== 'requested') continue
    const update = [...(state.vendorUpdates ?? [])].reverse().find((entry) => entry.status !== 'followed_up' && entry.status !== 'no_response')
    if (!update || !agreedStatuses.has(update.status)) continue
    const remaining = Math.max(0, (state.requestedAmount ?? finding.dollarImpact) - (state.recoveredAmount ?? 0))
    const returnedSinceUpdate = (state.recoverySettlements ?? []).filter((entry) => entry.settledAt >= update.at).reduce((sum, entry) => sum + entry.amount, 0)
    // Only "accepted the claim" states that the whole request was accepted.
    // A partial acceptance, promise, or issued credit without a stated amount
    // cannot safely be valued at the full remaining balance.
    const amount = update.amount === undefined
      ? (update.status === 'accepted' ? remaining : 0)
      : Math.min(remaining, Math.max(0, update.amount - returnedSinceUpdate))
    if (amount <= 0) continue
    totals.confirmed += amount
    totals.confirmedCases += 1
    if (pendingStatuses.has(update.status)) {
      totals.pendingReturn += amount
      totals.pendingCases += 1
    }
  }
  return { ...totals, confirmed: Math.round(totals.confirmed * 100) / 100, pendingReturn: Math.round(totals.pendingReturn * 100) / 100 }
}

/**
 * Every vendor in the ledger, not only the flagged ones. A vendor that came
 * through clean is a result too, and leaving it out would make this page
 * disagree with the vendor count on every other screen.
 *
 * Keyed on the normalized name so a finding and its records land on the same
 * row even when the source file spells the vendor slightly differently.
 */
export function vendors(env: LedgerEnvironment): VendorRollup[] {
  const order: EvidenceLevel[] = ['review', 'moderate', 'strong']
  const byVendor = new Map<string, VendorRollup>()

  const rowFor = (name: string): VendorRollup => {
    const key = normalizeVendor(name)
    const existing = byVendor.get(key)
    if (existing) return existing
    const created: VendorRollup = {
      vendor: name,
      caseCount: 0,
      potential: 0,
      recovered: 0,
      strongest: null,
      recordCount: 0,
    }
    byVendor.set(key, created)
    return created
  }

  // Records first, so recordCount is "payments in this ledger" rather than a
  // sum of related-record lists that double-counts anything in two findings.
  for (const record of env.records) rowFor(record.vendor).recordCount += 1

  for (const finding of env.result.findings) {
    const state = getCaseState(env, finding.id)
    const evidence = evidenceOf(finding)
    const row = rowFor(finding.vendor)
    row.caseCount += 1
    if (isStillInPlay(state)) row.potential = sumMoney([row.potential, Math.max(0, claimValue(finding) - (isClaim(finding) ? state.recoveredAmount ?? 0 : 0))])
    if (finding.class === 'recoverable' && (state.recoveryStage === 'recovered' || state.recoveryStage === 'requested')) row.recovered = sumMoney([row.recovered, state.recoveredAmount ?? 0])
    if (row.strongest === null || order.indexOf(evidence) > order.indexOf(row.strongest)) row.strongest = evidence
  }

  return [...byVendor.values()].sort(
    (a, b) => b.potential - a.potential || a.vendor.localeCompare(b.vendor)
  )
}

/** Not dismissed and not yet resolved — the same test the ladder's `potential` rung uses. */
function isStillInPlay(state: CaseState): boolean {
  return state.decision !== 'expected' && state.recoveryStage !== 'recovered' && state.recoveryStage !== 'not_recovered'
}

/**
 * §25 — why the money left, grouped by the check that caught it. A finding the
 * reviewer dismissed as expected was never a leak, so it is left out; money
 * that has since been recovered still left in the first place, so it stays.
 */
export function rootCauses(env: LedgerEnvironment): RootCause[] {
  const byType = new Map<FindingType, RootCause>()
  for (const finding of env.result.findings) {
    if (getCaseState(env, finding.id).decision === 'expected') continue
    const row = byType.get(finding.type) ?? {
      type: finding.type,
      label: FINDING_TYPE_LABELS[finding.type] ?? finding.type,
      count: 0,
      value: 0,
    }
    row.count += 1
    row.value += finding.dollarImpact
    byType.set(finding.type, row)
  }
  return [...byType.values()].sort((a, b) => b.value - a.value)
}

export interface RecordedRootCause { label: string; count: number; recovered: number }

/** Causes confirmed by customers during accounting closeout, separate from rule categories. */
export function recordedRootCauses(env: LedgerEnvironment): RecordedRootCause[] {
  const causes = new Map<string, RecordedRootCause>()
  for (const finding of env.result.findings) {
    const state = getCaseState(env, finding.id)
    if (finding.class !== 'recoverable' || state.recoveryStage !== 'recovered' || (state.recoveredAmount ?? 0) <= 0 || !state.reconciledAt || !state.rootCause) continue
    const cause = causes.get(state.rootCause) ?? { label: state.rootCause, count: 0, recovered: 0 }
    cause.count += 1
    cause.recovered += state.recoveredAmount ?? 0
    causes.set(state.rootCause, cause)
  }
  return [...causes.values()].sort((a, b) => b.recovered - a.recovered)
}

/** The chronological record for a single case (§21). */
export interface TimelineStep {
  when: string
  what: string
  detail?: string
  done: boolean
}

export function timelineFor(finding: Finding, state: CaseState, discoveredAt: number | null = null): TimelineStep[] {
  const at = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : '—'

  if (finding.class !== 'recoverable') return [
    { when: at(discoveredAt), what: 'Finding detected', done: true },
    { when: at(state.decidedAt), what: 'Evidence reviewed', done: state.decision !== null },
    { when: at(state.recoveryRequestedAt), what: 'Internal review filed', done: state.recoveryStage === 'requested' || state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered' },
    { when: at(state.recoveryResolvedAt), what: state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered' ? 'Internal review closed' : 'Investigation outcome pending', detail: state.recoveryOutcomeNote ?? undefined, done: state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered' },
  ]

  const steps: TimelineStep[] = [
    {
      when: at(discoveredAt),
      what: 'Opportunity detected',
      detail: `${FINDING_TYPE_LABELS[finding.type] ?? finding.type} · ${finding.relatedRecords.length} ${finding.relatedRecords.length === 1 ? 'record' : 'records'} matched`,
      done: true,
    },
    {
      when: at(state.decidedAt),
      what: 'Evidence reviewed',
      detail: state.decision ? undefined : 'Waiting on you',
      done: state.decision !== null,
    },
    {
      when: at(state.recoveryRequestedAt),
      what: 'Recovery request sent',
      done: state.recoveryStage === 'requested' || state.recoveryStage === 'recovered',
    },
    {
      when: at(state.recoveryResolvedAt),
      // Reclaim has no bank feed, so it cannot verify anything itself — the
      // outcome is what the reviewer recorded, and the label says so.
      what:
        state.recoveryStage === 'not_recovered'
          ? 'Closed without recovery'
          : state.recoveryStage === 'recovered' && (state.recoveredAmount ?? 0) <= 0
            ? 'Return amount missing — correct this case before reconciliation'
            : state.recoveryStage === 'recovered'
              ? `Money received — ${formatCurrency(state.recoveredAmount ?? 0)} recorded by you`
            : (state.recoveredAmount ?? 0) > 0
              ? `Partial return — ${formatCurrency(state.recoveredAmount ?? 0)} recorded by you`
              : 'Outcome pending',
      detail: state.recoveryOutcomeNote ?? undefined,
      done: state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered' || (state.recoveredAmount ?? 0) > 0,
    },
  ]
  return steps
}
