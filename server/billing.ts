import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { AuthService } from './auth.ts'
import type { UserRow } from './db.ts'
import { HttpError, json, RateLimiter, type Request, type Response } from './http.ts'
import { entitlementsFor, planOf, PLAN_PRICE_USD, successFee, type Plan } from './plans.ts'
import { StripeError, subscriptionIdOf, verifyWebhook, type StripeApi, type StripeSubscription } from './stripe.ts'

export type { StripeApi } from './stripe.ts'

/**
 * Paid plans through Stripe (test mode until the keys say otherwise).
 *
 *   POST /api/billing/subscribe  Free → Growth or Flat, with a payment method
 *                                Stripe.js created in the browser
 *   POST /api/billing/confirm    after the browser finished 3-D Secure
 *   POST /api/billing/change     Growth ↔ Flat, prorated and charged now
 *   POST /api/billing/cancel     paid access runs to the end of the period
 *   POST /api/billing/resume     undo a scheduled cancel
 *   GET  /api/billing            plan, status, next bill date, success fees
 *   POST /api/billing/webhook    Stripe's events, signature-checked
 *
 * `users.plan` is only ever set from a subscription read back from Stripe,
 * never from what the browser says. The webhook keeps it true afterwards
 * (renewals, failed payments, the end of a cancelled period); the endpoints
 * above read the subscription right after changing it so the app can switch
 * at once instead of waiting for the event. Card numbers never reach this
 * server: it sees a `pm_…` id and stores only Stripe's customer and
 * subscription ids.
 *
 * Growth's success fee: every settlement the recovery workflow records
 * (settled cash, or a credit applied to a named bill — the same test as
 * src/recovery/financials.ts validSettlements) gets one row in
 * `recovery_fees` the first time the server sees it, with the plan the
 * account was on at that moment. Only rows recorded on Growth carry a fee,
 * and each becomes one Stripe invoice item that rides on the next
 * subscription invoice. Findings, vendor promises and unapplied credits are
 * never settlements, so they never reach this table. A settlement that is
 * later removed is voided, and refunded as a credit item if it was billed.
 */

export const PRICE_LOOKUP_KEYS: Record<PaidPlan, string> = { growth: 'reclaim_growth_monthly', flat: 'reclaim_flat_monthly' }
export type PaidPlan = Exclude<Plan, 'free'>

/** Statuses in which the plan's features stay on. past_due is Stripe's retry window. */
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due'])

type AccountRow = {
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  subscription_plan: string | null
  subscription_status: string | null
  current_period_end: number | null
  cancel_at_period_end: number
}

type FeeRow = {
  project_id: string
  finding_id: string
  settlement_key: string
  amount_cents: number
  fee_cents: number
  method: string
  reference: string
  settled_at: number
  recorded_at: number
  plan: string
  billable: number
  reason: string | null
  stripe_invoice_item_id: string | null
  voided_at: number | null
  stripe_credit_item_id: string | null
}

export interface BillingStatus {
  /** False when the server has no Stripe keys: nothing can be bought or charged. */
  configured: boolean
  plan: Plan
  status: string | null
  /** Milliseconds; when the next bill is due, or when paid access ends if cancelling. */
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  successFees: {
    rate: number
    /** Fees recorded this calendar month (UTC), in cents. */
    monthCents: number
    /** Fees recorded but not yet sent to Stripe, in cents. */
    unbilledCents: number
    lines: Array<{ projectId: string; findingId: string; amountCents: number; feeCents: number; method: string; reference: string; settledAt: number; recordedAt: number; billed: boolean; voided: boolean }>
  }
}

export interface Billing {
  /** Handles /api/billing/*; null for every other path. */
  route(req: Request): Promise<Response | null>
  /** Record settlements seen in a saved project; bills Growth fees in the background. */
  recordRecoveries(userId: string, project: Record<string, unknown>, options?: { imported?: boolean }): void
  /** Resolves once background fee billing has finished (tests). */
  idle(): Promise<void>
}

export interface BillingDependencies {
  db: DatabaseSync
  auth: AuthService
  stripe: StripeApi | null
  webhookSecret: string | null
  requireUser(req: Request): UserRow
}

export function createBilling({ db, auth, stripe, webhookSecret, requireUser }: BillingDependencies): Billing {
  db.exec(`
    -- One Stripe customer per account. No card data: Stripe holds it.
    CREATE TABLE IF NOT EXISTS billing_accounts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT NOT NULL UNIQUE,
      stripe_subscription_id TEXT,
      subscription_plan TEXT,
      subscription_status TEXT,
      current_period_end INTEGER,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    -- Webhook events already handled (Stripe delivers at least once).
    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      received_at INTEGER NOT NULL
    );
    -- Every settlement the server has seen, once, with the plan at that moment.
    CREATE TABLE IF NOT EXISTS recovery_fees (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      settlement_key TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      method TEXT NOT NULL,
      reference TEXT NOT NULL,
      settled_at INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL,
      plan TEXT NOT NULL,
      billable INTEGER NOT NULL,
      reason TEXT,
      stripe_invoice_item_id TEXT,
      voided_at INTEGER,
      stripe_credit_item_id TEXT,
      PRIMARY KEY (user_id, project_id, finding_id, settlement_key)
    );
  `)

  const limiter = new RateLimiter(20, 60 * 60 * 1000)
  let background: Promise<void> = Promise.resolve()
  const priceCache = new Map<PaidPlan, string>()

  const account = (userId: string) => db.prepare('SELECT * FROM billing_accounts WHERE user_id = ?').get(userId) as AccountRow | undefined
  const accountByCustomer = (customerId: string) => db.prepare('SELECT * FROM billing_accounts WHERE stripe_customer_id = ?').get(customerId) as AccountRow | undefined
  const hasPaidSubscription = (row: AccountRow | undefined): row is AccountRow & { stripe_subscription_id: string } =>
    Boolean(row?.stripe_subscription_id && row.subscription_status && PAID_STATUSES.has(row.subscription_status))

  const requireStripe = () => {
    if (!stripe) throw new HttpError(503, 'Paid plans aren’t switched on for this server yet. Nothing was charged.', 'billing_unavailable')
    return stripe
  }

  async function priceFor(plan: PaidPlan): Promise<string> {
    const cached = priceCache.get(plan)
    if (cached) return cached
    const price = await requireStripe().findPrice(PRICE_LOOKUP_KEYS[plan])
    // A wrong price must never be charged: the amount on the site is the amount billed.
    if (!price || price.unitAmount !== PLAN_PRICE_USD[plan] * 100 || price.currency !== 'usd' || price.interval !== 'month') {
      console.error(`billing: Stripe price "${PRICE_LOOKUP_KEYS[plan]}" is missing or not $${PLAN_PRICE_USD[plan]}/month (run scripts/stripe-setup.ts)`)
      throw new HttpError(503, 'Paid plans aren’t set up correctly yet. Nothing was charged.', 'billing_misconfigured')
    }
    priceCache.set(plan, price.id)
    return price.id
  }

  async function planForPrice(priceId: string | null): Promise<PaidPlan | null> {
    if (!priceId) return null
    for (const plan of ['growth', 'flat'] as const) {
      try {
        if ((await priceFor(plan)) === priceId) return plan
      } catch {
        // a misconfigured price matches nothing
      }
    }
    return null
  }

  /**
   * Make the account match a subscription read from Stripe. Events about an
   * older subscription (say, an abandoned first attempt expiring) never
   * override a newer one that is paid up.
   */
  async function applySubscription(sub: StripeSubscription): Promise<AccountRow | null> {
    const row = accountByCustomer(sub.customer)
    if (!row) return null
    // A different subscription only takes over when it is paid and the current one is not;
    // a declined or abandoned attempt never touches the plan.
    if (row.stripe_subscription_id !== sub.id && (!PAID_STATUSES.has(sub.status) || hasPaidSubscription(row))) return row
    const plan = await planForPrice(sub.priceId)
    const paid = PAID_STATUSES.has(sub.status) && plan !== null
    db.prepare(
      `UPDATE billing_accounts SET stripe_subscription_id = ?, subscription_plan = ?, subscription_status = ?, current_period_end = ?, cancel_at_period_end = ?, updated_at = ? WHERE user_id = ?`
    ).run(sub.id, plan, sub.status, sub.currentPeriodEnd ? sub.currentPeriodEnd * 1000 : null, sub.cancelAtPeriodEnd ? 1 : 0, Date.now(), row.user_id)
    const before = planOf(auth.findUserById(row.user_id)?.plan)
    const after: Plan = paid ? plan : sub.status === 'incomplete' ? before : 'free'
    if (after !== before) auth.setPlan(row.user_id, after)
    if (after === 'growth') queueBilling(row.user_id)
    if (!paid && (sub.status === 'canceled' || sub.status === 'unpaid')) {
      // The last period's fees still get billed, on a final invoice.
      queueBilling(row.user_id, { finalInvoice: true })
    }
    return account(row.user_id) ?? null
  }

  async function ensureCustomer(user: UserRow): Promise<AccountRow> {
    const existing = account(user.id)
    if (existing) return existing
    const customer = await requireStripe().createCustomer({ email: user.email, name: `${user.first_name} ${user.last_name}`.trim(), userId: user.id }, `reclaim-customer-${user.id}`)
    db.prepare('INSERT INTO billing_accounts (user_id, stripe_customer_id, cancel_at_period_end, updated_at) VALUES (?, ?, 0, ?)').run(user.id, customer.id, Date.now())
    return account(user.id)!
  }

  // ---------- success fees ----------

  const settlementKey = (s: Settlement) => createHash('sha256').update(`${s.method}|${s.reference.trim().toLowerCase()}|${s.appliedToBill?.trim() ?? ''}`).digest('hex').slice(0, 32)

  function recordRecoveries(userId: string, project: Record<string, unknown>, options: { imported?: boolean } = {}): void {
    const projectId = typeof project.id === 'string' ? project.id : null
    if (!projectId) return
    const plan = planOf(auth.findUserById(userId)?.plan)
    const env = (project.environment ?? {}) as { result?: { findings?: Array<Record<string, unknown>> }; caseStates?: Record<string, { recoverySettlements?: Settlement[] | null; recoveryVerification?: Settlement | null }> }
    const findings = new Map((env.result?.findings ?? []).map((f) => [f.id as string, f]))
    const now = Date.now()
    const seen = new Set<string>()
    const insert = db.prepare(
      `INSERT OR IGNORE INTO recovery_fees (user_id, project_id, finding_id, settlement_key, amount_cents, fee_cents, method, reference, settled_at, recorded_at, plan, billable, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const [findingId, state] of Object.entries(env.caseStates ?? {})) {
      if (!state || typeof state !== 'object') continue
      const finding = findings.get(findingId)
      if (!finding) continue
      for (const s of validSettlements(state)) {
        const key = settlementKey(s)
        seen.add(`${findingId}|${key}`)
        const amountCents = Math.round(s.amount * 100)
        const usd = currencyOf(finding) === 'USD'
        // The plan at the moment the server first sees the money, not later.
        const reason = options.imported ? 'imported' : plan !== 'growth' ? `plan_${plan}` : !usd ? 'not_usd' : null
        const fee = reason ? 0 : Math.round(successFee('growth', amountCents / 100) * 100)
        insert.run(userId, projectId, findingId, key, amountCents, fee, s.method, s.reference.trim().slice(0, 200), s.settledAt, now, plan, reason ? 0 : 1, reason)
      }
    }
    // A settlement no longer in the case (reopened, reversed, corrected) stops being billable.
    const live = db.prepare('SELECT * FROM recovery_fees WHERE user_id = ? AND project_id = ? AND voided_at IS NULL').all(userId, projectId) as FeeRow[]
    const voidRow = db.prepare('UPDATE recovery_fees SET voided_at = ? WHERE user_id = ? AND project_id = ? AND finding_id = ? AND settlement_key = ?')
    for (const row of live) if (!seen.has(`${row.finding_id}|${row.settlement_key}`)) voidRow.run(now, userId, projectId, row.finding_id, row.settlement_key)
    queueBilling(userId)
  }

  function queueBilling(userId: string, options: { finalInvoice?: boolean } = {}): void {
    if (!stripe) return
    background = background.then(() => billFees(userId, options)).catch((err) => {
      // Unbilled rows stay unbilled and are retried on the next save or event.
      console.error('billing: success-fee sync failed:', err instanceof Error ? err.message : 'unknown error')
    })
  }

  async function billFees(userId: string, { finalInvoice = false }: { finalInvoice?: boolean } = {}): Promise<void> {
    const api = stripe
    const row = account(userId)
    if (!api || !row) return
    const subscriptionId = hasPaidSubscription(row) ? row.stripe_subscription_id : null
    // New fees go out while there is a subscription to carry them, or on the final invoice.
    if (subscriptionId || finalInvoice) {
      const unbilled = db.prepare('SELECT * FROM recovery_fees WHERE user_id = ? AND billable = 1 AND fee_cents > 0 AND voided_at IS NULL AND stripe_invoice_item_id IS NULL').all(userId) as FeeRow[]
      for (const fee of unbilled) {
        const item = await api.createInvoiceItem(
          {
            customerId: row.stripe_customer_id,
            subscriptionId,
            amountCents: fee.fee_cents,
            description: `Reclaim success fee: 10% of $${(fee.amount_cents / 100).toFixed(2)} recovered (${fee.method}, ref. ${fee.reference.slice(0, 60)})`,
            metadata: { reclaim_user_id: userId, project_id: fee.project_id, finding_id: fee.finding_id, settlement: fee.settlement_key },
          },
          `reclaim-fee-${userId}-${fee.project_id}-${fee.finding_id}-${fee.settlement_key}`
        )
        db.prepare('UPDATE recovery_fees SET stripe_invoice_item_id = ? WHERE user_id = ? AND project_id = ? AND finding_id = ? AND settlement_key = ?').run(item.id, userId, fee.project_id, fee.finding_id, fee.settlement_key)
      }
    }
    // Voided after billing: remove the pending item, or credit it back if it was already invoiced.
    const voided = db.prepare('SELECT * FROM recovery_fees WHERE user_id = ? AND voided_at IS NOT NULL AND stripe_invoice_item_id IS NOT NULL AND stripe_credit_item_id IS NULL').all(userId) as FeeRow[]
    for (const fee of voided) {
      const removed = await api.deleteInvoiceItem(fee.stripe_invoice_item_id!)
      const credit = removed
        ? 'deleted'
        : (
            await api.createInvoiceItem(
              { customerId: row.stripe_customer_id, subscriptionId, amountCents: -fee.fee_cents, description: `Reclaim success fee reversed (ref. ${fee.reference.slice(0, 60)})`, metadata: { reclaim_user_id: userId, reverses: fee.stripe_invoice_item_id! } },
              `reclaim-fee-credit-${fee.stripe_invoice_item_id}`
            )
          ).id
      db.prepare('UPDATE recovery_fees SET stripe_credit_item_id = ? WHERE user_id = ? AND project_id = ? AND finding_id = ? AND settlement_key = ?').run(credit, userId, fee.project_id, fee.finding_id, fee.settlement_key)
    }
    if (finalInvoice) await api.invoicePendingItems(row.stripe_customer_id)
  }

  function status(user: UserRow): BillingStatus {
    const row = account(user.id)
    const fees = db.prepare('SELECT * FROM recovery_fees WHERE user_id = ? AND billable = 1 ORDER BY recorded_at DESC').all(user.id) as FeeRow[]
    const d = new Date()
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const active = fees.filter((f) => f.voided_at === null)
    return {
      configured: stripe !== null,
      plan: planOf(user.plan),
      status: row?.subscription_status ?? null,
      currentPeriodEnd: row && hasPaidSubscription(row) ? row.current_period_end : null,
      cancelAtPeriodEnd: Boolean(row && hasPaidSubscription(row) && row.cancel_at_period_end),
      successFees: {
        rate: 0.1,
        monthCents: active.filter((f) => f.recorded_at >= monthStart).reduce((s, f) => s + f.fee_cents, 0),
        unbilledCents: active.filter((f) => !f.stripe_invoice_item_id).reduce((s, f) => s + f.fee_cents, 0),
        lines: fees.slice(0, 50).map((f) => ({ projectId: f.project_id, findingId: f.finding_id, amountCents: f.amount_cents, feeCents: f.fee_cents, method: f.method, reference: f.reference, settledAt: f.settled_at, recordedAt: f.recorded_at, billed: Boolean(f.stripe_invoice_item_id), voided: f.voided_at !== null })),
      },
    }
  }

  const answer = (userId: string, extra: Record<string, unknown> = {}) => {
    const user = auth.findUserById(userId)!
    return json(200, { ...extra, user: auth.toPublic(user), entitlements: entitlementsFor(planOf(user.plan), 0), billing: status(user) })
  }

  /** Card problems are the cardholder's to fix; Stripe writes those messages for them. Anything else stays generic. */
  const failed = (err: unknown, plan: Plan): never => {
    if (err instanceof HttpError) throw err
    const stay = `You’re still on ${PLAN_NAME[plan]}.`
    if (err instanceof StripeError && err.type === 'card_error') throw new HttpError(402, `${err.message} ${stay}`, 'card_declined')
    // A pm_… id from another Stripe account (publishable and secret keys that don't match).
    if (err instanceof StripeError && err.code === 'resource_missing' && /PaymentMethod/.test(err.message)) throw new HttpError(402, `That card couldn’t be used. Enter it again. ${stay}`, 'card_unusable')
    console.error('billing: Stripe call failed:', err instanceof StripeError ? `${err.type} ${err.code ?? ''}` : err instanceof Error ? err.message : 'unknown')
    throw new HttpError(502, `We couldn’t reach our payment provider. Nothing changed — ${stay.toLowerCase()} Try again in a minute.`, 'billing_failed')
  }

  const paidPlanFrom = (value: unknown): PaidPlan => {
    if (value !== 'growth' && value !== 'flat') throw new HttpError(400, 'Choose Growth or Flat.', 'validation')
    return value
  }

  async function route(req: Request): Promise<Response | null> {
    const path = req.url.pathname
    if (path !== '/api/billing' && !path.startsWith('/api/billing/')) return null
    const method = req.method

    if (path === '/api/billing/webhook' && method === 'POST') {
      if (!stripe || !webhookSecret) throw new HttpError(503, 'Billing is not configured.', 'billing_unavailable')
      const raw = await req.text()
      let event
      try {
        event = verifyWebhook(raw, req.headers['stripe-signature'] as string | undefined, webhookSecret)
      } catch {
        throw new HttpError(400, 'Invalid signature.', 'bad_signature')
      }
      if (db.prepare('SELECT 1 FROM billing_events WHERE id = ?').get(event.id)) return json(200, { received: true, duplicate: true })
      const subscriptionId = event.type.startsWith('customer.subscription.') || event.type.startsWith('invoice.') ? subscriptionIdOf(event.data.object) : null
      // The payload is only a pointer: the subscription is read back from Stripe.
      if (subscriptionId) await applySubscription(await stripe.retrieveSubscription(subscriptionId))
      db.prepare('INSERT OR IGNORE INTO billing_events (id, type, received_at) VALUES (?, ?, ?)').run(event.id, event.type, Date.now())
      return json(200, { received: true })
    }

    const user = requireUser(req)

    if (path === '/api/billing' && method === 'GET') {
      return json(200, status(user))
    }

    if (method !== 'POST') throw new HttpError(404, 'Not found.')
    if (!limiter.check(user.id)) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.', 'rate_limited')
    const api = requireStripe()
    const current = planOf(user.plan)
    const body = (req.headers['content-type'] ?? '').includes('application/json') ? await req.json<Record<string, unknown>>() : {}

    if (path === '/api/billing/subscribe') {
      const plan = paidPlanFrom(body.plan)
      const paymentMethodId = body.paymentMethodId
      if (typeof paymentMethodId !== 'string' || !/^pm_\w{3,}$/.test(paymentMethodId)) throw new HttpError(400, 'The card wasn’t verified. Enter it again.', 'validation')
      if (hasPaidSubscription(account(user.id))) throw new HttpError(409, 'You already have a paid plan. Change it from Settings.', 'already_subscribed')
      try {
        const priceId = await priceFor(plan)
        const row = await ensureCustomer(user)
        await api.attachPaymentMethod(paymentMethodId, row.stripe_customer_id)
        const sub = await api.createSubscription({ customerId: row.stripe_customer_id, priceId, paymentMethodId, userId: user.id }, `reclaim-sub-${user.id}-${plan}-${paymentMethodId}`)
        if (sub.status === 'incomplete' && sub.paymentIntent?.status === 'requires_action' && sub.paymentIntent.clientSecret) {
          db.prepare('UPDATE billing_accounts SET stripe_subscription_id = ?, subscription_status = ?, updated_at = ? WHERE user_id = ?').run(sub.id, sub.status, Date.now(), user.id)
          return json(200, { status: 'requires_action', clientSecret: sub.paymentIntent.clientSecret, subscriptionId: sub.id })
        }
        if (!PAID_STATUSES.has(sub.status)) {
          // Declined: drop the half-made subscription so it never charges later.
          await api.cancelSubscriptionNow(sub.id).catch(() => {})
          throw new HttpError(402, `Your card was declined, so nothing was charged. You’re still on ${PLAN_NAME[current]}.`, 'card_declined')
        }
        await applySubscription(sub)
        return answer(user.id, { status: 'active' })
      } catch (err) {
        return failed(err, current)
      }
    }

    if (path === '/api/billing/confirm') {
      const row = account(user.id)
      if (!row?.stripe_subscription_id || body.subscriptionId !== row.stripe_subscription_id) throw new HttpError(404, 'No payment is waiting.', 'not_found')
      try {
        const sub = await api.retrieveSubscription(row.stripe_subscription_id)
        if (sub.customer !== row.stripe_customer_id) throw new HttpError(404, 'No payment is waiting.', 'not_found')
        await applySubscription(sub)
        if (!PAID_STATUSES.has(sub.status)) throw new HttpError(402, `The payment wasn’t completed, so nothing was charged. You’re still on ${PLAN_NAME[current]}.`, 'payment_incomplete')
        return answer(user.id, { status: 'active' })
      } catch (err) {
        return failed(err, current)
      }
    }

    const row = account(user.id)
    if (!hasPaidSubscription(row)) throw new HttpError(409, 'You’re on Free. Choose a plan to subscribe.', 'no_subscription')

    if (path === '/api/billing/change') {
      const plan = paidPlanFrom(body.plan)
      try {
        let sub = await api.retrieveSubscription(row.stripe_subscription_id)
        if ((await planForPrice(sub.priceId)) === plan) {
          if (sub.cancelAtPeriodEnd) sub = await api.setCancelAtPeriodEnd(sub.id, false)
        } else {
          if (!sub.itemId) throw new Error('subscription has no item')
          sub = await api.changeSubscriptionPrice(sub.id, sub.itemId, await priceFor(plan))
          if (sub.pendingUpdate) throw new HttpError(402, `The payment for the switch didn’t go through, so your plan didn’t change. You’re still on ${PLAN_NAME[current]}. Update your card and try again.`, 'card_declined')
        }
        await applySubscription(sub)
        return answer(user.id, { status: 'active' })
      } catch (err) {
        return failed(err, current)
      }
    }

    if (path === '/api/billing/cancel' || path === '/api/billing/resume') {
      try {
        await applySubscription(await api.setCancelAtPeriodEnd(row.stripe_subscription_id, path === '/api/billing/cancel'))
        return answer(user.id)
      } catch (err) {
        return failed(err, current)
      }
    }

    throw new HttpError(404, 'Not found.')
  }

  return { route, recordRecoveries, idle: () => background }
}

const PLAN_NAME: Record<Plan, string> = { free: 'Free', growth: 'Growth', flat: 'Flat' }

interface Settlement {
  amount: number
  method: string
  source: string
  reference: string
  settledAt: number
  appliedToBill?: string
}

/**
 * Returned value only: cash that settled, or a credit/offset applied to a named
 * bill. Mirrors src/recovery/financials.ts validSettlements (that module uses
 * `@/` imports the plain-node server cannot load); billing.test.ts checks the two agree.
 */
export function validSettlements(state: { recoverySettlements?: Settlement[] | null; recoveryVerification?: Settlement | null }): Settlement[] {
  const all = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
  return (Array.isArray(all) ? all : []).filter(
    (e) =>
      !!e &&
      typeof e.amount === 'number' &&
      Number.isFinite(e.amount) &&
      e.amount > 0 &&
      Number.isFinite(e.settledAt) &&
      e.settledAt > 0 &&
      typeof e.reference === 'string' &&
      Boolean(e.reference.trim()) &&
      ['bank', 'accounting', 'document', 'manual'].includes(e.source) &&
      (e.method === 'refund' || ((e.method === 'credit' || e.method === 'offset') && typeof e.appliedToBill === 'string' && Boolean(e.appliedToBill.trim())))
  )
}

/** Same rule as the workspace's recovered total (src/workspace/selectors.ts currencyOf). */
function currencyOf(finding: Record<string, unknown>): string {
  if (typeof finding.currency === 'string' && finding.currency) return finding.currency
  const obligation = (finding.evidence as { obligation?: { reference?: string; confirmedBy?: string; currency?: string } } | undefined)?.obligation
  if (obligation?.reference?.trim() && obligation.confirmedBy?.trim() && obligation.currency?.trim()) return obligation.currency.trim().toUpperCase()
  return 'Unknown'
}
