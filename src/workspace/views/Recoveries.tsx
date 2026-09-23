import { ArrowRight } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import { RECOVERY_STAGE_LABEL, type RecoveryStage } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, recoveries, type Opportunity } from '../selectors'
import { useHeadlineMoney } from '../preferences'
import { CountUp } from './CountUp'

const STAGES: Array<{ stage: RecoveryStage; hint: string }> = [
  { stage: 'confirmed', hint: 'Confirmed. Send the request.' },
  { stage: 'requested', hint: 'Request sent. Record what comes back.' },
  { stage: 'recovered', hint: 'Money that actually came back.' },
  { stage: 'not_recovered', hint: 'Closed without money back.' },
]
const DAY = 86_400_000
const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function lastMove(o: Opportunity): number | null {
  const history = o.state.history ?? []
  return history.length ? history[history.length - 1].at : null
}

/** Confirmed findings as a board: one lane per stage, from request to money back. */
export function Recoveries({ env, onOpenCase, onOpenFindings }: { env: LedgerEnvironment; onOpenCase: (id: string) => void; onOpenFindings: () => void }) {
  const rows = recoveries(env)
  const l = ladder(env)
  const money = useHeadlineMoney()
  const now = Date.now()

  if (rows.length === 0) {
    return (
      <div className="wk-empty">
        <span className="wk-label">No recoveries yet</span>
        <p style={{ maxWidth: 560 }}>
          A finding moves here once you confirm it is real. Reclaim prepares the request; nothing goes to a vendor until you send it.
        </p>
        <button type="button" className="wk-btn" data-variant="primary" onClick={onOpenFindings}>
          Review findings <ArrowRight aria-hidden="true" />
        </button>
      </div>
    )
  }

  const amountOf = (o: Opportunity) => (o.state.recoveryStage === 'recovered' ? o.state.recoveredAmount ?? o.finding.dollarImpact : o.finding.dollarImpact)
  const readyValue = rows.filter((o) => o.state.recoveryStage === 'confirmed').reduce((s, o) => s + o.finding.dollarImpact, 0)
  const readyCount = rows.filter((o) => o.state.recoveryStage === 'confirmed').length

  return (
    <>
      <section className="wk-totals" aria-label="Recovery totals" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="wk-total" data-total="ready-to-send" data-amount={readyValue}>
          <span className="wk-label">Ready to send</span>
          <strong className="wk-total-value"><CountUp value={readyValue} format={money} /></strong>
          <span className="wk-total-note">{readyCount} confirmed, request not sent</span>
        </div>
        <div className="wk-total" data-total="inRecovery" data-amount={l.inRecovery} data-empty={l.inRecovery === 0 || undefined}>
          <span className="wk-label">In recovery</span>
          <strong className="wk-total-value"><CountUp value={l.inRecovery} format={money} /></strong>
          <span className="wk-total-note">{l.counts.inRecovery} {plural(l.counts.inRecovery, 'request')} out with vendors</span>
        </div>
        <div className="wk-total" data-total="recovered" data-amount={l.recovered} data-empty={l.recovered === 0 || undefined} data-accent={l.recovered > 0 || undefined}>
          <span className="wk-label">Recovered</span>
          <strong className="wk-total-value" style={l.recovered > 0 ? { color: 'var(--accent-ink)' } : undefined}><CountUp value={l.recovered} format={money} /></strong>
          <span className="wk-total-note">{l.counts.recovered} {plural(l.counts.recovered, 'case')} settled</span>
        </div>
      </section>

      <div className="wk-board">
        {STAGES.map(({ stage, hint }) => {
          const inStage = rows.filter((o) => o.state.recoveryStage === stage)
          const total = inStage.reduce((sum, o) => sum + amountOf(o), 0)
          return (
            <section className="wk-lane" key={stage} data-stage={stage} data-has-money={total > 0 || undefined} aria-labelledby={`lane-${stage}`}>
              <div className="wk-lane-head">
                <h2 id={`lane-${stage}`} style={{ font: '600 13px var(--f-text)' }}>{RECOVERY_STAGE_LABEL[stage]}</h2>
                <span>{inStage.length}</span>
              </div>
              <div className="wk-lane-total" data-amount={total}>{money(total)}</div>
              {inStage.length ? inStage.map((o) => {
                const moved = lastMove(o)
                const days = moved ? Math.floor((now - moved) / DAY) : null
                return (
                  <button type="button" className="wk-ticket" key={o.finding.id} onClick={() => onOpenCase(o.finding.id)}>
                    <strong>{o.finding.vendor}</strong>
                    <span>{o.typeLabel}</span>
                    <span>
                      <em style={{ fontStyle: 'normal' }}>{moved ? (stage === 'requested' ? days === 0 ? 'Sent today' : `Sent ${short.format(moved)} · ${days}d waiting` : short.format(moved)) : ''}</em>
                      <b className="wk-ticket-money">{formatCurrency(amountOf(o))}</b>
                    </span>
                  </button>
                )
              }) : <p className="wk-lane-empty">{hint}</p>}
            </section>
          )
        })}
      </div>
    </>
  )
}
