import { useState } from 'react'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js'
import { Lock } from 'lucide-react'
import { getStripe, type TokenizedCard } from '@/billing/stripe'

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontFamily: 'inherit',
      fontSize: '15px',
      color: '#171917',
      '::placeholder': { color: '#7a7d76' },
      iconColor: '#5f625d',
    },
    invalid: {
      color: '#a8442e',
      iconColor: '#a8442e',
    },
  },
}

interface CardFieldProps {
  billingName: string
  billingEmail: string
  onTokenized: (card: TokenizedCard) => void
}

/** The actual Stripe card entry, inside the <Elements> provider below. */
function CardFieldInner({ billingName, billingEmail, onTokenized }: CardFieldProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleChange(event: StripeCardElementChangeEvent) {
    setComplete(event.complete)
    setError(event.error?.message ?? null)
  }

  async function handleSaveCard() {
    if (!stripe || !elements) return
    const card = elements.getElement(CardElement)
    if (!card) return

    setSubmitting(true)
    setError(null)

    // This tokenizes the card details entered inside Stripe's own hosted
    // iframe — the raw card number never enters Reclaim's code. It runs
    // entirely client-side against Stripe's test-mode publishable key, so it
    // is safe to try with any of Stripe's published test card numbers.
    const result = await stripe.createPaymentMethod({
      type: 'card',
      card,
      billing_details: { name: billingName || undefined, email: billingEmail || undefined },
    })

    setSubmitting(false)

    if (result.error) {
      setError(result.error.message ?? 'That card could not be saved. Check the details and try again.')
      return
    }

    const pm = result.paymentMethod
    if (!pm.card) {
      setError('Stripe did not return card details. Please try again.')
      return
    }

    onTokenized({
      paymentMethodId: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    })
  }

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div className="rc-card-element" data-invalid={Boolean(error)}>
        <CardElement options={CARD_ELEMENT_OPTIONS} onChange={handleChange} />
      </div>
      {error && (
        <p className="rc-card-element-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="rc-btn"
        data-variant="primary"
        disabled={!complete || submitting}
        onClick={handleSaveCard}
      >
        {submitting ? 'Saving card…' : 'Save card and continue'}
      </button>
      <p className="rc-card-element-hint">
        <Lock aria-hidden="true" style={{ width: '0.85rem', flexShrink: 0 }} />
        Card details are entered directly into Stripe's secure fields and tokenized before they ever reach Reclaim.
        Test mode — use{' '}
        <code>4242 4242 4242 4242</code>, any future expiry, any CVC.
      </p>
    </div>
  )
}

/**
 * Loads Stripe.js once and mounts a real, PCI-safe card entry field.
 * See src/billing/stripe.ts for exactly what this does and does not do yet.
 */
export function CardField(props: CardFieldProps) {
  const [stripePromise] = useState(getStripe)
  return (
    <Elements stripe={stripePromise}>
      <CardFieldInner {...props} />
    </Elements>
  )
}
