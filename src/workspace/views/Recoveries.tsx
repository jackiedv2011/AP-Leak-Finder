import { formatCurrency, plural } from '@/lib/format'
import { RECOVERY_STAGE_LABEL, type RecoveryStage } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, recoveries } from '../selectors'

const STAGE_ORDER: RecoveryStage[] = ['confirmed', 'requested', 'recovered', 'not_recovered']
const STAGE_TONE: Record<RecoveryStage, string> = {
  confirmed: 'info',
  requested: 'info',
  recovered: 'strong',
  not_recovered: 'quiet',
}

/** Cases that have graduated out of the findings list and into an actual recovery. */
export function Recoveries({ env, onOpenCase }: { env: LedgerEnvironment; onOpenCase: (id: string) => void }) {
  const rows = recoveries(env)
  const l = ladder(env)

  if (rows.length === 0) {
    return (
      <div className="wk-empty">
        <span className="wk-label">No recoveries yet</span>
        <p style={{ maxWidth: 520 }}>
          A finding lands here once you've confirmed it's real. Nothing goes to a vendor without that step.
        </p>
      </div>
    )
  }

  return (
    <>
      <section className="wk-section">
        <div className="wk-pipeline">
          <div>
            <span className="wk-label">Ready to send</span>
            <span className="wk-pipeline-figure">
              {formatCurrency(rows.filter((o) => o.state.recoveryStage === 'confirmed').reduce((s, o) => s + o.finding.dollarImpact, 0))}
            </span>
            <span className="wk-ladder-note">Confirmed, request not yet sent</span>
          </div>
          <div>
            <span className="wk-label">In recovery</span>
            <span className="wk-pipeline-figure">{formatCurrency(l.inRecovery)}</span>
            <span className="wk-ladder-note">
              {l.counts.inRecovery} {plural(l.counts.inRecovery, 'request')} out with vendors
            </span>
          </div>
          <div data-accent={l.recovered > 0 || undefined}>
            <span className="wk-label">Recovered</span>
            <span className="wk-pipeline-figure">{formatCurrency(l.recovered)}</span>
            <span className="wk-ladder-note">
              {l.counts.recovered} {plural(l.counts.recovered, 'case')} settled
            </span>
          </div>
        </div>
      </section>

      {STAGE_ORDER.map((stage) => {
        const inStage = rows.filter((o) => o.state.recoveryStage === stage)
        if (inStage.length === 0) return null
        const amountOf = (o: (typeof inStage)[number]) =>
          stage === 'recovered' ? o.state.recoveredAmount ?? o.finding.dollarImpact : o.finding.dollarImpact
        const total = inStage.reduce((sum, o) => sum + amountOf(o), 0)
        return (
          <section className="wk-section" key={stage}>
            <div className="wk-section-head">
              <h2 className="wk-display wk-h2">{RECOVERY_STAGE_LABEL[stage]}</h2>
              <span className="wk-mark" data-tone={STAGE_TONE[stage]}>
                {formatCurrency(total)}
              </span>
            </div>
            <div className="wk-table-wrap">
              <table className="wk-table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Finding</th>
                    <th className="wk-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {inStage.map((o) => (
                    <tr key={o.finding.id} onClick={() => onOpenCase(o.finding.id)}>
                      <td className="wk-table-vendor">{o.finding.vendor}</td>
                      <td>{o.typeLabel}</td>
                      <td className="wk-right wk-table-money">{formatCurrency(amountOf(o))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
  )
}
