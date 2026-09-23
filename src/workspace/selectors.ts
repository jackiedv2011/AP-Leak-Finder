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
   * Money still in play: every finding that has not been dismissed and has
   * not reached an outcome. Money that already came back (or was closed as
   * not recoverable) leaves this figure — potential and recovered are never
   * the same dollars.
   */
  potential: number
  /**
   * The rules engine's verdict that the records support a recovery — not a
   * human's. Nothing here has been agreed to by a vendor, so this is the
   * ceiling on what could be claimed, never a forecast of what will come back.
   * A case leaves this rung once it is dismissed or once a request goes out.
   */
  verified: number
  /** A request has actually gone out and nothing has come back yet. */
  inRecovery: number
  /** Money that actually came back — the only figure worth trusting. */
  recovered: number
  /** Stopped before it left, rather than clawed back after. */
  protected: number
  counts: Record<LadderStage, number>
  /** Verified and still waiting on a person — §28's "what should I do". */
  awaitingDecision: number
}

/**
 * The spec's ladder has a "Confirmed" rung between In Recovery and Recovered,
 * meaning the vendor has agreed the money is owed. Nothing in the ledger
 * records that. `RecoveryStage` does have a `confirmed` value, but it means
 * the reviewer confirmed the case is real and it is ready to send — an
 * internal judgement, not the vendor's — and after `requested` the only
 * outcomes are `recovered` and `not_recovered`. Rather than relabel our own
 * confidence as the vendor's agreement, the rung is left out until there is a
 * real state behind it.
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

/** Cases a reviewer has pushed into the recovery process. */
export function recoveries(env: LedgerEnvironment): Opportunity[] {
  return opportunities(env).filter(
    (o) => o.state.recoveryStage !== null && o.state.recoveryStage !== undefined
  )
}

/** Verified, undecided, and waiting on a human — §28's "what should I do". */
export function awaitingDecision(env: LedgerEnvironment): Opportunity[] {
  return opportunities(env).filter((o) => o.state.decision === null && o.finding.class === 'recoverable')
}

export function ladder(env: LedgerEnvironment): Ladder {
  const empty = { potential: 0, verified: 0, inRecovery: 0, recovered: 0, protected: 0 }
  const counts: Record<LadderStage, number> = { ...empty }
  const totals = { ...empty }
  let awaitingDecision = 0

  for (const finding of env.result.findings) {
    const state = getCaseState(env, finding.id)
    const stage = state.recoveryStage
    if (finding.class === 'recoverable' && state.decision === null) {
      awaitingDecision += finding.dollarImpact
    }

    // Each case sits on exactly one rung. Dismissed and resolved cases are
    // off the ladder entirely except for the money that actually settled.
    const dismissed = state.decision === 'expected'
    const resolved = stage === 'recovered' || stage === 'not_recovered'
    if (!dismissed && !resolved) {
      totals.potential += finding.dollarImpact
      counts.potential += 1
    }

    if (finding.class === 'opportunity' && !dismissed) {
      totals.protected += finding.dollarImpact
      counts.protected += 1
    }
    if (finding.class === 'recoverable' && !dismissed && stage !== 'requested' && !resolved) {
      totals.verified += finding.dollarImpact
      counts.verified += 1
    }
    if (stage === 'requested') {
      totals.inRecovery += finding.dollarImpact
      counts.inRecovery += 1
    }
    if (stage === 'recovered') {
      // A promise isn't a recovery. Only the amount that actually settled counts,
      // and only once it has been recorded as settled.
      totals.recovered += state.recoveredAmount ?? finding.dollarImpact
      counts.recovered += 1
    }
  }

  return { ...totals, counts, awaitingDecision }
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
    if (isStillInPlay(state)) row.potential += finding.dollarImpact
    if (state.recoveryStage === 'recovered') row.recovered += state.recoveredAmount ?? finding.dollarImpact
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

/** The chronological record for a single case (§21). */
export interface TimelineStep {
  when: string
  what: string
  detail?: string
  done: boolean
}

export function timelineFor(finding: Finding, state: CaseState): TimelineStep[] {
  const at = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

  const steps: TimelineStep[] = [
    {
      when: at(finding.relatedRecords[0]?.paymentDate?.getTime()),
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
          : state.recoveryStage === 'recovered'
            ? `Money received — ${formatCurrency(state.recoveredAmount ?? finding.dollarImpact)} recorded by you`
            : 'Outcome recorded',
      detail: state.recoveryOutcomeNote ?? undefined,
      done: state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered',
    },
  ]
  return steps
}
