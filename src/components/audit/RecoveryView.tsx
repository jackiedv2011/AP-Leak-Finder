import { ArrowRight, Info } from 'lucide-react'
import type { RecoveryQueueGroup } from '@/ledger/views'
import type { RecoveryStage } from '@/ledger/caseState'
import { PERFORMANCE_FEE_RATE, recoveryEconomics } from '@/billing/entitlement'
import { formatCurrency } from '@/lib/format'

interface RecoveryViewProps {
  queue: RecoveryQueueGroup[]
  onOpenCase: (findingId: string) => void
}

/** What the business does next at each stage — not what the state machine calls it. */
const STAGE_SUBTEXT: Record<RecoveryStage, string> = {
  confirmed: 'Evidence is ready. Send the request to the vendor.',
  requested: "You've asked. Record what the vendor actually pays or credits.",
  recovered: 'Money confirmed received. Reclaim bills its fee on this amount.',
  not_recovered: 'Closed without money back. No fee is charged on these.',
}

const STAGE_STEP: Record<RecoveryStage, number> = {
  confirmed: 1,
  requested: 2,
  recovered: 3,
  not_recovered: 3,
}

/**
 * Claims — confirmed findings tracked from "ready to send" through to money
 * actually received.
 *
 * Reclaim never touches the money: the refund or credit goes straight from the
 * vendor to the business, and the performance fee is only ever calculated on
 * what the business confirms landed.
 */
export function RecoveryView({ queue, onOpenCase }: RecoveryViewProps) {
  const totalCases = queue.reduce((sum, group) => sum + group.cases.length, 0)

  const byStage = Object.fromEntries(queue.map((group) => [group.stage, group])) as Record<
    RecoveryStage,
    RecoveryQueueGroup | undefined
  >

  const inProgressValue = [byStage.confirmed, byStage.requested].reduce(
    (sum, group) => sum + (group?.cases.reduce((inner, { finding }) => inner + finding.dollarImpact, 0) ?? 0),
    0
  )

  const recoveredCases = byStage.recovered?.cases ?? []
  const recoveredActual = recoveredCases.reduce(
    (sum, { finding, state }) => sum + (state.recoveredAmount ?? finding.dollarImpact),
    0
  )
  const recoveredEstimate = recoveredCases.reduce((sum, { finding }) => sum + finding.dollarImpact, 0)
  const economics = recoveryEconomics(inProgressValue + recoveredEstimate, recoveredActual)

  if (totalCases === 0) {
    return (
      <div className="rc-view">
        <header className="rc-page-head">
          <div>
            <span className="rc-eyebrow">Claims</span>
            <h1>
              Nothing to <em>claim yet.</em>
            </h1>
            <p>Confirm a finding in Money found and it moves here, ready to send to the vendor.</p>
          </div>
        </header>
        <div className="rc-empty">
          <h2>No claims in progress</h2>
          <p>
            Reclaim finds the money and builds the evidence. You send the request and keep whatever comes back —
            Reclaim only bills {Math.round(PERFORMANCE_FEE_RATE * 100)}% of what you actually recover.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rc-view">
      <header className="rc-page-head">
        <div>
          <span className="rc-eyebrow">Claims</span>
          <h1>
            {totalCases} claim{totalCases === 1 ? '' : 's'} <em>in flight.</em>
          </h1>
          <p>You contact the vendor and receive the money directly. Reclaim tracks it and bills only on what lands.</p>
        </div>
      </header>

      {/* ── The money split ────────────────────────────────────────── */}
      <section className="rc-ledgerbar" aria-label="Recovery economics">
        <div className="rc-ledgerbar-row">
          <div>
            <span>In progress</span>
            <strong>{formatCurrency(inProgressValue)}</strong>
            <small>not yet received</small>
          </div>
          <div data-tone="good">
            <span>You've recovered</span>
            <strong>{formatCurrency(economics.recovered)}</strong>
            <small>
              {recoveredEstimate > 0 ? `est. ${formatCurrency(recoveredEstimate)}` : 'confirmed received'}
            </small>
          </div>
          <div>
            <span>Reclaim's fee</span>
            <strong>{formatCurrency(economics.fee)}</strong>
            <small>{Math.round(economics.feeRate * 100)}% of recovered</small>
          </div>
          <div data-tone="net">
            <span>You keep</span>
            <strong>{formatCurrency(economics.net)}</strong>
            <small>after the fee</small>
          </div>
        </div>
        <p className="rc-ledgerbar-note">
          <Info aria-hidden="true" />
          Reclaim never holds your money. Refunds and credits go straight from the vendor to you — the{' '}
          {Math.round(economics.feeRate * 100)}% fee is billed afterwards, and only on recoveries you confirm.
        </p>
      </section>

      {/* ── Pipeline ───────────────────────────────────────────────── */}
      <div className="rc-claims">
        {queue
          .filter((group) => group.cases.length > 0)
          .map((group) => {
            const groupEstimate = group.cases.reduce((sum, { finding }) => sum + finding.dollarImpact, 0)
            const isSettled = group.stage === 'recovered' || group.stage === 'not_recovered'

            return (
              <section className="rc-claims-group" data-stage={group.stage} key={group.stage}>
                <header className="rc-claims-group-head">
                  <div>
                    <h2>
                      <span className="rc-claims-step" aria-hidden="true">
                        {STAGE_STEP[group.stage]}
                      </span>
                      {group.label}
                    </h2>
                    <p>{STAGE_SUBTEXT[group.stage]}</p>
                  </div>
                  <div className="rc-claims-group-total">
                    <strong>{formatCurrency(groupEstimate)}</strong>
                    <span>
                      {group.cases.length} claim{group.cases.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </header>

                <ul className="rc-rowlist">
                  {group.cases.map(({ finding, state }) => {
                    const actual = state.recoveredAmount ?? null
                    return (
                      <li key={finding.id}>
                        <button
                          type="button"
                          className="rc-row rc-row-claim"
                          onClick={() => onOpenCase(finding.id)}
                          aria-label={`Open claim for ${finding.title}`}
                        >
                          <span className="rc-row-main">
                            <span className="rc-row-vendor">{finding.vendor}</span>
                            <span className="rc-row-title">{finding.title}</span>
                          </span>

                          <span className="rc-claim-money">
                            {isSettled && group.stage === 'recovered' ? (
                              <>
                                <b>{formatCurrency(actual ?? finding.dollarImpact)}</b>
                                <small>
                                  {actual !== null && actual !== finding.dollarImpact
                                    ? `est. ${formatCurrency(finding.dollarImpact)}`
                                    : 'as estimated'}
                                </small>
                              </>
                            ) : group.stage === 'not_recovered' ? (
                              <>
                                <b data-muted="true">{formatCurrency(0)}</b>
                                <small>est. {formatCurrency(finding.dollarImpact)}</small>
                              </>
                            ) : (
                              <>
                                <b>{formatCurrency(finding.dollarImpact)}</b>
                                <small>estimated</small>
                              </>
                            )}
                          </span>

                          <span className="rc-row-cta">
                            {group.stage === 'confirmed' ? 'Send request' : isSettled ? 'View' : 'Record outcome'}
                            <ArrowRight aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
      </div>
    </div>
  )
}
