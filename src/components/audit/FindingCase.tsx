import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Check, FileText, HelpCircle, MessageCircleWarning, Pencil, XCircle } from 'lucide-react'
import type { Finding } from '@/types'
import { formatCurrency } from '@/lib/format'
import { buildRuleChecklist } from '@/audit/ruleChecklist'
import { buildEvidenceGaps } from '@/audit/evidenceGaps'
import {
  DISMISSAL_TAG_LABEL,
  QUEUE_GROUP_LABEL,
  queueGroupFor,
  recoveryStageLabel,
  type CaseState,
  type DecisionValue,
  type DismissalTag,
  type RecoveryMethod,
} from '@/ledger/caseState'
import { EvidenceComparison, type EvidenceFieldKey } from '@/components/audit/EvidenceComparison'
import { RecoveryDraftPanel } from '@/components/audit/RecoveryDraftPanel'
import { MOTION_SPRING, MOTION_TRANSITION } from '@/motion/system'

interface FindingCaseProps {
  finding: Finding
  state: CaseState
  isNew: boolean
  draftOpen: boolean
  onOpenDraft: () => void
  onCloseDraft?: () => void
  onDecide: (findingId: string, value: DecisionValue, reason: string | null) => void
  onDismiss?: (findingId: string, tag: DismissalTag, reason: string | null) => void
  onUpdateRequestedEvidence?: (findingId: string, requestedEvidence: string[], reason: string | null) => void
  onPackageChange: (findingId: string, update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod }) => void
  onMarkRequested: (findingId: string, recoveryPackage: { subject: string; body: string; recipientEmail?: string; requestedResolution: RecoveryMethod }) => void
  onRecordOutcome: (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null) => void
  embedded?: boolean
}

const DISMISSAL_TAGS = Object.keys(DISMISSAL_TAG_LABEL) as DismissalTag[]

const DUPLICATE_TYPES = new Set<Finding['type']>(['exact_duplicate', 'near_duplicate'])

function confirmLabel(finding: Finding): string {
  return DUPLICATE_TYPES.has(finding.type) ? 'Confirm likely duplicate' : 'Confirm finding'
}

function caseStatusLabel(finding: Finding, state: CaseState): string {
  if (state.recoveryStage) return recoveryStageLabel(state.recoveryStage, finding.class !== 'recoverable')
  if (state.decision === 'expected') return 'Expected'
  return QUEUE_GROUP_LABEL[queueGroupFor(finding, state)]
}

function findingContext(finding: Finding): string {
  const invoice = finding.relatedRecords.find((r) => r.invoiceNumber)?.invoiceNumber
  return invoice ? `${finding.vendor} / Invoice ${invoice}` : finding.vendor
}

const DECISION_CONSEQUENCE: Record<DecisionValue, (finding: Finding) => string> = {
  // A "confirmed" review/opportunity finding never gets sent to a vendor —
  // it becomes an internal note, not a claim. Saying "send the request"
  // regardless of class was wrong for every non-recoverable finding type
  // (bank account changes, missed discounts, outliers, etc.).
  confirmed: (finding) =>
    finding.class === 'recoverable'
      ? `Moves it to Claims so you can send the request. ${formatCurrency(finding.dollarImpact)} at issue.`
      : `Moves it to Claims as an internal review note. ${formatCurrency(finding.dollarImpact)} at issue.`,
  expected: () => "We'll ask why, so the next check is better.",
  needs_info: () => 'Stays open. Flag exactly what you still need.',
}

export function FindingCase({
  finding,
  state,
  isNew,
  draftOpen,
  onOpenDraft,
  onCloseDraft,
  onDecide,
  onDismiss,
  onUpdateRequestedEvidence,
  onPackageChange,
  onMarkRequested,
  onRecordOutcome,
  embedded = false,
}: FindingCaseProps) {
  const [highlightedField, setHighlightedField] = useState<EvidenceFieldKey | null>(null)
  const [reasonDraft, setReasonDraft] = useState(state.reason ?? '')
  const [dismissOpen, setDismissOpen] = useState(false)
  const [dismissTag, setDismissTag] = useState<DismissalTag | null>(state.dismissalTag ?? null)
  const [dismissNote, setDismissNote] = useState(state.decision === 'expected' ? state.reason ?? '' : '')
  const [requestedEvidence, setRequestedEvidence] = useState<string[]>(state.requestedEvidence ?? [])
  const caseRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    caseRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    setDismissOpen(false)
    setDismissTag(state.dismissalTag ?? null)
    setDismissNote(state.decision === 'expected' ? state.reason ?? '' : '')
    setRequestedEvidence(state.requestedEvidence ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding.id])

  const persistPackage = useCallback(
    (update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod }) => onPackageChange(finding.id, update),
    [finding.id, onPackageChange]
  )

  const checklist = buildRuleChecklist(finding)
  const evidenceGaps = buildEvidenceGaps(finding)
  const draftActionLabel = finding.class === 'recoverable' ? 'Draft recovery request' : 'Create internal review note'
  const canDraft = state.decision === 'confirmed'

  function pickDecision(value: DecisionValue) {
    if (value === 'expected') {
      setDismissTag(state.decision === 'expected' ? state.dismissalTag ?? null : null)
      setDismissNote(state.decision === 'expected' ? state.reason ?? '' : '')
      setDismissOpen(true)
      return
    }
    setReasonDraft(state.decision === value ? state.reason ?? '' : '')
    onDecide(finding.id, value, state.decision === value ? state.reason : null)
  }

  function commitReason() {
    if (state.decision && state.decision !== 'expected') onDecide(finding.id, state.decision, reasonDraft.trim() || null)
  }

  function confirmDismissal() {
    if (!dismissTag) return
    onDismiss?.(finding.id, dismissTag, dismissNote.trim() || null)
    setDismissOpen(false)
  }

  function toggleRequestedEvidence(label: string) {
    const next = requestedEvidence.includes(label)
      ? requestedEvidence.filter((item) => item !== label)
      : [...requestedEvidence, label]
    setRequestedEvidence(next)
    onUpdateRequestedEvidence?.(finding.id, next, reasonDraft.trim() || null)
  }

  const decidePanel = (
    <div className="audit-panel rc-decide">
      <div className="rc-decide-head">
        <div>
          <h2>Is this a real error?</h2>
          <p className="audit-panel-hint">
            You've seen the evidence. Reclaim only claims what you confirm.
          </p>
        </div>
        <div className="rc-decide-stake">
          <span>{finding.class === 'opportunity' ? 'Future saving' : 'At stake'}</span>
          <strong>{formatCurrency(finding.dollarImpact)}</strong>
        </div>
      </div>

      <div className="rc-decide-actions" role="group" aria-label="Review decision">
        <button
          type="button"
          className="rc-decide-primary audit-decision-btn"
          data-motion="pressable"
          data-selected={state.decision === 'confirmed'}
          aria-pressed={state.decision === 'confirmed'}
          onClick={() => pickDecision('confirmed')}
        >
          <span className="rc-decide-primary-label">
            <Check aria-hidden="true" />
            {confirmLabel(finding)}
          </span>
          <span className="rc-decide-primary-note">{DECISION_CONSEQUENCE.confirmed(finding)}</span>
        </button>

        <div className="rc-decide-secondary">
          <button
            type="button"
            className="rc-decide-alt audit-decision-btn"
            data-motion="pressable"
            data-tone="needs_info"
            data-selected={state.decision === 'needs_info'}
            aria-pressed={state.decision === 'needs_info'}
            onClick={() => pickDecision('needs_info')}
          >
            <HelpCircle aria-hidden="true" />
            <span>
              <strong>Not sure yet</strong>
              <em>{DECISION_CONSEQUENCE.needs_info(finding)}</em>
            </span>
          </button>
          <button
            type="button"
            className="rc-decide-alt audit-decision-btn"
            data-motion="pressable"
            data-tone="expected"
            data-selected={state.decision === 'expected'}
            aria-pressed={state.decision === 'expected'}
            onClick={() => pickDecision('expected')}
          >
            <XCircle aria-hidden="true" />
            <span>
              <strong>Not an error</strong>
              <em>{DECISION_CONSEQUENCE.expected(finding)}</em>
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {dismissOpen ? (
          <motion.div
            key="dismiss-prompt"
            className="audit-dismiss-prompt"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, -6px, 0)' }}
            animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, -6px, 0)' }}
            transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.enter}
          >
            <div className="audit-dismiss-prompt-head">
              <MessageCircleWarning aria-hidden="true" />
              <div>
                <strong>Before you dismiss this — which is it?</strong>
                <p>
                  Dismissing doesn't always mean Reclaim was wrong — sometimes you just have context it
                  doesn't. Pick the closest reason so future checks get sharper.
                </p>
              </div>
            </div>

            <div className="audit-dismiss-tags" role="radiogroup" aria-label="Why is this being dismissed">
              {DISMISSAL_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className="audit-dismiss-tag"
                  data-motion="pressable"
                  data-selected={dismissTag === tag}
                  role="radio"
                  aria-checked={dismissTag === tag}
                  onClick={() => setDismissTag(tag)}
                >
                  {DISMISSAL_TAG_LABEL[tag]}
                </button>
              ))}
            </div>

            <label htmlFor="audit-dismiss-note" className="audit-decision-reason-label">
              Anything else? (optional)
            </label>
            <textarea
              id="audit-dismiss-note"
              className="audit-decision-note"
              placeholder="Add detail if it helps explain why…"
              name="dismiss-note"
              autoComplete="off"
              value={dismissNote}
              onChange={(event) => setDismissNote(event.target.value)}
            />

            <div className="audit-dismiss-actions">
              <button type="button" className="audit-btn" data-motion="pressable" onClick={() => setDismissOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="audit-btn"
                data-motion="pressable"
                data-variant="primary"
                disabled={!dismissTag}
                onClick={confirmDismissal}
              >
                Confirm — mark as expected
              </button>
            </div>
          </motion.div>
        ) : state.decision === 'expected' ? (
          <motion.div
            key="dismiss-ack"
            className="audit-dismiss-ack"
            role="status"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, -6px, 0)' }}
            animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, -6px, 0)' }}
            transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.enter}
          >
            <div>
              <strong>Thanks — marked as expected.</strong>
              <p>
                {state.dismissalTag ? DISMISSAL_TAG_LABEL[state.dismissalTag] : 'No reason given.'}
                {state.reason ? ` — "${state.reason}"` : ''}
              </p>
            </div>
            <button type="button" className="audit-btn" data-motion="pressable" data-size="sm" onClick={() => pickDecision('expected')}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit feedback
            </button>
          </motion.div>
        ) : (
          state.decision && (
            <motion.div
              key="decision-reason"
              className="audit-decision-reason"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, -6px, 0)' }}
              animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, -6px, 0)' }}
              transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.enter}
            >
              <label htmlFor="audit-decision-note" className="audit-decision-reason-label">
                {state.decision === 'needs_info' ? 'Anything else missing? (optional)' : 'Reason (optional)'}
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
              <motion.p
                className="audit-decision-status"
                key={caseStatusLabel(finding, state)}
                role="status"
                aria-live="polite"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.08 : 0.16 }}
              >
                {caseStatusLabel(finding, state)}
              </motion.p>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Some finding types (e.g. missed_discount) have nothing left to
          gather — the window already closed, no evidence would change the
          outcome. Rendering the checklist header with zero checkboxes under
          it read as broken, not as "nothing needed here". */}
      {state.decision === 'needs_info' && evidenceGaps.length > 0 && (
        <motion.div
          className="audit-evidence-gaps"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 8px, 0)' }}
          animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
          transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.enter}
        >
          <h3>What would resolve this case</h3>
          <p className="audit-panel-hint">Check off what's actually blocking a decision — Reclaim already knows what's missing.</p>
          {evidenceGaps.map((gap) => {
            const checked = requestedEvidence.includes(gap.label)
            return (
              <label className="audit-evidence-gap" data-source={gap.source} data-checked={checked} key={gap.label}>
                <div className="audit-evidence-gap-top">
                  <span className="audit-evidence-gap-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRequestedEvidence(gap.label)}
                    />
                    <strong>{gap.label}</strong>
                  </span>
                  <span className="audit-gap-source-tag">{gap.source === 'vendor' ? 'Ask the vendor' : 'Likely available internally'}</span>
                </div>
                <p>{gap.whyItMatters}</p>
                <p className="audit-gap-next-step">Next step: {gap.nextStep}</p>
              </label>
            )
          })}
          {requestedEvidence.length > 0 && (
            <p className="audit-evidence-gaps-summary">
              Flagged {requestedEvidence.length} item{requestedEvidence.length === 1 ? '' : 's'} as blocking this case.
            </p>
          )}
        </motion.div>
      )}

      {!draftOpen && canDraft && (
        <motion.div
          className="audit-recovery-readiness"
          data-motion-state="confirmed"
          role="status"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 8px, 0)' }}
          animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
          transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.enter}
        >
          <div>
            <span>Recovery ready</span>
            <strong>The evidence package is complete.</strong>
            <p>The vendor, invoice, payment dates, amount, and source rows will travel with the request.</p>
          </div>
          <button type="button" className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" onClick={onOpenDraft}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            {draftActionLabel}
          </button>
        </motion.div>
      )}
    </div>
  )

  return (
    <motion.section
      ref={caseRef}
      className="audit-case"
      data-embedded={embedded}
      layoutId={`finding-${finding.id}`}
      transition={reduceMotion ? { duration: 0 } : MOTION_SPRING.shared}
    >
      <p className="sr-only" role="status" aria-live="polite">Opened case: {finding.title}</p>
      <header className="audit-case-header">
        <span className="audit-status-chip" data-class={finding.class}>
          {caseStatusLabel(finding, state)}
          {isNew ? ' / New' : ''}
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
        {!draftOpen && (
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
                      <strong>{record.invoiceNumber ?? 'Not provided'}</strong>
                    </span>
                    <span>
                      Category
                      <strong>{record.category ?? 'Not provided'}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div className="audit-panel">
            <h2>Why this was flagged</h2>
            <p className="audit-panel-hint">Plain-language rule breakdown, not a confidence score.</p>
            <ul className="audit-rule-checklist">
              {checklist.map((check, index) => (
                <motion.li
                  key={check.label}
                  data-matched={check.matched}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(-6px, 0, 0)' }}
                  animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
                  transition={reduceMotion ? { duration: 0.1 } : { ...MOTION_TRANSITION.enter, delay: 0.05 + index * 0.035 }}
                >
                  <span className="audit-rule-mark" aria-hidden="true">
                    {check.matched ? '✓' : '○'}
                  </span>
                  {check.label}
                </motion.li>
              ))}
            </ul>
          </div>

          {/*
            The decision is one question with a money answer, not three equal
            buttons. The claim action carries the amount and the weight; the
            two ways of saying "no" sit underneath as quieter choices.
          */}
          {decidePanel}
        </div>
        )}

        <AnimatePresence initial={false}>
          {draftOpen && canDraft && (
            <motion.div
              className="audit-case-column audit-action-column audit-action-column-full"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(18px, 0, 0)' }}
              animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(10px, 0, 0)' }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {onCloseDraft && (
                <button type="button" className="rc-btn" data-variant="ghost" data-size="sm" onClick={onCloseDraft}>
                  <ArrowLeft aria-hidden="true" />
                  Back to case
                </button>
              )}
              <details className="audit-draft-decide-recap">
                <summary>Case decision — {caseStatusLabel(finding, state)}</summary>
                {decidePanel}
              </details>
              <RecoveryDraftPanel
                finding={finding}
                state={state}
                onHighlightField={setHighlightedField}
                onPackageChange={persistPackage}
                onMarkRequested={(recoveryPackage) => onMarkRequested(finding.id, recoveryPackage)}
                onRecordOutcome={(outcome, amount, note) => onRecordOutcome(finding.id, outcome, amount, note)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
