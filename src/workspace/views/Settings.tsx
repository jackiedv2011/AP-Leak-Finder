import { overviewSummary } from '@/ledger/views'
import type { LedgerEnvironment } from '@/ledger/store'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { TERMS_VERSION } from '@/legal/terms'
import { Facts } from './Reports'
import { CustomizeControls } from '../Customize'
import { PlanBilling } from '@/components/plan/PlanBilling'
import { QuickBooksSettings } from '@/components/audit/QuickBooksSource'
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
  const recovered = ladder(env).recovered

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

      <section className="wk-section" aria-labelledby="settings-appearance">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2" id="settings-appearance">Appearance and layout</h2>
          <p>Saved in this browser</p>
        </div>
        <div className="wk-card wk-settings-prefs">
          <CustomizeControls />
        </div>
      </section>

      <PlanBilling recovered={recovered} />

      <QuickBooksSettings />

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
