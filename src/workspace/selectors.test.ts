/**
 * Data-consistency contract for every number the dashboard shows.
 *
 * The rules, stated once so the tests below can be read against them:
 *   potential   — money still in play: every finding not dismissed and not yet
 *                 resolved (recovered / not recovered). Never includes money
 *                 that already came back.
 *   verified    — recoverable-class findings the rules support that have not
 *                 been dismissed and have not moved on to a request/outcome.
 *   inRecovery  — a request has gone out and nothing has come back yet.
 *   recovered   — only the amount recorded as actually settled.
 *   A case sits on exactly one of verified / inRecovery / recovered.
 */
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { mergeImport, setCaseState, type LedgerEnvironment } from '@/ledger/store'
import { confirmCase, markExpected, markNeedsInfo, markRecoveryRequested, recordRecoveryOutcome, EMPTY_CASE_STATE } from '@/ledger/caseState'
import { ladder, opportunities, recoveries, rootCauses, vendors } from '@/workspace/selectors'

const HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4'
function envFrom(rows: string[]): LedgerEnvironment {
  return mergeImport(null, { sourceLabel: 'test.csv', mode: 'upload', parsed: parseCsv([HEADER, ...rows].join('\n')) })
}

// Three recoverable duplicates ($1000, $500, $250), one review-class bank change ($720), one opportunity ($20).
function baseline(): LedgerEnvironment {
  return envFrom([
    'Alpha,A-1,2025-01-01,2025-01-10,1000,1000,,1111',
    'Alpha,A-1,2025-01-01,2025-01-20,1000,1000,,1111',
    'Beta,B-1,2025-01-01,2025-01-10,500,500,,2222',
    'Beta,B-1,2025-01-01,2025-01-20,500,500,,2222',
    'Gamma,G-1,2025-01-01,2025-01-10,250,250,,3333',
    'Gamma,G-1,2025-01-01,2025-01-20,250,250,,3333',
    'Delta,D-1,2025-01-01,2025-01-10,700,700,,4444',
    'Delta,D-2,2025-02-01,2025-02-10,720,720,,5555',
    'Epsilon,E-1,2025-03-01,2025-03-25,1000,1000,2/10 net 30,6666',
  ])
}

const findingFor = (env: LedgerEnvironment, vendor: string) => env.result.findings.find((f) => f.vendor === vendor)!

describe('ladder — fresh audit', () => {
  it('counts every finding as potential, only recoverable ones as verified, nothing in recovery', () => {
    const l = ladder(baseline())
    expect(l.counts.potential).toBe(5)
    expect(l.potential).toBe(1000 + 500 + 250 + 720 + 20)
    expect(l.counts.verified).toBe(3)
    expect(l.verified).toBe(1750)
    expect(l.awaitingDecision).toBe(1750)
    expect(l.inRecovery).toBe(0)
    expect(l.recovered).toBe(0)
    expect(l.protected).toBe(20)
  })
})

describe('ladder — the recovery lifecycle moves money along, never duplicating it', () => {
  it('confirm → request → recovered: a case is on exactly one rung at a time', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')

    env = setCaseState(env, alpha.id, confirmCase(null))
    let l = ladder(env)
    expect(l.awaitingDecision).toBe(750)
    expect(l.verified).toBe(1750) // confirmed but not yet sent still counts as verified
    expect(l.inRecovery).toBe(0)

    env = setCaseState(env, alpha.id, markRecoveryRequested(env.caseStates[alpha.id]))
    l = ladder(env)
    expect(l.verified).toBe(750)
    expect(l.inRecovery).toBe(1000)
    expect(l.counts.inRecovery).toBe(1)
    expect(l.recovered).toBe(0)
    expect(l.potential).toBe(2490) // still in play

    env = setCaseState(env, alpha.id, recordRecoveryOutcome(env.caseStates[alpha.id], 'recovered', 1000, null))
    l = ladder(env)
    expect(l.verified).toBe(750)
    expect(l.inRecovery).toBe(0)
    expect(l.recovered).toBe(1000)
    expect(l.counts.recovered).toBe(1)
    expect(l.potential).toBe(1490) // recovered money is no longer "potential"
    expect(l.counts.potential).toBe(4)
  })

  it('partial recovery counts only what came back, and zero recovery counts nothing', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const beta = findingFor(env, 'Beta')
    env = setCaseState(env, alpha.id, markRecoveryRequested(confirmCase(null)))
    env = setCaseState(env, beta.id, markRecoveryRequested(confirmCase(null)))
    env = setCaseState(env, alpha.id, recordRecoveryOutcome(env.caseStates[alpha.id], 'recovered', 400, 'vendor credited part'))
    env = setCaseState(env, beta.id, recordRecoveryOutcome(env.caseStates[beta.id], 'recovered', 0, 'nothing came'))
    const l = ladder(env)
    expect(l.recovered).toBe(400)
    expect(l.counts.recovered).toBe(2)
    expect(l.inRecovery).toBe(0)
  })

  it('"not recovered" closes the case: out of potential, out of every rung, and never counted as recovered', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'not_recovered', null, null))
    const l = ladder(env)
    expect(l.potential).toBe(1490)
    expect(l.verified).toBe(750)
    expect(l.inRecovery).toBe(0)
    expect(l.recovered).toBe(0)
    expect(recoveries(env).map((o) => o.state.recoveryStage)).toEqual(['not_recovered'])
  })

  it('a dismissed finding leaves potential, verified, awaiting-decision, root causes and vendor totals', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const delta = findingFor(env, 'Delta')
    env = setCaseState(env, alpha.id, markExpected('split payment', 'intentional'))
    env = setCaseState(env, delta.id, markExpected('we asked them to change it', 'known_vendor_exception'))
    const l = ladder(env)
    expect(l.potential).toBe(500 + 250 + 20)
    expect(l.counts.potential).toBe(3)
    expect(l.verified).toBe(750)
    expect(l.awaitingDecision).toBe(750)
    expect(rootCauses(env).find((c) => c.type === 'bank_account_change')).toBeUndefined()
    expect(rootCauses(env).find((c) => c.type === 'exact_duplicate')?.value).toBe(750)
    expect(vendors(env).find((v) => v.vendor === 'Alpha')?.potential).toBe(0)
    expect(vendors(env).find((v) => v.vendor === 'Alpha')?.recordCount).toBe(2)
  })

  it('"needs information" keeps the case in play but takes it off the waiting-on-you figure', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, markNeedsInfo('which PO?'))
    const l = ladder(env)
    expect(l.potential).toBe(2490)
    expect(l.verified).toBe(1750)
    expect(l.awaitingDecision).toBe(750)
  })

  it('changing a decision back to undecided restores every figure exactly', () => {
    let env = baseline()
    const before = ladder(env)
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, markExpected(null))
    expect(ladder(env)).not.toEqual(before)
    env = setCaseState(env, alpha.id, EMPTY_CASE_STATE)
    expect(ladder(env)).toEqual(before)
  })

  it('potential recovery and actual recovered are never the same money', () => {
    let env = baseline()
    for (const f of env.result.findings.filter((f) => f.class === 'recoverable')) {
      env = setCaseState(env, f.id, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'recovered', f.dollarImpact, null))
    }
    const l = ladder(env)
    expect(l.recovered).toBe(1750)
    expect(l.potential).toBe(740)
    expect(l.verified).toBe(0)
    expect(l.potential + l.recovered).toBe(2490)
  })

  it('reports and recoveries agree with the ladder on what is in recovery and what came back', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const beta = findingFor(env, 'Beta')
    env = setCaseState(env, alpha.id, markRecoveryRequested(confirmCase(null)))
    env = setCaseState(env, beta.id, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'recovered', 500, null))
    const l = ladder(env)
    const rows = recoveries(env)
    const inRecovery = rows.filter((o) => o.state.recoveryStage === 'requested').reduce((s, o) => s + o.finding.dollarImpact, 0)
    const recovered = rows.filter((o) => o.state.recoveryStage === 'recovered').reduce((s, o) => s + (o.state.recoveredAmount ?? 0), 0)
    expect(inRecovery).toBe(l.inRecovery)
    expect(recovered).toBe(l.recovered)
    expect(vendors(env).reduce((s, v) => s + v.recovered, 0)).toBe(l.recovered)
  })
})

describe('opportunities ordering', () => {
  it('ranks the largest strongly evidenced duplicate first and the low-value opportunity last', () => {
    const rows = opportunities(baseline())
    expect(rows[0].finding.vendor).toBe('Alpha')
    expect(rows.at(-1)!.finding.vendor).toBe('Epsilon')
  })
})
