import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The slice of Stripe that billing uses, behind an interface so server tests
 * run against `FakeStripe` (fakeStripe.ts) and production against the REST
 * client below. No SDK: a dozen form-encoded calls do not need one, and the
 * container image runs plain node.
 *
 * Every request pins `Stripe-Version`, so the response shapes below hold
 * whatever version the Stripe account defaults to. Webhook payloads are *not*
 * pinned (they follow the endpoint's version), which is why the webhook only
 * reads an id out of an event and re-fetches the object here.
 */
export const STRIPE_API_VERSION = '2024-06-20'

export interface StripePrice {
  id: string
  unitAmount: number | null
  currency: string
  interval: string | null
}

export interface StripeSubscription {
  id: string
  customer: string
  status: 'active' | 'trialing' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused'
  cancelAtPeriodEnd: boolean
  /** Unix seconds. */
  currentPeriodEnd: number | null
  itemId: string | null
  priceId: string | null
  /** A plan switch that is waiting on a payment (payment_behavior=pending_if_incomplete). */
  pendingUpdate: boolean
  /** The first invoice's payment, when the subscription is still incomplete. */
  paymentIntent: { status: string; clientSecret: string | null } | null
}

export interface StripeApi {
  findPrice(lookupKey: string): Promise<StripePrice | null>
  createCustomer(input: { email: string; name: string; userId: string }, idempotencyKey: string): Promise<{ id: string }>
  attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<void>
  createSubscription(input: { customerId: string; priceId: string; paymentMethodId: string; userId: string }, idempotencyKey: string): Promise<StripeSubscription>
  retrieveSubscription(id: string): Promise<StripeSubscription>
  /** Prorated, charged now; if the charge fails the subscription keeps its old price. */
  changeSubscriptionPrice(id: string, itemId: string, priceId: string): Promise<StripeSubscription>
  setCancelAtPeriodEnd(id: string, cancel: boolean): Promise<StripeSubscription>
  cancelSubscriptionNow(id: string): Promise<void>
  createInvoiceItem(input: { customerId: string; subscriptionId: string | null; amountCents: number; description: string; metadata: Record<string, string> }, idempotencyKey: string): Promise<{ id: string }>
  /** False when the item was already on a finalized invoice and can no longer be removed. */
  deleteInvoiceItem(id: string): Promise<boolean>
  /** Bill whatever invoice items are still pending (used when a subscription ends). */
  invoicePendingItems(customerId: string): Promise<void>
}

/** A Stripe API error. `type === 'card_error'` messages are written for the cardholder and safe to show. */
export class StripeError extends Error {
  readonly type: string
  readonly code: string | null
  readonly status: number
  constructor(status: number, type: string, code: string | null, message: string) {
    super(message)
    this.status = status
    this.type = type
    this.code = code
  }
}

type Json = Record<string, unknown>

/** Stripe's bracketed form encoding: { items: [{ price: 'p' }] } → items[0][price]=p. */
export function formEncode(params: Json, prefix = ''): string {
  const out: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) {
      value.forEach((entry, i) => {
        if (entry !== null && typeof entry === 'object') out.push(formEncode(entry as Json, `${name}[${i}]`))
        else out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(entry))}`)
      })
    } else if (typeof value === 'object') {
      out.push(formEncode(value as Json, name))
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    }
  }
  return out.filter(Boolean).join('&')
}

/** Read a subscription in either shape: period end moved onto the items in newer API versions. */
export function normalizeSubscription(raw: Json): StripeSubscription {
  const items = ((raw.items as Json | undefined)?.data as Json[] | undefined) ?? []
  const item = items[0]
  const price = item?.price as Json | string | undefined
  const invoice = raw.latest_invoice as Json | string | null | undefined
  const intent = invoice && typeof invoice === 'object' ? (invoice.payment_intent as Json | string | null | undefined) : null
  const periodEnd = (raw.current_period_end as number | undefined) ?? (item?.current_period_end as number | undefined) ?? null
  return {
    id: raw.id as string,
    customer: typeof raw.customer === 'string' ? raw.customer : ((raw.customer as Json | undefined)?.id as string),
    status: raw.status as StripeSubscription['status'],
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
    currentPeriodEnd: typeof periodEnd === 'number' ? periodEnd : null,
    itemId: (item?.id as string | undefined) ?? null,
    priceId: typeof price === 'string' ? price : ((price?.id as string | undefined) ?? null),
    pendingUpdate: Boolean(raw.pending_update),
    paymentIntent: intent && typeof intent === 'object' ? { status: intent.status as string, clientSecret: (intent.client_secret as string | null) ?? null } : null,
  }
}

export function createStripeClient(secretKey: string, fetchImpl: typeof fetch = fetch): StripeApi {
  async function call(method: 'GET' | 'POST' | 'DELETE', path: string, params: Json = {}, idempotencyKey?: string): Promise<Json> {
    const body = formEncode(params)
    const url = `https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': STRIPE_API_VERSION }
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    const res = await fetchImpl(url, { method, headers, body: method === 'POST' ? body : undefined })
    const data = (await res.json().catch(() => ({}))) as Json
    if (!res.ok) {
      const err = (data.error as Json | undefined) ?? {}
      throw new StripeError(res.status, String(err.type ?? 'api_error'), (err.decline_code as string) ?? (err.code as string) ?? null, String(err.message ?? `Stripe returned ${res.status}.`))
    }
    return data
  }
  const expand = ['latest_invoice.payment_intent']

  return {
    async findPrice(lookupKey) {
      const list = await call('GET', '/prices', { lookup_keys: [lookupKey], active: true, limit: 1 })
      const price = ((list.data as Json[]) ?? [])[0]
      if (!price) return null
      return { id: price.id as string, unitAmount: (price.unit_amount as number | null) ?? null, currency: price.currency as string, interval: ((price.recurring as Json | null)?.interval as string) ?? null }
    },
    async createCustomer({ email, name, userId }, idempotencyKey) {
      const customer = await call('POST', '/customers', { email, name: name || undefined, metadata: { reclaim_user_id: userId } }, idempotencyKey)
      return { id: customer.id as string }
    },
    async attachPaymentMethod(paymentMethodId, customerId) {
      await call('POST', `/payment_methods/${encodeURIComponent(paymentMethodId)}/attach`, { customer: customerId })
      await call('POST', `/customers/${encodeURIComponent(customerId)}`, { invoice_settings: { default_payment_method: paymentMethodId } })
    },
    async createSubscription({ customerId, priceId, paymentMethodId, userId }, idempotencyKey) {
      const sub = await call(
        'POST',
        '/subscriptions',
        {
          customer: customerId,
          items: [{ price: priceId }],
          default_payment_method: paymentMethodId,
          // Charge now; if the bank wants 3-D Secure the subscription stays
          // incomplete and the browser confirms the payment intent.
          payment_behavior: 'allow_incomplete',
          metadata: { reclaim_user_id: userId },
          expand,
        },
        idempotencyKey
      )
      return normalizeSubscription(sub)
    },
    async retrieveSubscription(id) {
      return normalizeSubscription(await call('GET', `/subscriptions/${encodeURIComponent(id)}`, { expand }))
    },
    async changeSubscriptionPrice(id, itemId, priceId) {
      const sub = await call('POST', `/subscriptions/${encodeURIComponent(id)}`, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
        cancel_at_period_end: false,
        expand,
      })
      return normalizeSubscription(sub)
    },
    async setCancelAtPeriodEnd(id, cancel) {
      return normalizeSubscription(await call('POST', `/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: cancel, expand }))
    },
    async cancelSubscriptionNow(id) {
      await call('DELETE', `/subscriptions/${encodeURIComponent(id)}`)
    },
    async createInvoiceItem({ customerId, subscriptionId, amountCents, description, metadata }, idempotencyKey) {
      const item = await call('POST', '/invoiceitems', { customer: customerId, subscription: subscriptionId ?? undefined, amount: amountCents, currency: 'usd', description, metadata }, idempotencyKey)
      return { id: item.id as string }
    },
    async deleteInvoiceItem(id) {
      try {
        await call('DELETE', `/invoiceitems/${encodeURIComponent(id)}`)
        return true
      } catch (err) {
        if (err instanceof StripeError && err.status === 400) return false
        throw err
      }
    },
    async invoicePendingItems(customerId) {
      try {
        await call('POST', '/invoices', { customer: customerId, pending_invoice_items_behavior: 'include', auto_advance: true })
      } catch (err) {
        // "Nothing to invoice" is the normal answer when no fee is pending.
        if (!(err instanceof StripeError && err.status === 400)) throw err
      }
    },
  }
}

/** Five minutes either way, as Stripe's own libraries allow. */
const SIGNATURE_TOLERANCE_S = 300

/**
 * Checks a `Stripe-Signature` header (t=…,v1=…) against the raw request body.
 * Returns the parsed event, or throws: an unsigned or altered body is never read.
 */
export function verifyWebhook(rawBody: string, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): { id: string; type: string; data: { object: Json } } {
  if (!header) throw new Error('missing signature')
  const parts = header.split(',').map((p) => p.trim().split('='))
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1])
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '')
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error('malformed signature')
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_S) throw new Error('signature too old')
  const expected = Buffer.from(signPayload(rawBody, secret, timestamp), 'hex')
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!ok) throw new Error('signature mismatch')
  const event = JSON.parse(rawBody) as { id?: unknown; type?: unknown; data?: { object?: unknown } }
  if (typeof event.id !== 'string' || typeof event.type !== 'string' || !event.data || typeof event.data.object !== 'object') throw new Error('not an event')
  return event as { id: string; type: string; data: { object: Json } }
}

export function signPayload(rawBody: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

/** The header Stripe would send — for tests and the fake. */
export function signatureHeader(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${signPayload(rawBody, secret, timestamp)}`
}

/** The subscription an event is about, in either payload shape. */
export function subscriptionIdOf(object: Json): string | null {
  if (object.object === 'subscription' && typeof object.id === 'string') return object.id
  if (typeof object.subscription === 'string') return object.subscription
  const parent = object.parent as Json | undefined
  const details = parent?.subscription_details as Json | undefined
  if (typeof details?.subscription === 'string') return details.subscription
  return null
}
