import { ArrowRight, Plus } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, opportunities, rootCauses } from '../selectors'
import { lockedSummary } from '../planGates'
import { Locked } from '@/components/plan/Locked'
import { Strength } from './Strength'
import { SCREEN_OBJECT } from '../objects'
import { WorkObject } from '../WorkObject'

interface DashboardProps {
  env: LedgerEnvironment
  /** Finding ids the plan shows in full; others appear blurred. */
  visible: Set<string>
  auditCount: number
  auditLabel: string
  onOpenCase: (findingId: string) => void
  onSeeAllFindings: () => void
  onStartAudit: () => void
}

function findingsTable(rows: ReturnType<typeof opportunities>, onOpenCase: ((id: string) => void) | undefined) {
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
                <div className="wk-table-vendor">{o.finding.vendor}</div>
                <div className="wk-table-sub">
                  {o.finding.relatedRecords.length} {plural(o.finding.relatedRecords.length, 'record')}
                </div>
              </td>
              <td>{o.typeLabel}</td>
              <td>
                <Strength level={o.evidence} />
              </td>
              <td className="wk-right wk-table-money">{formatCurrency(o.finding.dollarImpact)}</td>
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
        <span className="wk-display wk-figure">{value}</span>
      </div>
      <p className="wk-ladder-note">{note}</p>
    </div>
  )
}

/**
 * The first screen after log-in. It answers four things at a glance — how much
 * could come back, how many findings there are, how many audits have run, and
 * what to look at next — and offers one door: start an audit.
 */
export function Dashboard({ env, visible, auditCount, auditLabel, onOpenCase, onSeeAllFindings, onStartAudit }: DashboardProps) {
  const l = ladder(env)
  const causes = rootCauses(env)
  const all = opportunities(env)
  const recent = all.filter((o) => visible.has(o.finding.id)).slice(0, 5)
  const lockedRecent = all.filter((o) => !visible.has(o.finding.id)).slice(0, 3)
  const locked = lockedSummary(all.map((o) => o.finding), visible)
  const biggestCause = causes[0]?.value ?? 1

  // One scale for all three stages: the largest figure on the board. Not a
  // total — `ladder()` keeps the stages disjoint and §3 forbids adding them —
  // just the common denominator that lets three separate bars be compared.
  const scale = Math.max(l.potential, l.verified, l.inRecovery, l.recovered, 1)
  // Where the money has actually got to. Everything past it is demoted rather
  // than given equal weight to a figure thousands of dollars larger.
  const frontier = [l.verified, l.inRecovery, l.recovered].reduce(
    (deepest, value, index) => (value > 0 ? index : deepest),
    -1
  )

  return (
    <>
      <section className="wk-section">
        <div className="wk-ladder">
          <Stat
            label="Potential recovery"
            value={formatCurrency(l.potential)}
            note={`Across ${l.counts.potential} ${plural(l.counts.potential, 'finding')} in ${auditLabel}.`}
          />
          <Stat
            label="Findings"
            value={String(l.counts.potential)}
            note={`${l.counts.verified} ${plural(l.counts.verified, 'is', 'are')} strong enough to claim.`}
          />
          <Stat label="Audits run" value={String(auditCount)} note={auditCount === 1 ? 'One ledger reviewed so far.' : 'Ledgers reviewed in this workspace.'} />
          <Stat
            label="Recovered"
            value={formatCurrency(l.recovered)}
            note={
              l.counts.recovered > 0
                ? `${l.counts.recovered} ${plural(l.counts.recovered, 'case')} closed with money back.`
                : 'Counts only once money has actually settled.'
            }
            accent={l.recovered > 0}
          />
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <span className="wk-label">Next step</span>
            <p style={{ marginTop: 8, fontSize: 15, fontWeight: 500 }}>
              {l.awaitingDecision > 0 ? (
                <>
                  <span className="wk-num wk-accent">{formatCurrency(l.awaitingDecision)}</span> is waiting on your review.
                </>
              ) : l.counts.potential > 0 ? (
                <>Every finding has a decision. Start a new audit to keep going.</>
              ) : (
                <>This ledger came back clean. Start another audit to check more records.</>
              )}
            </p>
            <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>
              Reclaim never contacts a vendor until you confirm a finding is real.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {recent[0] && l.awaitingDecision > 0 ? (
              <button type="button" className="wk-btn" data-variant="primary" onClick={() => onOpenCase(recent[0].finding.id)}>
                Review {recent[0].finding.vendor}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="wk-btn" data-variant="primary" onClick={onStartAudit}>
                <Plus aria-hidden="true" />
                Start an audit
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Recovery pipeline</h2>
          <p>Each figure is a separate stage. They are never added together.</p>
        </div>
        {/* The object stands beside the stages rather than above them: it is
            the largest thing on the screen, and the money is the most
            important, so they share a row and neither pushes the other down. */}
        <div className="wk-dash-pipeline">
          <div className="wk-pipeline">
            <div data-frontier={frontier === 0 || undefined}>
              <span className="wk-label">Verified</span>
              <span className="wk-pipeline-figure">{formatCurrency(l.verified)}</span>
              <Meter value={l.verified} scale={scale} />
              <span className="wk-ladder-note">
                {l.counts.verified} {plural(l.counts.verified, 'finding')} the records support
              </span>
            </div>
            <div data-frontier={frontier === 1 || undefined} data-unreached={frontier < 1 || undefined}>
              <span className="wk-label">In recovery</span>
              <span className="wk-pipeline-figure">{formatCurrency(l.inRecovery)}</span>
              <Meter value={l.inRecovery} scale={scale} />
              <span className="wk-ladder-note">
                {l.counts.inRecovery} {plural(l.counts.inRecovery, 'request')} out with vendors
              </span>
            </div>
            <div
              data-accent={l.recovered > 0 || undefined}
              data-frontier={frontier === 2 || undefined}
              data-unreached={frontier < 2 || undefined}
            >
              <span className="wk-label">Recovered</span>
              <span className="wk-pipeline-figure">{formatCurrency(l.recovered)}</span>
              <Meter value={l.recovered} scale={scale} />
              <span className="wk-ladder-note">
                {l.counts.recovered} {plural(l.counts.recovered, 'case')} settled
              </span>
            </div>
          </div>
          <WorkObject name={SCREEN_OBJECT.dashboard} height={186} />
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Recent findings</h2>
          <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onSeeAllFindings}>
            All findings
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        {recent.length === 0 && lockedRecent.length === 0 ? (
          <div className="wk-empty">
            <span className="wk-label">Nothing flagged</span>
            <p>Every check ran against this ledger and found nothing worth your time.</p>
          </div>
        ) : null}
        {recent.length > 0 ? findingsTable(recent, onOpenCase) : null}
        {lockedRecent.length > 0 ? (
          <div style={{ marginTop: recent.length > 0 ? 14 : 0 }}>
            <Locked
              title={`${locked.count} larger ${locked.count === 1 ? 'finding' : 'findings'} worth ${formatCurrency(locked.value)} are part of Pro`}
              note="Free shows the lowest-value findings in full."
            >
              {findingsTable(lockedRecent, undefined)}
            </Locked>
          </div>
        ) : null}
      </section>

      {causes.length > 0 ? (
        <section className="wk-section">
          <div className="wk-section-head">
            <h2 className="wk-display wk-h2">Where the money went</h2>
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
    </>
  )
}
