import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { generateLetter } from '@/lib/letters'
import type { SenderProfile } from '@/lib/senderProfile'
import { buildDraftRequest, DraftUnavailableError, requestAiDraft } from '@/lib/ai/draftClient'
import { validateRecoveredAmount, type CaseState, type RecoveryMethod } from '@/ledger/caseState'
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
}

function MethodSelect({ id, value, onChange }: { id: string; value: RecoveryMethod; onChange: (m: RecoveryMethod) => void }) {
  return (
    <select id={id} className="wk-input" value={value} onChange={(e) => onChange(e.target.value as RecoveryMethod)}>
      {(Object.keys(METHOD_LABEL) as RecoveryMethod[]).map((m) => (
        <option key={m} value={m}>
          {METHOD_LABEL[m]}
        </option>
      ))}
    </select>
  )
}

function parseMoney(input: string): number {
  return Number(input.replace(/[$,\s]/g, ''))
}

/**
 * Stage "confirmed": build the recovery request. The letter is generated from
 * the case, can be rewritten by hand or redrafted with AI help, copied or
 * downloaded — and nothing leaves Reclaim. "Mark request sent" only records
 * that the reviewer sent it themselves.
 */
export function RecoveryRequestPanel({
  finding,
  state,
  sender,
  limits,
  onMarkRequested,
}: {
  finding: Finding
  state: CaseState
  sender: SenderProfile
  limits: PlanLimits
  onMarkRequested: (pkg: RequestPackage) => void
}) {
  const [upgrade, setUpgrade] = useState<string | null>(null)
  const canEdit = limits.fullLetters
  const [method, setMethod] = useState<RecoveryMethod>(state.requestedResolution ?? 'refund')
  const [amountInput, setAmountInput] = useState(() => (state.requestedAmount ?? finding.dollarImpact).toFixed(2))
  const generated = useMemo(() => {
    const amount = parseMoney(amountInput)
    const scoped = Number.isFinite(amount) && amount > 0 ? { ...finding, dollarImpact: amount } : finding
    return generateLetter(scoped, sender, method)
  }, [finding, sender, method, amountInput])
  const [subject, setSubject] = useState(state.recoverySubject ?? generated.subject)
  const [body, setBody] = useState(state.recoveryDraft ?? generated.body)
  const [edited, setEdited] = useState(Boolean(state.recoveryDraft))
  const [context, setContext] = useState('')
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
      : Math.round(amount * 100) > Math.round(finding.dollarImpact * 100)
        ? `The records only support ${formatCurrency(finding.dollarImpact)}.`
        : null

  const isVendorLetter = finding.class === 'recoverable'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      setNotice('Copied to the clipboard.')
    } catch {
      setNotice('Copy is not available here — select the text and copy it by hand.')
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
      setNotice('Draft ready. Read it through before you send anything — it only knows what is on this page.')
    } catch (err) {
      setNotice(err instanceof DraftUnavailableError ? err.message : 'Could not draft right now. The generated letter is still here.')
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div className="wk-card" data-testid="recovery-request">
      <span className="wk-label">{isVendorLetter ? 'Recovery request' : 'Internal note'}</span>
      <p className="wk-dim" style={{ marginTop: 6, fontSize: 13, maxWidth: 620 }}>
        {isVendorLetter
          ? 'Written from the records on this page. Edit it, copy or download it, and send it from your own email. Reclaim never contacts a vendor.'
          : 'This finding needs checking inside your business before anyone contacts the vendor. The note below says what to check.'}
      </p>

      {isVendorLetter ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 16 }}>
          <div className="wk-field">
            <label htmlFor="request-amount">Amount to request</label>
            <input
              id="request-amount"
              className="wk-input"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              aria-invalid={amountError ? 'true' : undefined}
              aria-describedby={amountError ? 'request-amount-error' : undefined}
            />
            {amountError ? (
              <span className="wk-field-error" id="request-amount-error" role="alert">
                {amountError}
              </span>
            ) : (
              <span className="wk-field-hint">The records support up to {formatCurrency(finding.dollarImpact)}.</span>
            )}
          </div>
          <div className="wk-field">
            <label htmlFor="request-method">Ask for</label>
            <MethodSelect id="request-method" value={method} onChange={setMethod} />
          </div>
        </div>
      ) : null}

      <div className="wk-field" style={{ marginTop: 16 }}>
        <label htmlFor="request-subject">Subject</label>
        <input
          id="request-subject"
          className="wk-input"
          value={subject}
          readOnly={!canEdit}
          onChange={(e) => {
            setSubject(e.target.value)
            setEdited(true)
          }}
        />
      </div>
      <div className="wk-field" style={{ marginTop: 12 }}>
        <label htmlFor="request-body">Message</label>
        <textarea
          id="request-body"
          className="wk-input"
          rows={14}
          value={body}
          readOnly={!canEdit}
          onChange={(e) => {
            setBody(e.target.value)
            setEdited(true)
          }}
          style={{ fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', height: 'auto', minHeight: 280, padding: '10px 12px' }}
        />
      </div>

      {!canEdit ? (
        <p className="wk-dim" style={{ marginTop: 8, fontSize: 12.5 }}>
          Editing, downloading and AI drafting are part of Pro.{' '}
          <button type="button" className="wk-linklike" onClick={() => setUpgrade('Editable letters are part of Pro.')}>
            See what Pro adds
          </button>
        </p>
      ) : null}

      {isVendorLetter && canEdit ? (
        <div className="wk-field" style={{ marginTop: 12 }}>
          <label htmlFor="request-context">Anything the draft should know? (optional)</label>
          <input
            id="request-context"
            className="wk-input"
            placeholder="e.g. long-standing supplier, keep the tone warm; their AP contact is Maria"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
        {isVendorLetter ? (
          <button
            type="button"
            className="wk-btn"
            data-variant="outline"
            data-size="sm"
            onClick={limits.aiDrafts ? draftWithAi : () => setUpgrade('AI recovery drafts are part of Pro.')}
            disabled={drafting || Boolean(amountError)}
          >
            <Sparkles aria-hidden="true" />
            {drafting ? 'Drafting…' : limits.aiDrafts ? 'Draft with AI' : 'Draft with AI (Pro)'}
          </button>
        ) : null}
        <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={copy}>
          <Copy aria-hidden="true" />
          Copy
        </button>
        <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={canEdit ? download : () => setUpgrade('Downloading letters is part of Pro.')}>
          <Download aria-hidden="true" />
          {canEdit ? 'Download' : 'Download (Pro)'}
        </button>
        <UpgradeDialog open={upgrade !== null} onOpenChange={(open) => !open && setUpgrade(null)} reason={upgrade ?? undefined} />
        {edited ? (
          <button
            type="button"
            className="wk-btn"
            data-variant="ghost"
            data-size="sm"
            onClick={() => {
              setEdited(false)
              setSubject(generated.subject)
              setBody(generated.body)
            }}
          >
            Reset to generated text
          </button>
        ) : null}
      </div>
      {notice ? (
        <p className="wk-dim" style={{ marginTop: 10, fontSize: 13 }} role="status">
          {notice}
        </p>
      ) : null}

      <hr className="wk-rule" style={{ margin: '18px 0' }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="wk-btn"
          data-variant="primary"
          data-size="sm"
          disabled={isVendorLetter && Boolean(amountError)}
          onClick={() => onMarkRequested({ subject, body, requestedAmount: isVendorLetter ? amount : finding.dollarImpact, method })}
        >
          {isVendorLetter ? 'Mark request sent' : 'Mark as filed'}
        </button>
        <span className="wk-dim" style={{ fontSize: 12.5 }}>
          {isVendorLetter ? 'Only after you have actually sent it. Reclaim does not send email.' : 'Records that the check has been handed to the right person.'}
        </span>
      </div>
    </div>
  )
}

/** Stage "requested": record what actually came back. */
export function RecoveryOutcomePanel({
  finding,
  state,
  limits,
  onRecordOutcome,
}: {
  finding: Finding
  state: CaseState
  limits: PlanLimits
  onRecordOutcome: (outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null, method: RecoveryMethod | null) => void
}) {
  const requested = state.requestedAmount ?? finding.dollarImpact
  const [amountInput, setAmountInput] = useState(requested.toFixed(2))
  const [method, setMethod] = useState<RecoveryMethod>(state.requestedResolution ?? 'refund')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [upgrade, setUpgrade] = useState(false)
  const error = validateRecoveredAmount(amountInput, requested)
  const full = limits.fullRecoveryWorkflow

  if (!full) {
    // Free: the outcome is the whole amount or nothing. Partial amounts and methods are Pro.
    return (
      <div className="wk-card" data-testid="recovery-outcome">
        <span className="wk-label">Record the outcome</span>
        <p className="wk-dim" style={{ marginTop: 6, fontSize: 13, maxWidth: 620 }}>
          {formatCurrency(requested)} was requested. Did it come back?
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => onRecordOutcome('recovered', requested, null, null)}>
            Money came back
          </button>
          <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onRecordOutcome('not_recovered', null, null, null)}>
            Close without recovery
          </button>
          <button type="button" className="wk-linklike" style={{ marginLeft: 'auto' }} onClick={() => setUpgrade(true)}>
            Only part of it came back? That&apos;s Pro.
          </button>
        </div>
        <UpgradeDialog open={upgrade} onOpenChange={setUpgrade} reason="Partial recoveries and recovery methods are part of Pro." />
      </div>
    )
  }

  return (
    <div className="wk-card" data-testid="recovery-outcome">
      <span className="wk-label">Record the outcome</span>
      <p className="wk-dim" style={{ marginTop: 6, fontSize: 13, maxWidth: 620 }}>
        {formatCurrency(requested)} was requested. Enter what actually arrived — a partial amount is fine — or close the case if nothing did.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 16 }}>
        <div className="wk-field">
          <label htmlFor="outcome-amount">Amount received</label>
          <input
            id="outcome-amount"
            className="wk-input"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value)
              setTouched(true)
            }}
            aria-invalid={touched && error ? 'true' : undefined}
            aria-describedby={touched && error ? 'outcome-amount-error' : undefined}
          />
          {touched && error ? (
            <span className="wk-field-error" id="outcome-amount-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <div className="wk-field">
          <label htmlFor="outcome-method">Came back as</label>
          <MethodSelect id="outcome-method" value={method} onChange={setMethod} />
        </div>
        <div className="wk-field">
          <label htmlFor="outcome-note">Reference (optional)</label>
          <input id="outcome-note" className="wk-input" placeholder="e.g. credit memo CM-42" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button
          type="button"
          className="wk-btn"
          data-variant="primary"
          data-size="sm"
          onClick={() => {
            setTouched(true)
            if (error) return
            onRecordOutcome('recovered', parseMoney(amountInput), note.trim() || null, method)
          }}
        >
          Money came back
        </button>
        <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onRecordOutcome('not_recovered', null, note.trim() || null, null)}>
          Close without recovery
        </button>
      </div>
    </div>
  )
}

export { METHOD_LABEL }
