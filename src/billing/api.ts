import { call } from '@/lib/auth/apiAuthService'
import type { Plan } from '@/lib/plans'

/**
 * The browser side of billing (server/billing.ts). The browser never decides
 * the plan: every call returns what the server read back from Stripe, and the
 * caller then refreshes the account (`useAuth().refreshAccount`).
 */
export type PaidPlan = Exclude<Plan, 'free'>

export interface BillingStatus {
  configured: boolean
  plan: Plan
  /** Stripe's subscription status: active, past_due, canceled… null without one. */
  status: string | null
  /** Milliseconds. The next bill date, or the day paid access ends when cancelling. */
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  successFees: {
    rate: number
    monthCents: number
    unbilledCents: number
    lines: Array<{ projectId: string; findingId: string; amountCents: number; feeCents: number; method: string; reference: string; settledAt: number; recordedAt: number; billed: boolean; voided: boolean }>
  }
}

export type BillingResult =
  | { ok: true; billing: BillingStatus | null }
  | { ok: true; requiresAction: true; clientSecret: string; subscriptionId: string }
  | { ok: false; message: string; code?: string }

type Body = { message?: string; code?: string; status?: string; clientSecret?: string; subscriptionId?: string; billing?: BillingStatus }

async function post(path: string, json: unknown): Promise<BillingResult> {
  try {
    const { status, body } = await call<Body>(path, { method: 'POST', json })
    if (status !== 200) return { ok: false, message: body?.message ?? 'Something went wrong with billing. Your plan hasn’t changed.', code: body?.code }
    if (body?.status === 'requires_action' && body.clientSecret && body.subscriptionId) return { ok: true, requiresAction: true, clientSecret: body.clientSecret, subscriptionId: body.subscriptionId }
    return { ok: true, billing: body?.billing ?? null }
  } catch {
    return { ok: false, message: 'Couldn’t reach Reclaim. Check your connection — your plan hasn’t changed.' }
  }
}

export async function fetchBilling(): Promise<BillingStatus | null> {
  try {
    const { status, body } = await call<BillingStatus>('/api/billing')
    return status === 200 ? body : null
  } catch {
    return null
  }
}

/** Free → Growth or Flat, with a `pm_…` id Stripe.js made from the card. */
export const subscribe = (plan: PaidPlan, paymentMethodId: string) => post('/api/billing/subscribe', { plan, paymentMethodId })
/** After the bank's 3-D Secure step. */
export const confirmSubscription = (subscriptionId: string) => post('/api/billing/confirm', { subscriptionId })
/** Growth ↔ Flat, prorated. Choosing the current plan while a cancel is scheduled keeps it. */
export const changePlan = (plan: PaidPlan) => post('/api/billing/change', { plan })
export const cancelPlan = () => post('/api/billing/cancel', {})
export const resumePlan = () => post('/api/billing/resume', {})
