import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { EVIDENCE_LABEL, vendors } from '../selectors'

/** §30 — what each vendor relationship has actually cost and returned. */
export function Vendors({ env }: { env: LedgerEnvironment }) {
  const rows = vendors(env)

  if (rows.length === 0) {
    return (
      <div className="wk-empty">
        <span className="wk-label">No vendors yet</span>
        <p>This ledger has no payment records in it.</p>
      </div>
    )
  }

  const clean = rows.filter((v) => v.caseCount === 0).length

  return (
    <section className="wk-section">
      <div className="wk-section-head">
        <h2 className="wk-display wk-h2">Every vendor checked</h2>
        <span className="wk-label">
          {clean === 0
            ? `${rows.length} vendors, all with something to look at`
            : `${clean} of ${rows.length} came back clean`}
        </span>
      </div>
      <table className="wk-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Cases</th>
            <th>Strongest evidence</th>
            <th className="wk-right">Recovered</th>
            <th className="wk-right">Potential</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.vendor}>
              <td>
                <div className="wk-table-vendor">{v.vendor}</div>
                <div className="wk-table-sub">
                  {v.recordCount} {plural(v.recordCount, 'payment')} in this ledger
                </div>
              </td>
              <td className="wk-num">{v.caseCount === 0 ? '—' : v.caseCount}</td>
              <td>
                {v.strongest === null ? (
                  <span className="wk-dim" style={{ fontSize: 14 }}>
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
              <td className="wk-right wk-table-money" style={{ color: v.recovered > 0 ? 'var(--accent)' : undefined }}>
                {v.recovered > 0 ? formatCurrency(v.recovered) : '—'}
              </td>
              <td className="wk-right wk-table-money">{v.potential > 0 ? formatCurrency(v.potential) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
