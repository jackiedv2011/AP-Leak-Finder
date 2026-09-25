import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, Copy, Download, Lightbulb, PauseCircle, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { generateLetter } from '@/lib/letters'
import type { SenderProfile } from '@/lib/senderProfile'
import { buildDraftRequest, DraftUnavailableError, requestAiDraft } from '@/lib/ai/draftClient'
import { type CaseState, type RecoveryMethod } from '@/ledger/caseState'
import type { Finding } from '@/types'
import type { PlanLimits } from '@/lib/plans'
import { UpgradeDialog } from '@/components/plan/UpgradeDialog'

const METHOD_LABEL: Record<RecoveryMethod, string> = {
  refund: 'Refund',
  credit: 'Account credit',
  offset: 'Offset against our next payment',
}

export interface RequestPackage {
  subject: string
  body: string
  requestedAmount: number
  method: RecoveryMethod
  recipientEmail: string
}

function parseMoney(input: string): number {
  return Number(input.replace(/[$,\s]/g, ''))
}

/**
 * Stage "confirmed": build the recovery request, then approve it. The letter is
 * generated from the case, can be rewritten by hand or redrafted with AI help,
 * copied or downloaded, and nothing leaves Reclaim. Approval records the
 * customer's go-ahead and who first knew about the issue; "Mark request sent"
 * only records that the reviewer sent it themselves.
 */
export function RecoveryRequestPanel({
  finding,
  state,
  sender,
  limits,
  onMarkRequested,
  onApprove,
  onApproveAndSend,
  onContactHold,
  recommendation,
}: {
  finding: Finding
  state: CaseState
  sender: SenderProfile
  limits: PlanLimits
  onMarkRequested: (pkg: RequestPackage) => void
  onApprove: (pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => void
  onApproveAndSend?: (pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => void
  onContactHold: (reason: string | null) => void
  recommendation?: { method: RecoveryMethod; reason: string }
}) {
  const [upgrade, setUpgrade] = useState<string | null>(null)
  const canEdit = limits.fullLetters
  const [method, setMethod] = useState<RecoveryMethod>(state.requestedResolution ?? recommendation?.method ?? 'refund')
  const [amountInput, setAmountInput] = useState(() => (state.requestedAmount ?? finding.dollarImpact).toFixed(2))
  const generated = useMemo(() => {
    const amount = parseMoney(amountInput)
    // A partial request lowers the ask; the facts the letter states still come from the finding.
    return generateLetter(finding, sender, method, Number.isFinite(amount) && amount > 0 ? amount : finding.dollarImpact)
  }, [finding, sender, method, amountInput])
  const [subject, setSubject] = useState(state.recoverySubject ?? generated.subject)
  const [body, setBody] = useState(state.recoveryDraft ?? generated.body)
  const [edited, setEdited] = useState(Boolean(state.recoveryDraft))
  const [context, setContext] = useState('')
  const [recipientEmail, setRecipientEmail] = useState(state.recoveryRecipientEmail ?? '')
  const [knownBeforeReclaim, setKnownBeforeReclaim] = useState<boolean | null>(state.knownBeforeReclaim ?? null)
  const [knownBeforeNote, setKnownBeforeNote] = useState(state.knownBeforeNote ?? '')
  const [holdOpen, setHoldOpen] = useState(Boolean(state.contactHold))
  const [holdReason, setHoldReason] = useState(state.contactHold ?? '')
  const [drafting, setDrafting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Until the reviewer edits the text, keep it in step with the method/amount they pick.
  useEffect(() => {
    if (!edited) {
      setSubject(generated.subject)
      setBody(generated.body)
    }
  }, [generated, edited])

  const amount = parseMoney(amountInput)
  const amountError =
    !Number.isFinite(amount) || amount <= 0
      ? 'Enter the amount to request.'
      : Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
        ? 'Enter dollars and cents only.'
        : Math.round(amount * 100) > Math.round(finding.dollarImpact * 100)
          ? `The records only support ${formatCurrency(finding.dollarImpact)}.`
          : null

  const isVendorLetter = finding.class === 'recoverable'
  const pkg: RequestPackage = { subject, body, requestedAmount: amount, method, recipientEmail: recipientEmail.trim() }
  const disclosureNote = knownBeforeReclaim ? knownBeforeNote.trim() || null : null
  const approvedForCurrent =
    Boolean(state.approvedAt) &&
    state.recoverySubject === subject &&
    state.recoveryDraft === body &&
    state.requestedAmount === amount &&
    state.requestedResolution === method &&
    (state.recoveryRecipientEmail ?? '') === recipientEmail.trim() &&
    state.knownBeforeReclaim === knownBeforeReclaim &&
    (state.knownBeforeNote ?? null) === disclosureNote &&
    !state.contactHold
  const disclosureMissing = knownBeforeReclaim === null || (knownBeforeReclaim === true && !knownBeforeNote.trim())
  const canApprove = !amountError && !state.contactHold && !disclosureMissing

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      setNotice('Copied to the clipboard.')
    } catch {
      setNotice('Copy is not available here. Select the text and copy it by hand.')
    }
  }

  const download = () => {
    const blob = new Blob([`Subject: ${subject}\n\n${body}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${finding.vendor.replace(/[^\w-]+/g, '-')}-recovery-request.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setNotice('Downloaded as a text file.')
  }

  const draftWithAi = async () => {
    if (amountError) return
    setDrafting(true)
    setNotice(null)
    try {
      const draft = await requestAiDraft(buildDraftRequest(finding, state, { amountRequested: amount, method, userContext: context, sender }))
      setSubject(draft.subject)
      setBody(draft.body)
      setEdited(true)
      setNotice('Draft ready. Read it through before you send anything; it only knows what is on this page.')
    } catch (err) {
      setNotice(err instanceof DraftUnavailableError ? err.message : 'Could not draft right now. The generated letter is still here.')
    } finally {
      setDrafting(false)
    }
  }

  return (
    <section className="wk-panelcard" data-testid="recovery-request" aria-labelledby="request-title">
      <div className="wk-panelcard-head">
        <div>
          <h2 id="request-title">{isVendorLetter ? 'Recovery request' : 'Internal note'}</h2>
          <p>
            {isVendorLetter
              ? 'Written from the records on this page. Edit it, then send it from your own email. Reclaim never contacts a vendor.'
              : 'This finding needs checking inside your business before anyone contacts the vendor.'}
          </p>
        </div>
      </div>

      <div className="wk-panelcard-body wk-stack">
        {isVendorLetter && recommendation ? (
          <div className="wk-callout">
            <Lightbulb aria-hidden="true" />
            <p>
              <strong>Suggested: {recommendation.method === 'credit' ? 'an applied credit' : 'a cash refund'}.</strong> {recommendation.reason}
            </p>
          </div>
        ) : null}

        {isVendorLetter ? (
          <div className="wk-fields" data-columns="3">
            <div className="wk-field">
              <label htmlFor="request-amount">Amount to request</label>
              <input
                id="request-amount"
                className="wk-input"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                aria-invalid={amountError ? 'true' : undefined}
                aria-describedby={amountError ? 'request-amount-error' : 'request-amount-hint'}
              />
              {amountError ? (
                <span className="wk-field-error" id="request-amount-error" role="alert">{amountError}</span>
              ) : (
                <span className="wk-field-hint" id="request-amount-hint">The records support up to {formatCurrency(finding.dollarImpact)}.</span>
              )}
            </div>
            <div className="wk-field">
              <label htmlFor="request-method">Ask for</label>
              <select id="request-method" className="wk-input" value={method} onChange={(e) => setMethod(e.target.value as RecoveryMethod)}>
                {(Object.keys(METHOD_LABEL) as RecoveryMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </div>
            <div className="wk-field">
              <label htmlFor="request-recipient">Vendor email (optional)</label>
              <input id="request-recipient" className="wk-input" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="ap@vendor.com" />
            </div>
          </div>
        ) : null}

        <div className="wk-field">
          <label htmlFor="request-subject">Subject</label>
          <input id="request-subject" className="wk-input" value={subject} readOnly={!canEdit} onChange={(e) => { setSubject(e.target.value); setEdited(true) }} />
        </div>
        <div className="wk-field">
          <label htmlFor="request-body">Message</label>
          <textarea id="request-body" className="wk-input wk-letter" rows={14} value={body} readOnly={!canEdit} onChange={(e) => { setBody(e.target.value); setEdited(true) }} />
        </div>

        {!canEdit ? (
          <p className="wk-field-hint">
            Editing, downloading and AI drafting are part of Growth and Flat.{' '}
            <button type="button" className="wk-linklike" onClick={() => setUpgrade('Editable letters are part of Growth and Flat.')}>See what paid plans add</button>
          </p>
        ) : null}

        {isVendorLetter && canEdit ? (
          <div className="wk-field">
            <label htmlFor="request-context">Anything the draft should know? (optional)</label>
            <input id="request-context" className="wk-input" placeholder="e.g. long-standing supplier, keep the tone warm; their AP contact is Maria" value={context} onChange={(e) => setContext(e.target.value)} />
          </div>
        ) : null}

        <div className="wk-actions">
          {isVendorLetter ? (
            <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={limits.aiDrafts ? draftWithAi : () => setUpgrade('AI recovery drafts are part of Growth and Flat.')} disabled={drafting || Boolean(amountError)}>
              <Sparkles aria-hidden="true" />
              {drafting ? 'Drafting…' : limits.aiDrafts ? 'Draft with AI' : 'Draft with AI (paid plans)'}
            </button>
          ) : null}
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={copy}>
            <Copy aria-hidden="true" />
            Copy
          </button>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={canEdit ? download : () => setUpgrade('Downloading letters is part of Growth and Flat.')}>
            <Download aria-hidden="true" />
            {canEdit ? 'Download' : 'Download (paid plans)'}
          </button>
          {edited ? (
            <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => { setEdited(false); setSubject(generated.subject); setBody(generated.body) }}>
              Reset to generated text
            </button>
          ) : null}
        </div>
        {notice ? <p className="wk-field-hint" role="status">{notice}</p> : null}
        <UpgradeDialog open={upgrade !== null} onOpenChange={(open) => !open && setUpgrade(null)} reason={upgrade ?? undefined} />
      </div>

      {isVendorLetter ? (
        <div className="wk-panelcard-body wk-stack wk-subsection" aria-labelledby="approval-title">
          <div>
            <h3 id="approval-title" className="wk-subhead">Approve before it goes out</h3>
            <p className="wk-field-hint">Check the amount, method, recipient and message. Approving records your go-ahead; it does not send an email.</p>
          </div>

          <fieldset className="wk-radio-set">
            <legend>Was this issue already known before Reclaim found it?</legend>
            <label className="wk-radio">
              <input type="radio" name={`prior-knowledge-${finding.id}`} checked={knownBeforeReclaim === false} onChange={() => setKnownBeforeReclaim(false)} />
              <span>No, Reclaim surfaced it</span>
            </label>
            <label className="wk-radio">
              <input type="radio" name={`prior-knowledge-${finding.id}`} checked={knownBeforeReclaim === true} onChange={() => setKnownBeforeReclaim(true)} />
              <span>Yes, we already knew</span>
            </label>
          </fieldset>
          {knownBeforeReclaim ? (
            <div className="wk-field">
              <label htmlFor={`known-before-note-${finding.id}`}>How did your team know?</label>
              <textarea id={`known-before-note-${finding.id}`} className="wk-input" rows={2} value={knownBeforeNote} onChange={(e) => setKnownBeforeNote(e.target.value)} placeholder="For example, AP flagged this in August" />
            </div>
          ) : null}

          {state.contactHold ? (
            <div className="wk-callout" data-tone="warn" role="status">
              <PauseCircle aria-hidden="true" />
              <p><strong>Vendor contact is on hold.</strong> {state.contactHold}</p>
            </div>
          ) : null}

          <div className="wk-actions">
            {approvedForCurrent ? (
              <button type="button" className="wk-btn" data-variant="outline" data-size="sm" data-state="done" disabled><CircleCheck aria-hidden="true" />Approved for outreach</button>
            ) : (
              <button type="button" className="wk-btn" data-variant="outline" data-size="sm" disabled={!canApprove} onClick={() => { if (knownBeforeReclaim !== null) onApprove(pkg, knownBeforeReclaim, disclosureNote) }}>
                Approve recovery request
              </button>
            )}
            <button type="button" className="wk-btn" data-variant="primary" data-size="sm" disabled={Boolean(amountError) || !approvedForCurrent} onClick={() => onMarkRequested(pkg)}>
              Mark request sent
            </button>
            {!approvedForCurrent && onApproveAndSend ? (
              <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" disabled={!canApprove} onClick={() => { if (knownBeforeReclaim !== null) onApproveAndSend(pkg, knownBeforeReclaim, disclosureNote) }}>
                Approve and mark sent
              </button>
            ) : null}
          </div>
          <p className="wk-field-hint">
            {disclosureMissing
              ? 'Answer the question above first, so the case records who identified the issue.'
              : state.approvedAt && !approvedForCurrent && !state.contactHold
                ? 'The request changed after approval. Review and approve this version.'
                : 'Mark it sent only after you have sent it. Reclaim does not send email.'}
          </p>

          <div className="wk-disclosure">
            {!holdOpen && !state.contactHold ? (
              <button type="button" className="wk-linklike" onClick={() => setHoldOpen(true)}>Hold vendor contact instead</button>
            ) : (
              <div className="wk-inline-form">
                <div className="wk-field">
                  <label htmlFor="contact-hold">Hold vendor contact (optional reason)</label>
                  <input id="contact-hold" className="wk-input" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="For example, strategic relationship" />
                </div>
                <button type="button" className="wk-btn" data-variant="outline" data-size="sm" disabled={!holdReason.trim()} onClick={() => onContactHold(holdReason.trim())}>
                  {state.contactHold ? 'Update hold' : 'Put on hold'}
                </button>
                {state.contactHold ? (
                  <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => { setHoldReason(''); onContactHold(null) }}>Remove hold</button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="wk-panelcard-body wk-subsection">
          <div className="wk-actions">
            <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => onMarkRequested({ ...pkg, requestedAmount: finding.dollarImpact })}>Mark as filed</button>
            <span className="wk-field-hint">Records that the check has been handed to the right person.</span>
          </div>
        </div>
      )}
    </section>
  )
}

/** Internal investigations close with a note and do not record returned money. */
export function InternalReviewPanel({ onClose }: { onClose: (note: string) => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState(false)
  return (
    <section className="wk-panelcard" data-testid="internal-review-outcome" aria-labelledby="internal-title">
      <div className="wk-panelcard-head">
        <div>
          <h2 id="internal-title">Internal investigation</h2>
          <p>Record what your team checked and concluded. This does not record returned money.</p>
        </div>
      </div>
      <div className="wk-panelcard-body wk-stack">
        <div className="wk-field">
          <label htmlFor="internal-review-note">Investigation outcome</label>
          <textarea id="internal-review-note" className="wk-input" rows={3} value={note} onChange={(event) => { setNote(event.target.value); setError(false) }} />
          {error ? <span className="wk-field-error" role="alert">Add an investigation note before closing this review.</span> : null}
        </div>
        <div className="wk-actions">
          <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => { if (!note.trim()) { setError(true); return } onClose(note.trim()) }}>Close internal review</button>
        </div>
      </div>
    </section>
  )
}

export { METHOD_LABEL }
