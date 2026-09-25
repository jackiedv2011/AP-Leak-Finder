import { useEffect, useState } from 'react'
import { CalendarClock, CircleCheck } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { type CaseState, type RecoveryMethod, type RecoveryVerification, type VendorUpdate, type VendorUpdateStatus } from '@/ledger/caseState'
import { latestVendorPosition, VENDOR_STATUS, VENDOR_STATUS_ORDER } from '@/recovery/vendorStatus'
import type { Finding } from '@/types'

const SETTLEMENT_METHOD_LABEL: Record<RecoveryMethod, string> = { refund: 'Cash refund', credit: 'Applied vendor credit', offset: 'Payment offset' }
const ROOT_CAUSES = [
  'Invoice entered twice', 'Vendor duplicate record', 'Invoice renumbered', 'Payment issued across systems', 'Payment retry',
  'Vendor resent invoice', 'Credit memo never entered', 'Return not communicated to AP', 'Pricing mismatch',
  'Contract cancellation missed', 'Accounting migration', 'Entity mismatch', 'Manual entry error', 'Other',
]
const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const dateValue = (time: number | null | undefined) => {
  if (!time) return ''
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const dateFromInput = (value: string) => (value ? new Date(`${value}T12:00:00`).getTime() : null)
const parseMoney = (value: string) => Number(value.replace(/[$,\s]/g, ''))
const wholeCents = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) <= 0.000001

type Tab = 'reply' | 'money' | 'close'

/**
 * Stage "requested": everything that happens while the request is out. The
 * conversation stays in view; the three things you can do next (log a reply,
 * record money back, close) sit behind a switch so only one form shows at once.
 */
export function RecoveryProgressPanel({ finding, state, onVendorUpdate, onFollowUp, onVerify, onClose }: {
  finding: Finding
  state: CaseState
  onVendorUpdate: (id: string, update: VendorUpdate) => void
  onFollowUp: (id: string, at: number | null) => void
  onVerify: (id: string, proof: RecoveryVerification) => void
  onClose: (id: string, reason: string) => void
}) {
  const requested = state.requestedAmount ?? finding.dollarImpact
  const returned = state.recoveredAmount ?? 0
  const remaining = Math.max(0, Math.round(requested * 100 - returned * 100) / 100)
  const position = latestVendorPosition(state)
  // Open on the most likely next step: money back once some has arrived or is on its way.
  const [tab, setTab] = useState<Tab>(returned > 0 || (position && VENDOR_STATUS[position.status].pending) ? 'money' : 'reply')

  const [status, setStatus] = useState<VendorUpdateStatus>('acknowledged')
  const [responseNote, setResponseNote] = useState('')
  const [responseAmount, setResponseAmount] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [followUpDate, setFollowUpDate] = useState(dateValue(state.nextFollowUpAt))
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [method, setMethod] = useState<RecoveryMethod>(state.requestedResolution ?? 'refund')
  const [source, setSource] = useState<RecoveryVerification['source']>('manual')
  const [reference, setReference] = useState('')
  const [appliedToBill, setAppliedToBill] = useState('')
  const [closeReason, setCloseReason] = useState('')
  const [vendorError, setVendorError] = useState('')
  const [proofError, setProofError] = useState('')
  const [closeError, setCloseError] = useState('')

  useEffect(() => { setAmount(remaining.toFixed(2)) }, [remaining])
  useEffect(() => { setFollowUpDate(dateValue(state.nextFollowUpAt)) }, [state.nextFollowUpAt])

  const statusInfo = VENDOR_STATUS[status]

  const logUpdate = () => {
    if (!responseNote.trim()) { setVendorError('Describe what the vendor said or what you sent.'); return }
    const parsedAmount = statusInfo.amount !== 'none' && responseAmount.trim() ? parseMoney(responseAmount) : undefined
    if (statusInfo.amount === 'required' && parsedAmount === undefined) { setVendorError('Enter the amount the vendor accepted.'); return }
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > requested)) { setVendorError('Vendor amount must be within the requested amount.'); return }
    if (parsedAmount !== undefined && !wholeCents(parsedAmount)) { setVendorError('Enter dollars and cents only.'); return }
    if (status === 'partial_acceptance' && parsedAmount !== undefined && (parsedAmount <= 0 || Math.round(parsedAmount * 100) >= Math.round(remaining * 100))) {
      setVendorError(`A partial acceptance is more than $0 and less than ${formatCurrency(remaining)}. For the whole amount, choose "Accepted the claim".`)
      return
    }
    setVendorError('')
    try {
      onVendorUpdate(finding.id, { status, note: responseNote.trim(), at: Date.now(), amount: parsedAmount, expectedAt: dateFromInput(expectedDate) ?? undefined })
    } catch (error) {
      setVendorError(error instanceof Error ? error.message : 'That reply could not be recorded.')
      return
    }
    setResponseNote('')
    setResponseAmount('')
    setExpectedDate('')
  }

  const recordSettlement = () => {
    const parsed = parseMoney(amount)
    if (!Number.isFinite(parsed) || parsed <= 0 || Math.round(parsed * 100) > Math.round(remaining * 100)) { setProofError(`Enter a settled amount from $0.01 to ${formatCurrency(remaining)}.`); return }
    if (!wholeCents(parsed)) { setProofError('Enter dollars and cents only.'); return }
    if (!reference.trim()) { setProofError('Enter a settlement reference.'); return }
    if ((method === 'credit' || method === 'offset') && !appliedToBill.trim()) { setProofError('Enter the bill where the credit was actually applied.'); return }
    const prior = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
    if (prior.some((entry) => entry.method === method && entry.reference.toLowerCase() === reference.trim().toLowerCase() && (entry.appliedToBill ?? undefined) === (appliedToBill.trim() || undefined))) {
      setProofError('This settlement reference was already recorded. Check the earlier return before adding another.')
      return
    }
    setProofError('')
    onVerify(finding.id, { amount: parsed, method, source, reference: reference.trim(), appliedToBill: appliedToBill.trim() || undefined, settledAt: Date.now() })
    setReference('')
    setAppliedToBill('')
  }

  return (
    <section className="wk-panelcard" data-testid="recovery-progress" aria-labelledby="progress-title">
      <div className="wk-panelcard-head">
        <div>
          <h2 id="progress-title">With the vendor</h2>
          <p>
            Asked for {formatCurrency(requested)}{state.recoveryRequestedAt ? ` on ${short.format(state.recoveryRequestedAt)}` : ''}
            {returned > 0 ? ` · ${formatCurrency(returned)} back so far` : ''} · {formatCurrency(remaining)} outstanding
          </p>
        </div>
      </div>

      <div className="wk-panelcard-body wk-stack">
        {state.vendorUpdates?.length || state.recoverySettlements?.length ? (
          <ol className="wk-log" aria-label="Vendor conversation">
            {[
              ...(state.vendorUpdates ?? []).map((update) => ({ at: update.at, kind: 'reply' as const, update })),
              ...(state.recoverySettlements ?? []).map((settlement) => ({ at: settlement.settledAt, kind: 'money' as const, settlement })),
            ]
              .sort((a, b) => a.at - b.at)
              .map((entry, index) => entry.kind === 'reply' ? (
                <li key={`r-${entry.at}-${index}`} data-kind={VENDOR_STATUS[entry.update.status].agreed ? 'agreed' : VENDOR_STATUS[entry.update.status].progress ? 'reply' : 'ours'}>
                  <div><strong>{VENDOR_STATUS[entry.update.status].label}</strong><time>{short.format(entry.update.at)}</time></div>
                  <p>{entry.update.note}</p>
                  {entry.update.amount !== undefined ? <small>{formatCurrency(entry.update.amount)}{entry.update.amountInferred ? ' · the full remaining claim' : ''}{entry.update.expectedAt ? ` · expected ${short.format(entry.update.expectedAt)}` : ''}</small> : entry.update.expectedAt ? <small>Expected {short.format(entry.update.expectedAt)}</small> : null}
                </li>
              ) : (
                <li key={`m-${entry.at}-${index}`} data-kind="money">
                  <div><strong>{formatCurrency(entry.settlement.amount)} came back</strong><time>{short.format(entry.settlement.settledAt)}</time></div>
                  <p>{SETTLEMENT_METHOD_LABEL[entry.settlement.method]} · {entry.settlement.reference}{entry.settlement.appliedToBill ? ` · applied to ${entry.settlement.appliedToBill}` : ''}</p>
                </li>
              ))}
          </ol>
        ) : (
          <p className="wk-field-hint">Nothing recorded yet. Log the vendor's reply here when it arrives; Reclaim does not read or send email.</p>
        )}

        <div className="wk-followup">
          <CalendarClock aria-hidden="true" />
          <div className="wk-field">
            <label htmlFor="follow-up-date">Next follow-up</label>
            <input id="follow-up-date" type="date" className="wk-input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => onFollowUp(finding.id, dateFromInput(followUpDate))}>Save date</button>
        </div>
      </div>

      <div className="wk-panelcard-body wk-stack wk-subsection">
        <div className="wk-seg" role="tablist" aria-label="Record what happened">
          <button type="button" role="tab" aria-selected={tab === 'reply'} aria-pressed={tab === 'reply'} onClick={() => setTab('reply')}>Log a reply</button>
          <button type="button" role="tab" aria-selected={tab === 'money'} aria-pressed={tab === 'money'} onClick={() => setTab('money')}>Record money back</button>
          <button type="button" role="tab" aria-selected={tab === 'close'} aria-pressed={tab === 'close'} onClick={() => setTab('close')}>Close</button>
        </div>

        {tab === 'reply' ? (
          <div className="wk-stack" role="tabpanel" aria-label="Log a reply">
            <div className="wk-fields">
              <div className="wk-field">
                <label htmlFor="vendor-status">What happened?</label>
                <select id="vendor-status" className="wk-input" value={status} onChange={(e) => setStatus(e.target.value as VendorUpdateStatus)}>
                  {VENDOR_STATUS_ORDER.map((value) => <option key={value} value={value}>{VENDOR_STATUS[value].label}</option>)}
                </select>
              </div>
              {statusInfo.amount !== 'none' ? (
                <div className="wk-field">
                  <label htmlFor="vendor-amount">{statusInfo.amount === 'required' ? 'Amount accepted' : 'Amount mentioned (optional)'}</label>
                  <input id="vendor-amount" className="wk-input" inputMode="decimal" value={responseAmount} onChange={(e) => setResponseAmount(e.target.value)} />
                  <span className="wk-field-hint">
                    {status === 'accepted' ? 'Leave blank if the vendor accepted the full remaining claim.' : statusInfo.amount === 'required' ? `Less than the ${formatCurrency(remaining)} still outstanding.` : 'Shown in the pipeline as agreed, never as money back.'}
                  </span>
                </div>
              ) : null}
              {statusInfo.agreed ? (
                <div className="wk-field">
                  <label htmlFor="vendor-expected">Promised date (optional)</label>
                  <input id="vendor-expected" type="date" className="wk-input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                </div>
              ) : null}
              <div className="wk-field" data-wide="true">
                <label htmlFor="vendor-note">Conversation note</label>
                <textarea id="vendor-note" className="wk-input" rows={3} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="What did the vendor say, or what did you send?" />
              </div>
            </div>
            {vendorError ? <p className="wk-field-error" role="alert">{vendorError}</p> : null}
            <div className="wk-actions">
              <button type="button" className="wk-btn" data-variant="dark" data-size="sm" onClick={logUpdate}>Add update</button>
              {status === 'followed_up' ? <span className="wk-field-hint">The next reminder is set five business days out.</span> : null}
            </div>
          </div>
        ) : tab === 'money' ? (
          <div className="wk-stack" role="tabpanel" aria-label="Record money back">
            <p className="wk-field-hint">Record a refund once it lands in your bank, or a credit once it is applied to a real bill. A promise or an issued credit is not money back.</p>
            <div className="wk-fields">
              <div className="wk-field">
                <label htmlFor="settled-amount">Amount settled</label>
                <input id="settled-amount" className="wk-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="wk-field">
                <label htmlFor="settled-method">Came back as</label>
                <select id="settled-method" className="wk-input" value={method} onChange={(e) => setMethod(e.target.value as RecoveryMethod)}>
                  <option value="refund">Cash refund</option>
                  <option value="credit">Applied vendor credit</option>
                  <option value="offset">Offset against payment</option>
                </select>
              </div>
              <div className="wk-field">
                <label htmlFor="settled-source">Checked against</label>
                <select id="settled-source" className="wk-input" value={source} onChange={(e) => setSource(e.target.value as RecoveryVerification['source'])}>
                  <option value="manual">My own records</option>
                  <option value="bank">Bank transaction</option>
                  <option value="accounting">Accounting entry</option>
                  <option value="document">Settlement document</option>
                </select>
              </div>
              <div className="wk-field">
                <label htmlFor="settled-reference">Settlement reference</label>
                <input id="settled-reference" className="wk-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ACH ID, credit memo or entry ID" />
              </div>
              {method !== 'refund' ? (
                <div className="wk-field">
                  <label htmlFor="applied-bill">Bill where applied</label>
                  <input id="applied-bill" className="wk-input" value={appliedToBill} onChange={(e) => setAppliedToBill(e.target.value)} placeholder="Bill or invoice ID" />
                </div>
              ) : null}
            </div>
            {proofError ? <p className="wk-field-error" role="alert">{proofError}</p> : null}
            <div className="wk-actions">
              <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={recordSettlement}>Record settled value</button>
              <span className="wk-field-hint">{formatCurrency(remaining)} remains on this request.</span>
            </div>
          </div>
        ) : (
          <div className="wk-stack" role="tabpanel" aria-label="Close">
            <p className="wk-field-hint">
              {returned > 0
                ? `Close the remaining ${formatCurrency(remaining)} if it is not coming back. The ${formatCurrency(returned)} already recorded stays.`
                : 'Close the case if the money is not coming back. You can reopen it later.'}
            </p>
            <div className="wk-inline-form">
              <div className="wk-field">
                <label htmlFor="close-reason">Reason</label>
                <input id="close-reason" className="wk-input" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="For example, vendor disputed the claim" />
              </div>
              <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => { if (!closeReason.trim()) { setCloseError('Explain why the case is being closed.'); return } setCloseError(''); onClose(finding.id, closeReason.trim()) }}>Close case</button>
            </div>
            {closeError ? <p className="wk-field-error" role="alert">{closeError}</p> : null}
          </div>
        )}
      </div>
    </section>
  )
}

/** After money came back: the closeout in the customer's own books. */
export function RecoveryAccountingPanel({ finding, state, onReconcile }: { finding: Finding; state: CaseState; onReconcile: (id: string, note: string, rootCause: string) => void }) {
  const [note, setNote] = useState(state.reconciliationNote ?? '')
  const [rootCause, setRootCause] = useState(state.rootCause ?? '')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const settlements = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
  const hasRefund = settlements.some((entry) => entry.method === 'refund')
  const hasAppliedCredit = settlements.some((entry) => entry.method === 'credit' || entry.method === 'offset')
  const returned = state.recoveredAmount ?? 0
  const requested = state.requestedAmount ?? finding.dollarImpact

  if (state.recoveryStage !== 'recovered') return null
  if (returned <= 0) {
    return (
      <section className="wk-panelcard" aria-labelledby="books-title">
        <div className="wk-panelcard-head"><div><h2 id="books-title">In your books</h2><p>This older case is marked recovered with no recorded return amount. Use "Correct returned value" to reopen it and record the settlement first.</p></div></div>
      </section>
    )
  }

  return (
    <section className="wk-panelcard" aria-labelledby="books-title" data-testid="recovery-accounting">
      <div className="wk-panelcard-head">
        <div>
          <h2 id="books-title">In your books</h2>
          <p>{formatCurrency(returned)} came back across {settlements.length || 1} {settlements.length === 1 ? 'settlement' : 'settlements'}{requested > returned && state.recoveryOutcomeNote ? `; the other ${formatCurrency(requested - returned)} was closed: ${state.recoveryOutcomeNote}` : ''}.</p>
        </div>
      </div>
      <div className="wk-panelcard-body wk-stack">
        {state.reconciledAt && !editing ? (
          <div className="wk-callout" data-tone="done">
            <CircleCheck aria-hidden="true" />
            <p><strong>Reconciled {short.format(state.reconciledAt)}.</strong> {state.reconciliationNote}{state.rootCause ? ` · Cause: ${state.rootCause}` : ''}</p>
            <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => setEditing(true)}>Edit reconciliation</button>
          </div>
        ) : (
          <>
            <ul className="wk-checklist">
              <li>Find the original bill or payment and check the vendor's current balance.</li>
              {hasRefund ? <li>Match each cash refund to the deposit that settled it, then record it with your vendor-refund flow.</li> : null}
              {hasAppliedCredit ? <li>Confirm each credit or offset reduced the bill it names. A credit that is issued but unused does not count.</li> : null}
              <li>Make sure the returned amount appears once in your books, and note any amount closed without a return.</li>
            </ul>
            <div className="wk-fields">
              <div className="wk-field" data-wide="true">
                <label htmlFor="reconciliation-note">Accounting entry or reconciliation note</label>
                <textarea id="reconciliation-note" className="wk-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, cleared vendor overpayment against bank refund" />
              </div>
              <div className="wk-field">
                <label htmlFor="root-cause">Root cause (optional)</label>
                <select id="root-cause" className="wk-input" value={rootCause} onChange={(e) => setRootCause(e.target.value)}>
                  <option value="">Choose a cause</option>
                  {ROOT_CAUSES.map((cause) => <option key={cause}>{cause}</option>)}
                </select>
              </div>
            </div>
            {error ? <p className="wk-field-error" role="alert">{error}</p> : null}
            <div className="wk-actions">
              <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => { if (!note.trim()) { setError('Describe the reconciliation entry.'); return } setError(''); onReconcile(finding.id, note.trim(), rootCause); setEditing(false) }}>
                {state.reconciledAt ? 'Save reconciliation' : 'Mark reconciled'}
              </button>
              <span className="wk-field-hint">Record the closeout you made in your accounting system. Reclaim does not change your books.</span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
