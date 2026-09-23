import { ArrowRight, FileText, Plus } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, opportunities, rootCauses } from '../selectors'
import { lockedSummary } from '../planGates'
import { Locked } from '@/components/plan/Locked'
import { Strength } from './Strength'

interface DashboardProps {
  env: LedgerEnvironment
  visible: Set<string>
  auditCount: number
  auditLabel: string
  onOpenCase: (findingId: string) => void
  onSeeAllFindings: () => void
  onSeeFindingsKind: (kind: 'recoverable' | 'review' | 'opportunity') => void
  onStartAudit: () => void
}

export function Dashboard({ env, visible, auditCount, auditLabel, onOpenCase, onSeeAllFindings, onSeeFindingsKind, onStartAudit }: DashboardProps) {
  const l = ladder(env)
  const all = opportunities(env)
  const recent = all.filter((o) => visible.has(o.finding.id)).slice(0, 5)
  const lockedRecent = all.filter((o) => !visible.has(o.finding.id)).slice(0, 3)
  const locked = lockedSummary(all.map((o) => o.finding), visible)
  const causes = rootCauses(env)
  const biggestCause = causes[0]?.value ?? 1
  const source = env.imports.at(-1)
  const waiting = all.filter((o) => o.state.decision === null && o.finding.class === 'recoverable')
  const needsReview = all.filter((o) => o.finding.class === 'review' && o.state.decision !== 'expected' && o.state.recoveryStage !== 'not_recovered' && o.state.recoveryStage !== 'recovered')
  const needsReviewValue = needsReview.reduce((sum, o) => sum + o.finding.dollarImpact, 0)
  const next = waiting.find((o) => visible.has(o.finding.id))
  const date = source ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(source.importedAt) : '—'

  return <>
    <section className="wk-overview-card" aria-label="Latest audit">
      <div className="wk-overview-card-head">
        <h2>Latest analysis</h2>
        <div className="wk-overview-card-actions"><span className="wk-mark" data-tone="strong">Complete</span><button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={onStartAudit}><Plus aria-hidden="true" />New audit</button><button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={onSeeAllFindings}>Review findings <ArrowRight aria-hidden="true" /></button></div>
      </div>
      <div className="wk-overview-card-main">
        <div className="wk-audit-artifact"><div className="wk-audit-artifact-top"><span className="wk-audit-artifact-mark"><FileText aria-hidden="true" /></span><span>{source?.mode === 'sample' ? 'Sample data' : 'Payment ledger'}</span></div><div className="wk-audit-artifact-center"><span className="wk-audit-artifact-label">PAYMENT REVIEW</span><strong>{auditLabel}</strong><div className="wk-audit-preview-rows">{env.records.slice(0, 2).map((record) => <div key={record.id}><span>{record.vendor}</span><span>{formatCurrency(record.amountPaid)}</span></div>)}</div><small>{env.records.length} records scanned · {l.counts.potential} findings surfaced</small></div><div className="wk-audit-artifact-foot"><span>Reclaim</span><span>{date}</span></div></div>
        <div className="wk-audit-details"><span className="wk-detail-eyebrow">Current audit</span><h3>{auditLabel}</h3><p>Review the evidence behind each finding, record your decision, and track confirmed recovery through its outcome.</p><dl><div><dt>Source</dt><dd>{source?.sourceLabel ?? 'Payment ledger'}</dd></div><div><dt>Records</dt><dd>{env.records.length} payments</dd></div><div><dt>Findings</dt><dd>{l.counts.potential} surfaced across {auditCount} {plural(auditCount, 'audit')}</dd></div><div><dt>Potential impact</dt><dd>{formatCurrency(l.potential)}</dd></div></dl></div>
      </div>
      <div className="wk-overview-card-foot"><span>Findings are review candidates; potential amounts are not confirmed refunds.</span><button type="button" onClick={onSeeAllFindings}>View all findings <ArrowRight aria-hidden="true" /></button></div>
    </section>

    <div className="wk-overview-metrics">
      <button type="button" onClick={() => onSeeFindingsKind('recoverable')}><span>Ready to recover <ArrowRight aria-hidden="true" /></span><strong>{formatCurrency(l.verified)}</strong><small>{l.counts.verified} supported by the records</small></button>
      <button type="button" onClick={() => onSeeFindingsKind('review')}><span>Needs review <ArrowRight aria-hidden="true" /></span><strong>{formatCurrency(needsReviewValue)}</strong><small>{needsReview.length} {plural(needsReview.length, 'finding')} need more context</small></button>
      <button type="button" onClick={() => onSeeFindingsKind('opportunity')}><span>Future savings <ArrowRight aria-hidden="true" /></span><strong>{formatCurrency(l.protected)}</strong><small>{l.counts.protected} prevention {plural(l.counts.protected, 'opportunity', 'opportunities')}</small></button>
    </div>

    <div className="wk-overview-grid">
      <div className="wk-overview-primary">
        <section className="wk-overview-section"><div className="wk-overview-section-head"><h2>Prioritize next</h2><button type="button" onClick={onSeeAllFindings}>All {all.length} findings <ArrowRight aria-hidden="true" /></button></div>
          {next ? <div className="wk-next-action"><div><span className="wk-detail-eyebrow">Waiting on your review</span><p><strong>{formatCurrency(l.awaitingDecision)}</strong> is ready for a decision.</p><small>Reclaim will not contact a vendor until you confirm a finding.</small></div><button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => onOpenCase(next.finding.id)}>Review {next.finding.vendor}<ArrowRight aria-hidden="true" /></button></div> : <div className="wk-next-action"><div><span className="wk-detail-eyebrow">Up to date</span><p>There are no verified findings waiting for a decision.</p><small>Start another audit to review more payment records.</small></div><button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={onStartAudit}>New audit</button></div>}
          {recent.length ? <div className="wk-overview-queue"><div className="wk-overview-row-head"><span>Finding</span><span>Vendor</span><span>Evidence</span><span>Amount</span></div>{recent.map((o) => <button key={o.finding.id} type="button" className="wk-overview-row" onClick={() => onOpenCase(o.finding.id)}><span><strong>{o.typeLabel}</strong><small>{o.finding.id}</small></span><span>{o.finding.vendor}</span><span><Strength level={o.evidence} /></span><span className="wk-overview-amount">{formatCurrency(o.finding.dollarImpact)}</span></button>)}</div> : <div className="wk-empty"><p>Nothing flagged in this audit.</p></div>}
          {lockedRecent.length ? <Locked title={`${locked.count} larger ${plural(locked.count, 'finding')} worth ${formatCurrency(locked.value)} are part of Pro`} note="Free shows the lowest-value findings in full."><div className="wk-overview-locked">{lockedRecent.map((o) => <div key={o.finding.id}>{o.finding.vendor}<span>{formatCurrency(o.finding.dollarImpact)}</span></div>)}</div></Locked> : null}
        </section>
      </div>
      <aside className="wk-overview-secondary">
        <section className="wk-overview-side-card"><div className="wk-overview-section-head"><h2>Recovery pipeline</h2></div><p className="wk-overview-side-note">Separate stages; figures are never added together.</p><div className="wk-stage-list"><div><span>Verified</span><strong>{formatCurrency(l.verified)}</strong><small>{l.counts.verified} findings supported</small></div><div><span>In recovery</span><strong>{formatCurrency(l.inRecovery)}</strong><small>{l.counts.inRecovery} requests out</small></div><div data-accent={l.recovered > 0 || undefined}><span>Recovered</span><strong>{formatCurrency(l.recovered)}</strong><small>{l.counts.recovered} cases settled</small></div></div></section>
        {causes.length ? <section className="wk-overview-side-card"><div className="wk-overview-section-head"><h2>Where the money went</h2></div><div className="wk-cause-list">{causes.slice(0, 5).map((cause) => <div key={cause.type}><div><span>{cause.label}</span><strong>{formatCurrency(cause.value)}</strong></div><span className="wk-cause-track"><i style={{ width: `${Math.max(2, cause.value / biggestCause * 100)}%` }} /></span><small>{cause.count} {plural(cause.count, 'finding')}</small></div>)}</div></section> : null}
      </aside>
    </div>
  </>
}
