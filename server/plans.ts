/**
 * Reclaim's plans and what each one entitles an account to. This is the one
 * definition the server enforces from and the client renders from — the
 * client only ever *displays* limits it received from `/api/account/entitlements`.
 *
 * No payments exist yet: every account is `free` until an operator (or, later,
 * a billing webhook) sets `users.plan = 'pro'`.
 */
export type Plan = 'free' | 'pro'

export interface PlanLimits {
  /** New audits (uploaded ledgers) an account may start per calendar month. `null` = unlimited. */
  auditsPerMonth: number | null
  /** How many findings per audit are shown in full — the lowest-value ones first. `null` = all. */
  findingsVisible: number | null
  /** "Draft with AI" on a recovery request. */
  aiDrafts: boolean
  /** Edit, download and steer the generated letter (free: read and copy). */
  fullLetters: boolean
  /** Partial amounts, recovery method and the case history (free: full-or-nothing outcome). */
  fullRecoveryWorkflow: boolean
  /** The every-vendor table on Reports (free: the audit summary and by-check breakdown). */
  advancedReports: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    auditsPerMonth: 3,
    findingsVisible: 3,
    aiDrafts: false,
    fullLetters: false,
    fullRecoveryWorkflow: false,
    advancedReports: false,
  },
  pro: {
    auditsPerMonth: null,
    findingsVisible: null,
    aiDrafts: true,
    fullLetters: true,
    fullRecoveryWorkflow: true,
    advancedReports: true,
  },
}

export const PLAN_PRICE_USD: Record<Plan, number> = { free: 0, pro: 5 }

export function isPlan(value: unknown): value is Plan {
  return value === 'free' || value === 'pro'
}

/** Start of the current calendar month, UTC — the audit-count window. */
export function monthStart(now = Date.now()): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
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
