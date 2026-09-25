/**
 * Plan vocabulary shared with the server. The limits themselves are defined
 * once, in server/plans.ts; the client imports them only to describe the
 * plans (pricing table) and to apply Free limits to guest sessions, which
 * never reach the server. For a signed-in account, what applies is whatever
 * `/api/account/entitlements` said.
 */
import { PLAN_PRICE_USD, PLAN_SUCCESS_FEE, type Plan } from '../../server/plans.ts'

export { PLANS, PLAN_LIMITS, PLAN_PRICE_USD, PLAN_SUCCESS_FEE, entitlementsFor, isPaid, planOf, successFee } from '../../server/plans.ts'
export type { Entitlements, Plan, PlanLimits } from '../../server/plans.ts'

export const PLAN_LABEL: Record<Plan, string> = { free: 'Free', growth: 'Growth', flat: 'Flat' }

/** Monthly recoveries above which Flat costs less than Growth: 19.99 + 15% × R = 100. */
export const FLAT_BREAK_EVEN = Math.round(((PLAN_PRICE_USD.flat - PLAN_PRICE_USD.growth) / PLAN_SUCCESS_FEE.growth) * 100) / 100

export interface PlanPitch {
  tagline: string
  /** The price as a person reads it: "$19.99 / month + 15% of what's recovered". */
  price: string
  summary: string
  features: string[]
  /** The rule or the fee, stated plainly under the features. */
  note: string
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 === 0 ? 0 : 2 })

export const PLAN_PITCH: Record<Plan, PlanPitch> = {
  free: {
    tagline: 'See what you’re owed',
    price: '$0',
    summary: 'Upload every ledger you have. Every check runs on every file, and the three smallest findings in each one are yours in full.',
    features: [
      'Unlimited ledger uploads',
      'All eight checks on every file',
      'The 3 lowest-value findings of each upload, in full',
      'Recovery letters to read and copy',
      'Track what comes back by hand',
    ],
    note: 'One audit per ledger: uploading the same file again, or a smaller piece of it, is flagged and doesn’t unlock more findings.',
  },
  growth: {
    tagline: 'Pay when you get paid',
    price: `${money(PLAN_PRICE_USD.growth)} / month + ${PLAN_SUCCESS_FEE.growth * 100}% of what’s recovered`,
    summary: 'Every finding, every audit, and the whole recovery workflow — with AI writing the vendor emails for you.',
    features: [
      'Every finding in every audit — nothing hidden',
      'AI-drafted recovery emails from the exact records',
      'Automatic sending through your Gmail — coming soon',
      'Approvals, follow-ups, partial returns and full case history',
      'Every-vendor reports and accounting closeout',
      'Unlimited uploads and re-audits',
    ],
    note: `The ${PLAN_SUCCESS_FEE.growth * 100}% applies only to money that actually comes back — never to findings, promises or unused credits.`,
  },
  flat: {
    tagline: 'Keep every dollar',
    price: `${money(PLAN_PRICE_USD.flat)} / month, no success fee`,
    summary: 'Everything in Growth for one predictable price. Whatever you recover is all yours.',
    features: [
      'Everything in Growth',
      'No success fee — 100% of every recovery stays with you',
      'One fixed monthly cost for budgeting',
    ],
    note: `Costs less than Growth once you recover more than ${money(FLAT_BREAK_EVEN)} a month.`,
  },
}

/** Kept for places that only list features. */
export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: PLAN_PITCH.free.features,
  growth: PLAN_PITCH.growth.features,
  flat: PLAN_PITCH.flat.features,
}
