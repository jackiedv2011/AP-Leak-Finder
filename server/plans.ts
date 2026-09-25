/**
 * Reclaim's three tracks and what each one entitles an account to. This is
 * the one definition the server enforces from and the client renders from —
 * the client only ever *displays* limits it received from
 * `/api/account/entitlements`.
 *
 *   Free    — unlimited uploads; the 3 lowest-value findings of each upload in
 *             full. The same file (or a trimmed copy of one) cannot be uploaded
 *             again to see different findings.
 *   Growth  — $19.99 a month plus 15% of what is actually recovered.
 *   Flat    — $100 a month, no success fee. Same features as Growth.
 *
 * No payments exist yet: every account is `free` until an operator (or, later,
 * a billing webhook) sets `users.plan`.
 */
export type Plan = 'free' | 'growth' | 'flat'

export const PLANS: Plan[] = ['free', 'growth', 'flat']

export interface PlanLimits {
  /** New audits (uploaded ledgers) an account may start per calendar month. `null` = unlimited. */
  auditsPerMonth: number | null
  /** How many findings per audit are shown in full — the lowest-value ones first. `null` = all. */
  findingsVisible: number | null
  /** Free may not re-upload a ledger it has already uploaded, whole or in part. */
  blocksRepeatUploads: boolean
  /** "Draft with AI" on a recovery request. */
  aiDrafts: boolean
  /** Edit, download and steer the generated letter (free: read and copy). */
  fullLetters: boolean
  /** Partial amounts, recovery method and the case history (free: full-or-nothing outcome). */
  fullRecoveryWorkflow: boolean
  /** The every-vendor table on Reports (free: the audit summary and by-check breakdown). */
  advancedReports: boolean
}

const PAID: PlanLimits = {
  auditsPerMonth: null,
  findingsVisible: null,
  blocksRepeatUploads: false,
  aiDrafts: true,
  fullLetters: true,
  fullRecoveryWorkflow: true,
  advancedReports: true,
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    auditsPerMonth: null,
    findingsVisible: 3,
    blocksRepeatUploads: true,
    aiDrafts: false,
    fullLetters: false,
    fullRecoveryWorkflow: false,
    advancedReports: false,
  },
  growth: PAID,
  flat: PAID,
}

/** Monthly subscription, in US dollars. */
export const PLAN_PRICE_USD: Record<Plan, number> = { free: 0, growth: 19.99, flat: 100 }

/** Share of money actually recovered that the plan charges on top of the subscription. */
export const PLAN_SUCCESS_FEE: Record<Plan, number> = { free: 0, growth: 0.15, flat: 0 }

export function isPlan(value: unknown): value is Plan {
  return value === 'free' || value === 'growth' || value === 'flat'
}

/** Accounts stored before the three tracks existed: the old "pro" plan is Growth. */
export function planOf(value: unknown): Plan {
  if (isPlan(value)) return value
  return value === 'pro' ? 'growth' : 'free'
}

export function isPaid(plan: Plan): boolean {
  return plan !== 'free'
}

/** Start of the current calendar month, UTC — the audit-count window. */
export function monthStart(now = Date.now()): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

/** The success fee on an amount recovered, in whole cents. */
export function successFee(plan: Plan, recovered: number): number {
  return Math.round(Math.round(recovered * 100) * PLAN_SUCCESS_FEE[plan]) / 100
}

export interface Entitlements {
  plan: Plan
  limits: PlanLimits
  usage: { auditsThisMonth: number }
  /** Whether the account may start one more audit right now. */
  canStartAudit: boolean
}

export function entitlementsFor(plan: Plan, auditsThisMonth: number): Entitlements {
  const limits = PLAN_LIMITS[plan]
  return {
    plan,
    limits,
    usage: { auditsThisMonth },
    canStartAudit: limits.auditsPerMonth === null || auditsThisMonth < limits.auditsPerMonth,
  }
}
