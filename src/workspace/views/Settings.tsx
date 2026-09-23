import { overviewSummary } from '@/ledger/views'
import type { LedgerEnvironment } from '@/ledger/store'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { TERMS_VERSION } from '@/legal/terms'
import { Facts } from './Reports'
import { useState } from 'react'
import { UpgradeDialog } from '@/components/plan/UpgradeDialog'
import { PLAN_FEATURES, PLAN_LABEL, PLAN_PRICE_USD } from '@/lib/plans'

function when(ts: number | null): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ts))
}

/** Account, legal, and the one destructive action — deliberately small. */
export function SettingsView({ env, onClear, onShowTour }: { env: LedgerEnvironment; onClear: () => void; onShowTour?: () => void }) {
  const s = overviewSummary(env)
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const entitlements = auth?.entitlements ?? null
  const plan = user && !user.isGuest ? user.plan ?? 'free' : 'free'
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const devPlanSwitch = auth?.providers?.devMailbox && user && !user.isGuest

  return (
    <>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">Account</h2>
        {user && !user.isGuest ? (
          <Facts
            rows={[
              ['Name', user.name],
              ['Email', user.email],
              ['Company', user.company || '—'],
              ['Member since', when(user.createdAt)],
            ]}
          />
        ) : (
          <div className="wk-card">
            <p style={{ fontWeight: 500 }}>You're in a guest session.</p>
            <p className="wk-dim" style={{ marginTop: 4, fontSize: 13, maxWidth: 560 }}>
              Audits in a guest session are kept in this browser only. Create an account to keep them behind a log-in.
            </p>
            <a className="wk-btn" data-variant="primary" data-size="sm" style={{ marginTop: 16 }} href="/signup">
              Create an account
            </a>
          </div>
        )}
      </section>

      <section className="wk-section" data-testid="plan-panel">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Your plan</h2>
          <span className="wk-plan-pill">{PLAN_LABEL[plan]}</span>
        </div>
        <div className="wk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 560 }}>
              <p style={{ fontSize: 15, fontWeight: 500 }}>
                {PLAN_LABEL[plan]} · {PLAN_PRICE_USD[plan] === 0 ? '$0' : `$${PLAN_PRICE_USD[plan]}`} a month
              </p>
              <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>
                {plan === 'pro'
                  ? 'Unlimited audits, every finding, AI drafts, full letters, partial recoveries and the every-vendor report.'
                  : entitlements
                    ? `${entitlements.usage.auditsThisMonth} of ${entitlements.limits.auditsPerMonth} audits used this month. The ${entitlements.limits.findingsVisible} lowest-value findings per audit are shown in full.`
                    : 'The core checks, recovery tracking and basic reports.'}
              </p>
              {plan === 'free' ? (
                <ul className="wk-plan-features" style={{ marginTop: 12 }}>
                  {PLAN_FEATURES.pro.slice(1, 5).map((f) => (
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
              {plan === 'free' ? (
                <button type="button" className="wk-btn" data-variant="primary" onClick={() => setUpgradeOpen(true)}>
                  See Pro
                </button>
              ) : null}
              {devPlanSwitch ? (
                <button
                  type="button"
                  className="wk-btn"
                  data-variant="ghost"
                  data-size="sm"
                  onClick={() => void auth?.setDevPlan(plan === 'pro' ? 'free' : 'pro')}
                  title="Development only"
                >
                  Dev: switch to {plan === 'pro' ? 'Free' : 'Pro'}
                </button>
              ) : null}
            </div>
          </div>
          <p className="wk-dim" style={{ marginTop: 14, fontSize: 12.5 }}>
            Payments aren&apos;t open yet — upgrading is coming soon, and nothing is charged today.
          </p>
        </div>
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      </section>

      <section className="wk-section">
        <h2 className="wk-display wk-h2">Help</h2>
        <div className="wk-card-flat">
          <ul className="wk-list">
            <li>
              <div>
                <div style={{ fontWeight: 500 }}>Product tour</div>
                <div className="wk-table-sub">A two-minute walk through audits, findings, reviewing and recoveries.</div>
              </div>
              <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={onShowTour}>
                Show the tour
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section className="wk-section">
        <h2 className="wk-display wk-h2">Legal</h2>
        <div className="wk-card-flat">
          <ul className="wk-list">
            <li>
              <div>
                <div style={{ fontWeight: 500 }}>Terms of Service</div>
                <div className="wk-table-sub">
                  {user && user.termsAcceptedAt
                    ? `Accepted ${when(user.termsAcceptedAt)} · version ${user.termsVersion ?? TERMS_VERSION}`
                    : `Current version ${TERMS_VERSION}`}
                </div>
              </div>
              <a className="wk-link" href="/terms">
                Read
              </a>
            </li>
            <li>
              <div>
                <div style={{ fontWeight: 500 }}>Privacy Policy</div>
                <div className="wk-table-sub">How Reclaim handles account details and uploaded financial data.</div>
              </div>
              <a className="wk-link" href="/privacy">
                Read
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section className="wk-section">
        <h2 className="wk-display wk-h2">This audit's data</h2>
        <Facts
          rows={[
            ['Records held', String(s.recordCount)],
            ['Open findings', String(s.readyToVerifyCount + s.needsContextCount + s.worthNotingCount)],
            ['Stored', user && !user.isGuest ? 'Your account (server)' : 'This browser only'],
          ]}
        />
        <div className="wk-card">
          <p style={{ fontWeight: 500 }}>Delete this audit</p>
          <p className="wk-dim" style={{ marginTop: 4, fontSize: 13, maxWidth: 560 }}>
            {user && !user.isGuest
              ? 'Deleting it removes every record, finding, decision and recovery note in it from your account, on every device. It cannot be undone.'
              : "This ledger lives in your browser's local storage and has never left this device. Deleting it removes every record, finding and decision in it, and cannot be undone."}
          </p>
          <button type="button" className="wk-btn" data-variant="danger" data-size="sm" style={{ marginTop: 16 }} onClick={onClear}>
            Delete this audit
          </button>
        </div>
      </section>
    </>
  )
}
