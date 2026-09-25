import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowRight, BadgeCheck, Check, Minus, X } from 'lucide-react'
import { PLANS, PLAN_LABEL, PLAN_PITCH, planOf, type Plan } from '@/lib/plans'
import { useOptionalAuth } from '@/lib/auth/AuthContext'

/** One row per capability, and which tracks include it. */
const COMPARISON: Array<{ label: string; plans: Record<Plan, boolean | string> }> = [
  { label: 'Ledger uploads', plans: { free: 'Unlimited', growth: 'Unlimited', flat: 'Unlimited' } },
  { label: 'All eight checks on every file', plans: { free: true, growth: true, flat: true } },
  { label: 'Findings shown in full', plans: { free: '3 lowest-value per upload', growth: 'Every finding', flat: 'Every finding' } },
  { label: 'Re-audit a ledger you already uploaded', plans: { free: false, growth: true, flat: true } },
  { label: 'Recovery letters', plans: { free: 'Read and copy', growth: 'Edit and download', flat: 'Edit and download' } },
  { label: 'AI-drafted recovery emails', plans: { free: false, growth: true, flat: true } },
  { label: 'Automatic sending through your Gmail', plans: { free: false, growth: 'Coming soon', flat: 'Coming soon' } },
  { label: 'Approvals, follow-ups and partial returns', plans: { free: false, growth: true, flat: true } },
  { label: 'Full case history and accounting closeout', plans: { free: false, growth: true, flat: true } },
  { label: 'Every-vendor report', plans: { free: false, growth: true, flat: true } },
  { label: 'Success fee on money recovered', plans: { free: 'None', growth: '15%', flat: 'None' } },
]

export function checkoutUrl(plan: Plan): string {
  return `/checkout?plan=${plan}`
}

/**
 * The three tracks as a destination of their own. Free confirms in place;
 * Growth and Flat continue to checkout.
 */
export function Plans({ onStartAudit }: { onStartAudit: () => void }) {
  const auth = useOptionalAuth()
  const isGuest = auth?.user?.isGuest ?? true
  const current: Plan = auth?.user && !isGuest ? planOf(auth.user.plan) : 'free'
  const [freeConfirmed, setFreeConfirmed] = useState(false)

  const continueWith = (plan: Plan) => {
    if (plan === 'free') {
      setFreeConfirmed(true)
      return
    }
    // A subscription belongs to an account; a guest creates one first and lands back on checkout.
    window.location.href = isGuest ? `/signup?next=${encodeURIComponent(checkoutUrl(plan))}` : checkoutUrl(plan)
  }

  return (
    <>
      <section className="wk-section">
        <div className="wk-plans-hero">
          <span className="wk-label">Plans</span>
          <h2 className="wk-display wk-h1">Find it free. Get it back.</h2>
          <p className="wk-dim">
            Every track runs every check. Free shows you where money leaked; Growth and Flat show every finding and run the whole
            recovery with you.
          </p>
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-plans-grid">
          {PLANS.map((plan) => {
            const pitch = PLAN_PITCH[plan]
            const isCurrent = current === plan
            return (
              <article key={plan} className="wk-plans-card" data-highlight={plan === 'growth' || undefined} data-testid={`plans-${plan}`}>
                <div className="wk-plans-card-head">
                  <span className="wk-label">{PLAN_LABEL[plan]}</span>
                  {isCurrent ? (
                    <span className="wk-mark" data-tone="quiet">Current plan</span>
                  ) : plan === 'growth' ? (
                    <span className="wk-mark" data-tone="strong">Most popular</span>
                  ) : null}
                </div>
                <h3 className="wk-display wk-plans-tagline">{pitch.tagline}</h3>
                <div className="wk-plans-price">{pitch.price}</div>
                <p className="wk-dim wk-plans-summary">{pitch.summary}</p>
                <ul className="wk-plan-features">
                  {pitch.features.map((f) => (
                    <li key={f}>
                      <Check aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="wk-table-sub wk-plans-note">{pitch.note}</p>
                <button
                  type="button"
                  className="wk-btn wk-plans-cta"
                  data-variant={plan === 'growth' ? 'primary' : 'outline'}
                  disabled={isCurrent && plan !== 'free'}
                  onClick={() => continueWith(plan)}
                >
                  {isCurrent ? (plan === 'free' ? 'You’re on Free' : `You’re on ${PLAN_LABEL[plan]}`) : `Continue with ${PLAN_LABEL[plan]}`}
                  {!isCurrent ? <ArrowRight aria-hidden="true" /> : null}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Compare the tracks</h2>
          <p>Growth and Flat include the same features. The difference is how you pay.</p>
        </div>
        <div className="wk-table-wrap">
          <table className="wk-table wk-plans-compare">
            <thead>
              <tr>
                <th>Feature</th>
                {PLANS.map((plan) => (
                  <th key={plan}>{PLAN_LABEL[plan]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} style={{ cursor: 'default' }}>
                  <td>{row.label}</td>
                  {PLANS.map((plan) => {
                    const value = row.plans[plan]
                    return (
                      <td key={plan}>
                        {value === true ? <Check aria-label="Included" className="wk-plans-yes" /> : value === false ? <Minus aria-label="Not included" className="wk-plans-no" /> : value}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="wk-table-sub" style={{ marginTop: 10 }}>
          Paid plans renew monthly and can be cancelled any time. Growth’s 15% applies only to money recorded as actually returned.
        </p>
      </section>

      <DialogPrimitive.Root open={freeConfirmed} onOpenChange={setFreeConfirmed}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="wk wk-overlay" />
          <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(520px, calc(100vw - 32px))' }} data-testid="free-confirmed">
            <header className="wk-panel-head">
              <div>
                <BadgeCheck aria-hidden="true" className="wk-plans-badge" />
                <DialogPrimitive.Title className="wk-display wk-h2">You’re all set on Free</DialogPrimitive.Title>
                <DialogPrimitive.Description className="wk-dim">
                  No card, no trial clock. Upload as many ledgers as you like and Reclaim will run every check on each one.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <div style={{ padding: '0 24px' }}>
              <span className="wk-label">What’s included</span>
              <ul className="wk-plan-features">
                {PLAN_PITCH.free.features.map((f) => (
                  <li key={f}>
                    <Check aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="wk-table-sub" style={{ marginTop: 12 }}>{PLAN_PITCH.free.note}</p>
            </div>
            <div className="wk-panel-foot">
              <button type="button" className="wk-btn" data-variant="ghost" onClick={() => setFreeConfirmed(false)}>
                Compare paid plans
              </button>
              <button
                type="button"
                className="wk-btn"
                data-variant="primary"
                onClick={() => {
                  setFreeConfirmed(false)
                  onStartAudit()
                }}
              >
                Upload a ledger
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
