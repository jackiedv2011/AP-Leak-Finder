/**
 * Plan vocabulary shared with the server. The limits themselves are defined
 * once, in server/plans.ts; the client imports them only to describe the
 * plans (pricing table) and to apply Free limits to guest sessions, which
 * never reach the server. For a signed-in account, what applies is whatever
 * `/api/account/entitlements` said.
 */
export { PLAN_LIMITS, PLAN_PRICE_USD, entitlementsFor } from '../../server/plans.ts'
export type { Entitlements, Plan, PlanLimits } from '../../server/plans.ts'

export const PLAN_LABEL: Record<'free' | 'pro', string> = { free: 'Free', pro: 'Pro' }

/** What each plan includes, in the words the pricing UI uses. */
export const PLAN_FEATURES: Record<'free' | 'pro', string[]> = {
  free: [
    'All eight detection checks on every audit',
    '3 audits a month',
    'The 3 lowest-value findings per audit in full',
    'Confirm, request and track recoveries',
    'Audit summary and by-check reports',
    'Generated recovery letters (read and copy)',
    'Email/password and Google sign-in',
  ],
  pro: [
    'Everything in Free',
    'Unlimited audits',
    'Every finding, every audit',
    'AI-drafted recovery requests',
    'Editable, downloadable letters with your own context',
    'Partial recoveries, recovery methods and full case history',
    'Every-vendor report',
  ],
}
