import { formatCurrency } from '@/lib/format'
import { overviewSummary } from '@/ledger/views'
import { assessRecordReadiness } from '@/audit/dataReadiness'
import type { LedgerEnvironment } from '@/ledger/store'
import type { ResolvedTheme, ThemeChoice } from '../theme'
import { ladder, rootCauses } from '../selectors'

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="wk-card-flat">
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(186px, 1fr))', gap: 23, margin: 0 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="wk-label">{label}</dt>
            <dd className="wk-num" style={{ margin: '8px 0 0', fontSize: 17.5 }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** §27's Reports — what the ledger produced, stated plainly. */
export function Reports({ env }: { env: LedgerEnvironment }) {
  const l = ladder(env)
  const causes = rootCauses(env)
  return (
    <>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">This ledger</h2>
        <Facts
          rows={[
            ['Cases surfaced', String(l.counts.potential)],
            ['Potential', formatCurrency(l.potential)],
            ['Verified', formatCurrency(l.verified)],
            ['Recovered', formatCurrency(l.recovered)],
          ]}
        />
      </section>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">By check</h2>
        <table className="wk-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Cases</th>
              <th className="wk-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {causes.map((c) => (
              <tr key={c.type} style={{ cursor: 'default' }}>
                <td>{c.label}</td>
                <td className="wk-num">{c.count}</td>
                <td className="wk-right wk-table-money">{formatCurrency(c.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

/** §27's Data — what was read, and what that made possible. */
export function DataView({ env, onImport }: { env: LedgerEnvironment; onImport: () => void }) {
  const s = overviewSummary(env)
  // Coverage is a property of the columns the ledger actually holds, so it is
  // recomputed from the standing records rather than carried over from the
  // import that happened to introduce them.
  const readiness = assessRecordReadiness(
    env.records,
    s.skippedCount,
    env.imports.flatMap((batch) => batch.detectedColumns ?? [])
  )
  return (
    <>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">What Reclaim read</h2>
        <Facts
          rows={[
            ['Payment records', String(s.recordCount)],
            ['Vendors', String(s.vendorCount)],
            ['Date range', s.dateRangeLabel ?? '—'],
            ['Rows skipped', String(s.skippedCount)],
          ]}
        />
      </section>
      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Coverage</h2>
          <span className="wk-mark" data-tone={readiness.availableCheckCount === 7 ? 'strong' : 'quiet'}>
            {readiness.availableCheckCount} of {readiness.totalCheckCount} checks
          </span>
        </div>
        {readiness.weakerChecks.length === 0 ? (
          <div className="wk-card-flat">
            <p className="wk-dim" style={{ fontSize: 14, maxWidth: 618 }}>
              These records carry every column all seven checks need. Nothing was skipped for want of data.
            </p>
          </div>
        ) : (
          <ul className="wk-notes">
            {readiness.weakerChecks.map((check) => (
              <li key={check.label}>{check.label}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">Sources</h2>
        <div className="wk-card">
          <span className="wk-label">{s.lastImportLabel ?? 'No source'}</span>
          <p className="wk-dim" style={{ marginTop: 9, fontSize: 14, maxWidth: 549 }}>
            Everything on every screen traces back to these rows. Reclaim reads them and nothing else — it has no
            connection to your accounting system and cannot change your books.
          </p>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" style={{ marginTop: 17 }} onClick={onImport}>
            Add another file
          </button>
        </div>
      </section>
    </>
  )
}

/* Light, System, Dark — in that order, so the track reads from lightest to
   darkest and the thumb's position means something at a glance. */
const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

interface SettingsViewProps {
  env: LedgerEnvironment
  onClear: () => void
  theme: ThemeChoice
  resolvedTheme: ResolvedTheme
  onThemeChange: (choice: ThemeChoice) => void
}

/** §27's Settings — deliberately small. */
export function SettingsView({ env, onClear, theme, resolvedTheme, onThemeChange }: SettingsViewProps) {
  const s = overviewSummary(env)
  return (
    <>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">Appearance</h2>
        <div className="wk-card">
          <div
            className="wk-seg"
            data-active={THEME_OPTIONS.findIndex((option) => option.value === theme)}
            role="radiogroup"
            aria-label="Appearance"
          >
            <span className="wk-seg-thumb" aria-hidden="true" />
            {THEME_OPTIONS.map((option) => (
              <label key={option.value} className="wk-seg-option">
                <input
                  type="radio"
                  name="reclaim-appearance"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => onThemeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <p className="wk-dim" style={{ marginTop: 14, fontSize: 13 }}>
            {theme === 'system'
              ? `Following your device, which is set to ${resolvedTheme}.`
              : `Pinned to ${theme}, whatever your device is set to.`}
          </p>
        </div>
      </section>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">This workspace</h2>
        <Facts
          rows={[
            ['Records held', String(s.recordCount)],
            ['Open cases', String(s.readyToVerifyCount + s.needsContextCount + s.worthNotingCount)],
            ['Stored', 'This browser only'],
          ]}
        />
      </section>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">Your data</h2>
        <div className="wk-card">
          <p className="wk-dim" style={{ fontSize: 14, maxWidth: 549 }}>
            This ledger lives in your browser's local storage and has never left this device. Clearing it removes
            every record, case and decision, and cannot be undone.
          </p>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" style={{ marginTop: 17 }} onClick={onClear}>
            Clear this ledger
          </button>
        </div>
      </section>
    </>
  )
}
