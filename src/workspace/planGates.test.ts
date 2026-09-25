import { describe, expect, it } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { mergeImport } from '@/ledger/store'
import { entitlementsFor, FLAT_BREAK_EVEN, PLAN_LIMITS, PLAN_PRICE_USD, successFee } from '@/lib/plans'
import { lockedSummary, visibleFindingIds } from '@/workspace/planGates'
import { setCaseState } from '@/ledger/store'
import { confirmCase, markRecoveryRequested } from '@/ledger/caseState'

const env = mergeImport(null, { sourceLabel: 's.csv', mode: 'upload', parsed: getSampleLedger() })

describe('plan gates', () => {
  it('Free shows exactly the N lowest-value findings and locks the rest', () => {
    const visible = visibleFindingIds(env, entitlementsFor('free', 0))
    expect(visible.size).toBe(PLAN_LIMITS.free.findingsVisible)
    const sorted = [...env.result.findings].sort((a, b) => a.dollarImpact - b.dollarImpact)
    for (const f of sorted.slice(0, 3)) expect(visible.has(f.id)).toBe(true)
    for (const f of sorted.slice(3)) expect(visible.has(f.id)).toBe(false)
    const locked = lockedSummary(env.result.findings, visible)
    expect(locked.count).toBe(env.result.findings.length - 3)
    // The teaser's "worth $X" is what the locked findings could bring back — not payments to verify or missed discounts.
    const claims = sorted.slice(3).filter((f) => !['missed_discount', 'bank_account_change', 'shared_invoice_number'].includes(f.type))
    expect(locked.value).toBeCloseTo(claims.reduce((s, f) => s + f.dollarImpact, 0), 2)
  })

  it('a case with a decision on it stays visible on Free even when new records push it out of the cheapest three', () => {
    const sorted = [...env.result.findings].sort((a, b) => a.dollarImpact - b.dollarImpact)
    const acted = sorted[sorted.length - 1]
    const withDecision = setCaseState(env, acted.id, markRecoveryRequested(confirmCase(null)))
    const visible = visibleFindingIds(withDecision, entitlementsFor('free', 0))
    expect(visible.has(acted.id)).toBe(true)
    expect(visible.size).toBe(PLAN_LIMITS.free.findingsVisible! + 1)
  })

  it('Pro shows everything, and Free shows everything when there are no more than N findings', () => {
    expect(visibleFindingIds(env, entitlementsFor('growth', 99)).size).toBe(env.result.findings.length)
    const small = { ...env, result: { ...env.result, findings: env.result.findings.slice(0, 2) } }
    expect(visibleFindingIds(small, entitlementsFor('free', 0)).size).toBe(2)
  })

  it('every track has unlimited uploads; only Free shows 3 findings and refuses repeats', () => {
    for (const plan of ['free', 'growth', 'flat'] as const) expect(entitlementsFor(plan, 500).canStartAudit).toBe(true)
    expect(entitlementsFor('free', 0).limits).toMatchObject({ findingsVisible: 3, blocksRepeatUploads: true, aiDrafts: false })
    expect(entitlementsFor('growth', 0).limits).toEqual(entitlementsFor('flat', 0).limits)
    expect(entitlementsFor('growth', 0).limits).toMatchObject({ findingsVisible: null, blocksRepeatUploads: false, aiDrafts: true })
  })

  it('pricing: $19.99 + 15% of what came back on Growth, $100 flat, and the break-even between them', () => {
    expect(PLAN_PRICE_USD).toEqual({ free: 0, growth: 19.99, flat: 100 })
    expect(successFee('growth', 1234.56)).toBe(185.18)
    expect(successFee('flat', 1234.56)).toBe(0)
    expect(successFee('free', 1234.56)).toBe(0)
    expect(FLAT_BREAK_EVEN).toBe(533.4)
    expect(19.99 + successFee('growth', FLAT_BREAK_EVEN)).toBeCloseTo(100, 2)
  })
})
