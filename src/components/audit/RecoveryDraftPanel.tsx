import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, Mail, Printer, Send } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Finding } from '@/types'
import { generateLetter } from '@/lib/letters'
import { RECOVERY_STAGE_LABEL, recoveryStageLabel, type CaseState, type RecoveryMethod } from '@/ledger/caseState'
import type { EvidenceFieldKey } from '@/components/audit/EvidenceComparison'
import { recoveryEconomics } from '@/billing/entitlement'
import { formatCurrency, formatDate } from '@/lib/format'
import { MOTION_TRANSITION } from '@/motion/system'
import { loadSenderProfile, saveSenderProfile, type SenderProfile } from '@/lib/senderProfile'

interface RecoveryDraftPanelProps {
  finding: Finding
  state: CaseState
  onHighlightField: (field: EvidenceFieldKey | null) => void
  onPackageChange: (update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod }) => void
  onMarkRequested: (recoveryPackage: { subject: string; body: string; recipientEmail?: string; requestedResolution: RecoveryMethod }) => void
  onRecordOutcome: (outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null) => void
}

const LINKED_CHIPS: { field: EvidenceFieldKey; label: string }[] = [
  { field: 'vendor', label: 'Vendor' },
  { field: 'invoice', label: 'Invoice' },
  { field: 'amount', label: 'Amount' },
  { field: 'date', label: 'Payment date' },
]

const METHOD_LABEL: Record<RecoveryMethod, string> = {
  refund: 'Refund',
  credit: 'Account credit',
  offset: 'Future-payment offset',
}

const METHOD_HINT: Record<RecoveryMethod, string> = {
  refund: 'Money back into your account',
  credit: 'Applied against a future invoice',
  offset: 'Deducted from the next payment due',
}

function caseReference(finding: Finding) {
  return finding.relatedRecords.find((record) => record.invoiceNumber)?.invoiceNumber ?? finding.id
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function RecoveryDraftPanel({ finding, state, onHighlightField, onPackageChange, onMarkRequested, onRecordOutcome }: RecoveryDraftPanelProps) {
  const [senderProfile, setSenderProfile] = useState<SenderProfile>(() => loadSenderProfile())
  const [requestedResolution, setRequestedResolution] = useState<RecoveryMethod>(state.requestedResolution ?? 'refund')
  const letter = useMemo(
    () => generateLetter(finding, senderProfile, requestedResolution),
    [finding, senderProfile, requestedResolution]
  )
  const isInternal = finding.class !== 'recoverable'
  const [subject, setSubject] = useState(state.recoverySubject ?? letter.subject)
  const [text, setText] = useState(state.recoveryDraft ?? letter.body)
  const [recipientEmail, setRecipientEmail] = useState(state.recoveryRecipientEmail ?? '')
  const [customResolution, setCustomResolution] = useState('')
  const [responseDueBy, setResponseDueBy] = useState('')
  const [recoveredAmount, setRecoveredAmount] = useState(String(state.recoveredAmount ?? finding.dollarImpact))
  const [outcomeNote, setOutcomeNote] = useState(state.recoveryOutcomeNote ?? '')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const statusTimeoutRef = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()

  function updateSenderProfile(update: Partial<SenderProfile>) {
    const next = { ...senderProfile, ...update }
    setSenderProfile(next)
    saveSenderProfile(next)
  }

  useEffect(() => {
    setSubject(state.recoverySubject ?? letter.subject)
    setText(state.recoveryDraft ?? letter.body)
    setRecipientEmail(state.recoveryRecipientEmail ?? '')
    setRequestedResolution(state.requestedResolution ?? 'refund')
    setRecoveredAmount(String(state.recoveredAmount ?? finding.dollarImpact))
    setOutcomeNote(state.recoveryOutcomeNote ?? '')
    setStatusMessage(null)
    setPreviewMode('edit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding.id])

  useEffect(() => {
    const timeout = window.setTimeout(
      () => onPackageChange({ subject, body: text, recipientEmail, requestedResolution }),
      250
    )
    return () => window.clearTimeout(timeout)
  }, [subject, text, recipientEmail, requestedResolution, onPackageChange])

  useEffect(() => () => {
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current)
  }, [])

  const evidenceLine = useMemo(
    () =>
      finding.relatedRecords
        .map((record) =>
          `${formatDate(record.paymentDate)} | ${record.vendor} | ${record.invoiceNumber ?? 'No invoice'} | ${formatCurrency(record.amountPaid)} | Source row ${record.rowIndex + 1}`
        )
        .join('\n'),
    [finding.relatedRecords]
  )

  // A clean email transcript, not a data dump above a letter that repeats
  // the same facts in prose. The vendor, amount, and resolution are already
  // stated in the body itself (generateLetter writes them in), so restating
  // them as header fields just duplicated the letter above itself.
  const packageText = useMemo(() => {
    const senderLine = senderProfile.senderName
      ? senderProfile.senderEmail
        ? `${senderProfile.senderName} <${senderProfile.senderEmail}>`
        : senderProfile.senderName
      : senderProfile.senderEmail || null

    const notes = [
      !isInternal && customResolution.trim() ? `Additional instructions: ${customResolution.trim()}` : null,
      !isInternal && responseDueBy ? `Response requested by: ${formatDate(new Date(`${responseDueBy}T00:00:00`))}` : null,
    ].filter((line): line is string => line !== null)

    return [
      senderLine ? `From: ${senderLine}` : null,
      recipientEmail ? `To: ${recipientEmail}` : null,
      `Subject: ${subject}`,
      '',
      text,
      notes.length > 0 ? '' : null,
      ...notes,
      '',
      `Evidence backing this request (case ${caseReference(finding)})`,
      evidenceLine,
    ]
      .filter((line) => line !== null)
      .join('\n')
  }, [customResolution, evidenceLine, finding, isInternal, recipientEmail, responseDueBy, senderProfile, subject, text])

  // Only split a figure that is actually a positive number — an empty or
  // half-typed field must not render a $0.00 fee as if it were settled.
  const parsedRecovered = Number(recoveredAmount)
  const outcomeSplit =
    Number.isFinite(parsedRecovered) && parsedRecovered > 0 ? recoveryEconomics(0, parsedRecovered) : null

  const emailValid = recipientEmail.trim().length === 0 || EMAIL_PATTERN.test(recipientEmail.trim())
  const readyToSend = !isInternal && recipientEmail.trim().length > 0 && emailValid

  function flashStatus(message: string) {
    setStatusMessage(message)
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = window.setTimeout(() => setStatusMessage(null), 2400)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(packageText)
      flashStatus('Recovery package copied')
    } catch {
      textareaRef.current?.select()
      flashStatus('Clipboard is blocked. The request text is selected.')
    }
  }

  function handleDownload() {
    const blob = new Blob([packageText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reclaim-${caseReference(finding).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    flashStatus('Recovery package downloaded')
  }

  function handleOpenEmail() {
    const mailto = `mailto:${encodeURIComponent(recipientEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    window.location.href = mailto
    flashStatus('Opening your email client')
  }

  function handleRequested() {
    onMarkRequested({ subject, body: text, recipientEmail: recipientEmail.trim() || undefined, requestedResolution })
    flashStatus(isInternal ? 'Marked as filed' : 'Request marked as sent')
  }

  function handleRecovered() {
    const amount = Number(recoveredAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      flashStatus('Enter the money actually recovered')
      return
    }
    onRecordOutcome('recovered', amount, outcomeNote.trim() || null)
    flashStatus('Recovery recorded')
  }

  function handleNotRecovered() {
    onRecordOutcome('not_recovered', null, outcomeNote.trim() || null)
    flashStatus('Case closed without recovery')
  }

  return (
    <div className="rc-recovery-package" data-stage={state.recoveryStage ?? 'potential'}>
      {/*
        Framed as "you are about to ask this vendor for this money", not as a
        document editor. The claim line states who, how much, and what for in
        one sentence before any field appears.
      */}
      <div className="rc-claimhead">
        <div className="rc-claimhead-top">
          <span className="rc-eyebrow">{isInternal ? 'Internal review note' : 'Your claim'}</span>
          {state.recoveryStage && <span className="rc-chip">{recoveryStageLabel(state.recoveryStage, isInternal)}</span>}
        </div>
        <h2>{isInternal ? 'Internal review package' : 'Recovery package'}</h2>
        <p className="rc-claimhead-line">
          {isInternal ? (
            <>
              Flagging <strong>{finding.vendor}</strong> / <strong>{caseReference(finding)}</strong> for internal
              follow-up — {formatCurrency(finding.dollarImpact)} at issue, backed by {finding.relatedRecords.length}{' '}
              record{finding.relatedRecords.length === 1 ? '' : 's'} from your own file. This never goes to the
              vendor.
            </>
          ) : (
            <>
              Asking <strong>{finding.vendor}</strong> for{' '}
              <strong className="rc-claimhead-money">{formatCurrency(finding.dollarImpact)}</strong> on{' '}
              <strong>{caseReference(finding)}</strong>, backed by {finding.relatedRecords.length} record
              {finding.relatedRecords.length === 1 ? '' : 's'} from your own file.
            </>
          )}
        </p>

        <div className="rc-recovery-linked">
          <span>Evidence travelling with it:</span>
          {LINKED_CHIPS.map((chip) => (
            <button
              type="button"
              className="rc-chip rc-chip-link"
              key={chip.field}
              onMouseEnter={() => onHighlightField(chip.field)}
              onMouseLeave={() => onHighlightField(null)}
              onFocus={() => onHighlightField(chip.field)}
              onBlur={() => onHighlightField(null)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rc-recovery-tabs" role="tablist" aria-label="Compose or preview">
        <button
          type="button"
          role="tab"
          aria-selected={previewMode === 'edit'}
          data-active={previewMode === 'edit'}
          onClick={() => setPreviewMode('edit')}
        >
          Compose
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={previewMode === 'preview'}
          data-active={previewMode === 'preview'}
          onClick={() => setPreviewMode('preview')}
        >
          Preview
        </button>
      </div>

      {previewMode === 'edit' ? (
        <div className="rc-recovery-form">
          <div className="rc-field-group">
            <span className="rc-field-group-label">From — who this request comes from</span>
            <p className="rc-field-group-hint">
              Saved on this device and reused on every future request, so you only fill it in once.
            </p>
            <div className="rc-field-row">
              <label className="rc-field">
                <span>Your business name</span>
                <input
                  type="text"
                  className="rc-input"
                  name="sender-business"
                  autoComplete="organization"
                  placeholder="Acme Supply Co."
                  value={senderProfile.businessName}
                  onChange={(event) => updateSenderProfile({ businessName: event.target.value })}
                />
              </label>
              <label className="rc-field">
                <span>Your name</span>
                <input
                  type="text"
                  className="rc-input"
                  name="sender-name"
                  autoComplete="name"
                  placeholder="Jordan Lee"
                  value={senderProfile.senderName}
                  onChange={(event) => updateSenderProfile({ senderName: event.target.value })}
                />
              </label>
              <label className="rc-field">
                <span>Your email (reply-to)</span>
                <input
                  type="email"
                  className="rc-input"
                  name="sender-email"
                  autoComplete="email"
                  placeholder="ap@yourbusiness.com"
                  value={senderProfile.senderEmail}
                  onChange={(event) => updateSenderProfile({ senderEmail: event.target.value })}
                />
              </label>
            </div>
          </div>

          {!isInternal && (
            <label className="rc-field">
              <span>Recipient email (optional)</span>
              <input
                type="email"
                className="rc-input"
                name="recovery-recipient"
                autoComplete="email"
                placeholder="ap@vendor.com"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                onBlur={() => onPackageChange({ recipientEmail: recipientEmail.trim() })}
                aria-invalid={!emailValid}
              />
              {!emailValid && <small className="rc-field-error">That doesn't look like a valid email.</small>}
            </label>
          )}

          <label className="rc-field">
            <span>Subject</span>
            <input
              type="text"
              className="rc-input"
              name="recovery-subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              onBlur={() => onPackageChange({ subject })}
            />
          </label>

          {/* A <label> must not wrap these: <button> is a labelable element, so
              the label text would become every option's accessible name.
              Hidden for internal notes — there's no vendor to request a
              refund, credit, or offset from on a finding you're not sending. */}
          {!isInternal && (
            <div className="rc-field">
              <span id="rc-resolution-label">Requested resolution — how you want this settled</span>
              <div className="rc-method-options" role="radiogroup" aria-labelledby="rc-resolution-label">
                {(Object.keys(METHOD_LABEL) as RecoveryMethod[]).map((method) => (
                  <button
                    type="button"
                    key={method}
                    className="rc-method-option"
                    role="radio"
                    aria-checked={requestedResolution === method}
                    data-selected={requestedResolution === method}
                    onClick={() => {
                      setRequestedResolution(method)
                      onPackageChange({ requestedResolution: method })
                      // The chosen method changes what the letter actually
                      // asks for, so the visible draft must change with it —
                      // otherwise picking "Account credit" here while the
                      // text still says "a refund" would be silently wrong.
                      const regenerated = generateLetter(finding, senderProfile, method)
                      setSubject(regenerated.subject)
                      setText(regenerated.body)
                      onPackageChange({ subject: regenerated.subject, body: regenerated.body })
                    }}
                  >
                    <span className="rc-method-option-top">
                      <strong>{METHOD_LABEL[method]}</strong>
                      {requestedResolution === method && <Check aria-hidden="true" className="rc-method-option-check" />}
                    </span>
                    <span>{METHOD_HINT[method]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isInternal && (
            <div className="rc-field-row">
              <label className="rc-field">
                <span>Additional instructions (optional)</span>
                <input
                  type="text"
                  className="rc-input"
                  name="recovery-custom-resolution"
                  autoComplete="off"
                  placeholder="e.g. apply to invoice #4021 instead"
                  value={customResolution}
                  onChange={(event) => setCustomResolution(event.target.value)}
                />
              </label>
              <label className="rc-field">
                <span>Response requested by (optional)</span>
                <input
                  type="date"
                  className="rc-input"
                  name="recovery-due-date"
                  value={responseDueBy}
                  onChange={(event) => setResponseDueBy(event.target.value)}
                />
              </label>
            </div>
          )}

          <label htmlFor="rc-draft-textarea" className="rc-field">
            <span>{isInternal ? 'Internal review note' : 'Recovery request'}</span>
            <textarea
              id="rc-draft-textarea"
              ref={textareaRef}
              className="rc-input rc-textarea"
              name="recovery-draft"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => onPackageChange({ body: text })}
              rows={9}
              spellCheck
            />
          </label>

          <details className="rc-recovery-evidence">
            <summary>Evidence index included with this package</summary>
            <div className="rc-recovery-evidence-rows">
              {finding.relatedRecords.map((record) => (
                <div className="rc-recovery-evidence-row" key={record.id}>
                  <span>Row {record.rowIndex + 1}</span>
                  <time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
                  <strong>{record.invoiceNumber ?? 'No invoice'}</strong>
                  <b>{formatCurrency(record.amountPaid)}</b>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : (
        <div className="rc-letter-preview">
          <div className="rc-letter-preview-meta">
            <div>
              <span>To</span>
              <strong>{recipientEmail.trim() || `${finding.vendor} (no email on file)`}</strong>
            </div>
            <div>
              <span>Subject</span>
              <strong>{subject}</strong>
            </div>
          </div>
          <div className="rc-letter-preview-body">
            {text.split('\n').map((line, index) => (
              <p key={index}>{line || ' '}</p>
            ))}
          </div>
        </div>
      )}

      <div className="rc-recovery-status" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {statusMessage && (
            <motion.span
              key={statusMessage}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 4px, 0)' }}
              animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0.08 } : MOTION_TRANSITION.state}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {statusMessage}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="rc-recovery-actions">
        {readyToSend && (
          <button type="button" className="rc-btn" data-variant="outline" onClick={handleOpenEmail}>
            <Mail aria-hidden="true" />
            Open in email
          </button>
        )}
        <button type="button" className="rc-btn" data-variant="outline" onClick={handleCopy}>
          <Copy aria-hidden="true" />
          Copy package
        </button>
        <button type="button" className="rc-btn" data-variant="outline" onClick={handleDownload}>
          <Download aria-hidden="true" />
          Download
        </button>
        <button type="button" className="rc-btn" data-variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Print
        </button>
      </div>

      <aside className="rc-note">
        <span>
          <strong>Reclaim doesn't send this for you.</strong> Open it in your email client, copy it into your own
          message, or download it — then send it the way you normally would.
        </span>
      </aside>

      {state.recoveryStage === 'confirmed' && (
        <div className="rc-recovery-stage">
          <div>
            <strong>{isInternal ? 'Ready to file' : 'Ready to request'}</strong>
            <p>
              {isInternal
                ? 'The exact records are included above. Filing just keeps this case marked as followed up on.'
                : 'The exact records and requested resolution are included above.'}
            </p>
          </div>
          <button type="button" className="rc-btn" data-variant="mint" onClick={handleRequested}>
            <Send aria-hidden="true" />
            {isInternal ? 'Mark as filed' : 'Mark request sent'}
          </button>
        </div>
      )}

      {/* Internal notes never have money coming back from a vendor — there's
          nothing to request a refund on, so the recovered-amount field and
          Reclaim's fee split (which only makes sense against real vendor
          money) don't apply. This just closes the note out. */}
      {isInternal && (state.recoveryStage === 'requested' || state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered') && (
        <div className="rc-recovery-outcome">
          <div className="rc-recovery-outcome-head">
            <span>Follow-up</span>
            <strong>{state.recoveryStage === 'requested' ? 'Anything to note before closing this?' : 'Closed'}</strong>
          </div>
          <label className="rc-field">
            <span>Outcome note</span>
            <textarea
              className="rc-input"
              name="recovery-outcome-note"
              autoComplete="off"
              value={outcomeNote}
              placeholder="Example: confirmed with AP team, process updated…"
              onChange={(event) => setOutcomeNote(event.target.value)}
              rows={3}
            />
          </label>
          {state.recoveryStage === 'requested' && (
            <div className="rc-recovery-outcome-actions">
              <button type="button" className="rc-btn" data-variant="mint" onClick={handleNotRecovered}>
                Close this note
              </button>
            </div>
          )}
        </div>
      )}

      {!isInternal && (state.recoveryStage === 'requested' || state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered') && (
        <div className="rc-recovery-outcome">
          <div className="rc-recovery-outcome-head">
            <span>Money outcome</span>
            <strong>
              {state.recoveryStage === 'requested'
                ? 'What happened after the request?'
                : `Recorded as ${RECOVERY_STAGE_LABEL[state.recoveryStage].toLowerCase()}`}
            </strong>
          </div>
          <label className="rc-field">
            <span>Amount actually recovered</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="rc-input"
              name="recovered-amount"
              autoComplete="off"
              value={recoveredAmount}
              onChange={(event) => setRecoveredAmount(event.target.value)}
            />
          </label>
          {/* The fee lands here, so show the split against the number they
              just typed rather than making them work it out later. */}
          {outcomeSplit && (
            <div className="rc-feesplit" aria-live="polite">
              <div>
                <span>You received</span>
                <strong>{formatCurrency(outcomeSplit.recovered)}</strong>
              </div>
              <div>
                <span>Reclaim's {Math.round(outcomeSplit.feeRate * 100)}%</span>
                <strong>{formatCurrency(outcomeSplit.fee)}</strong>
              </div>
              <div data-tone="net">
                <span>You keep</span>
                <strong>{formatCurrency(outcomeSplit.net)}</strong>
              </div>
            </div>
          )}

          <label className="rc-field">
            <span>Outcome note</span>
            <textarea
              className="rc-input"
              name="recovery-outcome-note"
              autoComplete="off"
              value={outcomeNote}
              placeholder="Example: refund reference RF-102…"
              onChange={(event) => setOutcomeNote(event.target.value)}
              rows={3}
            />
          </label>
          <div className="rc-recovery-outcome-actions">
            <button type="button" className="rc-btn" data-variant="mint" onClick={handleRecovered}>
              Record money recovered
            </button>
            <button type="button" className="rc-btn" data-variant="outline" onClick={handleNotRecovered}>
              Close as not recovered
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
