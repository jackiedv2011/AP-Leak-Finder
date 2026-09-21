import { describe, expect, it } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { mergeImport } from '@/ledger/store'
import { entitlementsFor, PLAN_LIMITS } from '@/lib/plans'
import { lockedSummary, visibleFindingIds } from '@/workspace/planGates'

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
    expect(locked.value).toBeCloseTo(sorted.slice(3).reduce((s, f) => s + f.dollarImpact, 0), 2)
  })

  it('Pro shows everything, and Free shows everything when there are no more than N findings', () => {
    expect(visibleFindingIds(env, entitlementsFor('pro', 99)).size).toBe(env.result.findings.length)
    const small = { ...env, result: { ...env.result, findings: env.result.findings.slice(0, 2) } }
    expect(visibleFindingIds(small, entitlementsFor('free', 0)).size).toBe(2)
  })

  it('entitlements say when one more audit is allowed', () => {
    expect(entitlementsFor('free', 2).canStartAudit).toBe(true)
    expect(entitlementsFor('free', 3).canStartAudit).toBe(false)
    expect(entitlementsFor('pro', 300).canStartAudit).toBe(true)
  })
})
