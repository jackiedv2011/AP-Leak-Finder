import type { LedgerEnvironment } from '@/ledger/store'
import type { Entitlements } from '@/lib/plans'
import type { Finding } from '@/types'

/**
 * Which findings the plan shows in full. Free shows the lowest-value ones —
 * enough to see the product work on real money — and blurs the rest, so the
 * largest recoveries are the reason to upgrade.
 */
export function visibleFindingIds(env: LedgerEnvironment, entitlements: Entitlements): Set<string> {
  const limit = entitlements.limits.findingsVisible
  const all = env.result.findings
  if (limit === null || all.length <= limit) return new Set(all.map((f) => f.id))
  const cheapest = [...all].sort((a, b) => a.dollarImpact - b.dollarImpact || a.id.localeCompare(b.id)).slice(0, limit)
  return new Set(cheapest.map((f) => f.id))
}

export interface LockedSummary {
  count: number
  value: number
}

export function lockedSummary(findings: Finding[], visible: Set<string>): LockedSummary {
  const locked = findings.filter((f) => !visible.has(f.id))
  return { count: locked.length, value: locked.reduce((s, f) => s + f.dollarImpact, 0) }
}
