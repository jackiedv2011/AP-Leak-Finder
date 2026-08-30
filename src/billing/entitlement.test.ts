import { describe, expect, it } from 'vitest'
import type { Finding } from '@/types'
import {
  buildEntitlement,
  isUnlocked,
  lockedSummary,
  previewFindingIds,
  recoveryEconomics,
  FREE_PREVIEW_COUNT,
  PERFORMANCE_FEE_RATE,
} from '@/billing/entitlement'

function finding(id: string, dollarImpact: number): Finding {
  return {
    id,
    type: 'exact_duplicate',
    class: 'recoverable',
    severity: 'high',
    vendor: `Vendor ${id}`,
    dollarImpact,
    title: `Finding ${id}`,
    explanation: '',
    relatedRecords: [],
  }
}

describe('entitlement', () => {
  const findings = [finding('a', 6800), finding('b', 120), finding('c', 3600), finding('d', 64)]

  it('previews the cheapest findings, not the most valuable ones', () => {
    // The free tier proves detection works without giving away the recoverable value.
    // d=64, b=120, c=3600 are the three smallest; a=6800 stays behind the paywall.
    expect(previewFindingIds(findings)).toEqual(['d', 'b', 'c'])
  })

  it('previews exactly FREE_PREVIEW_COUNT findings', () => {
    expect(previewFindingIds(findings)).toHaveLength(FREE_PREVIEW_COUNT)
  })

  it('breaks ties by id so the preview set is stable across reloads', () => {
    const tied = [finding('z', 50), finding('a', 50), finding('m', 50)]
    expect(previewFindingIds(tied, 2)).toEqual(['a', 'm'])
    // Re-sorting a differently-ordered input yields the same set.
    expect(previewFindingIds([...tied].reverse(), 2)).toEqual(['a', 'm'])
  })

  it('unlocks everything on the pro plan', () => {
    const pro = buildEntitlement('pro', findings)
    expect(findings.every((f) => isUnlocked(pro, f.id))).toBe(true)
    expect(pro.previewIds).toEqual([])
  })

  it('locks the high-value findings on the free plan', () => {
    const free = buildEntitlement('free', findings)
    expect(isUnlocked(free, 'd')).toBe(true)
    expect(isUnlocked(free, 'b')).toBe(true)
    expect(isUnlocked(free, 'c')).toBe(true)
    expect(isUnlocked(free, 'a')).toBe(false)
  })

  it('reports the value held behind the paywall', () => {
    const summary = lockedSummary(buildEntitlement('free', findings), findings)
    expect(summary).toEqual({
      lockedCount: 1,
      lockedValue: 6800,
      unlockedCount: 3,
      unlockedValue: 3600 + 120 + 64,
    })
  })

  it('holds nothing back once subscribed', () => {
    const summary = lockedSummary(buildEntitlement('pro', findings), findings)
    expect(summary.lockedCount).toBe(0)
    expect(summary.lockedValue).toBe(0)
    expect(summary.unlockedValue).toBe(6800 + 3600 + 120 + 64)
  })

  it('handles a ledger smaller than the preview allowance', () => {
    const one = [finding('solo', 500)]
    const free = buildEntitlement('free', one)
    expect(isUnlocked(free, 'solo')).toBe(true)
    expect(lockedSummary(free, one).lockedCount).toBe(0)
  })

  it('handles an empty ledger', () => {
    expect(previewFindingIds([])).toEqual([])
    expect(lockedSummary(buildEntitlement('free', []), [])).toEqual({
      lockedCount: 0,
      lockedValue: 0,
      unlockedCount: 0,
      unlockedValue: 0,
    })
  })

  describe('performance fee', () => {
    it('charges the fee on money actually recovered, never on the potential total', () => {
      const economics = recoveryEconomics(47_280, 40_000, 0.03)
      expect(economics.fee).toBe(1200)
      expect(economics.net).toBe(38_800)
      expect(economics.potential).toBe(47_280)
    })

    it('charges nothing when nothing was recovered', () => {
      const economics = recoveryEconomics(47_280, 0)
      expect(economics.fee).toBe(0)
      expect(economics.net).toBe(0)
    })

    it('always splits the recovered amount exactly — fee plus net loses no cents', () => {
      // 3% of an odd amount is where naive float math strands a fraction of a
      // cent, which would not reconcile against a bank statement.
      for (const recovered of [0.01, 33.33, 1234.56, 99_999.99]) {
        const { fee, net } = recoveryEconomics(recovered, recovered)
        expect(Number((fee + net).toFixed(2))).toBe(Number(recovered.toFixed(2)))
      }
    })

    it('treats a negative recovery as zero rather than paying the customer a fee', () => {
      const economics = recoveryEconomics(100, -50)
      expect(economics.recovered).toBe(0)
      expect(economics.fee).toBe(0)
      expect(economics.net).toBe(0)
    })

    it('defaults to the configured platform rate', () => {
      expect(recoveryEconomics(1000, 1000).feeRate).toBe(PERFORMANCE_FEE_RATE)
      expect(recoveryEconomics(1000, 1000).fee).toBe(Math.round(1000 * PERFORMANCE_FEE_RATE * 100) / 100)
    })
  })
})
