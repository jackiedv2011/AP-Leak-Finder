import { useCallback, useEffect, useState } from 'react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { PLANS, PLAN_LABEL, PLAN_PITCH, PLAN_SUCCESS_FEE, planOf, successFee, type Plan } from '@/lib/plans'
import { cancelPlan, changePlan, fetchBilling, resumePlan, type BillingResult, type BillingStatus, type PaidPlan } from '@/billing/api'
import { formatCurrency } from '@/lib/format'
import { UpgradeDialog } from './UpgradeDialog'

const day = (ms: number) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms))

/**
 * Settings → Your plan. Shows the plan the server says the account is on, the
 * next bill date (or the day paid access ends), and the actions that change
 * it. Every action re-reads the account afterwards, so findings, drafts,
 * letters and reports lock or unlock without a reload.
 */
export function PlanBilling({ recovered }: { recovered: number }) {
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const signedIn = Boolean(user && !user.isGuest)
  const plan: Plan = signedIn ? planOf(user!.plan) : 'free'
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [confirming, setConfirming] = useState<null | 'cancel' | PaidPlan>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const devPlanSwitch = auth?.providers?.devMailbox && signedIn
  const other: PaidPlan = plan === 'growth' ? 'flat' : 'growth'

  const load = useCallback(async () => {
    if (signedIn) setBilling(await fetchBilling())
  }, [signedIn])

  // Re-read whenever the plan moves (checkout, a webhook noticed on focus, the dev switch).
  useEffect(() => {
    void load()
  }, [load, plan])

  const run = async (action: () => Promise<BillingResult>) => {
    setBusy(true)
    setError(null)
    const result = await action()
    await auth?.refreshAccount()
    if (!result.ok) setError(result.message)
    else if ('billing' in result && result.billing) setBilling(result.billing)
    setBusy(false)
    setConfirming(null)
  }

  const subscribed = billing !== null && billing.plan !== 'free' && billing.currentPeriodEnd !== null
  const fee = PLAN_SUCCESS_FEE[plan] > 0

  return (
    <section className="wk-section" data-testid="plan-panel">
      <div className="wk-section-head">
        <h2 className="wk-display wk-h2">Your plan</h2>
        <span className="wk-plan-pill">{PLAN_LABEL[plan]}</span>
      </div>
      <div className="wk-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ fontSize: 15, fontWeight: 500 }}>
              {PLAN_LABEL[plan]} · {PLAN_PITCH[plan].price}
            </p>
            <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>{PLAN_PITCH[plan].summary}</p>
            <p className="wk-table-sub" style={{ marginTop: 8 }}>{PLAN_PITCH[plan].note}</p>

            {subscribed ? (
              <p style={{ marginTop: 10, fontSize: 13.5 }} data-testid="plan-renewal">
                {billing.cancelAtPeriodEnd
                  ? `Cancelled. ${PLAN_LABEL[plan]} stays on until ${day(billing.currentPeriodEnd!)}, then your account moves to Free.`
                  : `Next bill: ${day(billing.currentPeriodEnd!)}${fee ? ', plus any success fees' : ''}.`}
              </p>
            ) : null}
            {billing?.status === 'past_due' ? (
              <p className="wk-alert" role="alert" style={{ marginTop: 10, fontSize: 13.5 }} data-testid="plan-past-due">
                Your last payment didn’t go through. Stripe will try the card again over the next few days, and {PLAN_LABEL[plan]} stays on meanwhile.
              </p>
            ) : null}

            {fee ? (
              <p style={{ marginTop: 10, fontSize: 13.5 }} data-testid="success-fee">
                Success fee on this audit so far: <span className="wk-num">{formatCurrency(successFee(plan, recovered))}</span>{' '}
                <span className="wk-dim">({PLAN_SUCCESS_FEE[plan] * 100}% of {formatCurrency(recovered)} recorded as returned)</span>
                {billing && billing.successFees.monthCents > 0 ? (
                  <>
                    <br />
                    Success fees recorded this month, all audits: <span className="wk-num">{formatCurrency(billing.successFees.monthCents / 100)}</span>
                  </>
                ) : null}
              </p>
            ) : null}

            {plan === 'free' ? (
              <ul className="wk-plan-features" style={{ marginTop: 12 }}>
                {PLAN_PITCH.growth.features.slice(0, 4).map((f) => (
                  <li key={f}>
                    <span aria-hidden="true" style={{ color: 'var(--accent-ink)' }}>
                      +
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            {plan === 'free' || !subscribed ? (
              <button type="button" className="wk-btn" data-variant={plan === 'free' ? 'primary' : 'outline'} onClick={() => setUpgradeOpen(true)}>
                {plan === 'free' ? 'See Growth and Flat' : 'Compare plans'}
              </button>
            ) : billing.cancelAtPeriodEnd ? (
              <button type="button" className="wk-btn" data-variant="primary" disabled={busy} onClick={() => void run(resumePlan)}>
                Keep {PLAN_LABEL[plan]}
              </button>
            ) : (
              <>
                <button type="button" className="wk-btn" data-variant="outline" disabled={busy} onClick={() => setConfirming(other)}>
                  Change plan
                </button>
                <button type="button" className="wk-btn" data-variant="ghost" disabled={busy} onClick={() => setConfirming('cancel')}>
                  Cancel plan
                </button>
              </>
            )}
            {devPlanSwitch ? (
              <button
                type="button"
                className="wk-btn"
                data-variant="ghost"
                data-size="sm"
                onClick={() => void auth?.setDevPlan(PLANS[(PLANS.indexOf(plan) + 1) % PLANS.length])}
                title="Development only"
              >
                Dev: switch to {PLAN_LABEL[PLANS[(PLANS.indexOf(plan) + 1) % PLANS.length]]}
              </button>
            ) : null}
          </div>
        </div>

        {confirming && subscribed ? (
          <div className="wk-card-flat" style={{ marginTop: 14 }} data-testid="plan-confirm">
            {confirming === 'cancel' ? (
              <p style={{ fontSize: 13.5 }}>
                Cancel {PLAN_LABEL[plan]}? You keep every paid feature until {day(billing.currentPeriodEnd!)}, and you won’t be billed again
                {fee ? ' (success fees on money recorded as returned before then are still billed)' : ''}. After that the account is on Free; your audits stay.
              </p>
            ) : (
              <p style={{ fontSize: 13.5 }}>
                Switch to {PLAN_LABEL[confirming]} · {PLAN_PITCH[confirming].price}? The change starts now. You’re charged (or credited) the prorated difference for the rest of
                this period{confirming === 'flat' ? ', and no success fee applies to money recorded from now on' : ', and 10% applies to money recorded as returned from now on'}.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="wk-btn"
                data-variant={confirming === 'cancel' ? 'danger' : 'primary'}
                data-size="sm"
                disabled={busy}
                onClick={() => void run(confirming === 'cancel' ? cancelPlan : () => changePlan(confirming))}
              >
                {busy ? 'Working…' : confirming === 'cancel' ? `Cancel ${PLAN_LABEL[plan]}` : `Switch to ${PLAN_LABEL[confirming]}`}
              </button>
              <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" disabled={busy} onClick={() => setConfirming(null)}>
                Never mind
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="wk-alert" role="alert" style={{ marginTop: 14 }} data-testid="plan-error">
            <p>{error}</p>
          </div>
        ) : null}

        {billing && !billing.configured ? (
          <p className="wk-dim" style={{ marginTop: 14, fontSize: 12.5 }}>
            Paid plans open with supervised pilots. Payments aren’t switched on for this server, and nothing is charged.
          </p>
        ) : null}
      </div>
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </section>
  )
}
