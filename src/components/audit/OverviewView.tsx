import { ArrowRight, Lock, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { OverviewSummary, CaseView, ScanReceiptSummary } from '@/ledger/views'
import type { DecisionValue, DismissalTag, RecoveryMethod } from '@/ledger/caseState'
import type { Entitlement, LockedSummary } from '@/billing/entitlement'
import { isUnlocked, recoveryEconomics } from '@/billing/entitlement'
import { formatCurrency } from '@/lib/format'
import { QUEUE_GROUP_LABEL, QUEUE_GROUP_SUBTEXT, queueGroupFor, recoveryStageLabel } from '@/ledger/caseState'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { FindingCase } from '@/components/audit/FindingCase'
import { ScanReceipt } from '@/components/audit/ScanReceipt'

interface OverviewViewProps {
  summary: OverviewSummary
  receipt: ScanReceiptSummary | null
  entitlement: Entitlement
  locked: LockedSummary
  onUpgrade: () => void
  activeCase?: CaseView | null
  draftOpen?: boolean
  onOpenCase: (findingId: string) => void
  onCloseCase?: () => void
  onOpenDraft?: () => void
  onCloseDraft?: () => void
  onDecide?: (findingId: string, value: DecisionValue, reason: string | null) => void
  onDismiss?: (findingId: string, tag: DismissalTag, reason: string | null) => void
  onUpdateRequestedEvidence?: (findingId: string, requestedEvidence: string[], reason: string | null) => void
  onPackageChange?: (findingId: string, update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod }) => void
  onMarkRequested?: (findingId: string, recoveryPackage: { subject: string; body: string; recipientEmail?: string; requestedResolution: RecoveryMethod }) => void
  onRecordOutcome?: (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null) => void
  onOpenImport: () => void
  onClearLedger: () => void
  onGoToFindings: () => void
}

/**
 * Dashboard: the money, then the single next action, then the breakdown.
 *
 * The previous version led with a donut of internal readiness buckets — a chart
 * about Reclaim's own classification. This leads with the number the business
 * came for and the one case to open next.
 */
export function OverviewView({
  summary,
  receipt,
  entitlement,
  locked,
  onUpgrade,
  activeCase = null,
  draftOpen = false,
  onOpenCase,
  onCloseCase,
  onOpenDraft,
  onCloseDraft,
  onDecide,
  onDismiss,
  onUpdateRequestedEvidence,
  onPackageChange,
  onMarkRequested,
  onRecordOutcome,
  onOpenImport,
  onClearLedger,
  onGoToFindings,
}: OverviewViewProps) {
  if (activeCase && onCloseCase && onOpenDraft && onDecide && onPackageChange && onMarkRequested && onRecordOutcome) {
    return (
      <FindingCase
        key={activeCase.finding.id}
        finding={activeCase.finding}
        state={activeCase.state}
        isNew={activeCase.isNew}
        draftOpen={draftOpen}
        onOpenDraft={onOpenDraft}
        onCloseDraft={onCloseDraft}
        onDecide={onDecide}
        onDismiss={onDismiss}
        onUpdateRequestedEvidence={onUpdateRequestedEvidence}
        onPackageChange={onPackageChange}
        onMarkRequested={onMarkRequested}
        onRecordOutcome={onRecordOutcome}
        embedded
      />
    )
  }

  const openCaseCount = summary.statusMix.reduce((sum, item) => sum + item.count, 0)
  const hasOpenFindings = openCaseCount > 0
  const showPaywall = entitlement.plan === 'free' && locked.lockedCount > 0
  const recommended = summary.nextRecommendedCase ?? summary.nextRecoveryCase
  const recoveryRecommended = !summary.nextRecommendedCase && Boolean(summary.nextRecoveryCase)
  const recommendedUnlocked = recommended ? isUnlocked(entitlement, recommended.finding.id) : false
  const largestExposure = Math.max(0, ...summary.exposureByType.map((item) => item.dollarImpact))

  // On the free plan the headline must describe only what the reader can
  // actually open, or the number promises access they don't have.
  const visibleTotal = showPaywall ? locked.unlockedValue : summary.worthInvestigatingTotal

  return (
    <div className="rc-view">
      {!activeCase && receipt && <ScanReceipt summary={receipt} entitlement={entitlement} variant="compact" />}
      {/* ── The money, stated once ───────────────────────────────── */}
      <section className="rc-hero">
        <div className="rc-hero-main">
          <span className="rc-eyebrow">
            {summary.lastImportLabel ? `From ${summary.lastImportLabel}` : 'Your ledger'}
          </span>
          <h1>
            {hasOpenFindings ? (
              <>
                We found <em>{formatCurrency(summary.worthInvestigatingTotal)}</em> worth checking.
              </>
            ) : summary.recoveredCount > 0 ? (
              <>
                You've recovered <em>{formatCurrency(summary.recoveredValue)}</em>.
              </>
            ) : (
              <>
                Your ledger is <em>clean.</em>
              </>
            )}
          </h1>
          <p>
            Reclaim read {summary.recordCount} payments across {summary.vendorCount} vendors
            {hasOpenFindings ? ` and flagged ${openCaseCount} worth a decision.` : ' and found nothing outstanding.'}
          </p>

          <div className="rc-hero-actions">
            {hasOpenFindings && (
              <button type="button" className="rc-btn" data-variant="primary" onClick={onGoToFindings}>
                See what we found
                <ArrowRight aria-hidden="true" />
              </button>
            )}
            <button type="button" className="rc-btn" data-variant="outline" onClick={onOpenImport}>
              <Plus aria-hidden="true" />
              Add records
            </button>
          </div>
        </div>

        <dl className="rc-hero-stats">
          <div>
            <dt>Payments read</dt>
            <dd>{summary.recordCount}</dd>
          </div>
          <div>
            <dt>Issues found</dt>
            <dd>{summary.totalFindingCount}</dd>
          </div>
          <div data-tone={summary.recoveryActiveCount > 0 ? 'active' : undefined}>
            <dt>Claims in progress</dt>
            <dd>{summary.recoveryActiveCount}</dd>
            <small>Confirmed and sent to a vendor, waiting on a response.</small>
          </div>
          <div data-tone={summary.recoveredValue > 0 ? 'good' : undefined}>
            <dt>You've kept</dt>
            <dd>{formatCurrency(recoveryEconomics(0, summary.recoveredValue).net)}</dd>
            <small>Money vendors actually paid back, after Reclaim's fee.</small>
          </div>
        </dl>
      </section>

      {/* ── The paywall, impossible to miss ──────────────────────── */}
      {showPaywall && (
        <section className="rc-gate" aria-labelledby="rc-gate-title">
          <div className="rc-gate-bar">
            <span className="rc-gate-bar-open" style={{ flex: Math.max(locked.unlockedValue, 1) }} />
            <span className="rc-gate-bar-locked" style={{ flex: Math.max(locked.lockedValue, 1) }} />
          </div>

          <div className="rc-gate-body">
            <div>
              <span className="rc-eyebrow">You're on the free preview</span>
              <h2 id="rc-gate-title">
                You can see {formatCurrency(visibleTotal)}. We're holding{' '}
                <em>{formatCurrency(locked.lockedValue)}</em> back.
              </h2>
              <p>
                Reclaim found <strong>{locked.lockedCount + locked.unlockedCount} issues</strong> in your ledger. The{' '}
                {locked.unlockedCount} smallest are open right now so you can check our work against your own records —
                including the full evidence and the exact source rows. The other{' '}
                <strong>{locked.lockedCount}</strong>, worth <strong>{formatCurrency(locked.lockedValue)}</strong>, stay
                hidden until you subscribe.
              </p>
            </div>

            <div className="rc-gate-action">
              <div className="rc-gate-figure">
                <span>Hidden from you</span>
                <strong>{formatCurrency(locked.lockedValue)}</strong>
                <small>
                  across {locked.lockedCount} issue{locked.lockedCount === 1 ? '' : 's'}
                </small>
              </div>
              <button type="button" className="rc-btn" data-variant="mint" onClick={onUpgrade}>
                <Sparkles aria-hidden="true" />
                Unlock all {locked.lockedCount}
              </button>
              <small>$149/month · cancel anytime</small>
            </div>
          </div>
        </section>
      )}

      {/* ── The one next action ──────────────────────────────────── */}
      {recommended && (
        <section className="rc-section">
          <div className="rc-section-head">
            <div>
              <h2>Start here</h2>
              <p>
                {recommendedUnlocked
                  ? recoveryRecommended
                    ? 'The claim closest to getting money back.'
                    : 'The clearest evidence and the largest amount, first.'
                  : 'Your highest-value issue is one of the ones we\'re holding back.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="rc-next"
            data-locked={!recommendedUnlocked}
            onClick={() => (recommendedUnlocked ? onOpenCase(recommended.finding.id) : onUpgrade())}
            aria-label={
              recommendedUnlocked
                ? `Review evidence for ${recommended.finding.title}`
                : `${FINDING_TYPE_LABELS[recommended.finding.type]} — locked finding. Subscribe to unlock.`
            }
          >
            <div className="rc-next-body">
              <div className="rc-next-top">
                <span className="rc-card-vendor">
                  {recommendedUnlocked ? recommended.finding.vendor : FINDING_TYPE_LABELS[recommended.finding.type]}
                </span>
                <span className="rc-chip" data-tone={recommendedUnlocked ? undefined : 'locked'}>
                  {recommendedUnlocked
                    ? recoveryRecommended && recommended.state.recoveryStage
                      ? recoveryStageLabel(recommended.state.recoveryStage, recommended.finding.class !== 'recoverable')
                      : QUEUE_GROUP_LABEL[queueGroupFor(recommended.finding, recommended.state)]
                    : 'Locked'}
                </span>
              </div>
              {recommendedUnlocked ? (
                <strong>{recommended.finding.title}</strong>
              ) : (
                <strong className="rc-card-title-lock">Which vendor, and why — unlocks with a subscription</strong>
              )}
              <p>
                {recommendedUnlocked
                  ? QUEUE_GROUP_SUBTEXT[queueGroupFor(recommended.finding, recommended.state)]
                  : 'Subscribe to see the evidence behind this one.'}
              </p>
            </div>

            <div className="rc-next-money">
              <span>{recommended.finding.class === 'opportunity' ? 'Future saving' : 'Worth'}</span>
              <strong className={recommendedUnlocked ? undefined : 'rc-card-amount'}>
                {formatCurrency(recommended.finding.dollarImpact)}
              </strong>
              <span className="rc-next-cta">
                {recommendedUnlocked ? (
                  <>
                    Open case <ArrowRight aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <Lock aria-hidden="true" /> Unlock
                  </>
                )}
              </span>
            </div>
          </button>
        </section>
      )}

      {/* ── Breakdown ─────────────────────────────────────────────── */}
      {hasOpenFindings && (
        <section className="rc-section">
          <div className="rc-section-head">
            <div>
              <h2>What we found</h2>
              <p>The same {summary.totalFindingCount} issues, sliced two ways below: what you'd do next about each one, and which check caught it.</p>
            </div>
          </div>

          <div className="rc-split">
            <div className="rc-panel">
              <h3>By what you'd do next</h3>
              <ul className="rc-groupbars">
                {summary.statusMix
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <li key={item.group} data-group={item.group}>
                      <button type="button" onClick={onGoToFindings}>
                        <span className="rc-groupbars-key" aria-hidden="true" />
                        <div>
                          <strong>{QUEUE_GROUP_LABEL[item.group]}</strong>
                          <small>{QUEUE_GROUP_SUBTEXT[item.group]}</small>
                        </div>
                        <div className="rc-groupbars-money">
                          <b>{formatCurrency(item.dollarImpact)}</b>
                          <small>
                            {item.count} issue{item.count === 1 ? '' : 's'}
                          </small>
                        </div>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="rc-panel">
              <h3>By what went wrong</h3>
              <p className="rc-panel-sub">Every check Reclaim runs against this ledger. A check with no issues still ran — it just found nothing.</p>
              <ul className="rc-typebars">
                {summary.exposureByType.map((item) => (
                  <li key={item.type} data-empty={item.count === 0 ? 'true' : undefined}>
                    <div className="rc-bar-top">
                      <span>{FINDING_TYPE_LABELS[item.type]}</span>
                      <strong>{formatCurrency(item.dollarImpact)}</strong>
                    </div>
                    <i className="rc-bar-track">
                      <b
                        className="rc-bar-fill"
                        style={{ width: `${largestExposure > 0 ? (item.dollarImpact / largestExposure) * 100 : 0}%` }}
                      />
                    </i>
                    <small>
                      {item.count === 0 ? 'No issues found' : `${item.count} issue${item.count === 1 ? '' : 's'}`}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {!hasOpenFindings && (
        <div className="rc-empty">
          <h2>Nothing needs a decision</h2>
          <p>Reclaim checked the whole ledger and found nothing outstanding. Add more records to check again.</p>
        </div>
      )}

      <footer className="rc-view-footer">
        <button type="button" className="rc-btn" data-variant="ghost" onClick={onClearLedger}>
          <Trash2 aria-hidden="true" />
          Clear this ledger
        </button>
      </footer>
    </div>
  )
}
