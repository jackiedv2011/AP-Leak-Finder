import { Check, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import type { Plan } from '@/billing/entitlement'
import type { LockedSummary } from '@/billing/entitlement'
import { FREE_PREVIEW_COUNT, PERFORMANCE_FEE_RATE, SUBSCRIPTION_PRICE_MONTHLY, recoveryEconomics } from '@/billing/entitlement'
import { formatCurrency } from '@/lib/format'

interface SettingsViewProps {
  plan: Plan
  locked: LockedSummary
  recordCount: number
  vendorCount: number
  importCount: number
  sourceLabel: string | null
  /** Money the business has confirmed actually landed, across every claim. */
  recoveredValue: number
  onUpgrade: () => void
  onDowngrade: () => void
  onClearLedger: () => void
  onOpenImport: () => void
}

/**
 * Settings — plan state, ledger state, and the data controls.
 *
 * The plan row is deliberately explicit: a subscription that only ever appears
 * as a paywall banner is impossible to check or undo, which is exactly how a
 * stale "pro" flag can silently hide the free-preview experience.
 */
export function SettingsView({
  plan,
  locked,
  recordCount,
  vendorCount,
  importCount,
  sourceLabel,
  recoveredValue,
  onUpgrade,
  onDowngrade,
  onClearLedger,
  onOpenImport,
}: SettingsViewProps) {
  const economics = recoveryEconomics(0, recoveredValue)

  return (
    <div className="rc-view">
      <header className="rc-page-head">
        <div>
          <span className="rc-eyebrow">Settings</span>
          <h1>
            Your plan and <em>your data.</em>
          </h1>
          <p>Everything Reclaim knows about this ledger lives on this device.</p>
        </div>
      </header>

      <section className="rc-settings-block">
        <div className="rc-settings-block-head">
          <h2>Plan</h2>
          <span className="rc-chip" data-tone={plan === 'pro' ? 'free' : 'locked'}>
            {plan === 'pro' ? 'Full access' : 'Free preview'}
          </span>
        </div>

        {plan === 'pro' ? (
          <>
            <p className="rc-settings-copy">
              Every finding in every ledger is unlocked, with full evidence and recovery requests.
            </p>
            <ul className="rc-settings-list">
              <li>
                <Check aria-hidden="true" /> All findings unlocked
              </li>
              <li>
                <Check aria-hidden="true" /> Unlimited imports and re-checks
              </li>
              <li>
                <Check aria-hidden="true" /> Recovery requests and outcome tracking
              </li>
            </ul>

            <div className="rc-settings-facts" style={{ marginTop: '1rem' }}>
              <div>
                <dt>Subscription</dt>
                <dd>${SUBSCRIPTION_PRICE_MONTHLY}/mo</dd>
              </div>
              <div>
                <dt>You've recovered</dt>
                <dd>{formatCurrency(economics.recovered)}</dd>
              </div>
              <div>
                <dt>Recovery fee ({Math.round(economics.feeRate * 100)}%)</dt>
                <dd>{formatCurrency(economics.fee)}</dd>
              </div>
              <div>
                <dt>You kept</dt>
                <dd>{formatCurrency(economics.net)}</dd>
              </div>
            </div>
            <div className="rc-settings-actions">
              <button type="button" className="rc-btn" data-variant="outline" onClick={onDowngrade}>
                <RotateCcw aria-hidden="true" />
                Return to free preview
              </button>
            </div>
            <p className="rc-settings-fine">
              Returning to the free preview re-hides everything except the {FREE_PREVIEW_COUNT} smallest findings. It
              does not cancel anything with a payment provider — this prototype stores the plan on this device only.
            </p>
          </>
        ) : (
          <>
            <p className="rc-settings-copy">
              You can open the {locked.unlockedCount} smallest findings in this ledger. {locked.lockedCount} more,
              worth <strong>{formatCurrency(locked.lockedValue)}</strong>, are hidden.
            </p>
            <div className="rc-settings-actions">
              <button type="button" className="rc-btn" data-variant="mint" onClick={onUpgrade}>
                <Sparkles aria-hidden="true" />
                Unlock everything
              </button>
            </div>
            <p className="rc-settings-fine">
              ${SUBSCRIPTION_PRICE_MONTHLY}/month, plus {Math.round(PERFORMANCE_FEE_RATE * 100)}% of money you actually
              recover — charged only after you confirm a refund or credit landed. Reclaim never holds your money, and
              nothing recovered means no fee. Cancel anytime. Card details are handled by Stripe, never by Reclaim.
            </p>
          </>
        )}
      </section>

      <section className="rc-settings-block">
        <div className="rc-settings-block-head">
          <h2>This ledger</h2>
        </div>
        <dl className="rc-settings-facts">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel ?? 'Not named'}</dd>
          </div>
          <div>
            <dt>Payments</dt>
            <dd>{recordCount}</dd>
          </div>
          <div>
            <dt>Vendors</dt>
            <dd>{vendorCount}</dd>
          </div>
          <div>
            <dt>Imports</dt>
            <dd>{importCount}</dd>
          </div>
        </dl>
        <div className="rc-settings-actions">
          <button type="button" className="rc-btn" data-variant="outline" onClick={onOpenImport}>
            Add more records
          </button>
        </div>
      </section>

      <section className="rc-settings-block" data-tone="danger">
        <div className="rc-settings-block-head">
          <h2>Delete this ledger</h2>
        </div>
        <p className="rc-settings-copy">
          Permanently removes every imported record and every decision on this device. This cannot be undone.
        </p>
        <div className="rc-settings-actions">
          <button type="button" className="rc-btn" data-variant="danger" onClick={onClearLedger}>
            <Trash2 aria-hidden="true" />
            Delete everything
          </button>
        </div>
      </section>
    </div>
  )
}
