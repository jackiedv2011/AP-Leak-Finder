import { signatureHeader, StripeError, type StripeApi, type StripePrice, type StripeSubscription } from './stripe.ts'

/**
 * An in-memory Stripe for tests and local runs without keys. It keeps the
 * parts of Stripe's behaviour billing depends on: prices by lookup key,
 * idempotency keys, card outcomes by test payment method, 3-D Secure, plan
 * switches that wait on payment, cancel at period end, pending invoice items,
 * and the webhook events each of those produces (signed like Stripe's).
 *
 * Test payment methods follow Stripe's names:
 *   pm_card_chargeDeclined          — the first charge is declined
 *   pm_card_authenticationRequired  — the bank asks for 3-D Secure
 *   pm_card_attachDeclined          — refused when attached
 *   anything else starting pm_      — succeeds (like pm_card_visa / 4242…)
 */
const DAY_S = 86_400

interface FakeSub {
  id: string
  customer: string
  status: StripeSubscription['status']
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: number
  itemId: string
  priceId: string
  pendingUpdate: boolean
  intent: { status: string; clientSecret: string | null } | null
}

export interface FakeInvoiceItem {
  id: string
  customer: string
  subscription: string | null
  amountCents: number
  description: string
  metadata: Record<string, string>
  /** Set once the item has been put on an invoice. */
  invoiced: boolean
}

export interface FakeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export class FakeStripe implements StripeApi {
  prices = new Map<string, StripePrice & { lookupKey: string }>()
  customers = new Map<string, { id: string; email: string; userId: string; defaultPaymentMethod: string | null }>()
  subscriptions = new Map<string, FakeSub>()
  invoiceItems = new Map<string, FakeInvoiceItem>()
  invoices: Array<{ customer: string; amountCents: number; items: string[] }> = []
  events: FakeEvent[] = []
  /** Every call, by name — tests assert what was (and was not) sent. */
  calls: string[] = []
  /** Fails the next call with this error, once. */
  failNext: StripeError | null = null
  private idempotent = new Map<string, unknown>()
  private seq = 0
  now = Math.floor(Date.now() / 1000)

  constructor(options: { withPrices?: boolean } = {}) {
    if (options.withPrices !== false) {
      this.addPrice('reclaim_growth_monthly', 1500)
      this.addPrice('reclaim_flat_monthly', 5000)
    }
  }

  addPrice(lookupKey: string, unitAmount: number, currency = 'usd', interval = 'month'): string {
    const id = this.id('price')
    this.prices.set(id, { id, lookupKey, unitAmount, currency, interval })
    return id
  }

  private id(prefix: string): string {
    this.seq += 1
    return `${prefix}_fake${String(this.seq).padStart(4, '0')}`
  }

  private enter(name: string): void {
    this.calls.push(name)
    if (this.failNext) {
      const err = this.failNext
      this.failNext = null
      throw err
    }
  }

  private once<T>(key: string | undefined, run: () => T): T {
    if (key && this.idempotent.has(key)) return this.idempotent.get(key) as T
    const value = run()
    if (key) this.idempotent.set(key, value)
    return value
  }

  private emit(type: string, object: Record<string, unknown>): void {
    this.events.push({ id: this.id('evt'), type, data: { object } })
  }

  private wire(sub: FakeSub): Record<string, unknown> {
    // The newer payload shape (period end on the item), so the webhook path never relies on it.
    return { id: sub.id, object: 'subscription', customer: sub.customer, status: sub.status, cancel_at_period_end: sub.cancelAtPeriodEnd, items: { data: [{ id: sub.itemId, price: { id: sub.priceId }, current_period_end: sub.currentPeriodEnd }] } }
  }

  private view(sub: FakeSub): StripeSubscription {
    return { id: sub.id, customer: sub.customer, status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, currentPeriodEnd: sub.currentPeriodEnd, itemId: sub.itemId, priceId: sub.priceId, pendingUpdate: sub.pendingUpdate, paymentIntent: sub.intent }
  }

  private sub(id: string): FakeSub {
    const sub = this.subscriptions.get(id)
    if (!sub) throw new StripeError(404, 'invalid_request_error', 'resource_missing', `No such subscription: '${id}'`)
    return sub
  }

  private declines(customer: string): boolean {
    return this.customers.get(customer)?.defaultPaymentMethod === 'pm_card_chargeDeclined'
  }

  private price(id: string): StripePrice {
    const price = this.prices.get(id)
    if (!price) throw new StripeError(400, 'invalid_request_error', 'resource_missing', `No such price: '${id}'`)
    return price
  }

  // ---------- StripeApi ----------

  async findPrice(lookupKey: string) {
    this.enter('findPrice')
    return [...this.prices.values()].find((p) => p.lookupKey === lookupKey) ?? null
  }

  async createCustomer(input: { email: string; name: string; userId: string }, idempotencyKey: string) {
    this.enter('createCustomer')
    return this.once(idempotencyKey, () => {
      const id = this.id('cus')
      this.customers.set(id, { id, email: input.email, userId: input.userId, defaultPaymentMethod: null })
      return { id }
    })
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string) {
    this.enter('attachPaymentMethod')
    if (!/^pm_\w+$/.test(paymentMethodId)) throw new StripeError(400, 'invalid_request_error', 'resource_missing', `No such PaymentMethod: '${paymentMethodId}'`)
    if (paymentMethodId === 'pm_card_attachDeclined') throw new StripeError(402, 'card_error', 'card_declined', 'Your card was declined.')
    const customer = this.customers.get(customerId)
    if (!customer) throw new StripeError(404, 'invalid_request_error', 'resource_missing', `No such customer: '${customerId}'`)
    customer.defaultPaymentMethod = paymentMethodId
  }

  async createSubscription(input: { customerId: string; priceId: string; paymentMethodId: string; userId: string }, idempotencyKey: string) {
    this.enter('createSubscription')
    return this.once(idempotencyKey, () => {
      this.price(input.priceId)
      const declined = input.paymentMethodId === 'pm_card_chargeDeclined'
      const challenge = input.paymentMethodId === 'pm_card_authenticationRequired'
      const sub: FakeSub = {
        id: this.id('sub'),
        customer: input.customerId,
        status: declined || challenge ? 'incomplete' : 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: this.now + 30 * DAY_S,
        itemId: this.id('si'),
        priceId: input.priceId,
        pendingUpdate: false,
        intent: declined ? { status: 'requires_payment_method', clientSecret: null } : challenge ? { status: 'requires_action', clientSecret: `pi_secret_${this.seq}` } : { status: 'succeeded', clientSecret: null },
      }
      this.subscriptions.set(sub.id, sub)
      this.emit('customer.subscription.created', this.wire(sub))
      if (sub.status === 'active') this.emit('invoice.paid', { object: 'invoice', subscription: sub.id, customer: sub.customer })
      return this.view(sub)
    })
  }

  async retrieveSubscription(id: string) {
    this.enter('retrieveSubscription')
    return this.view(this.sub(id))
  }

  async changeSubscriptionPrice(id: string, itemId: string, priceId: string) {
    this.enter('changeSubscriptionPrice')
    const sub = this.sub(id)
    if (sub.itemId !== itemId) throw new StripeError(400, 'invalid_request_error', 'resource_missing', 'No such subscription item.')
    const from = this.price(sub.priceId)
    const to = this.price(priceId)
    if (this.declines(sub.customer) && (to.unitAmount ?? 0) > (from.unitAmount ?? 0)) {
      // pending_if_incomplete: the switch waits for a payment that failed; the old price stays.
      sub.pendingUpdate = true
      return this.view(sub)
    }
    sub.priceId = priceId
    sub.cancelAtPeriodEnd = false
    sub.pendingUpdate = false
    this.emit('customer.subscription.updated', this.wire(sub))
    return this.view(sub)
  }

  async setCancelAtPeriodEnd(id: string, cancel: boolean) {
    this.enter('setCancelAtPeriodEnd')
    const sub = this.sub(id)
    sub.cancelAtPeriodEnd = cancel
    this.emit('customer.subscription.updated', this.wire(sub))
    return this.view(sub)
  }

  async cancelSubscriptionNow(id: string) {
    this.enter('cancelSubscriptionNow')
    const sub = this.sub(id)
    sub.status = sub.status === 'incomplete' ? 'incomplete_expired' : 'canceled'
    this.emit('customer.subscription.deleted', this.wire(sub))
  }

  async createInvoiceItem(input: { customerId: string; subscriptionId: string | null; amountCents: number; description: string; metadata: Record<string, string> }, idempotencyKey: string) {
    this.enter('createInvoiceItem')
    return this.once(idempotencyKey, () => {
      const id = this.id('ii')
      this.invoiceItems.set(id, { id, customer: input.customerId, subscription: input.subscriptionId, amountCents: input.amountCents, description: input.description, metadata: input.metadata, invoiced: false })
      return { id }
    })
  }

  async deleteInvoiceItem(id: string) {
    this.enter('deleteInvoiceItem')
    const item = this.invoiceItems.get(id)
    if (!item || item.invoiced) return false
    this.invoiceItems.delete(id)
    return true
  }

  async invoicePendingItems(customerId: string) {
    this.enter('invoicePendingItems')
    this.invoice(customerId, null)
  }

  // ---------- test controls ----------

  /** The browser finished 3-D Secure: the first invoice is paid. */
  completeAuthentication(subscriptionId: string): void {
    const sub = this.sub(subscriptionId)
    sub.status = 'active'
    sub.intent = { status: 'succeeded', clientSecret: null }
    this.emit('customer.subscription.updated', this.wire(sub))
    this.emit('invoice.paid', { object: 'invoice', subscription: sub.id, customer: sub.customer })
  }

  /** A renewal charge failed (Stripe retries; the subscription is past_due meanwhile). */
  failRenewal(subscriptionId: string): void {
    const sub = this.sub(subscriptionId)
    sub.status = 'past_due'
    this.emit('invoice.payment_failed', { object: 'invoice', subscription: sub.id, customer: sub.customer })
    this.emit('customer.subscription.updated', this.wire(sub))
  }

  /** Every retry failed: Stripe cancels the subscription. */
  exhaustRetries(subscriptionId: string): void {
    const sub = this.sub(subscriptionId)
    sub.status = 'canceled'
    this.emit('customer.subscription.deleted', this.wire(sub))
  }

  /**
   * The billing period ends: subscriptions set to cancel end, the rest renew
   * and their pending invoice items are invoiced with the renewal.
   */
  endPeriod(): void {
    this.now += 30 * DAY_S
    for (const sub of this.subscriptions.values()) {
      if (sub.status !== 'active' && sub.status !== 'past_due' && sub.status !== 'trialing') continue
      if (sub.cancelAtPeriodEnd) {
        sub.status = 'canceled'
        this.emit('customer.subscription.deleted', this.wire(sub))
        continue
      }
      this.invoice(sub.customer, sub)
      sub.currentPeriodEnd = this.now + 30 * DAY_S
      this.emit('invoice.paid', { object: 'invoice', subscription: sub.id, customer: sub.customer })
      this.emit('customer.subscription.updated', this.wire(sub))
    }
  }

  private invoice(customer: string, sub: FakeSub | null): void {
    const pending = [...this.invoiceItems.values()].filter((i) => i.customer === customer && !i.invoiced)
    const base = sub ? (this.price(sub.priceId).unitAmount ?? 0) : 0
    if (!pending.length && !base) return
    for (const item of pending) item.invoiced = true
    this.invoices.push({ customer, amountCents: base + pending.reduce((s, i) => s + i.amountCents, 0), items: pending.map((i) => i.id) })
  }

  /** Takes the queued events, signed as Stripe would sign them for this endpoint secret. */
  drainSigned(secret: string): Array<{ body: string; signature: string }> {
    const out = this.events.map((event) => {
      const body = JSON.stringify({ ...event, object: 'event', api_version: '2025-09-30.clover' })
      return { body, signature: signatureHeader(body, secret) }
    })
    this.events = []
    return out
  }
}
