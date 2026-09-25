/**
 * Data-consistency contract for every number the dashboard shows.
 *
 * The rules, stated once so the tests below can be read against them:
 *   potential   — money still in play that could come back: every claim (not a
 *                 missed discount, bank-account change or shared invoice number)
 *                 not dismissed and not yet resolved. Never includes money that
 *                 already came back, protected money, or payments at risk.
 *   atRisk      — open bank-account / shared-invoice alerts, reported apart.
 *   protected   — missed discounts: a process fix, never recovery.
 *   verified    — recoverable-class findings the rules support that have not
 *                 been dismissed and have not moved on to a request/outcome.
 *   inRecovery  — outstanding balance on requests that are still open.
 *   recovered   — only the amount recorded as actually settled.
 *   A partially returned case contributes separate amounts to inRecovery and recovered.
 */
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { mergeImport, setCaseState, type LedgerEnvironment } from '@/ledger/store'
import { confirmCase, markExpected, markNeedsInfo, markRecoveryRequested, recordRecoveryOutcome, EMPTY_CASE_STATE } from '@/ledger/caseState'
import { verifyRecovery } from '@/recovery/model'
import { internalReviews, ladder, opportunities, recentReturns, recoveries, recoveryAging, recordedRootCauses, rootCauses, timelineFor, vendorCommitments, vendors } from '@/workspace/selectors'
import { approveRecovery, recordVendorUpdate, startRecoveryRequest } from '@/recovery/model'

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

describe('recovery dashboard activity', () => {
  it('does not infer a full return from a legacy recovered stage without an amount', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, { ...confirmCase(null), recoveryStage: 'recovered', requestedAmount: 1000, recoveredAmount: null, recoveryResolvedAt: 500, reconciledAt: 600, rootCause: 'Payment retry' })
    expect(ladder(env).recovered).toBe(0)
    expect(ladder(env).counts.recovered).toBe(0)
    expect(recentReturns(env)).toEqual([])
    expect(recordedRootCauses(env)).toEqual([])
  })
  it('ages only open vendor requests and keeps missing request dates explicit', () => {
    let env = baseline()
    const today = new Date(2026, 8, 21, 12).getTime()
    const sevenDaysAgo = new Date(2026, 8, 14, 12).getTime()
    const thirtyTwoDaysAgo = new Date(2026, 7, 20, 12).getTime()
    const alpha = findingFor(env, 'Alpha')
    const beta = findingFor(env, 'Beta')
    const gamma = findingFor(env, 'Gamma')
    const alphaRequest = startRecoveryRequest(approveRecovery(confirmCase(null), { at: sevenDaysAgo, knownBeforeReclaim: false }), 1000, sevenDaysAgo)
    env = setCaseState(env, alpha.id, verifyRecovery(alphaRequest, { amount: 100, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: today - 1000 }))
    env = setCaseState(env, beta.id, startRecoveryRequest(approveRecovery(confirmCase(null), { at: thirtyTwoDaysAgo, knownBeforeReclaim: false }), 500, thirtyTwoDaysAgo))
    env = setCaseState(env, gamma.id, { ...markRecoveryRequested(confirmCase(null), 250), recoveryRequestedAt: null })
    expect(recoveryAging(env, today)).toEqual([
      { label: '0–14 days', count: 1, outstanding: 900 },
      { label: '15–30 days', count: 0, outstanding: 0 },
      { label: '31+ days', count: 1, outstanding: 500 },
      { label: 'Date unknown', count: 1, outstanding: 250 },
    ])
  })

  it('lists recent recorded returns by settlement date, including partial returns', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const beta = findingFor(env, 'Beta')
    const alphaRequest = startRecoveryRequest(approveRecovery(confirmCase(null), { at: 100, knownBeforeReclaim: false }), 1000, 200)
    const betaRequest = startRecoveryRequest(approveRecovery(confirmCase(null), { at: 100, knownBeforeReclaim: false }), 500, 200)
    env = setCaseState(env, alpha.id, verifyRecovery(alphaRequest, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 }))
    env = setCaseState(env, beta.id, verifyRecovery(betaRequest, { amount: 500, method: 'credit', source: 'accounting', reference: 'CM-1', appliedToBill: 'BILL-1', settledAt: 400 }))
    expect(recentReturns(env)).toMatchObject([
      { findingId: beta.id, amount: 500, settledAt: 400, partial: false },
      { findingId: alpha.id, amount: 300, settledAt: 300, partial: true },
    ])
  })

  it('lists each settlement at its own amount and date instead of dating the case total by the latest return', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: 100, knownBeforeReclaim: false }), 1000, 200)
    const first = verifyRecovery(requested, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 300 })
    env = setCaseState(env, alpha.id, verifyRecovery(first, { amount: 700, method: 'refund', source: 'bank', reference: 'ACH-2', settledAt: 400 }))
    expect(recentReturns(env)).toMatchObject([
      { findingId: alpha.id, amount: 700, settledAt: 400, reference: 'ACH-2' },
      { findingId: alpha.id, amount: 300, settledAt: 300, reference: 'ACH-1' },
    ])
  })
})

describe('ladder — fresh audit', () => {
  it('uses the finding discovery time, never a historical payment date, in the case timeline', () => {
    const env = baseline()
    const finding = findingFor(env, 'Alpha')
    const importedAt = env.imports.find((batch) => batch.findingIds?.includes(finding.id))?.importedAt
    expect(importedAt).toBeTypeOf('number')
    expect(timelineFor(finding, EMPTY_CASE_STATE, importedAt)[0].when).toBe(new Date(importedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    expect(timelineFor(finding, EMPTY_CASE_STATE)[0].when).toBe('—')
  })
  it('counts only claims as potential recovery; payments at risk and missed discounts are reported apart, never added in', () => {
    const l = ladder(baseline())
    expect(l.openCount).toBe(5)
    expect(l.counts.potential).toBe(3)
    expect(l.potential).toBe(1000 + 500 + 250)
    expect(l.atRisk).toBe(720)
    expect(l.counts.verified).toBe(3)
    expect(l.verified).toBe(1750)
    expect(l.awaitingDecision).toBe(1750)
    expect(l.inRecovery).toBe(0)
    expect(l.recovered).toBe(0)
    expect(l.protected).toBe(0)
  })
})

describe('ladder — the recovery lifecycle moves money along, never duplicating it', () => {
  it('separates vendor agreement and pending return from recovered value', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: 100, knownBeforeReclaim: false }), 1000, 200)
    const promised = recordVendorUpdate(requested, { status: 'promised', note: 'Will refund 800', amount: 800, at: 300 })
    env = setCaseState(env, alpha.id, promised)
    expect(vendorCommitments(env)).toMatchObject({ confirmed: 800, pendingReturn: 800, confirmedCases: 1, pendingCases: 1 })
    expect(ladder(env).recovered).toBe(0)
    const partial = verifyRecovery(promised, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 400 })
    env = setCaseState(env, alpha.id, partial)
    expect(vendorCommitments(env)).toMatchObject({ confirmed: 500, pendingReturn: 500 })
    expect(ladder(env).recovered).toBe(300)
    const disputed = recordVendorUpdate(partial, { status: 'disputed', note: 'Disputes the remainder', at: 500 })
    env = setCaseState(env, alpha.id, disputed)
    expect(vendorCommitments(env)).toMatchObject({ confirmed: 0, pendingReturn: 0 })
  })

  it('does not invent a vendor commitment amount when a partial claim, promise, or credit has no amount', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { at: 100, knownBeforeReclaim: false }), 1000, 200)
    for (const status of ['promised', 'credit_issued'] as const) {
      env = setCaseState(env, alpha.id, recordVendorUpdate(requested, { status, note: 'No amount given', at: 300 }))
      expect(vendorCommitments(env)).toMatchObject({ confirmed: 0, pendingReturn: 0, confirmedCases: 0, pendingCases: 0 })
    }
    // A partial acceptance now needs its figure, but replies saved before that
    // rule may lack one, and those must still not be valued at the full claim.
    expect(() => recordVendorUpdate(requested, { status: 'partial_acceptance', note: 'No amount given', at: 300 })).toThrow(/amount/i)
    env = setCaseState(env, alpha.id, { ...requested, vendorUpdates: [{ status: 'partial_acceptance', note: 'Saved before the rule', at: 300 }] })
    expect(vendorCommitments(env)).toMatchObject({ confirmed: 0, pendingReturn: 0, confirmedCases: 0, pendingCases: 0 })
    const accepted = recordVendorUpdate(requested, { status: 'accepted', note: 'Accepted the full claim', at: 300 })
    env = setCaseState(env, alpha.id, accepted)
    expect(vendorCommitments(env)).toMatchObject({ confirmed: 1000, pendingReturn: 0 })
    env = setCaseState(env, alpha.id, verifyRecovery(accepted, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-2', settledAt: 400 }))
    expect(vendorCommitments(env)).toMatchObject({ confirmed: 700, pendingReturn: 0 })
  })

  it('splits a partial return between outstanding and recovered without double counting', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    const requested = markRecoveryRequested(confirmCase(null), 1000)
    env = setCaseState(env, alpha.id, verifyRecovery(requested, { amount: 400, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: 500 }))
    const l = ladder(env)
    expect(l.inRecovery).toBe(600)
    expect(l.recovered).toBe(400)
    // Claims only (the $720 bank alert and $20 missed discount are not money owed), net of the $400 returned.
    expect(l.potential).toBe(1750 - 400)
    expect(vendors(env).find((row) => row.vendor === 'Alpha')).toMatchObject({ potential: 600, recovered: 400 })
  })

  it('keeps an internal investigation note out of vendor-request dollars', () => {
    let env = baseline()
    const review = findingFor(env, 'Delta')
    env = setCaseState(env, review.id, markRecoveryRequested(confirmCase(null), review.dollarImpact))
    expect(ladder(env).inRecovery).toBe(0)
    env = setCaseState(env, review.id, recordRecoveryOutcome(env.caseStates[review.id], 'recovered', review.dollarImpact, 'Legacy review outcome'))
    expect(ladder(env).recovered).toBe(0)
    expect(vendors(env).find((row) => row.vendor === 'Delta')?.recovered).toBe(0)
    expect(timelineFor(review, env.caseStates[review.id]).at(-1)?.what).toBe('Internal review closed')
  })
  it('keeps an open internal investigation in Findings work rather than vendor Recoveries', () => {
    let env = baseline()
    const review = findingFor(env, 'Delta')
    env = setCaseState(env, review.id, markRecoveryRequested(confirmCase('Check bank update'), review.dollarImpact))
    expect(recoveries(env).some((row) => row.finding.id === review.id)).toBe(false)
    expect(internalReviews(env).map((row) => row.finding.id)).toEqual([review.id])
    expect(opportunities(env).some((row) => row.finding.id === review.id)).toBe(true)
  })
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
    expect(l.potential).toBe(1750) // still in play

    env = setCaseState(env, alpha.id, recordRecoveryOutcome(env.caseStates[alpha.id], 'recovered', 1000, null))
    l = ladder(env)
    expect(l.verified).toBe(750)
    expect(l.inRecovery).toBe(0)
    expect(l.recovered).toBe(1000)
    expect(l.counts.recovered).toBe(1)
    expect(l.potential).toBe(750) // recovered money is no longer "potential"
    expect(l.counts.potential).toBe(2)
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
    expect(l.counts.recovered).toBe(1)
    expect(l.inRecovery).toBe(0)
  })

  it('"not recovered" closes the case: out of potential, out of every rung, and never counted as recovered', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null)), 'not_recovered', null, null))
    const l = ladder(env)
    expect(l.potential).toBe(750)
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
    expect(l.potential).toBe(500 + 250)
    expect(l.counts.potential).toBe(2)
    expect(l.atRisk).toBe(0)
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
    expect(l.potential).toBe(1750)
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
    expect(l.potential).toBe(0)
    expect(l.verified).toBe(0)
    expect(l.atRisk).toBe(720)
    // A missed discount is a future saving, not a prevented payment: protected stays zero.
    expect(l.protected).toBe(0)
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

  it('counts the requested amount in recovery when the customer claims less than the finding value', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, markRecoveryRequested(confirmCase(null), 600))
    expect(ladder(env).inRecovery).toBe(600)
  })
})

describe('opportunities ordering', () => {
  it('ranks the largest strongly evidenced duplicate first and the low-value opportunity last', () => {
    const rows = opportunities(baseline())
    expect(rows[0].finding.vendor).toBe('Alpha')
    expect(rows.at(-1)!.finding.vendor).toBe('Epsilon')
  })

  it('a payment to verify or a missed discount can never be counted as money in recovery or recovered', () => {
    let env = baseline()
    const delta = findingFor(env, 'Delta')
    const epsilon = findingFor(env, 'Epsilon')
    // Even if a stored state claims money came back on them (older data, or a bypassed UI)…
    env = setCaseState(env, delta.id, markRecoveryRequested(confirmCase(null), 720))
    let l = ladder(env)
    expect(l.inRecovery).toBe(0)
    env = setCaseState(env, delta.id, recordRecoveryOutcome(env.caseStates[delta.id], 'recovered', 720, null))
    env = setCaseState(env, epsilon.id, recordRecoveryOutcome(markRecoveryRequested(confirmCase(null), 20), 'recovered', 20, null))
    l = ladder(env)
    // …the ladder never reports it as recovered money.
    expect(l.recovered).toBe(0)
    expect(vendors(env).reduce((s, v) => s + v.recovered, 0)).toBe(0)
  })

  it('in recovery is what was actually asked for, not the full finding, when a partial request goes out', () => {
    let env = baseline()
    const alpha = findingFor(env, 'Alpha')
    env = setCaseState(env, alpha.id, markRecoveryRequested(confirmCase(null), 600))
    const l = ladder(env)
    expect(l.inRecovery).toBe(600)
    expect(l.potential).toBe(1750)
  })
})

it('groups actual customer-recorded root causes by recovered value', () => {
  let env = baseline()
  const alpha = findingFor(env, 'Alpha')
  const beta = findingFor(env, 'Beta')
  env = setCaseState(env, alpha.id, { ...recordRecoveryOutcome(markRecoveryRequested(confirmCase(null), 1000), 'recovered', 600, null), rootCause: 'Payment retry', reconciledAt: 100 })
  env = setCaseState(env, beta.id, { ...recordRecoveryOutcome(markRecoveryRequested(confirmCase(null), 500), 'recovered', 400, null), rootCause: 'Payment retry', reconciledAt: 200 })
  expect(recordedRootCauses(env)).toEqual([{ label: 'Payment retry', count: 2, recovered: 1000 }])
})
