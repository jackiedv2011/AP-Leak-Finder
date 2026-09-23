import { formatCurrency, plural } from '@/lib/format'
import { DECISION_LABEL } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, opportunities, type Opportunity } from '../selectors'
import { lockedSummary } from '../planGates'
import { Locked } from '@/components/plan/Locked'
import { Strength } from './Strength'
import { recoveryStatusLabel } from '@/recovery/model'

interface FindingsProps {
  env: LedgerEnvironment
  /** Finding ids the plan shows in full; the rest are rendered locked. */
  visible: Set<string>
  onOpenCase: (findingId: string) => void
}

/**
 * Every finding the checks surfaced, ordered by what is worth chasing first —
 * value weighed against how well the records support it.
 */
export function Findings({ env, visible, onOpenCase }: FindingsProps) {
  const all = opportunities(env)
  const rows = all.filter((o) => visible.has(o.finding.id))
  const lockedRows = all.filter((o) => !visible.has(o.finding.id))
  const locked = lockedSummary(all.map((o) => o.finding), visible)
  const l = ladder(env)

  if (all.length === 0) {
    return (
      <div className="wk-empty">
        <span className="wk-label">Nothing open</span>
        <p>Every check ran and found nothing worth your time.</p>
      </div>
    )
  }

  const decided = rows.filter((o) => o.state.decision !== null).length

  const table = (list: Opportunity[], interactive: boolean) => (
    <div className="wk-table-wrap">
      <table className="wk-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Finding</th>
            <th>Evidence</th>
            <th>Status</th>
            <th className="wk-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.finding.id} onClick={interactive ? () => onOpenCase(o.finding.id) : undefined}>
              <td>
                {interactive ? <button type="button" className="wk-table-action wk-table-vendor" onClick={(event) => { event.stopPropagation(); onOpenCase(o.finding.id) }} aria-label={`Open ${o.finding.vendor} finding`}>{o.finding.vendor}</button> : <div className="wk-table-vendor">{o.finding.vendor}</div>}
                <div className="wk-table-sub">
                  {o.finding.relatedRecords.length} {plural(o.finding.relatedRecords.length, 'record')}
                </div>
              </td>
              <td>
                <div>{o.typeLabel}</div>
                <div className="wk-table-sub">{o.finding.title}</div>
              </td>
              <td>
                <Strength level={o.evidence} />
              </td>
              <td>
                {o.state.decision ? (
                  <span className="wk-mark" data-tone={o.state.recoveryStage === 'recovered' && o.finding.class === 'recoverable' && (o.state.recoveredAmount ?? 0) > 0 ? 'strong' : o.state.decision === 'expected' || o.state.recoveryStage === 'not_recovered' ? 'quiet' : 'info'}>
                    {o.state.recoveryStage ? recoveryStatusLabel(o.state, o.finding.class !== 'recoverable') : DECISION_LABEL[o.state.decision]}
                  </span>
                ) : (
                  <span className="wk-dim" style={{ fontSize: 13 }}>
                    Not reviewed
                  </span>
                )}
              </td>
              <td className="wk-right wk-table-money">{formatCurrency(o.finding.dollarImpact)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <section className="wk-section">
        <div className="wk-pipeline">
          <div>
            <span className="wk-label">Open flagged value</span>
            <span className="wk-pipeline-figure wk-accent">{formatCurrency(l.potential)}</span>
            <span className="wk-ladder-note">
              {l.counts.potential} open {plural(l.counts.potential, 'finding')}
            </span>
          </div>
          <div>
            <span className="wk-label">Reviewed</span>
            <span className="wk-pipeline-figure">
              {decided} of {rows.length}
            </span>
            <span className="wk-ladder-note">Findings with a decision on them</span>
          </div>
          <div>
            <span className="wk-label">Waiting on you</span>
            <span className="wk-pipeline-figure">{formatCurrency(l.awaitingDecision)}</span>
            <span className="wk-ladder-note">Verified and still undecided</span>
          </div>
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">All findings</h2>
          <p>Ordered by what is worth chasing first — value weighed against how well the records support it.</p>
        </div>
        {rows.length > 0 ? table(rows, true) : null}
      </section>

      {lockedRows.length > 0 ? (
        <section className="wk-section">
          <div className="wk-section-head">
            <h2 className="wk-display wk-h2">
              {locked.count} more {plural(locked.count, 'finding')} · {formatCurrency(locked.value)}
            </h2>
            <p>The Free plan shows the lowest-value findings in full. These are the larger ones.</p>
          </div>
          <Locked
            title={`${locked.count} ${plural(locked.count, 'finding')} worth ${formatCurrency(locked.value)} are part of Pro`}
            note="Every finding, with its evidence, in every audit."
          >
            {table(lockedRows, false)}
          </Locked>
        </section>
      ) : null}
    </>
  )
}
