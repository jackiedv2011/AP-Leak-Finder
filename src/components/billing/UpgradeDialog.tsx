import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, CreditCard, Lock, X } from 'lucide-react'
import { PERFORMANCE_FEE_RATE, RECLAIM_PLANS, recoveryEconomics, type ReclaimPlan } from '@/billing/entitlement'
import type { TokenizedCard } from '@/billing/stripe'
import { CardField } from '@/components/billing/CardField'
import { formatCurrency } from '@/lib/format'

type Step = 'plan' | 'details' | 'payment' | 'review' | 'done'

const STEP_ORDER: Step[] = ['plan', 'details', 'payment', 'review']
const STEP_LABEL: Record<Step, string> = {
  plan: 'Plan',
  details: 'Details',
  payment: 'Card',
  review: 'Review',
  done: 'Done',
}

const CARD_BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
}

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the subscription is confirmed — unlocks every finding. */
  onConfirm: () => void
  lockedCount: number
  lockedValue: number
}

/**
 * Subscription flow, staged like the Wise transfer wizard: one decision per
 * step, a persistent progress rail, and a final review before anything is
 * committed.
 *
 * The Card step mounts a real Stripe Elements field (src/components/billing/CardField.tsx)
 * running against Stripe's test-mode publishable key — the PAN is entered
 * directly into Stripe's hosted iframe and tokenized into a `pm_…` id before
 * it ever reaches this component. That id is what "Start subscription" below
 * would hand to a backend. There is no backend yet, so confirming here
 * unlocks locally rather than actually charging — see the doc comment on
 * TokenizedCard in src/billing/stripe.ts for exactly what's left to wire up.
 */
export function UpgradeDialog({ open, onOpenChange, onConfirm, lockedCount, lockedValue }: UpgradeDialogProps) {
  const [step, setStep] = useState<Step>('plan')
  const [planId, setPlanId] = useState<ReclaimPlan['id']>('monthly')
  const [business, setBusiness] = useState('')
  const [email, setEmail] = useState('')
  const [card, setCard] = useState<TokenizedCard | null>(null)
  /**
   * lockedCount/lockedValue are live props: the moment the subscription is
   * confirmed they both drop to zero, because nothing is locked any more. The
   * success step has to report what was *just* unlocked, so it reads from a
   * snapshot captured before entitlement changes.
   */
  const [unlockedSnapshot, setUnlockedSnapshot] = useState({ count: 0, value: 0 })
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  const plan = useMemo(() => RECLAIM_PLANS.find((item) => item.id === planId) ?? RECLAIM_PLANS[0], [planId])

  // Reset to the first step whenever the dialog is reopened, so a previous
  // half-finished attempt never leaks into a new one.
  useEffect(() => {
    if (open) {
      setStep('plan')
      setCard(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  const detailsValid = business.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const currentIndex = STEP_ORDER.indexOf(step)

  function confirmSubscription() {
    setUnlockedSnapshot({ count: lockedCount, value: lockedValue })
    onConfirm()
    setStep('done')
  }

  return (
    <div
      className="rc-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <div
        className="rc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="rc-modal-head">
          <h2 id={titleId}>{step === 'done' ? 'Subscription active' : 'Unlock every finding'}</h2>
          <button type="button" className="rc-modal-close" onClick={() => onOpenChange(false)} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </div>

        {step !== 'done' && (
          <div className="rc-steps" aria-label="Progress">
            {STEP_ORDER.map((item, index) => (
              <Fragment key={item}>
                {index > 0 && <span className="rc-step-line" data-done={index <= currentIndex} />}
                <span
                  className="rc-step"
                  data-state={index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'todo'}
                >
                  <span className="rc-step-dot">
                    {index < currentIndex ? <Check aria-hidden="true" style={{ width: '0.7rem' }} /> : index + 1}
                  </span>
                  {STEP_LABEL[item]}
                </span>
              </Fragment>
            ))}
          </div>
        )}

        <div className="rc-modal-body">
          {step === 'plan' && (
            <>
              <p>
                Reclaim found {lockedCount} finding{lockedCount === 1 ? '' : 's'} worth{' '}
                <strong>{formatCurrency(lockedValue)}</strong> that are still locked. Pick how you want to subscribe.
              </p>
              <div className="rc-plans">
                {RECLAIM_PLANS.map((option) => (
                  <button
                    type="button"
                    className="rc-plan-option"
                    key={option.id}
                    aria-pressed={option.id === planId}
                    onClick={() => setPlanId(option.id)}
                  >
                    <div className="rc-plan-option-top">
                      <strong>
                        {option.name} · {option.cadence.replace('per ', '')}
                        {option.savingLabel ? ` — ${option.savingLabel}` : ''}
                      </strong>
                      <span className="rc-plan-price">
                        {option.priceLabel}
                        <span>{option.cadence}</span>
                      </span>
                    </div>
                    <ul>
                      {option.points.map((point) => (
                        <li key={point}>
                          <Check aria-hidden="true" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'details' && (
            <>
              <p>Who is this subscription for? We use this for the receipt and recovery correspondence.</p>
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Business name</span>
                  <input
                    className="rc-input"
                    value={business}
                    onChange={(event) => setBusiness(event.target.value)}
                    placeholder="Sierra Coffee Supply"
                    autoComplete="organization"
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Billing email</span>
                  <input
                    className="rc-input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="ap@yourbusiness.com"
                    autoComplete="email"
                  />
                </label>
              </div>
            </>
          )}

          {step === 'payment' &&
            (card ? (
              <div className="rc-card-saved">
                <div className="rc-card-saved-row">
                  <div className="rc-card-saved-chip" aria-hidden="true">
                    <CreditCard aria-hidden="true" />
                  </div>
                  <div>
                    <strong>
                      {CARD_BRAND_LABEL[card.brand] ?? 'Card'} •••• {card.last4}
                    </strong>
                    <span>
                      Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                    </span>
                  </div>
                </div>
                <button type="button" className="rc-btn" data-variant="ghost" data-size="sm" onClick={() => setCard(null)}>
                  Use a different card
                </button>
              </div>
            ) : (
              <>
                <p>Add a card to start the subscription. This uses Stripe's real, PCI-compliant card form.</p>
                <CardField billingName={business} billingEmail={email} onTokenized={setCard} />
              </>
            ))}

          {step === 'review' && (
            <>
              <p>Confirm the details before the subscription starts.</p>
              <div className="rc-rows">
                <div className="rc-row">
                  <span>Plan</span>
                  <strong>
                    {plan.name} · {plan.cadence}
                  </strong>
                </div>
                <div className="rc-row">
                  <span>Business</span>
                  <strong>{business.trim()}</strong>
                </div>
                <div className="rc-row">
                  <span>Billing email</span>
                  <strong>{email.trim()}</strong>
                </div>
                <div className="rc-row">
                  <span>Card</span>
                  <strong>
                    {card ? `${CARD_BRAND_LABEL[card.brand] ?? 'Card'} •••• ${card.last4}` : 'Not added'}
                  </strong>
                </div>
                <div className="rc-row">
                  <span>Unlocks</span>
                  <strong>
                    {lockedCount} finding{lockedCount === 1 ? '' : 's'} · {formatCurrency(lockedValue)}
                  </strong>
                </div>
                <div className="rc-row">
                  <span>Recovery fee</span>
                  <strong>{Math.round(PERFORMANCE_FEE_RATE * 100)}% of what you actually recover</strong>
                </div>
                <div className="rc-row" data-total="true">
                  <span>Due today</span>
                  <strong>{plan.priceLabel}</strong>
                </div>
              </div>

              {/* The fee is the part people misread, so show it against their
                  own number rather than describing it in the abstract. */}
              {lockedValue > 0 && (
                <div className="rc-feeexample">
                  <span className="rc-eyebrow">If you recovered everything we found</span>
                  <div className="rc-feeexample-rows">
                    <div>
                      <span>You recover</span>
                      <strong>{formatCurrency(lockedValue + 0)}</strong>
                    </div>
                    <div>
                      <span>Reclaim's {Math.round(PERFORMANCE_FEE_RATE * 100)}% fee</span>
                      <strong>{formatCurrency(recoveryEconomics(lockedValue, lockedValue).fee)}</strong>
                    </div>
                    <div data-tone="net">
                      <span>You keep</span>
                      <strong>{formatCurrency(recoveryEconomics(lockedValue, lockedValue).net)}</strong>
                    </div>
                  </div>
                  <small>
                    Charged only on money you confirm you received. Nothing recovered means no fee — just the
                    subscription.
                  </small>
                </div>
              )}
              <div className="rc-note">
                <Lock aria-hidden="true" style={{ width: '1rem', flexShrink: 0, marginTop: '0.1rem' }} />
                <span>
                  <strong>Card saved with Stripe, not charged yet.</strong> The card above was tokenized by Stripe's
                  real test-mode form — that part is genuinely PCI-safe. Actually charging it needs a backend holding
                  Stripe's secret key, which this prototype doesn't have, so "Start subscription" unlocks the findings
                  locally instead of moving money.
                </span>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="rc-success">
              <span className="rc-success-mark">
                <Check aria-hidden="true" />
              </span>
              <h3>Every finding is unlocked</h3>
              <p>
                All {unlockedSnapshot.count} previously locked finding{unlockedSnapshot.count === 1 ? '' : 's'} —{' '}
                {formatCurrency(unlockedSnapshot.value)} in potential recovery — are now open with full evidence.
              </p>
            </div>
          )}
        </div>

        <div className="rc-modal-foot">
          {step === 'plan' && (
            <>
              <button type="button" className="rc-btn" data-variant="ghost" onClick={() => onOpenChange(false)}>
                Not now
              </button>
              <button type="button" className="rc-btn" data-variant="primary" onClick={() => setStep('details')}>
                Continue
              </button>
            </>
          )}

          {step === 'details' && (
            <>
              <button type="button" className="rc-btn" data-variant="ghost" onClick={() => setStep('plan')}>
                Back
              </button>
              <button
                type="button"
                className="rc-btn"
                data-variant="primary"
                disabled={!detailsValid}
                onClick={() => setStep('payment')}
              >
                Continue
              </button>
            </>
          )}

          {step === 'payment' && (
            <>
              <button type="button" className="rc-btn" data-variant="ghost" onClick={() => setStep('details')}>
                Back
              </button>
              <button
                type="button"
                className="rc-btn"
                data-variant="primary"
                disabled={!card}
                onClick={() => setStep('review')}
              >
                Continue
              </button>
            </>
          )}

          {step === 'review' && (
            <>
              <button type="button" className="rc-btn" data-variant="ghost" onClick={() => setStep('payment')}>
                Back
              </button>
              <button type="button" className="rc-btn" data-variant="mint" onClick={confirmSubscription}>
                <CreditCard aria-hidden="true" />
                Start subscription
              </button>
            </>
          )}

          {step === 'done' && (
            <button type="button" className="rc-btn" data-variant="primary" onClick={() => onOpenChange(false)}>
              View my findings
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
