import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import type { OverviewSummary, CaseView } from '@/ledger/views'
import type { DecisionValue } from '@/ledger/caseState'
import { formatCurrency, formatDate } from '@/lib/format'
import { QUEUE_GROUP_LABEL, queueGroupFor } from '@/ledger/caseState'
import { FindingCase } from '@/components/audit/FindingCase'

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
  const OverviewTitle = activeCase ? 'p' : 'h1'

  return (
    <div className="audit-workspace audit-overview" data-case-open={Boolean(activeCase)}>
      <header className="audit-overview-hero">
        <div className="audit-overview-heading">
          <span>Standing ledger</span>
          <OverviewTitle className="audit-overview-title">
            {hasActiveWork ? 'Your next recovery is already in the records.' : 'Your ledger is current.'}
          </OverviewTitle>
          <p>
            {summary.recordCount} records across {summary.vendorCount} vendors, kept as one continuous evidence trail.
          </p>
        </div>

        <div className="audit-overview-total" data-tone={hasActiveWork ? 'recovery' : 'quiet'}>
          <span>{hasActiveWork ? 'Worth investigating' : 'Open recovery value'}</span>
          <strong>{formatCurrency(hasActiveWork ? summary.worthInvestigatingTotal : 0)}</strong>
          <small>
            {summary.importCount} import{summary.importCount === 1 ? '' : 's'}
            {summary.dateRangeLabel ? ` / ${summary.dateRangeLabel}` : ''}
          </small>
        </div>
      </header>

      {!activeCase && hasActiveWork && (
        <div className="audit-overview-signals" aria-label="Finding readiness">
          <div data-class="recoverable">
            <strong>{summary.readyToVerifyCount}</strong>
            <span>Ready to verify</span>
          </div>
          <div data-class="review">
            <strong>{summary.needsContextCount}</strong>
            <span>Need context</span>
          </div>
          <div data-class="opportunity">
            <strong>{summary.worthNotingCount}</strong>
            <span>Worth noting</span>
          </div>
          <p>
            {summary.newSinceLastVisitCount > 0
              ? `${summary.newSinceLastVisitCount} new since your last visit`
              : 'Every open case remains attached to its source rows'}
          </p>
        </div>
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
              layoutId={`finding-${recommended.finding.id}`}
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.42 }}
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
          <button type="button" className="audit-btn" data-variant="primary" onClick={onOpenImport}>
            <Plus aria-hidden="true" />
            Add records
          </button>
          <button type="button" className="audit-btn" data-variant="ghost" onClick={onClearLedger}>
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
