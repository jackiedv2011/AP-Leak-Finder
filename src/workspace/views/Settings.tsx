import { overviewSummary } from '@/ledger/views'
import type { LedgerEnvironment } from '@/ledger/store'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { TERMS_VERSION } from '@/legal/terms'
import { Facts } from './Reports'
import { useState } from 'react'
import { UpgradeDialog } from '@/components/plan/UpgradeDialog'
import { PLANS, PLAN_LABEL, PLAN_PITCH, PLAN_SUCCESS_FEE, planOf, successFee } from '@/lib/plans'
import { formatCurrency } from '@/lib/format'
import { ladder } from '../selectors'
import type { ResolvedTheme, ThemeChoice } from '@/workspace/theme'

function when(ts: number | null): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ts))
}

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

interface SettingsViewProps {
  env: LedgerEnvironment
  onClear: () => void
  onShowTour?: () => void
  theme: ThemeChoice
  resolvedTheme: ResolvedTheme
  onThemeChange: (choice: ThemeChoice) => void
}

/** Account, appearance, legal, and the one destructive action — deliberately small. */
export function SettingsView({ env, onClear, onShowTour, theme, resolvedTheme, onThemeChange }: SettingsViewProps) {
  const s = overviewSummary(env)
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const plan = user && !user.isGuest ? planOf(user.plan) : 'free'
  const recovered = ladder(env).recovered
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
                {PLAN_LABEL[plan]} · {PLAN_PITCH[plan].price}
              </p>
              <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>{PLAN_PITCH[plan].summary}</p>
              <p className="wk-table-sub" style={{ marginTop: 8 }}>{PLAN_PITCH[plan].note}</p>
              {PLAN_SUCCESS_FEE[plan] > 0 ? (
                <p style={{ marginTop: 10, fontSize: 13.5 }} data-testid="success-fee">
                  Success fee on this audit so far: <span className="wk-num">{formatCurrency(successFee(plan, recovered))}</span>{' '}
                  <span className="wk-dim">({PLAN_SUCCESS_FEE[plan] * 100}% of {formatCurrency(recovered)} recorded as returned)</span>
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
              <button type="button" className="wk-btn" data-variant={plan === 'free' ? 'primary' : 'outline'} onClick={() => setUpgradeOpen(true)}>
                {plan === 'free' ? 'See Growth and Flat' : 'Compare plans'}
              </button>
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
          <p className="wk-dim" style={{ marginTop: 14, fontSize: 12.5 }}>
            Payments aren&apos;t open yet — paid plans are coming soon, and nothing is charged today.
          </p>
        </div>
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      </section>

      <section className="wk-section">
        <h2 className="wk-display wk-h2">Appearance</h2>
        <div className="wk-card">
          <div className="wk-seg" data-active={THEME_OPTIONS.findIndex((option) => option.value === theme)} role="radiogroup" aria-label="Appearance">
            <span className="wk-seg-thumb" aria-hidden="true" />
            {THEME_OPTIONS.map((option) => (
              <label key={option.value} className="wk-seg-option">
                <input type="radio" name="reclaim-appearance" value={option.value} checked={theme === option.value} onChange={() => onThemeChange(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <p className="wk-dim" style={{ marginTop: 14, fontSize: 13 }}>
            {theme === 'system' ? `Following your device, which is set to ${resolvedTheme}.` : `Pinned to ${theme}, whatever your device is set to.`}
          </p>
        </div>
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
