import { ArrowRight, Lock, Sparkles } from 'lucide-react'
import type { FindingsQueueGroup } from '@/ledger/views'
import type { Entitlement, LockedSummary } from '@/billing/entitlement'
import { isUnlocked } from '@/billing/entitlement'
import { QUEUE_GROUP_LABEL, QUEUE_GROUP_SUBTEXT } from '@/ledger/caseState'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { formatCurrency } from '@/lib/format'

interface FindingsViewProps {
  queue: FindingsQueueGroup[]
  entitlement: Entitlement
  locked: LockedSummary
  onOpenCase: (findingId: string) => void
  onUpgrade: () => void
}

/**
 * Money found — every open issue as a scannable row, grouped by what it asks
 * of the reader.
 *
 * The previous version hid everything behind collapsed accordions, so the free
 * findings and the locked ones were both invisible until you clicked. Rows are
 * always open now: the whole point is that you can see what exists.
 */
export function FindingsView({ queue, entitlement, locked, onOpenCase, onUpgrade }: FindingsViewProps) {
  const totalCases = queue.reduce((sum, group) => sum + group.cases.length, 0)
  const showPaywall = entitlement.plan === 'free' && locked.lockedCount > 0

  if (totalCases === 0) {
    return (
      <div className="rc-view">
        <header className="rc-page-head">
          <div>
            <span className="rc-eyebrow">Money found</span>
            <h1>Nothing open right now</h1>
            <p>Every issue in this ledger has been decided, or none were found.</p>
          </div>
        </header>
        <div className="rc-empty">
          <h2>All clear</h2>
          <p>Add more records and Reclaim will check them against everything already here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rc-view">
      <header className="rc-page-head">
        <div>
          <span className="rc-eyebrow">Money found</span>
          <h1>
            {totalCases} issue{totalCases === 1 ? '' : 's'} to <em>decide on.</em>
          </h1>
          <p>Each one links back to the exact rows in your own file. Open one to see the evidence.</p>
        </div>
      </header>

      {showPaywall && (
        <section className="rc-gate" aria-labelledby="rc-gate-findings">
          <div className="rc-gate-bar">
            <span className="rc-gate-bar-open" style={{ flex: Math.max(locked.unlockedValue, 1) }} />
            <span className="rc-gate-bar-locked" style={{ flex: Math.max(locked.lockedValue, 1) }} />
          </div>
          <div className="rc-gate-body">
            <div>
              <span className="rc-eyebrow">You're on the free preview</span>
              <h2 id="rc-gate-findings">
                {locked.unlockedCount} open, <em>{locked.lockedCount} hidden.</em>
              </h2>
              <p>
                The open ones are the smallest amounts we found — enough to check our work. The hidden ones are worth{' '}
                <strong>{formatCurrency(locked.lockedValue)}</strong>.
              </p>
            </div>
            <div className="rc-gate-action">
              <button type="button" className="rc-btn" data-variant="mint" onClick={onUpgrade}>
                <Sparkles aria-hidden="true" />
                Unlock all {locked.lockedCount}
              </button>
              <small>$149/month · cancel anytime</small>
            </div>
          </div>
        </section>
      )}

      <div className="rc-findings">
        {queue
          .filter((group) => group.cases.length > 0)
          .map((group) => {
            const groupTotal = group.cases.reduce((sum, { finding }) => sum + finding.dollarImpact, 0)

            return (
              <section className="rc-findings-group" data-group={group.group} key={group.group}>
                <header className="rc-findings-group-head">
                  <div>
                    <h2>
                      <span className="rc-findings-key" aria-hidden="true" />
                      {QUEUE_GROUP_LABEL[group.group]}
                    </h2>
                    <p>{QUEUE_GROUP_SUBTEXT[group.group]}</p>
                  </div>
                  <div className="rc-findings-group-total">
                    <strong>{formatCurrency(groupTotal)}</strong>
                    <span>
                      {group.cases.length} issue{group.cases.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </header>

                <ul className="rc-rowlist">
                  {group.cases.map(({ finding, isNew }) => {
                    const unlocked = isUnlocked(entitlement, finding.id)
                    return (
                      <li key={finding.id}>
                        <button
                          type="button"
                          className="rc-row"
                          data-locked={!unlocked}
                          onClick={() => (unlocked ? onOpenCase(finding.id) : onUpgrade())}
                          aria-label={
                            unlocked
                              ? `Review ${finding.title}`
                              : `${FINDING_TYPE_LABELS[finding.type]} — locked finding. Subscribe to unlock.`
                          }
                        >
                          <span className="rc-row-type">{FINDING_TYPE_LABELS[finding.type]}</span>

                          <span className="rc-row-main">
                            {unlocked ? (
                              <>
                                <span className="rc-row-vendor">
                                  {finding.vendor}
                                  {isNew && (
                                    <span className="rc-chip" data-tone="new">
                                      New
                                    </span>
                                  )}
                                </span>
                                <span className="rc-row-title">{finding.title}</span>
                              </>
                            ) : (
                              <span className="rc-row-title rc-row-title-locked">Which vendor, and why — unlocks with a subscription</span>
                            )}
                          </span>

                          <span className="rc-row-amount" data-locked={!unlocked}>
                            {formatCurrency(finding.dollarImpact)}
                          </span>

                          <span className="rc-row-cta">
                            {unlocked ? (
                              <>
                                Open <ArrowRight aria-hidden="true" />
                              </>
                            ) : (
                              <>
                                <Lock aria-hidden="true" /> Unlock
                              </>
                            )}
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
