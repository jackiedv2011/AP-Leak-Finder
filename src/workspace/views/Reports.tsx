import { formatCurrency, plural } from '@/lib/format'
import { overviewSummary } from '@/ledger/views'
import type { LedgerEnvironment } from '@/ledger/store'
import { EVIDENCE_LABEL, ladder, rootCauses, vendors } from '../selectors'
import { Locked } from '@/components/plan/Locked'
import { useEntitlements } from '@/lib/auth/AuthContext'

export function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="wk-card-flat">
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 22 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="wk-label">{label}</dt>
            <dd className="wk-num" style={{ margin: '7px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** What this audit produced: the totals, the breakdown by check, and every vendor checked. */
export function Reports({ env }: { env: LedgerEnvironment }) {
  const l = ladder(env)
  const entitlements = useEntitlements()
  const s = overviewSummary(env)
  const causes = rootCauses(env)
  const rows = vendors(env)
  const clean = rows.filter((v) => v.caseCount === 0).length

  return (
    <>
      <section className="wk-section">
        <h2 className="wk-display wk-h2">This audit</h2>
        <Facts
          rows={[
            ['Payment records', String(s.recordCount)],
            ['Vendors', String(s.vendorCount)],
            ['Findings', String(l.counts.potential)],
            ['Open flagged value', formatCurrency(l.potential)],
            ['Verified', formatCurrency(l.verified)],
            ['Recovered', formatCurrency(l.recovered)],
          ]}
        />
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">By check</h2>
          <p>Which checks caught the money, and how much.</p>
        </div>
        {causes.length === 0 ? (
          <div className="wk-empty">
            <span className="wk-label">Nothing flagged</span>
            <p>No check produced a finding for this ledger.</p>
          </div>
        ) : (
          <div className="wk-table-wrap">
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Findings</th>
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
          </div>
        )}
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Every vendor checked</h2>
          <p>
            {rows.length === 0
              ? 'No payment records in this ledger.'
              : clean === 0
                ? `${rows.length} vendors, all with something to look at`
                : `${clean} of ${rows.length} came back clean`}
          </p>
        </div>
        {rows.length > 0 && !entitlements.limits.advancedReports ? (
          <Locked title="The every-vendor report is part of Pro" note="Findings, strongest evidence, potential and recovered — per vendor.">
            <div className="wk-table-wrap">
              <table className="wk-table">
                <tbody>
                  {rows.slice(0, 6).map((v) => (
                    <tr key={v.vendor} style={{ cursor: 'default' }}>
                      <td className="wk-table-vendor">{v.vendor}</td>
                      <td>{v.caseCount}</td>
                      <td className="wk-right wk-table-money">{formatCurrency(v.potential)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Locked>
        ) : rows.length > 0 ? (
          <div className="wk-table-wrap">
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Findings</th>
                  <th>Strongest evidence</th>
                  <th className="wk-right">Recovered</th>
                  <th className="wk-right">Flagged value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.vendor} style={{ cursor: 'default' }}>
                    <td>
                      <div className="wk-table-vendor">{v.vendor}</div>
                      <div className="wk-table-sub">
                        {v.recordCount} {plural(v.recordCount, 'payment')} in this ledger
                      </div>
                    </td>
                    <td className="wk-num">{v.caseCount === 0 ? '—' : v.caseCount}</td>
                    <td>
                      {v.strongest === null ? (
                        <span className="wk-dim" style={{ fontSize: 13 }}>
                          Nothing flagged
                        </span>
                      ) : (
                        <span
                          className="wk-mark"
                          data-tone={v.strongest === 'strong' ? 'strong' : v.strongest === 'review' ? 'review' : 'quiet'}
                        >
                          {EVIDENCE_LABEL[v.strongest]}
                        </span>
                      )}
                    </td>
                    <td className="wk-right wk-table-money" style={{ color: v.recovered > 0 ? 'var(--accent-ink)' : undefined }}>
                      {v.recovered > 0 ? formatCurrency(v.recovered) : '—'}
                    </td>
                    <td className="wk-right wk-table-money">{v.potential > 0 ? formatCurrency(v.potential) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}
