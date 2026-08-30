import { useCallback, useMemo, useState } from 'react'
import type { Finding } from '@/types'
import { buildEntitlement, type Entitlement, type Plan } from '@/billing/entitlement'

const PLAN_STORAGE_KEY = 'reclaim.plan.v1'

function readStoredPlan(): Plan {
  try {
    return window.localStorage.getItem(PLAN_STORAGE_KEY) === 'pro' ? 'pro' : 'free'
  } catch {
    // Private browsing / disabled storage — fall back to the free plan rather
    // than failing the render. Nothing is gated destructively, so this is safe.
    return 'free'
  }
}

function writeStoredPlan(plan: Plan) {
  try {
    window.localStorage.setItem(PLAN_STORAGE_KEY, plan)
  } catch {
    // Non-fatal: the plan simply won't survive a reload.
  }
}

/**
 * Subscription state for the workspace.
 *
 * This is a prototype entitlement: the plan lives in localStorage and is not a
 * security boundary — every finding is still computed client-side. A production
 * build must resolve entitlement server-side and withhold the locked findings
 * from the payload entirely.
 */
export function useEntitlement(findings: Finding[]) {
  const [plan, setPlan] = useState<Plan>(readStoredPlan)

  const entitlement: Entitlement = useMemo(() => buildEntitlement(plan, findings), [plan, findings])

  const upgrade = useCallback(() => {
    writeStoredPlan('pro')
    setPlan('pro')
  }, [])

  const downgrade = useCallback(() => {
    writeStoredPlan('free')
    setPlan('free')
  }, [])

  return { plan, entitlement, upgrade, downgrade }
}
