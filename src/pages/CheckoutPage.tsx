import { useEffect, useMemo, useState } from 'react'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeCardElementChangeEvent, StripeCardElementOptions } from '@stripe/stripe-js'
import { ArrowLeft, BadgeCheck, Check, CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { PLAN_LABEL, PLAN_PITCH, PLAN_PRICE_USD, PLAN_SUCCESS_FEE, FLAT_BREAK_EVEN, planOf, type Plan } from '@/lib/plans'
import { getStripe, STRIPE_IS_TEST_MODE } from '@/billing/stripe'
import { ReclaimLogo } from '@/components/ReclaimLogo'
import { useTheme } from '@/workspace/theme'
import '@/workspace/workspace.css'

type PaidPlan = Exclude<Plan, 'free'>

const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Ireland', 'New Zealand', 'Other']
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function planFromUrl(): PaidPlan | null {
  const p = new URLSearchParams(window.location.search).get('plan')
  return p === 'growth' || p === 'flat' ? p : null
}

/** Stripe's card field lives in an iframe and cannot read CSS variables, so it is handed the resolved colours. */
function cardOptions(): StripeCardElementOptions {
  const probe = document.querySelector('.wk') ?? document.documentElement
  const css = getComputedStyle(probe)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    hidePostalCode: true,
    style: {
      base: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '15px', color: v('--text', '#111'), iconColor: v('--text-muted', '#777'), '::placeholder': { color: v('--text-muted', '#888') } },
      invalid: { color: v('--danger', '#c33'), iconColor: v('--danger', '#c33') },
    },
  }
}

interface Receipt {
  brand: string
  last4: string
}

function PaymentForm({ plan, email, defaultName, onDone }: { plan: PaidPlan; email: string; defaultName: string; onDone: (r: Receipt) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [name, setName] = useState(defaultName)
  const [country, setCountry] = useState('United States')
  const [postal, setPostal] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const options = useMemo(cardOptions, [])

  const errors = {
    name: !name.trim() ? 'Enter the name on the card.' : null,
    postal: !postal.trim() ? 'Enter a ZIP or postal code.' : null,
    card: cardError ?? (!cardComplete ? 'Enter your card details.' : null),
    agreed: !agreed ? 'Please agree to the subscription terms.' : null,
  }
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setFormError(null)
    if (Object.values(errors).some(Boolean) || !stripe || !elements) return
    const card = elements.getElement(CardElement)
    if (!card) return
    setBusy(true)
    // The card number is entered in Stripe's own iframe and turned into a token
    // there; it never passes through Reclaim's code or server.
    const result = await stripe.createPaymentMethod({
      type: 'card',
      card,
      billing_details: { name: name.trim(), email, address: { postal_code: postal.trim() } },
    })
    setBusy(false)
    if (result.error || !result.paymentMethod.card) {
      setFormError(result.error?.message ?? 'That card could not be verified. Check the details and try again.')
      return
    }
    onDone({ brand: result.paymentMethod.card.brand, last4: result.paymentMethod.card.last4 })
  }

  return (
    <form className="wk-checkout-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend className="wk-label">Contact</legend>
        <div className="wk-field">
          <label htmlFor="co-email">Email</label>
          <input id="co-email" className="wk-input" value={email} readOnly />
          <span className="wk-field-hint">Receipts and billing notices go here.</span>
        </div>
      </fieldset>

      <fieldset>
        <legend className="wk-label">Payment</legend>
        <div className="wk-field">
          <label htmlFor="co-name">Name on card</label>
          <input id="co-name" className="wk-input" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={show('name') ? 'true' : undefined} />
          {show('name') ? <span className="wk-field-error" role="alert">{errors.name}</span> : null}
        </div>
        <div className="wk-field">
          <label htmlFor="co-card">Card</label>
          <div id="co-card" className="wk-input wk-checkout-card" data-invalid={Boolean(show('card')) || undefined}>
            <CardElement
              options={options}
              onChange={(e: StripeCardElementChangeEvent) => {
                setCardComplete(e.complete)
                setCardError(e.error?.message ?? null)
              }}
            />
          </div>
          {show('card') ? <span className="wk-field-error" role="alert">{errors.card}</span> : null}
        </div>
        <div className="wk-checkout-row">
          <div className="wk-field">
            <label htmlFor="co-country">Country</label>
            <select id="co-country" className="wk-input" autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="wk-field">
            <label htmlFor="co-postal">ZIP / postal code</label>
            <input id="co-postal" className="wk-input" autoComplete="postal-code" value={postal} onChange={(e) => setPostal(e.target.value)} aria-invalid={show('postal') ? 'true' : undefined} />
            {show('postal') ? <span className="wk-field-error" role="alert">{errors.postal}</span> : null}
          </div>
        </div>
      </fieldset>

      <label className="wk-checkout-consent">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I agree to be billed {money(PLAN_PRICE_USD[plan])} every month until I cancel
          {PLAN_SUCCESS_FEE[plan] > 0 ? `, plus ${PLAN_SUCCESS_FEE[plan] * 100}% of money recorded as recovered` : ''}, and to the{' '}
          <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>.
        </span>
      </label>
      {show('agreed') ? <span className="wk-field-error" role="alert">{errors.agreed}</span> : null}

      {formError ? (
        <div className="wk-alert" role="alert">
          <p>{formError}</p>
        </div>
      ) : null}

      <button type="submit" className="wk-btn wk-checkout-pay" data-variant="primary" disabled={busy || !stripe}>
        <Lock aria-hidden="true" />
        {busy ? 'Verifying card…' : `Subscribe · ${money(PLAN_PRICE_USD[plan])}/month`}
      </button>
      <p className="wk-checkout-secure">
        <ShieldCheck aria-hidden="true" />
        Card details go straight to Stripe over an encrypted connection. Reclaim never sees or stores your card number.
      </p>
    </form>
  )
}

function Summary({ plan }: { plan: PaidPlan }) {
  const pitch = PLAN_PITCH[plan]
  const other: PaidPlan = plan === 'growth' ? 'flat' : 'growth'
  return (
    <aside className="wk-checkout-summary" aria-label="Order summary">
      <span className="wk-label">Order summary</span>
      <div className="wk-checkout-plan">
        <div>
          <div className="wk-display wk-h2">Reclaim {PLAN_LABEL[plan]}</div>
          <div className="wk-dim" style={{ fontSize: 13 }}>{pitch.tagline} · billed monthly</div>
        </div>
        <a className="wk-linklike" href={`/checkout?plan=${other}`}>
          Switch to {PLAN_LABEL[other]}
        </a>
      </div>
      <ul className="wk-plan-features">
        {pitch.features.map((f) => (
          <li key={f}>
            <Check aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <dl className="wk-checkout-lines">
        <div>
          <dt>{PLAN_LABEL[plan]} subscription</dt>
          <dd>{money(PLAN_PRICE_USD[plan])}/mo</dd>
        </div>
        <div>
          <dt>Success fee</dt>
          <dd>{PLAN_SUCCESS_FEE[plan] > 0 ? `${PLAN_SUCCESS_FEE[plan] * 100}% of money recovered` : 'None'}</dd>
        </div>
        <div className="wk-checkout-total">
          <dt>Due today</dt>
          <dd>{money(PLAN_PRICE_USD[plan])}</dd>
        </div>
      </dl>
      <p className="wk-table-sub">
        {plan === 'growth'
          ? `The ${PLAN_SUCCESS_FEE.growth * 100}% is billed only on money that actually comes back — never on findings, promises or unused credits. Recovering more than ${money(FLAT_BREAK_EVEN)} a month? Flat costs less.`
          : 'One fixed price. Every dollar you recover stays with you.'}
      </p>
      <p className="wk-table-sub">Cancel any time from Settings. Your audits and findings stay yours either way.</p>
    </aside>
  )
}

/**
 * Checkout for Growth and Flat. Card entry is Stripe's own hosted field. Until
 * Reclaim's billing is connected on the server, a verified card starts no
 * subscription and nothing is charged — and the page says exactly that.
 */
export function CheckoutPage() {
  const { user, status } = useAuth()
  useTheme()
  const plan = planFromUrl()
  const [stripePromise] = useState(getStripe)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  useEffect(() => {
    if (!plan) window.location.replace('/audit?mode=plans')
  }, [plan])

  useEffect(() => {
    document.title = plan ? `Checkout — Reclaim ${PLAN_LABEL[plan]}` : 'Checkout — Reclaim'
  }, [plan])

  if (!plan || status === 'loading') return <main className="wk wk-checkout" aria-busy="true" />

  const signedIn = user && !user.isGuest
  const current = signedIn ? planOf(user.plan) : null

  return (
    <main className="wk wk-checkout">
      <header className="wk-checkout-bar">
        <a href="/" className="wk-checkout-brand" aria-label="Reclaim home">
          <ReclaimLogo />
        </a>
        <span className="wk-checkout-lock">
          <Lock aria-hidden="true" />
          Secure checkout
        </span>
        <a className="wk-btn" data-variant="ghost" data-size="sm" href="/audit?mode=plans">
          <ArrowLeft aria-hidden="true" />
          Back to plans
        </a>
      </header>

      {STRIPE_IS_TEST_MODE ? (
        <div className="wk-checkout-test" role="note" data-testid="checkout-test-mode">
          <strong>Test mode.</strong> Reclaim’s billing isn’t live yet — no card will be charged. Stripe’s test card 4242 4242 4242 4242 works with any future
          date and CVC.
        </div>
      ) : null}

      <div className="wk-checkout-grid">
        <section className="wk-checkout-main">
          <h1 className="wk-display wk-h1">Start Reclaim {PLAN_LABEL[plan]}</h1>
          {!signedIn ? (
            <div className="wk-card">
              <p style={{ fontWeight: 500 }}>A subscription belongs to an account.</p>
              <p className="wk-dim" style={{ marginTop: 6, fontSize: 13.5 }}>Create one (or log in) and you’ll come straight back here.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <a className="wk-btn" data-variant="primary" href={`/signup?next=${encodeURIComponent(`/checkout?plan=${plan}`)}`}>
                  Create an account
                </a>
                <a className="wk-btn" data-variant="outline" href={`/login?next=${encodeURIComponent(`/checkout?plan=${plan}`)}`}>
                  Log in
                </a>
              </div>
            </div>
          ) : current === plan ? (
            <div className="wk-card">
              <p style={{ fontWeight: 500 }}>You’re already on {PLAN_LABEL[plan]}.</p>
              <a className="wk-btn" data-variant="primary" href="/audit" style={{ marginTop: 14 }}>
                Back to your workspace
              </a>
            </div>
          ) : receipt ? (
            <div className="wk-card wk-checkout-done" data-testid="checkout-done" role="status">
              <BadgeCheck aria-hidden="true" className="wk-plans-badge" />
              <h2 className="wk-display wk-h2">Card verified</h2>
              <p style={{ marginTop: 6 }}>
                <CreditCard aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: '-3px', marginRight: 6 }} />
                {receipt.brand.toUpperCase()} ending {receipt.last4}
              </p>
              <p className="wk-dim" style={{ marginTop: 10, fontSize: 13.5 }}>
                Reclaim’s billing isn’t connected yet, so nothing was charged and your plan is still {PLAN_LABEL[current ?? 'free']}. As soon as billing goes live,
                this step starts your {PLAN_LABEL[plan]} subscription.
              </p>
              <a className="wk-btn" data-variant="primary" href="/audit" style={{ marginTop: 16 }}>
                Back to your workspace
              </a>
            </div>
          ) : (
            <Elements stripe={stripePromise}>
              <PaymentForm plan={plan} email={user.email} defaultName={user.name} onDone={setReceipt} />
            </Elements>
          )}
        </section>
        <Summary plan={plan} />
      </div>
    </main>
  )
}
