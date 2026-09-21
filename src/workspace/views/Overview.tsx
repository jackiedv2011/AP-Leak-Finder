import { ArrowRight } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { EVIDENCE_LABEL, ladder, opportunities, rootCauses, type Opportunity } from '../selectors'

interface OverviewProps {
  env: LedgerEnvironment
  onOpenCase: (findingId: string) => void
  onSeeAll: () => void
}

/** Evidence strength as three filled rules — §12, never a percentage. */
export function Strength({ level }: { level: Opportunity['evidence'] }) {
  return (
    <span className="wk-strength" data-level={level}>
      <span className="wk-strength-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{EVIDENCE_LABEL[level]}</span>
    </span>
  )
}

function Rung({
  label,
  value,
  note,
  terminal = false,
}: {
  label: string
  value: number
  note: string
  terminal?: boolean
}) {
  return (
    <div data-terminal={terminal || undefined}>
      <span className="wk-label">{label}</span>
      <div className="wk-ladder-figure">
        <span className="wk-display wk-figure">{formatCurrency(value)}</span>
      </div>
      <p className="wk-ladder-note">{note}</p>
    </div>
  )
}

export function Overview({ env, onOpenCase, onSeeAll }: OverviewProps) {
  const l = ladder(env)
  const causes = rootCauses(env)
  const top = opportunities(env).slice(0, 5)
  const biggestCause = causes[0]?.value ?? 1

  return (
    <>
      {/* §3 — the rungs sit side by side and are never added together. */}
      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Where the money stands</h2>
          <span className="wk-label">{l.counts.potential} cases</span>
        </div>
        <div className="wk-ladder">
          <Rung
            label="Potential"
            value={l.potential}
            note={`${l.counts.potential} ${plural(l.counts.potential, 'case')} the checks surfaced, before anyone judged them.`}
          />
          <Rung
            label="Verified"
            value={l.verified}
            note={`${l.counts.verified} where the records support a claim. Not yet agreed by any vendor.`}
          />
          <Rung
            label="In recovery"
            value={l.inRecovery}
            note={
              l.counts.inRecovery > 0
                ? `${l.counts.inRecovery} ${plural(l.counts.inRecovery, 'request is', 'requests are')} out with vendors.`
                : l.counts.recovered > 0
                  ? 'Nothing is out with a vendor right now.'
                  : 'Nothing has been sent yet.'
            }
          />
          <Rung
            label="Recovered"
            value={l.recovered}
            // The accent belongs to money that actually came back. Painting a
            // $0.00 green celebrates nothing and cheapens the one figure on
            // this screen worth trusting.
            terminal={l.recovered > 0}
            note={
              l.counts.recovered > 0
                ? `${l.counts.recovered} closed with money actually back.`
                : 'Money only counts here once it has actually settled.'
            }
          />
        </div>
      </section>

      {/* §28 — "what should I do", answered with one number and one door. */}
      <section className="wk-section">
        <div className="wk-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <span className="wk-label">Waiting on you</span>
            <p style={{ marginTop: 10, fontSize: 17, maxWidth: 620 }}>
              {l.awaitingDecision > 0 ? (
                <>
                  <b className="wk-num">{formatCurrency(l.awaitingDecision)}</b> is verified and undecided. Reclaim
                  won't contact a vendor until you approve it.
                </>
              ) : (
                <>Every verified case has a decision on it. Nothing is waiting.</>
              )}
            </p>
          </div>
          {top[0] ? (
            <button type="button" className="wk-btn" data-variant="primary" onClick={() => onOpenCase(top[0].finding.id)}>
              Review {top[0].finding.vendor}
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Worth the most, soonest</h2>
          <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onSeeAll}>
            All opportunities
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <table className="wk-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Opportunity</th>
              <th>Evidence</th>
              <th className="wk-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {top.map((o) => (
              <tr key={o.finding.id} onClick={() => onOpenCase(o.finding.id)}>
                <td>
                  <div className="wk-table-vendor">{o.finding.vendor}</div>
                  <div className="wk-table-sub">
                    {o.finding.relatedRecords.length} {o.finding.relatedRecords.length === 1 ? 'record' : 'records'}
                  </div>
                </td>
                <td>{o.typeLabel}</td>
                <td>
                  <Strength level={o.evidence} />
                </td>
                <td className="wk-right wk-table-money">{formatCurrency(o.finding.dollarImpact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* §25 — why the money left, not just that it did. */}
      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Why it happened</h2>
        </div>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 19 }}>
          {causes.map((cause) => (
            <li key={cause.type}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, marginBottom: 8 }}>
                <span style={{ fontSize: 15.5 }}>{cause.label}</span>
                <span className="wk-num wk-dim" style={{ fontSize: 14.5 }}>
                  {formatCurrency(cause.value)}
                </span>
              </div>
              <div className="wk-bar">
                <i style={{ width: `${Math.max(2, (cause.value / biggestCause) * 100)}%` }} />
              </div>
              <div className="wk-table-sub" style={{ marginTop: 6 }}>
                {cause.count} {cause.count === 1 ? 'case' : 'cases'}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
