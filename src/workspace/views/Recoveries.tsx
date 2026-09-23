import { ArrowRight } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { recoveryNextAction, recoveryStatusLabel, requiresCustomerAction } from '@/recovery/model'
import { ladder, recoveries, vendorCommitments } from '../selectors'

/** Cases that have graduated from findings, sorted by the customer's next action. */
export function Recoveries({ env, onOpenCase }: { env: LedgerEnvironment; onOpenCase: (id: string) => void }) {
  const rows = recoveries(env)
  const l = ladder(env)
  const commitments = vendorCommitments(env)
  const now = Date.now()
  const needsAction = rows.filter(({ state, finding }) => requiresCustomerAction(state, now, finding.class !== 'recoverable'))
  const ready = rows.filter(({ state, finding }) => finding.class === 'recoverable' && state.recoveryStage === 'confirmed')
  const sorted = [...rows].sort((a, b) => Number(needsAction.includes(b)) - Number(needsAction.includes(a)) || (a.state.nextFollowUpAt ?? Infinity) - (b.state.nextFollowUpAt ?? Infinity) || b.finding.dollarImpact - a.finding.dollarImpact)
  const caseValue = (row: typeof rows[number]) => row.finding.class !== 'recoverable' ? row.finding.dollarImpact : row.state.recoveryStage === 'recovered' ? row.state.recoveredAmount ?? 0 : row.state.recoveryStage === 'requested' ? Math.max(0, (row.state.requestedAmount ?? row.finding.dollarImpact) - (row.state.recoveredAmount ?? 0)) : row.finding.dollarImpact
  const valueLabel = (row: typeof rows[number]) => row.finding.class !== 'recoverable' ? 'Flagged value' : row.state.recoveryStage === 'recovered' ? (row.state.recoveredAmount ?? 0) > 0 ? 'Returned' : 'Amount missing' : row.state.recoveryStage === 'requested' ? 'Outstanding' : row.state.recoveryStage === 'not_recovered' ? 'Unreturned' : 'Opportunity'

  if (rows.length === 0) return <div className="wk-empty"><span className="wk-label">No vendor recovery cases yet</span><p style={{ maxWidth: 520 }}>Confirm a recoverable finding to prepare a vendor request. Risk and future-savings findings stay in internal review.</p></div>

  return <>
    <section className="wk-section">
      <div className="wk-recovery-metrics">
        <div><span className="wk-label">Needs your action</span><strong>{needsAction.length}</strong><p>{plural(needsAction.length, 'case')} to move forward</p></div>
        <div><span className="wk-label">Prepared cases</span><strong>{formatCurrency(ready.reduce((sum, row) => sum + caseValue(row), 0))}</strong><p>{ready.length} vendor {plural(ready.length, 'request')} ready to send</p></div>
        <div><span className="wk-label">In recovery</span><strong>{formatCurrency(l.inRecovery)}</strong><p>Vendor requests recorded as sent</p></div>
        <div><span className="wk-label">Vendor agreed</span><strong>{formatCurrency(commitments.confirmed)}</strong><p>{commitments.confirmedCases} customer-recorded {plural(commitments.confirmedCases, 'agreement')}</p></div>
        <div><span className="wk-label">Return pending</span><strong>{formatCurrency(commitments.pendingReturn)}</strong><p>{commitments.pendingCases} {commitments.pendingCases === 1 ? 'promise or credit' : 'promises or credits'} awaiting proof</p></div>
        <div><span className="wk-label">Returned value</span><strong>{formatCurrency(l.recovered)}</strong><p>Customer recorded as settled</p></div>
      </div>
    </section>

    <section className="wk-section">
      <div className="wk-section-head"><h2 className="wk-display wk-h2">What needs your attention</h2><p>Next steps in the recovery journey</p></div>
      {needsAction.length === 0 ? <div className="wk-empty"><span className="wk-label">Nothing due right now</span><p>Open a case to record a vendor reply or change its follow-up date.</p></div> : <div className="wk-task-list">{needsAction.map((row) => { const action = recoveryNextAction(row.state, now, row.finding.class !== 'recoverable'); return <button type="button" key={row.finding.id} onClick={() => onOpenCase(row.finding.id)}><span><strong>{row.finding.vendor}</strong><small>{row.typeLabel} · {formatCurrency(caseValue(row))}</small></span><span><b>{action.label}</b>{action.dueAt ? <small>{new Date(action.dueAt).toLocaleDateString()}</small> : null}</span><ArrowRight aria-hidden="true" /></button> })}</div>}
    </section>

    <section className="wk-section">
      <div className="wk-section-head"><h2 className="wk-display wk-h2">All recovery cases</h2><p>{rows.length} vendor {plural(rows.length, 'case')}</p></div>
      <div className="wk-table-wrap"><table className="wk-table"><thead><tr><th>Vendor and case</th><th>Status</th><th>Next action</th><th className="wk-right">Amount</th><th aria-label="Open" /></tr></thead><tbody>{sorted.map((row) => { const internal = row.finding.class !== 'recoverable'; const action = recoveryNextAction(row.state, now, internal); return <tr key={row.finding.id}><td><strong className="wk-table-vendor">{row.finding.vendor}</strong><div className="wk-table-sub">{row.typeLabel}</div></td><td><span className="wk-mark" data-tone={row.state.recoveryStage === 'recovered' ? 'strong' : row.state.recoveryStage === 'not_recovered' ? 'quiet' : 'info'}>{recoveryStatusLabel(row.state, internal)}</span></td><td>{action.label}{action.dueAt ? <div className="wk-table-sub">{new Date(action.dueAt).toLocaleDateString()}</div> : null}</td><td className="wk-right wk-table-money">{formatCurrency(caseValue(row))}<div className="wk-table-sub">{valueLabel(row)}</div></td><td><button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onOpenCase(row.finding.id)} aria-label={`Open ${row.finding.vendor} recovery case`}>Open <ArrowRight aria-hidden="true" /></button></td></tr> })}</tbody></table></div>
    </section>
  </>
}
