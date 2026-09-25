import { ArrowRight, CalendarClock } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { RecoveryStage } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { recoveryNextAction, recoveryStatusLabel, requiresCustomerAction } from '@/recovery/model'
import { ladder, recoveries, vendorCommitments, type Opportunity } from '../selectors'
import { useHeadlineMoney } from '../preferences'
import { CountUp } from './CountUp'

const LANES: Array<{ stage: RecoveryStage; title: string; hint: string }> = [
  { stage: 'confirmed', title: 'Prepared', hint: 'Confirmed findings waiting for approval or to be sent.' },
  { stage: 'requested', title: 'With the vendor', hint: 'Requests you have sent. Log replies and money back.' },
  { stage: 'recovered', title: 'Money back', hint: 'Money that actually came back, until it is reconciled.' },
  { stage: 'not_recovered', title: 'Closed', hint: 'Closed without money back.' },
]
const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** What a case is worth right now: the open balance while it is out, what came back once it is done. */
function caseValue(o: Opportunity): { amount: number; label: string } {
  const { state, finding } = o
  if (state.recoveryStage === 'recovered') return { amount: state.recoveredAmount ?? 0, label: (state.recoveredAmount ?? 0) > 0 ? 'returned' : 'amount missing' }
  if (state.recoveryStage === 'requested') return { amount: Math.max(0, (state.requestedAmount ?? finding.dollarImpact) - (state.recoveredAmount ?? 0)), label: 'outstanding' }
  if (state.recoveryStage === 'not_recovered') return { amount: state.requestedAmount ?? finding.dollarImpact, label: 'unreturned' }
  return { amount: finding.dollarImpact, label: 'to request' }
}

function dueText(dueAt: number | null | undefined, now: number): string | null {
  if (!dueAt) return null
  const days = Math.round((new Date(dueAt).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days < 0) return `${-days}d overdue`
  if (days === 0) return 'Due today'
  return `Due ${short.format(dueAt)}`
}

/** Vendor recovery cases: what needs you, then every case by where it has got to. */
export function Recoveries({ env, onOpenCase, onOpenFindings }: { env: LedgerEnvironment; onOpenCase: (id: string) => void; onOpenFindings: () => void }) {
  const rows = recoveries(env)
  const l = ladder(env)
  const commitments = vendorCommitments(env)
  const money = useHeadlineMoney()
  const now = Date.now()

  if (rows.length === 0) {
    return (
      <div className="wk-empty">
        <span className="wk-label">No recoveries yet</span>
        <p style={{ maxWidth: 560 }}>
          A money-back finding moves here once you confirm it is real. Reclaim prepares the request; nothing goes to a vendor until you approve and send it.
          Risk and prevention findings are reviewed inside your business and stay in Findings.
        </p>
        <button type="button" className="wk-btn" data-variant="primary" onClick={onOpenFindings}>
          Review findings <ArrowRight aria-hidden="true" />
        </button>
      </div>
    )
  }

  const needsAction = rows
    .filter(({ state, finding }) => requiresCustomerAction(state, now, finding.class !== 'recoverable'))
    .sort((a, b) => (recoveryNextAction(a.state, now).dueAt ?? Infinity) - (recoveryNextAction(b.state, now).dueAt ?? Infinity) || b.finding.dollarImpact - a.finding.dollarImpact)

  return (
    <>
      <section className="wk-totals" aria-label="Recovery totals">
        <div className="wk-total" data-total="inRecovery" data-amount={l.inRecovery} data-empty={l.inRecovery === 0 || undefined}>
          <span className="wk-label">In recovery</span>
          <strong className="wk-total-value"><CountUp value={l.inRecovery} format={money} /></strong>
          <span className="wk-total-note">{l.counts.inRecovery} {plural(l.counts.inRecovery, 'request')} out with vendors</span>
        </div>
        <div className="wk-total" data-total="agreed" data-amount={commitments.confirmed} data-empty={commitments.confirmed === 0 || undefined}>
          <span className="wk-label">Vendor agreed</span>
          <strong className="wk-total-value"><CountUp value={commitments.confirmed} format={money} /></strong>
          <span className="wk-total-note">{commitments.confirmedCases} {plural(commitments.confirmedCases, 'agreement')} you recorded</span>
        </div>
        <div className="wk-total" data-total="pending" data-amount={commitments.pendingReturn} data-empty={commitments.pendingReturn === 0 || undefined}>
          <span className="wk-label">Return pending</span>
          <strong className="wk-total-value"><CountUp value={commitments.pendingReturn} format={money} /></strong>
          <span className="wk-total-note">{commitments.pendingCases === 1 ? '1 promise or credit' : `${commitments.pendingCases} promises or credits`} awaiting proof</span>
        </div>
        <div className="wk-total" data-total="recovered" data-amount={l.recovered} data-empty={l.recovered === 0 || undefined} data-accent={l.recovered > 0 || undefined}>
          <span className="wk-label">Recovered</span>
          <strong className="wk-total-value" style={l.recovered > 0 ? { color: 'var(--accent-ink)' } : undefined}><CountUp value={l.recovered} format={money} /></strong>
          <span className="wk-total-note">Only money you recorded as settled</span>
        </div>
      </section>

      <section className="wk-panelcard" aria-labelledby="rec-needs">
        <div className="wk-panelcard-head">
          <div>
            <h2 id="rec-needs">Needs your action</h2>
            <p>{needsAction.length === 0 ? 'Nothing is due. Replies and follow-ups will surface here.' : `${needsAction.length} ${plural(needsAction.length, 'case')}, soonest due first`}</p>
          </div>
        </div>
        {needsAction.length ? (
          <div className="wk-queue">
            {needsAction.map((row) => {
              const action = recoveryNextAction(row.state, now)
              const value = caseValue(row)
              const due = dueText(action.dueAt, now)
              return (
                <button type="button" key={row.finding.id} className="wk-queue-row" onClick={() => onOpenCase(row.finding.id)} aria-label={`Open ${row.finding.vendor} recovery case`}>
                  <span className="wk-queue-main">
                    <strong>{action.label} · {row.finding.vendor}</strong>
                    <span>
                      {due ? <span className="wk-chip" data-tone={due.includes('overdue') ? 'accent' : undefined}><CalendarClock aria-hidden="true" style={{ width: 12, height: 12 }} />{due}</span> : null}
                      <em>{recoveryStatusLabel(row.state)} · {row.typeLabel}</em>
                    </span>
                  </span>
                  <span className="wk-queue-amount">{formatCurrency(value.amount)}</span>
                  <span className="wk-queue-go">Open<ArrowRight aria-hidden="true" /></span>
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      <div className="wk-board" aria-label="Every recovery case">
        {LANES.map(({ stage, title, hint }) => {
          const inStage = rows.filter((o) => o.state.recoveryStage === stage)
          const total = inStage.reduce((sum, o) => sum + caseValue(o).amount, 0)
          return (
            <section className="wk-lane" key={stage} data-stage={stage} data-has-money={total > 0 || undefined} data-empty={inStage.length === 0 || undefined} aria-labelledby={`lane-${stage}`}>
              <div className="wk-lane-head">
                <h2 id={`lane-${stage}`} style={{ font: '600 13px var(--f-text)' }}>{title}</h2>
                <span>{inStage.length}</span>
              </div>
              <div className="wk-lane-total" data-amount={total}>{money(total)}</div>
              {inStage.length ? inStage.map((o) => {
                const value = caseValue(o)
                const action = recoveryNextAction(o.state, now)
                const due = stage === 'requested' ? dueText(action.dueAt, now) : null
                return (
                  <button type="button" className="wk-ticket" key={o.finding.id} onClick={() => onOpenCase(o.finding.id)} aria-label={`Open ${o.finding.vendor} recovery case`}>
                    <strong>{o.finding.vendor}</strong>
                    <span className="wk-ticket-status">{recoveryStatusLabel(o.state)}</span>
                    <span>
                      <em style={{ fontStyle: 'normal' }}>{due ?? value.label}</em>
                      <b className="wk-ticket-money" data-label={value.label}>{formatCurrency(value.amount)}</b>
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
