import { formatCurrency } from '@/lib/format'
import { RECOVERY_STAGE_LABEL, type RecoveryStage } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { recoveries } from '../selectors'

const STAGE_ORDER: RecoveryStage[] = ['confirmed', 'requested', 'recovered', 'not_recovered']
const STAGE_TONE: Record<RecoveryStage, string> = {
  confirmed: 'info',
  requested: 'info',
  recovered: 'strong',
  not_recovered: 'quiet',
}

/** Cases that have graduated out of the queue and into an actual recovery (§14). */
export function Recoveries({ env, onOpenCase }: { env: LedgerEnvironment; onOpenCase: (id: string) => void }) {
  const rows = recoveries(env)

  if (rows.length === 0) {
    return (
      <div className="wk-empty">
        <span className="wk-label">No recoveries yet</span>
        <p style={{ maxWidth: 550 }}>
          A case lands here once you've confirmed it's real. Nothing goes to a vendor without that step.
        </p>
      </div>
    )
  }

  return (
    <>
      {STAGE_ORDER.map((stage) => {
        const inStage = rows.filter((o) => o.state.recoveryStage === stage)
        if (inStage.length === 0) return null
        const total = inStage.reduce(
          (sum, o) => sum + (stage === 'recovered' ? o.state.recoveredAmount ?? o.finding.dollarImpact : o.finding.dollarImpact),
          0
        )
        return (
          <section className="wk-section" key={stage}>
            <div className="wk-section-head">
              <h2 className="wk-display wk-h2">{RECOVERY_STAGE_LABEL[stage]}</h2>
              <span className="wk-mark" data-tone={STAGE_TONE[stage]}>
                {formatCurrency(total)}
              </span>
            </div>
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Opportunity</th>
                  <th className="wk-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {inStage.map((o) => (
                  <tr key={o.finding.id} onClick={() => onOpenCase(o.finding.id)}>
                    <td className="wk-table-vendor">{o.finding.vendor}</td>
                    <td>{o.typeLabel}</td>
                    <td className="wk-right wk-table-money">
                      {formatCurrency(
                        stage === 'recovered' ? o.state.recoveredAmount ?? o.finding.dollarImpact : o.finding.dollarImpact
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </>
  )
}
