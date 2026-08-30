import { loadStripe, type Stripe } from '@stripe/stripe-js'

/**
 * Stripe's own publicly documented test-mode publishable key — the same one
 * used throughout Stripe's official docs and quickstarts. Publishable keys are
 * designed to be public (they can only tokenize card data, never charge or move
 * money), so shipping this one is safe. It is NOT a real Reclaim account.
 *
 * Swap this for Reclaim's own `pk_test_…` / `pk_live_…` key from
 * https://dashboard.stripe.com/apikeys the moment there is a real account,
 * ideally via an environment variable rather than a literal here.
 */
const STRIPE_PUBLISHABLE_KEY = 'pk_test_TYooMQauvdEDq54NiTphI7jx'

let stripePromise: Promise<Stripe | null> | null = null

/** Memoized Stripe.js instance — the SDK should only ever be loaded once per page. */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY)
  return stripePromise
}

export interface TokenizedCard {
  paymentMethodId: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

/**
 * What "connect a real backend" means, concretely — kept next to the code it
 * describes so it can't drift out of sync with what's actually implemented.
 *
 * This screen already does the part that has to run in the browser: Stripe's
 * hosted Card Element collects the PAN inside Stripe's iframe (it never
 * touches Reclaim's own code or server — that's what makes this PCI-safe),
 * and `stripe.createPaymentMethod` below tokenizes it into a `pm_…` id. That
 * id is real and safe to send anywhere.
 *
 * Turning that id into an actual charge needs a server Reclaim doesn't have
 * yet, because charging requires Stripe's *secret* key, which must never
 * reach the browser:
 *   1. A server endpoint (e.g. POST /api/subscriptions) that holds
 *      STRIPE_SECRET_KEY and calls stripe.subscriptions.create() or
 *      stripe.paymentIntents.create() with this paymentMethodId.
 *   2. That endpoint returns a client_secret if the bank requires 3D Secure,
 *      which the browser then confirms via stripe.confirmCardPayment().
 *   3. A webhook handler for invoice.paid / customer.subscription.updated so
 *      entitlement is driven by Stripe's event stream, not by the client
 *      claiming "I paid" — see the prototype-entitlement note on
 *      useEntitlement in src/billing/useEntitlement.ts.
 */
export const BACKEND_INTEGRATION_NOTE = 'See the doc comment on TokenizedCard in src/billing/stripe.ts.'
