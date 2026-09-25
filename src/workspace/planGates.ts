import type { LedgerEnvironment } from '@/ledger/store'
import type { Entitlements } from '@/lib/plans'
import type { Finding } from '@/types'
import { claimValue, sumMoney } from '@/lib/claims'

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
  const visible = new Set(cheapest.map((f) => f.id))
  // A case someone has already acted on stays open to them: adding records can
  // change which findings are cheapest, and a request already sent to a vendor
  // must never become impossible to follow up.
  for (const f of all) if (env.caseStates[f.id]?.decision) visible.add(f.id)
  return visible
}

export interface LockedSummary {
  count: number
  /** What the locked findings could bring back — claims only, never payments-to-verify or missed discounts. */
  value: number
}

export function lockedSummary(findings: Finding[], visible: Set<string>): LockedSummary {
  const locked = findings.filter((f) => !visible.has(f.id))
  return { count: locked.length, value: sumMoney(locked.map(claimValue)) }
}

/** Placeholders shown in place of a locked finding's vendor and amount. */
export const REDACTED_VENDOR = 'Vendor hidden'
export const REDACTED_MONEY = '$•,•••.••'
