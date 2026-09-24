import { ArrowRight, Banknote, CalendarClock, Check, CircleHelp, Clock, Info, Lock, Send, X } from 'lucide-react'
import { formatDate, plural } from '@/lib/format'
import { getCaseState, type LedgerEnvironment } from '@/ledger/store'
import type { CaseEvent } from '@/ledger/caseState'
import { useEntitlements } from '@/lib/auth/AuthContext'
import { Locked } from '@/components/plan/Locked'
import { internalReviews, ladder, opportunities, recentReturns, recordedRootCauses, recoveries, recoveryAging, rootCauses, vendorCommitments, vendors, type Opportunity } from '../selectors'
import { recoveryNextAction, recoveryStatusLabel, requiresCustomerAction } from '@/recovery/model'
import { usePreferences, useHeadlineMoney, type OverviewSectionId } from '../preferences'
import type { WorkspaceMode } from '../WorkspaceShell'
import { KindChip } from './KindChip'
import { CountUp } from './CountUp'
import { findingReference } from './findingText'

interface DashboardProps {
  env: LedgerEnvironment
  visible: Set<string>
  auditLabel: string
  onOpenCase: (findingId: string) => void
  onSeeAllFindings: () => void
  onSeeFindingsKind: (kind: 'recoverable' | 'review' | 'opportunity') => void
  onSearchFindings: (query: string) => void
  onNavigate: (mode: WorkspaceMode) => void
}

const DAY = 86_400_000
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function dueLabel(dueAt: number, now: number): { text: string; overdue: boolean } {
  const days = Math.round((new Date(dueAt).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY)
  if (days < 0) return { text: `${-days}d overdue`, overdue: true }
  if (days === 0) return { text: 'Due today', overdue: true }
  return { text: `Due ${shortDate.format(dueAt)}`, overdue: false }
}

function ago(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days < 7 ? `${days}d ago` : shortDate.format(at)
}

function eventIcon(event: CaseEvent) {
  if (event.to.recoveryStage === 'recovered') return { icon: Banknote, tone: 'accent' as const }
  if (event.to.recoveryStage === 'requested') return { icon: Send, tone: undefined }
  if (event.to.decision === 'confirmed') return { icon: Check, tone: undefined }
  if (event.to.decision === 'expected') return { icon: X, tone: undefined }
  if (event.to.decision === 'needs_info') return { icon: CircleHelp, tone: undefined }
  return { icon: Clock, tone: undefined }
}

export function Dashboard({ env, visible, auditLabel, onOpenCase, onSeeAllFindings, onSeeFindingsKind, onSearchFindings, onNavigate }: DashboardProps) {
  const { prefs } = usePreferences()
  const money = useHeadlineMoney()
  const entitlements = useEntitlements()
  const now = Date.now()

  const l = ladder(env)
  const all = opportunities(env)
  const inPlay = (o: Opportunity) => o.state.decision !== 'expected' && o.state.recoveryStage !== 'recovered' && o.state.recoveryStage !== 'not_recovered'
  // Undecided, or parked as "needs more detail": both are waiting on a person.
  const undecided = all.filter((o) => (o.state.decision === null || o.state.decision === 'needs_info') && inPlay(o))
  const needsContext = all.filter((o) => o.finding.class === 'review' && inPlay(o) && o.state.recoveryStage === null)
  const needsContextValue = needsContext.reduce((sum, o) => sum + o.finding.dollarImpact, 0)
  // The five worth the most attention, plus, on Free, the ones this plan can open,
  // so the list is honest about the big money and still gives you something to do.
  const top = undecided.slice(0, 5)
  const openable = undecided.filter((o) => visible.has(o.finding.id) && !top.includes(o)).slice(0, Math.max(0, 2 - top.filter((o) => visible.has(o.finding.id)).length))
  const next = [...top, ...openable]
  const firstOpenable = undecided.find((o) => visible.has(o.finding.id))
  const causes = rootCauses(env)
  const topVendors = vendors(env).filter((v) => v.potential > 0).slice(0, 5)
  const vendorCount = new Set(env.records.map((r) => r.vendor.trim().toLowerCase())).size
  const times = env.records.map((r) => r.paymentDate.getTime()).filter(Number.isFinite)
  const range = times.length ? `${formatDate(new Date(Math.min(...times)))} – ${formatDate(new Date(Math.max(...times)))}` : null
  const source = env.imports.at(-1)

  const stageCounts = {
    found: all.filter((o) => o.finding.class === 'recoverable' && o.state.decision === null && inPlay(o)).length,
    confirmed: all.filter((o) => o.finding.class === 'recoverable' && o.state.recoveryStage === 'confirmed').length,
    requested: l.counts.inRecovery,
    recovered: l.counts.recovered,
  }
  const notRecovered = all.filter((o) => o.finding.class === 'recoverable' && o.state.recoveryStage === 'not_recovered').length
  const commitments = vendorCommitments(env)
  const aging = recoveryAging(env, now).filter((bucket) => bucket.count > 0)
  const confirmedCauses = recordedRootCauses(env)
  const latestReturns = recentReturns(env).slice(0, 3)

  // Recovery work that is waiting on the customer, soonest due first; internal reviews after.
  const tasks = [
    ...recoveries(env)
      .filter(({ state }) => requiresCustomerAction(state, now))
      .map((o) => ({ o, action: recoveryNextAction(o.state, now), internal: false })),
    ...internalReviews(env).map((o) => ({ o, action: recoveryNextAction(o.state, now, true), internal: true })),
  ].sort((a, b) => Number(a.internal) - Number(b.internal) || (a.action.dueAt ?? Infinity) - (b.action.dueAt ?? Infinity) || b.o.finding.dollarImpact - a.o.finding.dollarImpact)
  const leadTask = tasks.find((task) => visible.has(task.o.finding.id))

  const events = env.result.findings
    .flatMap((finding) => (getCaseState(env, finding.id).history ?? []).map((event) => ({ event, finding })))
    .sort((a, b) => b.event.at - a.event.at)
    .slice(0, 6)

  const shown = prefs.sections.filter((s) => s.visible).map((s) => s.id)
  const wide: OverviewSectionId[] = ['tasks', 'next', 'types', 'activity']
  const side: OverviewSectionId[] = ['pipeline', 'vendors']

  const sections: Record<OverviewSectionId, () => React.ReactNode> = {
    totals: () => (
      <section className="wk-totals" aria-label="Totals" key="totals">
        <button type="button" className="wk-total" data-total="ready" data-amount={l.verified} data-emphasis={l.verified > 0 || undefined} onClick={() => onSeeFindingsKind('recoverable')}>
          <span className="wk-total-label"><span className="wk-label">Ready to claim</span><ArrowRight aria-hidden="true" /></span>
          <strong className="wk-total-value"><CountUp value={l.verified} format={money} /></strong>
          <span className="wk-total-note">{l.counts.verified} {plural(l.counts.verified, 'finding')} the records support</span>
        </button>
        <button type="button" className="wk-total" data-total="review" data-amount={needsContextValue} onClick={() => onSeeFindingsKind('review')}>
          <span className="wk-total-label"><span className="wk-label">Needs more context</span><ArrowRight aria-hidden="true" /></span>
          <strong className="wk-total-value"><CountUp value={needsContextValue} format={money} /></strong>
          <span className="wk-total-note">{needsContext.length} {plural(needsContext.length, 'finding')} to check against a PO or statement</span>
        </button>
        <button type="button" className="wk-total" data-total="inRecovery" data-amount={l.inRecovery} data-empty={l.inRecovery === 0 || undefined} onClick={() => onNavigate('recoveries')}>
          <span className="wk-total-label"><span className="wk-label">In recovery</span><ArrowRight aria-hidden="true" /></span>
          <strong className="wk-total-value"><CountUp value={l.inRecovery} format={money} /></strong>
          <span className="wk-total-note">{l.counts.inRecovery === 0 ? 'No requests out yet' : `${l.counts.inRecovery} ${plural(l.counts.inRecovery, 'request')} out with vendors`}</span>
        </button>
        <button type="button" className="wk-total" data-total="recovered" data-amount={l.recovered} data-empty={l.recovered === 0 || undefined} data-accent={l.recovered > 0 || undefined} onClick={() => onNavigate('recoveries')}>
          <span className="wk-total-label"><span className="wk-label">Recovered</span><ArrowRight aria-hidden="true" /></span>
          <strong className="wk-total-value" style={l.recovered > 0 ? { color: 'var(--accent-ink)' } : undefined}><CountUp value={l.recovered} format={money} /></strong>
          <span className="wk-total-note">{l.counts.recovered === 0 ? 'Counts only money that came back' : `From ${l.counts.recovered} ${plural(l.counts.recovered, 'case')}`}</span>
        </button>
      </section>
    ),

    tasks: () => {
      if (!tasks.length) return null
      return (
        <section className="wk-panelcard" aria-labelledby="ov-tasks" key="tasks">
          <div className="wk-panelcard-head">
            <div>
              <h2 id="ov-tasks">Recovery tasks</h2>
              <p>{tasks.length} {plural(tasks.length, 'case')} waiting on you, soonest due first</p>
            </div>
            <button type="button" className="wk-more" onClick={() => onNavigate('recoveries')}>Recoveries <ArrowRight aria-hidden="true" /></button>
          </div>
          <div className="wk-queue">
            {tasks.slice(0, 5).map(({ o, action, internal }) => {
              const due = action.dueAt ? dueLabel(action.dueAt, now) : null
              const outstanding = o.state.recoveryStage === 'requested' ? Math.max(0, (o.state.requestedAmount ?? o.finding.dollarImpact) - (o.state.recoveredAmount ?? 0)) : o.finding.dollarImpact
              return (
                <button key={o.finding.id} type="button" className="wk-queue-row" data-amount={outstanding} onClick={() => onOpenCase(o.finding.id)}>
                  <span className="wk-queue-main">
                    <strong>{action.label} · {o.finding.vendor}</strong>
                    <span>
                      {due ? <span className="wk-chip" data-tone={due.overdue ? 'accent' : undefined}><CalendarClock aria-hidden="true" style={{ width: 12, height: 12 }} />{due.text}</span> : null}
                      <em>{recoveryStatusLabel(o.state, internal)}{internal ? ' · internal review' : ''}</em>
                    </span>
                  </span>
                  <span className="wk-queue-amount">{money(outstanding)}</span>
                  <span className="wk-queue-go">Open<ArrowRight aria-hidden="true" /></span>
                </button>
              )
            })}
          </div>
          {tasks.length > 5 ? <div className="wk-queue-foot"><span>{tasks.length - 5} more in Recoveries</span></div> : null}
        </section>
      )
    },

    next: () => {
      const lockedCount = undecided.filter((o) => !visible.has(o.finding.id)).length
      return (
        <section className="wk-panelcard" aria-labelledby="ov-next" key="next">
          <div className="wk-panelcard-head">
            <div>
              <h2 id="ov-next">Up next</h2>
              <p>{undecided.length === 0 ? 'Every finding has a decision.' : `${undecided.length} ${plural(undecided.length, 'finding')} waiting on your decision, most worth your time first`}</p>
            </div>
            <button type="button" className="wk-more" onClick={onSeeAllFindings}>All findings <ArrowRight aria-hidden="true" /></button>
          </div>
          {next.length ? (
            <div className="wk-queue">
              {next.map((o) => {
                const locked = !visible.has(o.finding.id)
                return (
                  <button key={o.finding.id} type="button" className="wk-queue-row" data-amount={o.finding.dollarImpact} data-locked={locked || undefined} onClick={() => onOpenCase(o.finding.id)} aria-label={`${o.finding.vendor}, ${o.typeLabel}, ${money(o.finding.dollarImpact)}${locked ? ', part of Pro' : ''}`}>
                    <span className="wk-queue-main">
                      <strong>{locked ? o.typeLabel : o.finding.vendor}</strong>
                      <span>{locked ? <em>Vendor and invoices shown on Pro</em> : <><KindChip finding={o.finding} label={o.typeLabel} />{o.state.decision === 'needs_info' ? <span className="wk-chip" data-tone="quiet">Needs information</span> : null}<em>{findingReference(o.finding)}</em></>}</span>
                    </span>
                    <span className="wk-queue-amount">{money(o.finding.dollarImpact)}</span>
                    <span className="wk-queue-go">{locked ? <><Lock aria-hidden="true" />Pro</> : <>Review<ArrowRight aria-hidden="true" /></>}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="wk-queue-empty">
              <p>Nothing is waiting on you. Confirmed findings move to Recoveries.</p>
              <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => onNavigate('recoveries')}>Open Recoveries</button>
            </div>
          )}
          {lockedCount > 0 ? (
            <div className="wk-upsell">
              <p><Lock aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} /><strong>{lockedCount} of {undecided.length}</strong> findings are shown in full on Pro. Free shows the {entitlements.limits.findingsVisible} lowest-value ones.</p>
            </div>
          ) : null}
        </section>
      )
    },

    pipeline: () => {
      const total = Math.max(1, stageCounts.found + stageCounts.confirmed + stageCounts.requested + stageCounts.recovered)
      const steps = [
        { id: 'found', label: 'To decide', count: stageCounts.found, note: 'Supported, not reviewed' },
        { id: 'confirmed', label: 'Confirmed', count: stageCounts.confirmed, note: 'Request not sent' },
        { id: 'requested', label: 'Requested', count: stageCounts.requested, note: 'Out with the vendor' },
        { id: 'recovered', label: 'Recovered', count: stageCounts.recovered, note: 'Money came back' },
      ] as const
      return (
        <section className="wk-panelcard" aria-labelledby="ov-pipeline" key="pipeline">
          <div className="wk-panelcard-head">
            <div>
              <h2 id="ov-pipeline">Recovery progress</h2>
              <p>Claimable findings by stage</p>
            </div>
            <button type="button" className="wk-more" onClick={() => onNavigate('recoveries')}>Recoveries <ArrowRight aria-hidden="true" /></button>
          </div>
          <div className="wk-panelcard-body wk-flow">
            <div className="wk-flow-bar" role="img" aria-label={steps.map((s) => `${s.label} ${s.count}`).join(', ')}>
              {steps.filter((s) => s.count > 0).map((s) => <i key={s.id} data-stage={s.id} style={{ flex: s.count / total }} />)}
            </div>
            <div className="wk-flow-steps">
              {steps.map((s) => (
                <div className="wk-flow-step" key={s.id} data-stage={s.id}>
                  <span className="wk-label"><i data-stage={s.id} aria-hidden="true" />{s.label}</span>
                  <strong>{s.count}</strong>
                  <small>{s.note}</small>
                </div>
              ))}
            </div>
            {commitments.confirmed > 0 ? (
              <dl className="wk-kv">
                <div><dt>Vendor agreed</dt><dd>{money(commitments.confirmed)}</dd></div>
                <div><dt>Return pending</dt><dd>{money(commitments.pendingReturn)}</dd></div>
              </dl>
            ) : null}
            {aging.length ? (
              <p className="wk-flow-note"><Clock aria-hidden="true" />Open requests: {aging.map((bucket) => `${bucket.count} ${bucket.label === 'Date unknown' ? 'with no send date' : `at ${bucket.label}`}`).join(' · ')}{notRecovered ? ` · ${notRecovered} closed without money back` : ''}</p>
            ) : notRecovered ? (
              <p className="wk-flow-note"><Info aria-hidden="true" />{notRecovered} {plural(notRecovered, 'case')} closed without money back</p>
            ) : null}
            {latestReturns.length ? (
              <div className="wk-returns">
                <h3 className="wk-subhead">Latest money back</h3>
                <ul>
                  {latestReturns.map((row) => (
                    <li key={row.id}>
                      <button type="button" onClick={() => onOpenCase(row.findingId)}>
                        <span><strong>{row.vendor}</strong><small>{formatDate(new Date(row.settledAt))}{row.partial ? ' · part of the claim' : ''}</small></span>
                        <b>{money(row.amount)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      )
    },

    types: () => {
      if (!causes.length) return null
      const biggest = causes[0].value || 1
      return (
        <section className="wk-panelcard" aria-labelledby="ov-types" key="types">
          <div className="wk-panelcard-head">
            <div>
              <h2 id="ov-types">By finding type</h2>
              <p>Which checks caught the money</p>
            </div>
            <button type="button" className="wk-more" onClick={() => onNavigate('reports')}>Report <ArrowRight aria-hidden="true" /></button>
          </div>
          <div className="wk-panelcard-body wk-bars" data-columns="2">
            {causes.slice(0, 6).map((cause) => (
              <button type="button" className="wk-bars-row" key={cause.type} data-amount={cause.value} onClick={() => onSearchFindings(cause.label)}>
                <span><em>{cause.label}</em></span>
                <strong>{money(cause.value)}</strong>
                <span className="wk-bars-track"><i style={{ width: `${Math.max(2, (cause.value / biggest) * 100)}%` }} /></span>
                <small>{cause.count} {plural(cause.count, 'finding')}</small>
              </button>
            ))}
          </div>
          {confirmedCauses.length ? (
            <div className="wk-panelcard-body wk-subsection wk-stack">
              <h3 className="wk-subhead">Causes you confirmed when reconciling</h3>
              <dl className="wk-kv">
                {confirmedCauses.map((cause) => <div key={cause.label}><dt>{cause.label} · {cause.count} {plural(cause.count, 'case')}</dt><dd>{money(cause.recovered)} back</dd></div>)}
              </dl>
            </div>
          ) : null}
        </section>
      )
    },

    vendors: () => {
      if (!topVendors.length) return null
      const biggest = topVendors[0].potential || 1
      const body = (
        <div className="wk-panelcard-body wk-bars">
          {topVendors.map((v) => (
            <button type="button" className="wk-bars-row" key={v.vendor} onClick={() => onSearchFindings(v.vendor)}>
              <span><em>{v.vendor}</em></span>
              <strong>{money(v.potential)}</strong>
              <span className="wk-bars-track"><i style={{ width: `${Math.max(2, (v.potential / biggest) * 100)}%` }} /></span>
              <small>{v.caseCount} {plural(v.caseCount, 'finding')} · {v.recordCount} {plural(v.recordCount, 'payment')}</small>
            </button>
          ))}
        </div>
      )
      return (
        <section className="wk-panelcard" aria-labelledby="ov-vendors" key="vendors">
          <div className="wk-panelcard-head">
            <div>
              <h2 id="ov-vendors">Top vendors</h2>
              <p>Most money still in play</p>
            </div>
          </div>
          {entitlements.limits.advancedReports ? body : <Locked title="Vendor breakdowns are part of Pro" note="Every vendor, with its findings and money in play.">{body}</Locked>}
        </section>
      )
    },

    activity: () => (
      <section className="wk-panelcard" aria-labelledby="ov-activity" key="activity">
        <div className="wk-panelcard-head">
          <div>
            <h2 id="ov-activity">Recent activity</h2>
            <p>Decisions, requests and money back on this audit</p>
          </div>
        </div>
        <div className="wk-panelcard-body">
          {events.length ? (
            <ul className="wk-feed">
              {events.map(({ event, finding }, index) => {
                const { icon: Icon, tone } = eventIcon(event)
                return (
                  <li key={`${finding.id}-${event.at}-${index}`}>
                    <span className="wk-feed-icon" data-tone={tone}><Icon aria-hidden="true" /></span>
                    <span className="wk-feed-text">
                      <button type="button" onClick={() => onOpenCase(finding.id)}>{finding.vendor}</button> · {event.summary}
                      {event.amount != null ? ` · ${money(event.amount)}` : ''}
                      <small>{event.actor ? `By ${event.actor}` : 'In this browser'}{event.note ? ` · ${event.note}` : ''}</small>
                    </span>
                    <time dateTime={new Date(event.at).toISOString()}>{ago(event.at, now)}</time>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="wk-feed-empty">Nothing yet. When you review a finding, it shows up here.</p>
          )}
        </div>
      </section>
    ),
  }

  // Keep the viewer's order, but split into the two columns the layout has room for.
  const mainIds = shown.filter((id) => wide.includes(id))
  const sideIds = shown.filter((id) => side.includes(id))
  const totalsShown = shown.includes('totals')
  const totalsFirst = totalsShown && shown.indexOf('totals') <= Math.min(...[...mainIds, ...sideIds].map((id) => shown.indexOf(id)), Infinity)

  return (
    <div className="wk-ov" data-potential={l.potential} data-open-findings={l.counts.potential}>
      <header className="wk-head">
        <div className="wk-head-copy">
          <div className="wk-head-meta">
            <span>{source?.mode === 'sample' ? 'Sample data' : source?.sourceLabel ?? 'Payment ledger'}</span>
            <span>{env.records.length} payments</span>
            <span>{vendorCount} vendors</span>
            {range ? <span>{range}</span> : null}
          </div>
          <h1>Overview</h1>
          <p>
            {l.counts.potential === 0
              ? `Every check ran against ${auditLabel} and nothing is still open.`
              : <>{l.counts.potential} open {plural(l.counts.potential, 'finding')} worth {money(l.potential)} in {auditLabel}. {l.verified > 0 ? <>{money(l.verified)} of it is supported by the records and ready to claim.</> : null}</>}
          </p>
        </div>
        <div className="wk-head-actions">
          {leadTask ? (
            <button type="button" className="wk-btn" data-variant="primary" onClick={() => onOpenCase(leadTask.o.finding.id)}>
              {leadTask.action.label} · {leadTask.o.finding.vendor} <ArrowRight aria-hidden="true" />
            </button>
          ) : firstOpenable ? (
            <button type="button" className="wk-btn" data-variant="primary" onClick={() => onOpenCase(firstOpenable.finding.id)}>
              Review next finding <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      {totalsFirst ? sections.totals() : null}
      {mainIds.length || sideIds.length ? (
        <div className="wk-ov-grid" data-single={!mainIds.length || !sideIds.length || undefined}>
          {mainIds.length ? <div className="wk-ov-col">{mainIds.map((id) => sections[id]())}</div> : null}
          {sideIds.length ? <div className="wk-ov-col">{sideIds.map((id) => sections[id]())}</div> : null}
        </div>
      ) : null}
      {totalsShown && !totalsFirst ? sections.totals() : null}

      <p className="wk-disclaimer"><Info aria-hidden="true" />Amounts are what the records support, not confirmed refunds. Only Recovered counts money that actually came back.</p>
    </div>
  )
}

