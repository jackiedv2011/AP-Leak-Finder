import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { OverviewSummary, CaseView } from '@/ledger/views'
import type { DecisionValue } from '@/ledger/caseState'
import { formatCurrency, formatDate } from '@/lib/format'
import { QUEUE_GROUP_LABEL, queueGroupFor } from '@/ledger/caseState'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { FindingCase } from '@/components/audit/FindingCase'
import { MOTION_SPRING } from '@/motion/system'
import { useMeaningfulReveal } from '@/motion/useMeaningfulReveal'

const DONUT_CIRCUMFERENCE = 2 * Math.PI * 42

function CaseMixDonut({ summary }: { summary: OverviewSummary }) {
  const total = summary.statusMix.reduce((sum, item) => sum + item.count, 0)
  let offset = 0

  return (
    <div
      className="audit-summary-donut"
      aria-label={`Open case mix: ${summary.readyToVerifyCount} ready to verify, ${summary.needsContextCount} needing context, and ${summary.worthNotingCount} worth noting.`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="audit-summary-donut-track" cx="50" cy="50" r="42" />
        {total > 0 &&
          summary.statusMix.map((item) => {
            const length = Math.max((item.count / total) * DONUT_CIRCUMFERENCE - 3, 0)
            const segment = (
              <circle
                className="audit-summary-donut-segment"
                data-group={item.group}
                cx="50"
                cy="50"
                key={item.group}
                r="42"
                style={{
                  '--segment-length': length,
                  '--segment-total': DONUT_CIRCUMFERENCE,
                  '--segment-offset': -offset,
                  strokeDasharray: `${length} ${DONUT_CIRCUMFERENCE}`,
                  strokeDashoffset: -offset,
                } as CSSProperties}
              />
            )
            offset += (item.count / total) * DONUT_CIRCUMFERENCE
            return segment
          })}
      </svg>
      <div>
        <strong>{total}</strong>
        <span>open cases</span>
      </div>
    </div>
  )
}

interface OverviewViewProps {
  summary: OverviewSummary
  activeCase?: CaseView | null
  draftOpen?: boolean
  onOpenCase: (findingId: string) => void
  onCloseCase?: () => void
  onOpenDraft?: () => void
  onDecide?: (findingId: string, value: DecisionValue, reason: string | null) => void
  onAdvanceStage?: (findingId: string) => void
  onDraftChange?: (findingId: string, text: string) => void
  onOpenImport: () => void
  onClearLedger: () => void
}

/** Overview lens: the standing ledger, compressed into the next useful move. */
export function OverviewView({
  summary,
  activeCase = null,
  draftOpen = false,
  onOpenCase,
  onCloseCase,
  onOpenDraft,
  onDecide,
  onAdvanceStage,
  onDraftChange,
  onOpenImport,
  onClearLedger,
}: OverviewViewProps) {
  const hasActiveWork = summary.readyToVerifyCount + summary.needsContextCount + summary.worthNotingCount > 0
  const reduceMotion = useReducedMotion()
  const recommended = summary.nextRecommendedCase
  const previewRecords = recommended?.finding.relatedRecords.slice(0, 2) ?? []
  const openCaseCount = summary.statusMix.reduce((sum, item) => sum + item.count, 0)
  const largestExposure = summary.exposureByType[0]?.dollarImpact ?? 0
  const OverviewTitle = activeCase ? 'p' : 'h1'
  const revealSignature = [
    summary.recordCount,
    summary.totalFindingCount,
    summary.worthInvestigatingTotal,
    summary.recoveryActiveCount,
    summary.recoveryActiveValue,
  ].join(':')
  const revealData = useMeaningfulReveal('overview', revealSignature)

  return (
    <div className="audit-workspace audit-overview" data-case-open={Boolean(activeCase)}>
      <header className="audit-overview-hero">
        <div className="audit-overview-heading">
          <span>Standing ledger</span>
          <OverviewTitle className="audit-overview-title">
            {hasActiveWork ? 'Your payment recovery, summarized.' : 'Your ledger is current.'}
          </OverviewTitle>
          <p>
            {summary.recordCount} records across {summary.vendorCount} vendors. Reclaim keeps the evidence and the next decision in the same view.
          </p>
        </div>

        <div className="audit-overview-total" data-tone={hasActiveWork ? 'recovery' : 'quiet'} data-motion-value>
          <span>{hasActiveWork ? 'Open exposure' : 'Open recovery value'}</span>
          <strong>{formatCurrency(hasActiveWork ? summary.worthInvestigatingTotal : 0)}</strong>
          <small>
            {openCaseCount} case{openCaseCount === 1 ? '' : 's'} awaiting a decision
          </small>
          {summary.recoveryActiveCount > 0 && (
            <div className="audit-overview-total-secondary">
              <span>Already in recovery</span>
              <strong>{formatCurrency(summary.recoveryActiveValue)}</strong>
            </div>
          )}
        </div>
      </header>

      {!activeCase && hasActiveWork && (
        <section className="audit-summary-grid" data-reveal={revealData} aria-label="Ledger summary">
          <div className="audit-summary-panel audit-summary-mix">
            <div className="audit-summary-panel-heading">
              <div>
                <span>Open case mix</span>
                <h2>What needs your attention</h2>
              </div>
              <p>Cases by readiness, not confidence.</p>
            </div>
            <div className="audit-summary-mix-body">
              <CaseMixDonut summary={summary} />
              <div className="audit-summary-legend">
                {summary.statusMix.map((item) => (
                  <div data-group={item.group} key={item.group}>
                    <span className="audit-summary-key" aria-hidden="true" />
                    <p>{QUEUE_GROUP_LABEL[item.group]}</p>
                    <strong>{item.count}</strong>
                    <small>{formatCurrency(item.dollarImpact)}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="audit-summary-panel audit-summary-exposure">
            <div className="audit-summary-panel-heading">
              <div>
                <span>Exposure by signal</span>
                <h2>Where the value is concentrated</h2>
              </div>
              <p>Open cases only.</p>
            </div>
            <ol>
              {summary.exposureByType.map((item) => (
                <li key={item.type}>
                  <div>
                    <span>{FINDING_TYPE_LABELS[item.type]}</span>
                    <strong>{formatCurrency(item.dollarImpact)}</strong>
                  </div>
                  <i aria-hidden="true">
                    <b
                      style={{
                        width: `${largestExposure > 0 ? (item.dollarImpact / largestExposure) * 100 : 0}%`,
                      }}
                    />
                  </i>
                  <small>{item.count} open case{item.count === 1 ? '' : 's'}</small>
                </li>
              ))}
            </ol>
          </div>

          <div className="audit-summary-panel audit-summary-pipeline">
            <div className="audit-summary-panel-heading">
              <div>
                <span>Recovery pipeline</span>
                <h2>From ledger to action</h2>
              </div>
              <p>{summary.newSinceLastVisitCount > 0 ? `${summary.newSinceLastVisitCount} new since your last visit` : 'Every case stays linked to its source rows.'}</p>
            </div>
            <div className="audit-summary-stages">
              <div>
                <strong>{summary.recordCount}</strong>
                <span>Records checked</span>
              </div>
              <div>
                <strong>{summary.totalFindingCount}</strong>
                <span>Signals surfaced</span>
              </div>
              <div data-emphasis="true">
                <strong>{summary.readyToVerifyCount}</strong>
                <span>Ready to verify</span>
              </div>
              <div data-emphasis={summary.recoveryActiveCount > 0}>
                <strong>{summary.recoveryActiveCount}</strong>
                <span>In recovery</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <AnimatePresence mode="popLayout" initial={false}>
        {activeCase && onCloseCase && onOpenDraft && onDecide && onAdvanceStage && onDraftChange ? (
          <FindingCase
            key={activeCase.finding.id}
            finding={activeCase.finding}
            state={activeCase.state}
            isNew={activeCase.isNew}
            draftOpen={draftOpen}
            onOpenDraft={onOpenDraft}
            onDecide={onDecide}
            onAdvanceStage={onAdvanceStage}
            onDraftChange={onDraftChange}
            embedded
          />
        ) : recommended ? (
          <section className="audit-recommended" key="recommended">
            <div className="audit-recommended-intro">
              <span>Recommended next</span>
              <p>The clearest evidence and the largest recoverable amount rise first.</p>
            </div>

            <motion.button
              type="button"
              className="audit-recommended-object"
              data-motion="pressable"
              data-motion-ray="true"
              data-motion-arrow="true"
              layoutId={`finding-${recommended.finding.id}`}
              transition={reduceMotion ? { duration: 0 } : MOTION_SPRING.shared}
              onClick={() => onOpenCase(recommended.finding.id)}
              aria-label={`Review evidence for ${recommended.finding.title}`}
            >
              <div className="audit-recommended-summary">
                <span className="audit-status-chip" data-class={recommended.finding.class}>
                  {QUEUE_GROUP_LABEL[queueGroupFor(recommended.finding, recommended.state)]}
                </span>
                <span className="audit-recommended-title">{recommended.finding.title}</span>
                <p>{recommended.finding.vendor}</p>
              </div>

              <div className="audit-recommended-evidence" aria-hidden="true">
                {previewRecords.map((record, index) => (
                  <div key={record.id}>
                    <span>Payment {index === 0 ? 'A' : 'B'}</span>
                    <strong>{record.invoiceNumber ?? 'No invoice'}</strong>
                    <small>{formatDate(record.paymentDate)}</small>
                  </div>
                ))}
                <i>Matched vendor, invoice, and amount</i>
              </div>

              <div className="audit-recommended-impact">
                <span>Potential recovery</span>
                <strong>{formatCurrency(recommended.finding.dollarImpact)}</strong>
                <span className="audit-recommended-open">
                  Review evidence
                  <ArrowRight aria-hidden="true" />
                </span>
              </div>
            </motion.button>
          </section>
        ) : (
          <div className="audit-empty-state" key="empty">
            <h2>No open issues right now</h2>
            <p>Reclaim checked the full standing ledger and found nothing that still needs a decision.</p>
          </div>
        )}
      </AnimatePresence>

      {!activeCase && (
        <footer className="audit-overview-footer">
          <button type="button" className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" onClick={onOpenImport}>
            <Plus aria-hidden="true" />
            Add records
          </button>
          <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" onClick={onClearLedger}>
            <Trash2 aria-hidden="true" />
            Clear ledger
          </button>
          {summary.recoveryActiveCount > 0 && (
            <span>
              {summary.recoveryActiveCount} case{summary.recoveryActiveCount === 1 ? '' : 's'} moving through recovery
            </span>
          )}
        </footer>
      )}
    </div>
  )
}
