/**
 * A seeded random walk over the whole recovery workflow — the same functions
 * the buttons call, in random order, with deliberately bad input mixed in.
 * After every step the money must still add up. A failure prints the seed and
 * step, so it replays exactly.
 */
import { describe, expect, it } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { mergeImport, setCaseState, getCaseState, serializeEnvironment, deserializeEnvironment, type LedgerEnvironment } from '@/ledger/store'
import { confirmCase, markExpected, markNeedsInfo, reopenDecision, reopenOutcome, withHistory, type CaseState, type RecoveryMethod, type VendorUpdateStatus } from '@/ledger/caseState'
import {
  approveRecovery,
  closeWithoutRecovery,
  reconcileRecovery,
  recordVendorUpdate,
  reopenRemainingBalance,
  setContactHold,
  setNextFollowUp,
  startRecoveryRequest,
  verifyRecovery,
} from '@/recovery/model'
import { ladder, vendors } from '@/workspace/selectors'
import { claimValue } from '@/lib/claims'

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

const STATUSES: VendorUpdateStatus[] = ['acknowledged', 'accepted', 'partial_acceptance', 'already_refunded', 'payment_not_found', 'no_action_required', 'needs_documents', 'disputed', 'promised', 'credit_issued', 'wrong_contact', 'no_response', 'followed_up']
const METHODS: RecoveryMethod[] = ['refund', 'credit', 'offset']
const cents = (n: number | null | undefined) => Math.round((n ?? 0) * 100)
const isCents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6

function checkInvariants(env: LedgerEnvironment, where: string) {
  let outstanding = 0
  let recovered = 0
  let potential = 0
  for (const f of env.result.findings) {
    const s = getCaseState(env, f.id)
    const tag = `${where} ${f.id} stage=${s.recoveryStage}`
    if (s.requestedAmount != null) {
      expect(cents(s.requestedAmount), tag).toBeGreaterThan(0)
      expect(cents(s.requestedAmount), tag).toBeLessThanOrEqual(cents(f.dollarImpact))
    }
    if (s.recoveredAmount != null) {
      expect(s.recoveredAmount, tag).toBeGreaterThanOrEqual(0)
      expect(cents(s.recoveredAmount), tag).toBeLessThanOrEqual(cents(s.requestedAmount ?? f.dollarImpact))
    }
    const settlements = s.recoverySettlements ?? []
    if (settlements.length) {
      expect(settlements.reduce((sum, e) => sum + cents(e.amount), 0), tag).toBe(cents(s.recoveredAmount))
      const refs = settlements.map((e) => `${e.method}|${e.reference.toLowerCase()}|${e.appliedToBill ?? ''}`)
      expect(new Set(refs).size, tag).toBe(refs.length)
      for (const e of settlements) if (e.method !== 'refund') expect(e.appliedToBill?.trim(), tag).toBeTruthy()
    }
    if (s.recoveryStage === 'not_recovered') expect(cents(s.recoveredAmount), tag).toBe(0)
    if (s.reconciledAt) expect(s.recoveryStage, tag).toBe('recovered')
    const open = s.decision !== 'expected' && s.recoveryStage !== 'recovered' && s.recoveryStage !== 'not_recovered'
    if (open) potential += Math.max(0, cents(claimValue(f)) - (claimValue(f) > 0 ? cents(s.recoveredAmount) : 0))
    if (f.class === 'recoverable' && s.recoveryStage === 'requested') outstanding += Math.max(0, cents(s.requestedAmount ?? f.dollarImpact) - cents(s.recoveredAmount))
    if (f.class === 'recoverable' && (s.recoveryStage === 'requested' || s.recoveryStage === 'recovered')) recovered += cents(s.recoveredAmount)
  }
  const l = ladder(env)
  for (const [k, v] of Object.entries({ potential: l.potential, verified: l.verified, inRecovery: l.inRecovery, recovered: l.recovered, atRisk: l.atRisk, awaiting: l.awaitingDecision })) {
    expect(Number.isFinite(v) && v >= 0 && isCents(v), `${where} ladder.${k}=${v}`).toBe(true)
  }
  expect(cents(l.inRecovery), `${where} inRecovery`).toBe(outstanding)
  expect(cents(l.recovered), `${where} recovered`).toBe(recovered)
  expect(cents(l.potential), `${where} potential`).toBe(potential)
  expect(vendors(env).reduce((sum, v) => sum + cents(v.recovered), 0), `${where} vendor recovered`).toBe(recovered)
}

function randomStep(state: CaseState, r: () => number, now: number, supported: number): CaseState {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const money = (max: number) => {
    const roll = r()
    if (roll < 0.1) return -5
    if (roll < 0.2) return max * 3 + 1
    if (roll < 0.25) return 0.005
    return Math.max(0.01, Math.round(r() * max * 100) / 100)
  }
  const outstanding = Math.max(0.01, (state.requestedAmount ?? 100) - (state.recoveredAmount ?? 0))
  switch (Math.floor(r() * 15)) {
    case 0: return confirmCase(r() < 0.5 ? null : 'looks real')
    case 1: return markNeedsInfo('which PO?')
    case 2: return markExpected('intentional', 'intentional')
    case 3: return reopenDecision(state)
    case 4: return reopenOutcome(state)
    case 5: return setContactHold(state, r() < 0.5 ? 'waiting on AP manager' : null)
    case 6: return approveRecovery(state, { at: now, knownBeforeReclaim: r() < 0.3, knownBeforeNote: r() < 0.5 ? 'we saw it in March' : '' })
    case 7: return startRecoveryRequest(state, money(state.requestedAmount ?? supported), now, supported)
    case 8: return recordVendorUpdate(state, { at: now, status: pick(STATUSES), note: r() < 0.9 ? 'vendor replied' : ' ', amount: r() < 0.5 ? undefined : money(outstanding), expectedAt: r() < 0.3 ? now + 86_400_000 : undefined })
    case 9: return setNextFollowUp(state, r() < 0.8 ? now + 3 * 86_400_000 : null)
    case 10:
    case 11: {
      const method = pick(METHODS)
      return verifyRecovery(state, { amount: money(outstanding), method, source: pick(['bank', 'accounting', 'document', 'manual'] as const), reference: pick(['ACH-1', 'ach-1', 'CM-9', 'WIRE-3', ' ', `R-${Math.floor(r() * 5)}`]), settledAt: now, appliedToBill: method === 'refund' || r() < 0.2 ? undefined : pick(['BILL-7', 'BILL-8']) })
    }
    case 12: return closeWithoutRecovery(state, r() < 0.85 ? 'vendor refused' : '  ', now)
    case 13: return reopenRemainingBalance(state, now)
    default: return reconcileRecovery(state, { note: r() < 0.85 ? 'JE-1' : '', rootCause: 'Payment retry', at: now })
  }
}

describe('recovery workflow — random walk', () => {
  const base = mergeImport(null, { sourceLabel: 'sample.csv', mode: 'upload', parsed: getSampleLedger() })

  it('200 sessions × 60 random actions (valid and invalid) never break the money', () => {
    let applied = 0
    let refused = 0
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed)
      let env = base
      let now = Date.UTC(2026, 0, 5)
      for (let step = 0; step < 60; step++) {
        const finding = env.result.findings[Math.floor(r() * env.result.findings.length)]
        const before = getCaseState(env, finding.id)
        now += Math.floor(r() * 3) * 86_400_000
        let next: CaseState
        try {
          next = randomStep(before, r, now, finding.dollarImpact)
        } catch {
          refused++ // the model refused bad input or an out-of-order step — that is the point
          continue
        }
        env = setCaseState(env, finding.id, withHistory(before, next, 'qa', finding.class !== 'recoverable'))
        applied++
        checkInvariants(env, `seed ${seed} step ${step}`)
        if (step % 15 === 14) {
          // Saving and reloading must not change a single figure.
          const reloaded = deserializeEnvironment(serializeEnvironment(env))
          expect(ladder(reloaded), `seed ${seed} step ${step} reload`).toEqual(ladder(env))
          env = reloaded
        }
      }
    }
    // Both kinds of step actually happened in volume.
    expect(applied).toBeGreaterThan(3000)
    expect(refused).toBeGreaterThan(2000)
  })
})
