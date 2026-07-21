import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FileText } from 'lucide-react'
import type { Finding } from '@/types'
import { formatCurrency } from '@/lib/format'
import { buildRuleChecklist } from '@/audit/ruleChecklist'
import { buildEvidenceGaps } from '@/audit/evidenceGaps'
import {
  QUEUE_GROUP_LABEL,
  RECOVERY_STAGE_LABEL,
  queueGroupFor,
  type CaseState,
  type DecisionValue,
} from '@/ledger/caseState'
import { EvidenceComparison, type EvidenceFieldKey } from '@/components/audit/EvidenceComparison'
import { RecoveryDraftPanel } from '@/components/audit/RecoveryDraftPanel'

interface FindingCaseProps {
  finding: Finding
  state: CaseState
  isNew: boolean
  draftOpen: boolean
  onOpenDraft: () => void
  onDecide: (findingId: string, value: DecisionValue, reason: string | null) => void
  onAdvanceStage: (findingId: string) => void
  onDraftChange: (findingId: string, text: string) => void
  embedded?: boolean
}

const DUPLICATE_TYPES = new Set<Finding['type']>(['exact_duplicate', 'near_duplicate'])

function confirmLabel(finding: Finding): string {
  return DUPLICATE_TYPES.has(finding.type) ? 'Confirm likely duplicate' : 'Confirm finding'
}

function caseStatusLabel(finding: Finding, state: CaseState): string {
  if (state.recoveryStage) return RECOVERY_STAGE_LABEL[state.recoveryStage]
  return QUEUE_GROUP_LABEL[queueGroupFor(finding, state)]
}

function findingContext(finding: Finding): string {
  const invoice = finding.relatedRecords.find((r) => r.invoiceNumber)?.invoiceNumber
  return invoice ? `${finding.vendor} · Invoice ${invoice}` : finding.vendor
}

const DECISION_CONSEQUENCE: Record<DecisionValue, (finding: Finding) => string> = {
  confirmed: (finding) => `Moves this case to recovery, ready to prepare for the ${formatCurrency(finding.dollarImpact)} at issue.`,
  expected: (finding) => `Resolves this case and removes ${formatCurrency(finding.dollarImpact)} from what's worth investigating.`,
  needs_info: () => 'Keeps this case in Findings and shows what evidence would resolve it.',
}

export function FindingCase({
  finding,
  state,
  isNew,
  draftOpen,
  onOpenDraft,
  onDecide,
  onAdvanceStage,
  onDraftChange,
  embedded = false,
}: FindingCaseProps) {
  const [highlightedField, setHighlightedField] = useState<EvidenceFieldKey | null>(null)
  const [reasonDraft, setReasonDraft] = useState(state.reason ?? '')
  const caseRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    caseRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [finding.id])

  const persistDraft = useCallback(
    (text: string) => onDraftChange(finding.id, text),
    [finding.id, onDraftChange]
  )

  const checklist = buildRuleChecklist(finding)
  const draftActionLabel = finding.class === 'recoverable' ? 'Draft recovery request' : 'Create internal review note'
  const canDraft = state.decision === 'confirmed'

  function pickDecision(value: DecisionValue) {
    setReasonDraft(state.decision === value ? state.reason ?? '' : '')
    onDecide(finding.id, value, state.decision === value ? state.reason : null)
  }

  function commitReason() {
    if (state.decision) onDecide(finding.id, state.decision, reasonDraft.trim() || null)
  }

  return (
    <motion.section
      ref={caseRef}
      className="audit-case"
      data-embedded={embedded}
      layoutId={`finding-${finding.id}`}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.42 }}
    >
      <p className="sr-only" role="status" aria-live="polite">Opened case: {finding.title}</p>
      <header className="audit-case-header">
        <span className="audit-status-chip" data-class={finding.class}>
          {caseStatusLabel(finding, state)}
          {isNew ? ' · New' : ''}
        </span>
        <h1>{finding.title}</h1>
        <p className="audit-case-context">{findingContext(finding)}</p>
        <p className="audit-case-sentence">{finding.explanation}</p>
        <div className="audit-case-headline-row">
          <span className="audit-case-amount" style={{ color: finding.class === 'recoverable' ? 'var(--recovery)' : finding.class === 'review' ? 'var(--review)' : 'var(--future)' }}>
            {formatCurrency(finding.dollarImpact)}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.78rem' }}>
            {finding.class === 'opportunity' ? 'future savings' : 'potential recovery'}
          </span>
        </div>
      </header>

      <div className="audit-case-body" data-draft-open={draftOpen}>
        <div className="audit-case-column">
          <div className="audit-panel">
            <h2>Evidence</h2>
            <p className="audit-panel-hint">The records behind this finding, aligned side by side.</p>
            <EvidenceComparison records={finding.relatedRecords} highlightedField={highlightedField} />

            <details className="audit-provenance">
              <summary>Source details</summary>
              <div className="audit-provenance-table">
                {finding.relatedRecords.map((record) => (
                  <div className="audit-provenance-row" key={record.id}>
                    <span>
                      Source row
                      <strong>{record.rowIndex + 1}</strong>
                    </span>
                    <span>
                      Vendor on file
                      <strong>{record.vendor}</strong>
                    </span>
                    <span>
                      Invoice on file
                      <strong>{record.invoiceNumber ?? '—'}</strong>
                    </span>
                    <span>
                      Category
                      <strong>{record.category ?? '—'}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div className="audit-panel">
            <h2>Why this was flagged</h2>
            <p className="audit-panel-hint">Plain-language rule breakdown — not a confidence score.</p>
            <ul className="audit-rule-checklist">
              {checklist.map((check) => (
                <li key={check.label} data-matched={check.matched}>
                  <span className="audit-rule-mark" aria-hidden="true">
                    {check.matched ? '✓' : '○'}
                  </span>
                  {check.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="audit-panel">
            <h2>Your decision</h2>
            <p className="audit-panel-hint">Reclaim surfaces the evidence — you decide what happens next.</p>
            <div className="audit-decision-row" role="group" aria-label="Review decision">
              <div className="audit-decision-option">
                <button
                  type="button"
                  className="audit-decision-btn"
                  data-selected={state.decision === 'confirmed'}
                  aria-pressed={state.decision === 'confirmed'}
                  onClick={() => pickDecision('confirmed')}
                >
                  {confirmLabel(finding)}
                </button>
                <p className="audit-decision-consequence">{DECISION_CONSEQUENCE.confirmed(finding)}</p>
              </div>
              <div className="audit-decision-option">
                <button
                  type="button"
                  className="audit-decision-btn"
                  data-selected={state.decision === 'needs_info'}
                  aria-pressed={state.decision === 'needs_info'}
                  onClick={() => pickDecision('needs_info')}
                >
                  Needs more information
                </button>
                <p className="audit-decision-consequence">{DECISION_CONSEQUENCE.needs_info(finding)}</p>
              </div>
              <div className="audit-decision-option">
                <button
                  type="button"
                  className="audit-decision-btn"
                  data-selected={state.decision === 'expected'}
                  aria-pressed={state.decision === 'expected'}
                  onClick={() => pickDecision('expected')}
                >
                  Mark as expected
                </button>
                <p className="audit-decision-consequence">{DECISION_CONSEQUENCE.expected(finding)}</p>
              </div>
            </div>

            {state.decision && (
              <div className="audit-decision-reason">
                <label htmlFor="audit-decision-note" className="audit-decision-reason-label">
                  Reason (optional)
                </label>
                <textarea
                  id="audit-decision-note"
                  className="audit-decision-note"
                  placeholder="Add a short reason…"
                  name="decision-note"
                  autoComplete="off"
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  onBlur={commitReason}
                />
                <p className="audit-decision-status" role="status" aria-live="polite">
                  {caseStatusLabel(finding, state)}
                </p>
              </div>
            )}

            {state.decision === 'needs_info' && (
              <div className="audit-evidence-gaps">
                <h3>What would resolve this case</h3>
                {buildEvidenceGaps(finding).map((gap) => (
                  <div className="audit-evidence-gap" data-source={gap.source} key={gap.label}>
                    <div className="audit-evidence-gap-top">
                      <strong>{gap.label}</strong>
                      <span className="audit-gap-source-tag">{gap.source === 'vendor' ? 'Ask the vendor' : 'Likely available internally'}</span>
                    </div>
                    <p>{gap.whyItMatters}</p>
                    <p className="audit-gap-next-step">Next step: {gap.nextStep}</p>
                  </div>
                ))}
              </div>
            )}

            {!draftOpen && canDraft && (
              <div className="audit-recovery-readiness" role="status">
                <div>
                  <span>Recovery ready</span>
                  <strong>The evidence package is complete.</strong>
                  <p>The vendor, invoice, payment dates, amount, and source rows will travel with the request.</p>
                </div>
                <button type="button" className="audit-btn" data-variant="primary" onClick={onOpenDraft}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {draftActionLabel}
                </button>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {draftOpen && canDraft && (
            <motion.div
              className="audit-case-column audit-action-column"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(18px, 0, 0)' }}
              animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(10px, 0, 0)' }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <RecoveryDraftPanel
                finding={finding}
                state={state}
                onHighlightField={setHighlightedField}
                onAdvanceStage={() => onAdvanceStage(finding.id)}
                onDraftChange={persistDraft}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
