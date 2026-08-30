import type { Finding } from '@/types'

export type Plan = 'free' | 'pro'

/**
 * How many findings a business sees before subscribing.
 *
 * Free findings are proof, not product: enough for the business to pull their
 * own records and confirm Reclaim is finding real errors, not enough to work
 * the ledger without subscribing.
 */
export const FREE_PREVIEW_COUNT = 3

/** Fixed monthly subscription, in dollars. */
export const SUBSCRIPTION_PRICE_MONTHLY = 299

/**
 * Reclaim's share of money the business actually recovers.
 *
 * Charged on *confirmed recovered* amounts only — never on the potential
 * total, and never on a claim the vendor refused. Reclaim never holds the
 * money: the refund or credit goes straight to the business, and this fee is
 * billed afterwards against what they confirmed they received.
 */
export const PERFORMANCE_FEE_RATE = 0.03

export interface RecoveryEconomics {
  /** Everything Reclaim flagged as potentially recoverable. */
  potential: number
  /** Money the business has confirmed actually landed. */
  recovered: number
  /** Reclaim's performance fee on `recovered`. */
  fee: number
  /** What the business keeps after the fee. */
  net: number
  feeRate: number
}

/** Split confirmed recoveries into the business's share and Reclaim's fee. */
export function recoveryEconomics(
  potential: number,
  recovered: number,
  feeRate: number = PERFORMANCE_FEE_RATE
): RecoveryEconomics {
  const safeRecovered = Math.max(0, recovered)
  // Round to whole cents so the fee and the net always sum back to the
  // recovered figure — a business reconciling this against a bank statement
  // should never find a stray fraction of a cent.
  const fee = Math.round(safeRecovered * feeRate * 100) / 100
  return {
    potential: Math.max(0, potential),
    recovered: safeRecovered,
    fee,
    net: Math.round((safeRecovered - fee) * 100) / 100,
    feeRate,
  }
}

/**
 * The free preview deliberately unlocks the *lowest-value* findings.
 *
 * The pitch is "we already found real money in your ledger" — showing the
 * cheapest confirmed findings proves the detection works on their own data
 * while leaving the recoverable value behind the subscription. Sorting by
 * ascending dollar impact (id as a stable tie-break) keeps the preview set
 * identical across reloads, so a business never sees a finding appear and then
 * vanish behind the paywall.
 */
export function previewFindingIds(findings: Finding[], count: number = FREE_PREVIEW_COUNT): string[] {
  return findings
    .toSorted((a, b) => a.dollarImpact - b.dollarImpact || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, count))
    .map((finding) => finding.id)
}

export interface Entitlement {
  plan: Plan
  /** Finding ids readable on the free plan. Empty once the plan is `pro`. */
  previewIds: string[]
}

export function buildEntitlement(plan: Plan, findings: Finding[]): Entitlement {
  return { plan, previewIds: plan === 'pro' ? [] : previewFindingIds(findings) }
}

export function isUnlocked(entitlement: Entitlement, findingId: string): boolean {
  return entitlement.plan === 'pro' || entitlement.previewIds.includes(findingId)
}

export interface LockedSummary {
  lockedCount: number
  lockedValue: number
  unlockedCount: number
  unlockedValue: number
}

/** What the paywall is actually withholding, in cases and dollars. */
export function lockedSummary(entitlement: Entitlement, findings: Finding[]): LockedSummary {
  let lockedCount = 0
  let lockedValue = 0
  let unlockedCount = 0
  let unlockedValue = 0

  for (const finding of findings) {
    if (isUnlocked(entitlement, finding.id)) {
      unlockedCount += 1
      unlockedValue += finding.dollarImpact
    } else {
      lockedCount += 1
      lockedValue += finding.dollarImpact
    }
  }

  return { lockedCount, lockedValue, unlockedCount, unlockedValue }
}

export interface ReclaimPlan {
  id: 'monthly' | 'annual'
  name: string
  priceLabel: string
  cadence: string
  savingLabel: string | null
  points: string[]
}

export const RECLAIM_PLANS: ReclaimPlan[] = [
  {
    id: 'monthly',
    name: 'Recovery',
    priceLabel: `$${SUBSCRIPTION_PRICE_MONTHLY}`,
    cadence: 'per month',
    savingLabel: null,
    points: [
      'Every finding unlocked, with the full evidence trail',
      'Unlimited re-checks as you add new payments',
      'Recovery requests, tracking, and confirmed outcomes',
    ],
  },
  {
    id: 'annual',
    name: 'Recovery',
    priceLabel: `$${(SUBSCRIPTION_PRICE_MONTHLY * 10).toLocaleString('en-US')}`,
    cadence: 'per year',
    savingLabel: 'Two months free',
    points: [
      'Everything in monthly',
      'Two months free versus paying monthly',
      'Priority support on disputed recoveries',
    ],
  },
]
