import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import type { LedgerEnvironment } from '@/ledger/store'
import { EVIDENCE_LABEL, ladder, opportunities, rootCauses, type Opportunity } from '../selectors'
import { SCREEN_OBJECT } from '../objects'
import { WorkObject } from '../WorkObject'

interface OverviewProps {
  env: LedgerEnvironment
  onOpenCase: (findingId: string) => void
  onSeeAll: () => void
}

/** Evidence strength as three filled rules — §12, never a percentage. */
export function Strength({ level }: { level: Opportunity['evidence'] }) {
  return (
    <span className="wk-strength" data-level={level}>
      <span className="wk-strength-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{EVIDENCE_LABEL[level]}</span>
    </span>
  )
}

interface RungProps {
  label: string
  value: number
  note: string
  /** This rung's share of Potential, 0–1 — the one scale all four are read on. */
  share: number
  /** Money confirmed for this rung but not in it yet. Same scale, drawn after. */
  queued?: number
  /** The deepest rung money has actually reached. */
  frontier?: boolean
  /** Past the frontier: nothing has got this far. */
  unreached?: boolean
  terminal?: boolean
  action?: ReactNode
}

/** A bar can round a figure into nothing, so a real amount always keeps a mark. */
function width(share: number): string {
  if (share <= 0) return '0%'
  return `${Math.max(1.5, Math.min(100, share * 100))}%`
}

function Rung({ label, value, note, share, queued = 0, frontier, unreached, terminal, action }: RungProps) {
  return (
    <div
      data-terminal={terminal || undefined}
      data-frontier={frontier || undefined}
      data-unreached={unreached || undefined}
    >
      <div className="wk-rung-figure">
        <span className="wk-label">{label}</span>
        <span className="wk-display wk-figure">{formatCurrency(value)}</span>
      </div>
      <div className="wk-rung-meter">
        <div className="wk-rung-track" aria-hidden="true">
          <i className="wk-rung-fill" style={{ width: width(share) }} />
          {/* Drawn from where the fill stops, not from the origin: it reads as
              "this much more is queued behind it", which is what it is. */}
          {queued > 0 ? (
            <i className="wk-rung-queued" style={{ left: width(share), width: width(queued) }} />
          ) : null}
        </div>
        <p className="wk-ladder-note">{note}</p>
        {action}
      </div>
    </div>
  )
}

export function Overview({ env, onOpenCase, onSeeAll }: OverviewProps) {
  const l = ladder(env)
  const causes = rootCauses(env)
  const top = opportunities(env).slice(0, 5)
  const biggestCause = causes[0]?.value ?? 1

  // Every rung is measured against Potential. That is the only relationship
  // the bars claim: not that the rungs nest (`inRecovery` and `recovered` are
  // disjoint stages, so they don't) and not that they sum (§3 — they never do).
  const scale = l.potential > 0 ? l.potential : 1
  const share = (value: number) => value / scale

  // Where the money has actually got to: the deepest rung carrying anything.
  // Everything past it is demoted rather than given equal weight to a figure
  // twenty thousand dollars larger.
  const reached = [l.potential, l.verified, l.inRecovery, l.recovered]
  const frontier = reached.reduce((deepest, value, index) => (value > 0 ? index : deepest), -1)

  return (
    <>
      {/* §3 — the rungs sit side by side and are never added together. */}
      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Where the money stands</h2>
          <span className="wk-label">{l.counts.potential} cases</span>
        </div>
        {/* The object stands beside the rungs rather than above them: it is the
            largest thing on the screen, and the rungs are the most important,
            so they occupy the same row and neither pushes the other down. */}
        <div className="wk-overview-top">
          <div className="wk-ladder">
            <Rung
              label="Potential"
              value={l.potential}
              share={share(l.potential)}
              frontier={frontier === 0}
              note={`${l.counts.potential} ${plural(l.counts.potential, 'case')} the checks surfaced, before anyone judged them.`}
            />
            <Rung
              label="Verified"
              value={l.verified}
              share={share(l.verified)}
              frontier={frontier === 1}
              unreached={frontier < 1}
              note={
                l.awaitingDecision > 0
                  ? `${l.counts.verified} where the records support a claim. ${formatCurrency(l.awaitingDecision)} of that is undecided — nothing reaches a vendor until you approve it.`
                  : `${l.counts.verified} where the records support a claim. Every one has a decision on it.`
              }
              // §28 answered on the rung it belongs to: one number, one door.
              // As a separate card it restated a figure already on this screen.
              action={
                l.awaitingDecision > 0 && top[0] ? (
                  <div>
                    <button
                      type="button"
                      className="wk-btn"
                      data-variant="primary"
                      data-size="sm"
                      onClick={() => onOpenCase(top[0].finding.id)}
                    >
                      Review {top[0].finding.vendor}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                ) : null
              }
            />
            <Rung
              label="In recovery"
              value={l.inRecovery}
              share={share(l.inRecovery)}
              queued={share(l.readyToSend)}
              frontier={frontier === 2}
              unreached={frontier < 2}
              note={
                l.counts.inRecovery > 0
                  ? `${l.counts.inRecovery} ${plural(l.counts.inRecovery, 'request is', 'requests are')} out with vendors.`
                  : l.readyToSend > 0
                    ? `Nothing sent yet. ${formatCurrency(l.readyToSend)} is confirmed and ready to go.`
                    : 'Nothing has been sent yet.'
              }
            />
            <Rung
              label="Recovered"
              value={l.recovered}
              share={share(l.recovered)}
              queued={share(l.inRecovery)}
              frontier={frontier === 3}
              unreached={frontier < 3}
              // The accent belongs to money that actually came back. Painting a
              // $0.00 green celebrates nothing and cheapens the one figure on
              // this screen worth trusting.
              terminal={l.recovered > 0}
              note={
                l.counts.recovered > 0
                  ? `${l.counts.recovered} closed with money actually back.`
                  : l.inRecovery > 0
                    ? `Nothing has settled yet. ${formatCurrency(l.inRecovery)} is out with vendors.`
                    : 'Money only counts here once it has actually settled.'
              }
            />
          </div>
          <WorkObject name={SCREEN_OBJECT.overview} height={268} />
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Worth the most, soonest</h2>
          <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onSeeAll}>
            All opportunities
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <table className="wk-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Opportunity</th>
              <th>Evidence</th>
              <th className="wk-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {top.map((o) => (
              <tr key={o.finding.id} onClick={() => onOpenCase(o.finding.id)}>
                <td>
                  <div className="wk-table-vendor">{o.finding.vendor}</div>
                  <div className="wk-table-sub">
                    {o.finding.relatedRecords.length} {o.finding.relatedRecords.length === 1 ? 'record' : 'records'}
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
      </section>

      {/* §25 — why the money left, not just that it did. */}
      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Why it happened</h2>
        </div>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
          {causes.map((cause) => (
            <li key={cause.type}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 7 }}>
                <span style={{ fontSize: 13.5 }}>{cause.label}</span>
                <span className="wk-num wk-dim" style={{ fontSize: 13 }}>
                  {formatCurrency(cause.value)}
                </span>
              </div>
              <div className="wk-bar">
                <i style={{ width: `${Math.max(2, (cause.value / biggestCause) * 100)}%` }} />
              </div>
              <div className="wk-table-sub" style={{ marginTop: 6 }}>
                {cause.count} {cause.count === 1 ? 'case' : 'cases'}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
