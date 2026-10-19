/**
 * Creates (or checks) the two Stripe prices billing looks up by lookup key:
 *
 *   reclaim_growth_monthly  $15.00 / month   product "Reclaim Growth"
 *   reclaim_flat_monthly    $50.00 / month   product "Reclaim Flat"
 *
 *   STRIPE_SECRET_KEY=sk_test_… node server/stripeSetup.ts
 *   npm run stripe:setup          (reads .env)
 *
 * Safe to run again: existing prices are checked, not duplicated. A live key
 * (sk_live_…) needs --live. The success fee is not a price: it is billed as
 * one invoice item per recorded recovery (server/billing.ts).
 */
import { PLAN_PRICE_USD } from './plans.ts'
import { PRICE_LOOKUP_KEYS, type PaidPlan } from './billing.ts'
import { formEncode, STRIPE_API_VERSION } from './stripe.ts'

const key = process.env.STRIPE_SECRET_KEY?.trim()
if (!key || !/^(sk|rk)_(test|live)_/.test(key)) {
  console.error('Set STRIPE_SECRET_KEY to a Stripe secret key (sk_test_… from https://dashboard.stripe.com/test/apikeys).')
  process.exit(1)
}
if (key.includes('_live_') && !process.argv.includes('--live')) {
  console.error('That is a live key. Re-run with --live if you really mean to create live prices.')
  process.exit(1)
}

async function stripe(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}): Promise<Record<string, any>> {
  const body = formEncode(params)
  const res = await fetch(`https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_API_VERSION, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? body : undefined,
  })
  const data = (await res.json()) as Record<string, any>
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error?.message ?? res.status}`)
  return data
}

let failed = false
for (const plan of ['growth', 'flat'] as PaidPlan[]) {
  const lookupKey = PRICE_LOOKUP_KEYS[plan]
  const cents = PLAN_PRICE_USD[plan] * 100
  const existing = (await stripe('GET', '/prices', { lookup_keys: [lookupKey], active: true, limit: 1 })).data?.[0]
  if (existing) {
    const ok = existing.unit_amount === cents && existing.currency === 'usd' && existing.recurring?.interval === 'month'
    console.log(`${ok ? 'ok     ' : 'WRONG  '} ${lookupKey} → ${existing.id} (${existing.unit_amount / 100} ${existing.currency}/${existing.recurring?.interval})`)
    if (!ok) {
      failed = true
      console.error(`         Expected $${PLAN_PRICE_USD[plan]}/month. Archive that price in the dashboard and run this again.`)
    }
    continue
  }
  const name = `Reclaim ${plan === 'growth' ? 'Growth' : 'Flat'}`
  const products = (await stripe('GET', '/products', { active: true, limit: 100 })).data as Array<{ id: string; name: string; metadata?: Record<string, string> }>
  const product = products.find((p) => p.metadata?.reclaim_plan === plan) ?? (await stripe('POST', '/products', { name, metadata: { reclaim_plan: plan } }))
  const price = await stripe('POST', '/prices', { product: product.id, unit_amount: cents, currency: 'usd', recurring: { interval: 'month' }, lookup_key: lookupKey, nickname: `${name} monthly` })
  console.log(`created ${lookupKey} → ${price.id} ($${PLAN_PRICE_USD[plan]}/month on ${product.id})`)
}
process.exit(failed ? 1 : 0)
