import { formatCurrency, plural } from '@/lib/format'
import { DECISION_LABEL } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { opportunities } from '../selectors'
import { SCREEN_OBJECT } from '../objects'
import { ScreenHead, WorkObject } from '../WorkObject'
import { Strength } from './Overview'

interface OpportunitiesProps {
  env: LedgerEnvironment
  onOpenCase: (findingId: string) => void
}

/**
 * §13 — a prioritised list of money, not an alert feed. Ordering is by
 * `priorityOf`, so a clean mid-size claim outranks a large ambiguous one.
 */
export function Opportunities({ env, onOpenCase }: OpportunitiesProps) {
  const rows = opportunities(env)

  if (rows.length === 0) {
    return (
      <div className="wk-empty" data-object>
        <WorkObject name={SCREEN_OBJECT.opportunities} height={170} />
        <span className="wk-label">Nothing open</span>
        <p>Every check ran and found nothing worth your time.</p>
      </div>
    )
  }

  const decided = rows.filter((o) => o.state.decision !== null).length

  return (
    <>
      {/* The order is not by size, and a reader who assumes it is will think
          the table is broken. The screen's opening line says what it is
          sorted by, so the table itself only has to carry the count. */}
      <ScreenHead mode="opportunities" />
      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Every open case</h2>
          <span className="wk-label">
            {decided} of {rows.length} decided
          </span>
        </div>
        <table className="wk-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Opportunity</th>
              <th>Evidence</th>
              <th>Status</th>
              <th className="wk-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.finding.id} onClick={() => onOpenCase(o.finding.id)}>
                <td>
                  <div className="wk-table-vendor">{o.finding.vendor}</div>
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
                  {/* Undecided is the resting state of every case, so marking it
                      would paint the whole column a warning colour and say nothing.
                      Only an actual decision earns a mark. */}
                  {o.state.decision ? (
                    <span className="wk-mark" data-tone={o.state.decision === 'confirmed' ? 'strong' : 'quiet'}>
                      {DECISION_LABEL[o.state.decision]}
                    </span>
                  ) : (
                    <span className="wk-dim" style={{ fontSize: 13 }}>
                      —
                    </span>
                  )}
                </td>
                <td className="wk-right wk-table-money">{formatCurrency(o.finding.dollarImpact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
