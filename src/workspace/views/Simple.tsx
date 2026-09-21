import { formatCurrency } from '@/lib/format'
import { overviewSummary } from '@/ledger/views'
import { assessRecordReadiness } from '@/audit/dataReadiness'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, rootCauses } from '../selectors'

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="wk-card-flat">
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 26, margin: 0 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="wk-label">{label}</dt>
            <dd className="wk-num" style={{ margin: '9px 0 0', fontSize: 20 }}>
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
            <p className="wk-dim" style={{ fontSize: 15.5, maxWidth: 700 }}>
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
          <p className="wk-dim" style={{ marginTop: 10, fontSize: 15.5, maxWidth: 620 }}>
            Everything on every screen traces back to these rows. Reclaim reads them and nothing else — it has no
            connection to your accounting system and cannot change your books.
          </p>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" style={{ marginTop: 18 }} onClick={onImport}>
            Add another file
          </button>
        </div>
      </section>
    </>
  )
}

/** §27's Settings — deliberately small. */
export function SettingsView({ env, onClear }: { env: LedgerEnvironment; onClear: () => void }) {
  const s = overviewSummary(env)
  return (
    <>
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
          <p className="wk-dim" style={{ fontSize: 15.5, maxWidth: 620 }}>
            This ledger lives in your browser's local storage and has never left this device. Clearing it removes
            every record, case and decision, and cannot be undone.
          </p>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" style={{ marginTop: 18 }} onClick={onClear}>
            Clear this ledger
          </button>
        </div>
      </section>
    </>
  )
}
