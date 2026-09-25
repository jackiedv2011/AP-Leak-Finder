import { ArrowRight, Plus } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { internalReviews, ladder, opportunities, recentReturns, recoveryAging, recordedRootCauses, rootCauses, vendorCommitments } from '../selectors'
import { recoveries } from '../selectors'
import { recoveryNextAction, recoveryStatusLabel, requiresCustomerAction } from '@/recovery/model'
import { lockedSummary, REDACTED_MONEY, REDACTED_VENDOR } from '../planGates'
import { Locked } from '@/components/plan/Locked'
import { Strength } from './Strength'
import { SCREEN_OBJECT } from '../objects'
import { WorkObject } from '../WorkObject'

interface DashboardProps {
  env: LedgerEnvironment
  /** Finding ids the plan shows in full; others appear blurred. */
  visible: Set<string>
  onOpenCase: (findingId: string) => void
  onSeeAllFindings: () => void
  onSeeRecoveries: () => void
  onStartAudit: () => void
}

function findingsTable(rows: ReturnType<typeof opportunities>, onOpenCase: ((id: string) => void) | undefined, redact = false) {
  return (
    <div className="wk-table-wrap">
      <table className="wk-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Finding</th>
            <th>Evidence</th>
            <th className="wk-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.finding.id} onClick={onOpenCase ? () => onOpenCase(o.finding.id) : undefined}>
              <td>
                {onOpenCase ? <button type="button" className="wk-table-action wk-table-vendor" onClick={(event) => { event.stopPropagation(); onOpenCase(o.finding.id) }} aria-label={`Open ${o.finding.vendor} finding`}>{o.finding.vendor}</button> : <div className="wk-table-vendor">{redact ? REDACTED_VENDOR : o.finding.vendor}</div>}
                <div className="wk-table-sub">
                  {o.finding.relatedRecords.length} {plural(o.finding.relatedRecords.length, 'record')}
                </div>
              </td>
              <td>{o.typeLabel}</td>
              <td>
                <Strength level={o.evidence} />
              </td>
              <td className="wk-right wk-table-money">{redact ? REDACTED_MONEY : formatCurrency(o.finding.dollarImpact)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A bar can round a real amount down to nothing, so it always keeps a mark. */
function Meter({ value, scale }: { value: number; scale: number }) {
  const share = value / scale
  return (
    <div className="wk-rung-track" aria-hidden="true">
      <i style={{ width: share <= 0 ? '0%' : `${Math.max(1.5, Math.min(100, share * 100))}%` }} />
    </div>
  )
}

function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string
  value: string
  note: string
  accent?: boolean
}) {
  return (
    <div data-accent={accent || undefined}>
      <span className="wk-label">{label}</span>
      <div className="wk-ladder-figure">
        <span className="wk-display wk-figure" style={{ '--chars': Math.max(value.length, 6) } as React.CSSProperties}>
          {value}
        </span>
      </div>
      <p className="wk-ladder-note">{note}</p>
    </div>
  )
}

/** The first screen after log-in: recovered value, active work, and next steps. */
export function Dashboard({ env, visible, onOpenCase, onSeeAllFindings, onSeeRecoveries, onStartAudit }: DashboardProps) {
  const l = ladder(env)
  const commitments = vendorCommitments(env)
  const causes = rootCauses(env)
  const actualCauses = recordedRootCauses(env)
  const all = opportunities(env)
  const openFindings = all.filter((o) => o.state.decision === null || o.state.decision === 'needs_info')
  const priorityFindings = openFindings.filter((o) => visible.has(o.finding.id)).slice(0, 5)
  const lockedPriorityFindings = openFindings.filter((o) => !visible.has(o.finding.id)).slice(0, 3)
  const locked = lockedSummary(all.map((o) => o.finding), visible)
  const biggestCause = causes[0]?.value ?? 1
  const recoveryRows = recoveries(env)
  const reviewRows = internalReviews(env)
  const now = Date.now()
  const ageBuckets = recoveryAging(env, now).filter((bucket) => bucket.count > 0)
  const latestReturns = recentReturns(env).slice(0, 3)
  const recoveryTasks = recoveryRows.filter(({ state, finding }) => requiresCustomerAction(state, now, finding.class !== 'recoverable'))
  const recoveryTask = recoveryTasks[0] ?? reviewRows[0]
  const openRequestCount = recoveryRows.filter(({ state, finding }) => finding.class === 'recoverable' && state.recoveryStage === 'requested').length
  const accountingCloseoutCount = recoveryRows.filter(({ state, finding }) => finding.class === 'recoverable' && state.recoveryStage === 'recovered' && !state.reconciledAt).length
  const recoveryHighlights = [...recoveryRows].sort((a, b) =>
    Number(requiresCustomerAction(b.state, now, b.finding.class !== 'recoverable')) - Number(requiresCustomerAction(a.state, now, a.finding.class !== 'recoverable'))
    || (a.state.recoveryRequestedAt ?? Infinity) - (b.state.recoveryRequestedAt ?? Infinity)
    || b.finding.dollarImpact - a.finding.dollarImpact
  ).slice(0, 3)
  const unreviewedRecoverableCount = all.filter((row) => row.finding.class === 'recoverable' && row.state.decision === null).length
  const actionableFindings = openFindings.filter((o) => visible.has(o.finding.id))
  const actionableFinding = actionableFindings[0]
  const recoveryAction = recoveryTask ? recoveryNextAction(recoveryTask.state, now, recoveryTask.finding.class !== 'recoverable') : null

  // Each stage is shown against the largest figure, never added to the others.
  const scale = Math.max(l.verified, l.inRecovery, commitments.confirmed, commitments.pendingReturn, l.recovered, 1)

  return (
    <>
      <section className="wk-section">
        <div className="wk-ladder">
          <Stat
            label="Recovered"
            value={formatCurrency(l.recovered)}
            note={
              l.counts.recovered > 0
                ? `${l.counts.recovered} ${plural(l.counts.recovered, 'case')} with a recorded return.`
                : 'Only refunds you record as settled and credits you record as applied count.'
            }
            accent={l.recovered > 0}
          />
          <Stat label="In recovery" value={formatCurrency(l.inRecovery)} note={`${l.counts.inRecovery} ${plural(l.counts.inRecovery, 'request')} recorded as sent.`} />
          <Stat label="Ready to review" value={formatCurrency(l.awaitingDecision)} note={`${unreviewedRecoverableCount} recovery ${plural(unreviewedRecoverableCount, 'candidate')} awaiting a decision; plan access may vary.`} />
          <Stat label="Action needed" value={String(recoveryTasks.length + reviewRows.length + actionableFindings.length)} note="Cases and findings you can act on in this workspace." />
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <span className="wk-label">Next step</span>
            <p style={{ marginTop: 8, fontSize: 15, fontWeight: 500 }}>
              {recoveryTask && recoveryAction ? <><span className="wk-accent">{recoveryAction.label}</span> for {recoveryTask.finding.vendor}.</> : actionableFinding ? (
                <>
                  <span className="wk-num">{formatCurrency(actionableFinding.finding.dollarImpact)}</span> {actionableFinding.state.decision === 'needs_info' ? 'still needs more information.' : 'is waiting on your review.'}
                </>
              ) : l.awaitingDecision > 0 ? (
                <>The remaining recovery candidates are in the findings queue. Open it to see which need Growth or Flat.</>
              ) : l.openCount > 0 ? (
                <>Every finding has a decision. Start a new audit to keep going.</>
              ) : (
                <>This ledger came back clean. Start another audit to check more records.</>
              )}
            </p>
            <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>
              {recoveryAction?.detail ?? (actionableFinding && actionableFinding.finding.class !== 'recoverable' ? 'Review the finding inside your business. No vendor outreach is prepared for this case.' : 'You approve vendor outreach and send the request from your own email.')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {recoveryTask ? <button type="button" className="wk-btn" data-variant="primary" onClick={() => onOpenCase(recoveryTask.finding.id)}>{recoveryAction?.label}<ArrowRight aria-hidden="true" /></button> : actionableFinding ? (
              <button type="button" className="wk-btn" data-variant="primary" onClick={() => onOpenCase(actionableFinding.finding.id)}>
                Review {actionableFinding.finding.vendor}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : l.awaitingDecision > 0 ? <button type="button" className="wk-btn" data-variant="outline" onClick={onSeeAllFindings}>See findings <ArrowRight aria-hidden="true" /></button> : (
              <button type="button" className="wk-btn" data-variant="primary" onClick={onStartAudit}>
                <Plus aria-hidden="true" />
                Start an audit
              </button>
            )}
          </div>
        </div>
      </section>

      {recoveryRows.length > 0 ? <section className="wk-section">
        <div className="wk-section-head"><h2 className="wk-display wk-h2">Recovery work</h2><button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onSeeRecoveries}>All recoveries <ArrowRight aria-hidden="true" /></button></div>
        <p className="wk-dim wk-dashboard-recovery-summary">{recoveryRows.length} {plural(recoveryRows.length, 'case')} in the ledger · {openRequestCount} open {plural(openRequestCount, 'request')} · {accountingCloseoutCount} awaiting accounting closeout</p>
        <div className="wk-task-list">{recoveryHighlights.map(({ finding, state }) => {
          const action = recoveryNextAction(state, now)
          const amount = state.recoveryStage === 'requested' ? Math.max(0, (state.requestedAmount ?? finding.dollarImpact) - (state.recoveredAmount ?? 0)) : state.recoveryStage === 'recovered' ? state.recoveredAmount ?? 0 : finding.dollarImpact
          const amountLabel = state.recoveryStage === 'requested' ? 'outstanding' : state.recoveryStage === 'recovered' ? (state.recoveredAmount ?? 0) > 0 ? 'returned' : 'amount missing' : state.recoveryStage === 'not_recovered' ? 'unreturned' : 'opportunity'
          return <button type="button" key={finding.id} onClick={() => onOpenCase(finding.id)}><span><strong>{finding.vendor}</strong><small>{recoveryStatusLabel(state)} · {formatCurrency(amount)} {amountLabel}</small></span><span><b>{action.label}</b>{action.dueAt ? <small>{new Date(action.dueAt).toLocaleDateString()}</small> : null}</span><ArrowRight aria-hidden="true" /></button>
        })}</div>
      </section> : null}

      {reviewRows.length > 0 ? <section className="wk-section">
        <div className="wk-section-head"><h2 className="wk-display wk-h2">Internal reviews</h2><button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onSeeAllFindings}>All findings <ArrowRight aria-hidden="true" /></button></div>
        <p className="wk-dim wk-dashboard-recovery-summary">These findings need a team investigation. Their flagged value does not enter recovery totals.</p>
        <div className="wk-task-list">{reviewRows.slice(0, 3).map(({ finding, state }) => { const action = recoveryNextAction(state, now, true); return <button type="button" key={finding.id} onClick={() => onOpenCase(finding.id)}><span><strong>{finding.vendor}</strong><small>{recoveryStatusLabel(state, true)} · {formatCurrency(finding.dollarImpact)} flagged value</small></span><span><b>{action.label}</b></span><ArrowRight aria-hidden="true" /></button> })}</div>
      </section> : null}

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Recovery pipeline</h2>
          <p>Each figure is a separate stage. They are never added together.</p>
        </div>
        <div className="wk-dash-pipeline" data-stages="five">
          <div className="wk-pipeline" data-stages="five">
          <div>
            <span className="wk-label">Record-supported</span>
            <span className="wk-pipeline-figure">{formatCurrency(l.verified)}</span>
            <Meter value={l.verified} scale={scale} />
            <span className="wk-ladder-note">
              {l.counts.verified} {plural(l.counts.verified, 'candidate')} to review before outreach
            </span>
          </div>
          <div>
            <span className="wk-label">In recovery</span>
            <span className="wk-pipeline-figure">{formatCurrency(l.inRecovery)}</span>
            <Meter value={l.inRecovery} scale={scale} />
            <span className="wk-ladder-note">
              {l.counts.inRecovery} {plural(l.counts.inRecovery, 'request')} out with vendors
            </span>
          </div>
          <div>
            <span className="wk-label">Vendor agreed</span>
            <span className="wk-pipeline-figure">{formatCurrency(commitments.confirmed)}</span>
            <Meter value={commitments.confirmed} scale={scale} />
            <span className="wk-ladder-note">
              {commitments.confirmedCases} customer-recorded {plural(commitments.confirmedCases, 'agreement')}
            </span>
          </div>
          <div>
            <span className="wk-label">Return pending</span>
            <span className="wk-pipeline-figure">{formatCurrency(commitments.pendingReturn)}</span>
            <Meter value={commitments.pendingReturn} scale={scale} />
            <span className="wk-ladder-note">
              {commitments.pendingCases} {commitments.pendingCases === 1 ? 'promise or credit' : 'promises or credits'} awaiting proof
            </span>
          </div>
          <div data-accent={l.recovered > 0 || undefined}>
            <span className="wk-label">Recovered</span>
            <span className="wk-pipeline-figure">{formatCurrency(l.recovered)}</span>
            <Meter value={l.recovered} scale={scale} />
            <span className="wk-ladder-note">
              {l.counts.recovered} {plural(l.counts.recovered, 'case')} with recorded returns
            </span>
          </div>
          </div>
          <WorkObject name={SCREEN_OBJECT.dashboard} height={186} />
        </div>
      </section>

      {recoveryRows.length > 0 ? <section className="wk-section">
        <div className="wk-section-head"><h2 className="wk-display wk-h2">Recovery activity</h2><p>Open request age and returns you recorded</p></div>
        <div className="wk-recovery-insights">
          <div className="wk-card-flat"><span className="wk-label">Open request age</span><p className="wk-table-sub">From the date you marked vendor outreach as sent.</p>{ageBuckets.length ? <ul className="wk-recovery-insight-list">{ageBuckets.map((bucket) => <li key={bucket.label}><span><strong>{bucket.label}</strong><small>{bucket.count} {plural(bucket.count, 'case')}</small></span><b>{formatCurrency(bucket.outstanding)} outstanding</b></li>)}</ul> : <p className="wk-dim wk-recovery-insight-empty">No open vendor requests.</p>}</div>
          <div className="wk-card-flat"><span className="wk-label">Recent returned value</span><p className="wk-table-sub">Customer-recorded returns, newest first.</p>{latestReturns.length ? <ul className="wk-recovery-insight-list">{latestReturns.map((row) => <li key={row.id}><button type="button" onClick={() => onOpenCase(row.findingId)}><span><strong>{row.vendor}</strong><small>{new Date(row.settledAt).toLocaleDateString()} · {row.reference ?? (row.partial ? 'Partial return' : 'Return recorded')}</small></span><b>{formatCurrency(row.amount)}</b></button></li>)}</ul> : <p className="wk-dim wk-recovery-insight-empty">No dated returns recorded yet.</p>}</div>
        </div>
      </section> : null}

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Priority findings</h2>
          <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onSeeAllFindings}>
            All findings
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        {priorityFindings.length === 0 && lockedPriorityFindings.length === 0 ? (
          <div className="wk-empty">
            <span className="wk-label">Nothing flagged</span>
            <p>Every check ran against this ledger and found nothing worth your time.</p>
          </div>
        ) : null}
        {priorityFindings.length > 0 ? findingsTable(priorityFindings, onOpenCase) : null}
        {lockedPriorityFindings.length > 0 ? (
          <div style={{ marginTop: priorityFindings.length > 0 ? 14 : 0 }}>
            <Locked
              title={`${locked.count} larger ${locked.count === 1 ? 'finding' : 'findings'} worth ${formatCurrency(locked.value)} are part of Growth and Flat`}
              note="Free shows the lowest-value findings in full."
            >
              {findingsTable(lockedPriorityFindings, undefined, true)}
            </Locked>
          </div>
        ) : null}
      </section>

      {causes.length > 0 ? (
        <section className="wk-section">
          <div className="wk-section-head">
            <h2 className="wk-display wk-h2">What the checks flagged</h2>
          </div>
          <div className="wk-card-flat">
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {causes.map((cause) => (
                <li key={cause.type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 7 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{cause.label}</span>
                    <span className="wk-num wk-dim" style={{ fontSize: 13 }}>
                      {formatCurrency(cause.value)}
                    </span>
                  </div>
                  <div className="wk-bar">
                    <i style={{ width: `${Math.max(2, (cause.value / biggestCause) * 100)}%` }} />
                  </div>
                  <div className="wk-table-sub" style={{ marginTop: 5 }}>
                    {cause.count} {plural(cause.count, 'finding')}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {actualCauses.length > 0 ? <section className="wk-section"><div className="wk-section-head"><h2 className="wk-display wk-h2">Recorded root causes</h2><p>From reconciled recovery cases</p></div><div className="wk-table-wrap"><table className="wk-table"><thead><tr><th>Cause</th><th>Cases</th><th className="wk-right">Returned value</th></tr></thead><tbody>{actualCauses.map((cause) => <tr key={cause.label} style={{ cursor: 'default' }}><td>{cause.label}</td><td>{cause.count}</td><td className="wk-right wk-table-money">{formatCurrency(cause.recovered)}</td></tr>)}</tbody></table></div></section> : null}
    </>
  )
}
