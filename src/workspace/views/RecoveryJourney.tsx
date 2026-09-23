import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { type CaseState, type RecoveryMethod, type RecoveryVerification, type VendorUpdate, type VendorUpdateStatus } from '@/ledger/caseState'
import { recoveryNextAction } from '@/recovery/model'
import type { Finding } from '@/types'

const RESPONSE_LABELS: Record<VendorUpdateStatus, string> = {
  acknowledged: 'Acknowledged', accepted: 'Accepted the claim', partial_acceptance: 'Accepted part of the claim',
  already_refunded: 'Says refund was sent', payment_not_found: 'Cannot find the payment', no_action_required: 'Says no action is needed',
  needs_documents: 'Asked for documents', disputed: 'Disputed',
  promised: 'Promised refund or credit', credit_issued: 'Credit issued, not yet applied',
  wrong_contact: 'Wrong contact', no_response: 'No response', followed_up: 'Follow-up sent',
}
const SETTLEMENT_METHOD_LABEL: Record<RecoveryMethod, string> = { refund: 'Cash refund', credit: 'Applied vendor credit', offset: 'Payment offset' }
const dateValue = (time: number | null | undefined) => {
  if (!time) return ''
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const dateFromInput = (value: string) => value ? new Date(`${value}T12:00:00`).getTime() : null

export function RecoveryProgressPanel({ finding, state, onVendorUpdate, onFollowUp, onVerify, onClose }: {
  finding: Finding
  state: CaseState
  onVendorUpdate: (id: string, update: VendorUpdate) => void
  onFollowUp: (id: string, at: number | null) => void
  onVerify: (id: string, proof: RecoveryVerification) => void
  onClose: (id: string, reason: string) => void
}) {
  const action = recoveryNextAction(state)
  const requested = state.requestedAmount ?? finding.dollarImpact
  const remaining = Math.max(0, Math.round(requested * 100 - (state.recoveredAmount ?? 0) * 100) / 100)
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

  const logUpdate = () => {
    if (!responseNote.trim()) { setVendorError('Describe what the vendor said or what you sent.'); return }
    const parsedAmount = responseAmount.trim() ? Number(responseAmount.replace(/[$,\s]/g, '')) : undefined
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > requested)) { setVendorError('Vendor amount must be within the requested amount.'); return }
    if (parsedAmount !== undefined && Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 0.000001) { setVendorError('Enter dollars and cents only.'); return }
    setVendorError('')
    onVendorUpdate(finding.id, { status, note: responseNote.trim(), at: Date.now(), amount: parsedAmount, expectedAt: dateFromInput(expectedDate) ?? undefined })
    setResponseNote('')
    setResponseAmount('')
    setExpectedDate('')
  }

  const recordSettlement = () => {
    const parsed = Number(amount.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(parsed) || parsed <= 0 || Math.round(parsed * 100) > Math.round(remaining * 100)) { setProofError(`Enter a settled amount from $0.01 to ${formatCurrency(remaining)}.`); return }
    if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.000001) { setProofError('Enter dollars and cents only.'); return }
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
    <div className="wk-recovery-flow" data-testid="recovery-progress">
      <div className="wk-card wk-next-action">
        <span className="wk-label">Next action</span>
        <strong>{action.label}</strong>
        <p className="wk-dim">{action.detail}</p>
        {action.dueAt ? <span className="wk-table-sub">Target {new Date(action.dueAt).toLocaleDateString()}</span> : null}
      </div>

      <div className="wk-card-flat">
        <div className="wk-section-head"><h3 className="wk-display wk-h2">Vendor conversation</h3><span className="wk-mark" data-tone="info">Customer recorded</span></div>
        <p className="wk-dim wk-flow-intro">Replies and follow-ups are recorded here by you. Reclaim does not read or send email yet.</p>
        {state.vendorUpdates?.length ? (
          <ol className="wk-contact-log">
            {state.vendorUpdates.map((update, index) => (
              <li key={`${update.at}-${index}`}><strong>{RESPONSE_LABELS[update.status]}</strong><span>{new Date(update.at).toLocaleDateString()}</span><p>{update.note}</p>{update.amount !== undefined ? <small>{formatCurrency(update.amount)}{update.amountInferred ? ' · full remaining claim inferred from acceptance' : ''}</small> : null}</li>
            ))}
          </ol>
        ) : <p className="wk-table-sub">No vendor response recorded yet.</p>}
        <div className="wk-flow-fields">
          <div className="wk-field"><label htmlFor="vendor-status">What happened?</label><select id="vendor-status" className="wk-input" value={status} onChange={(e) => setStatus(e.target.value as VendorUpdateStatus)}>{Object.entries(RESPONSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="wk-field"><label htmlFor="vendor-amount">Amount mentioned (optional)</label><input id="vendor-amount" className="wk-input" inputMode="decimal" value={responseAmount} onChange={(e) => setResponseAmount(e.target.value)} />{status === 'accepted' ? <small className="wk-table-sub">Leave blank if the vendor accepted the full remaining claim.</small> : ['partial_acceptance', 'promised', 'credit_issued', 'already_refunded'].includes(status) ? <small className="wk-table-sub">Enter the vendor's amount to show it in the recovery pipeline. Leave blank if unknown.</small> : null}</div>
          <div className="wk-field"><label htmlFor="vendor-expected">Promised date (optional)</label><input id="vendor-expected" type="date" className="wk-input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
          <div className="wk-field wk-flow-wide"><label htmlFor="vendor-note">Conversation note</label><textarea id="vendor-note" className="wk-input" rows={3} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="What did the vendor say, or what did you send?" /></div>
        </div>
        {vendorError ? <p className="wk-field-error wk-flow-error" role="alert">{vendorError}</p> : null}
        <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={logUpdate}>Add update</button>
      </div>

      <div className="wk-card-flat">
        <h3 className="wk-display wk-h2">Follow-up</h3>
        <p className="wk-dim wk-flow-intro">A reminder is suggested five business days after outreach. Choose another date if it fits your vendor relationship.</p>
        <div className="wk-flow-inline"><div className="wk-field"><label htmlFor="follow-up-date">Next follow-up</label><input id="follow-up-date" type="date" className="wk-input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></div><button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => onFollowUp(finding.id, dateFromInput(followUpDate))}>Save date</button></div>
        <p className="wk-table-sub">After you send a reminder yourself, record “Follow-up sent” in the conversation above. Reclaim will suggest the next business-day reminder.</p>
      </div>

      <div className="wk-card-flat">
        <h3 className="wk-display wk-h2">Verify returned value</h3>
        <p className="wk-dim wk-flow-intro">A promise or issued credit is pending. Record a refund only when it settles, or a credit only after it is applied to a real bill. {formatCurrency(remaining)} remains on this request.</p>
        {state.recoverySettlements?.length ? <ol className="wk-contact-log">{state.recoverySettlements.map((settlement, index) => <li key={`${settlement.reference}-${index}`}><strong>{formatCurrency(settlement.amount)} returned</strong><span>{new Date(settlement.settledAt).toLocaleDateString()}</span><p>{SETTLEMENT_METHOD_LABEL[settlement.method]} · {settlement.reference}{settlement.appliedToBill ? ` · ${settlement.appliedToBill}` : ''}</p></li>)}</ol> : null}
        <div className="wk-flow-fields">
          <div className="wk-field"><label htmlFor="settled-amount">Amount settled</label><input id="settled-amount" className="wk-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="wk-field"><label htmlFor="settled-method">Came back as</label><select id="settled-method" className="wk-input" value={method} onChange={(e) => setMethod(e.target.value as RecoveryMethod)}><option value="refund">Cash refund</option><option value="credit">Applied vendor credit</option><option value="offset">Offset against payment</option></select></div>
          <div className="wk-field"><label htmlFor="settled-source">Checked against</label><select id="settled-source" className="wk-input" value={source} onChange={(e) => setSource(e.target.value as RecoveryVerification['source'])}><option value="manual">My own records</option><option value="bank">Bank transaction</option><option value="accounting">Accounting entry</option><option value="document">Settlement document</option></select></div>
          <div className="wk-field"><label htmlFor="settled-reference">Settlement reference</label><input id="settled-reference" className="wk-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ACH ID, credit memo, or entry ID" /></div>
          {method !== 'refund' ? <div className="wk-field"><label htmlFor="applied-bill">Bill where applied</label><input id="applied-bill" className="wk-input" value={appliedToBill} onChange={(e) => setAppliedToBill(e.target.value)} placeholder="Bill or invoice ID" /></div> : null}
        </div>
        {proofError ? <p className="wk-field-error wk-flow-error" role="alert">{proofError}</p> : null}
        <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={recordSettlement}>Record settled value</button>
      </div>

      <div className="wk-card-flat">
        <h3 className="wk-display wk-h2">{(state.recoveredAmount ?? 0) > 0 ? 'Close remaining balance' : 'Close without recovery'}</h3>
        <div className="wk-flow-inline"><div className="wk-field"><label htmlFor="close-reason">Reason</label><input id="close-reason" className="wk-input" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="For example, vendor disputed the claim" /></div><button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => { if (!closeReason.trim()) { setCloseError('Explain why the case is being closed.'); return } setCloseError(''); onClose(finding.id, closeReason.trim()) }}>Close case</button></div>
        {closeError ? <p className="wk-field-error wk-flow-error" role="alert">{closeError}</p> : null}
      </div>
    </div>
  )
}

export function RecoveryAccountingPanel({ finding, state, onReconcile }: { finding: Finding; state: CaseState; onReconcile: (id: string, note: string, rootCause: string) => void }) {
  const [note, setNote] = useState(state.reconciliationNote ?? '')
  const [rootCause, setRootCause] = useState(state.rootCause ?? '')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const proof = state.recoveryVerification
  const settlements = state.recoverySettlements ?? (proof ? [proof] : [])
  const hasRefund = settlements.some((entry) => entry.method === 'refund')
  const hasAppliedCredit = settlements.some((entry) => entry.method === 'credit' || entry.method === 'offset')
  if (state.recoveryStage !== 'recovered') return <div className="wk-card-flat"><p className="wk-dim">{(state.recoveredAmount ?? 0) > 0 ? `${formatCurrency(state.recoveredAmount ?? 0)} has been recorded as returned. ${formatCurrency(Math.max(0, (state.requestedAmount ?? finding.dollarImpact) - (state.recoveredAmount ?? 0)))} remains open; record the next settlement or close that balance before final reconciliation.` : 'No settled return to reconcile yet. Reclaim will show the accounting closeout here after you record one.'}</p></div>
  if ((state.recoveredAmount ?? 0) <= 0) return <div className="wk-card-flat"><p className="wk-dim">This older case is marked recovered, but it has no recorded return amount. Use “Correct returned value” above to reopen the request and record the settlement before reconciling.</p></div>
  return <div className="wk-card-flat">
    <span className="wk-label">Customer verified return</span>
    <p className="wk-flow-proof"><strong>{formatCurrency(state.recoveredAmount ?? 0)}</strong> {settlements.length ? `returned across ${settlements.length} recorded settlement${settlements.length === 1 ? '' : 's'}` : 'recorded as returned in an earlier version'}</p>
    {state.recoverySettlements?.length ? <ol className="wk-contact-log">{state.recoverySettlements.map((settlement, index) => <li key={`${settlement.reference}-${index}`}><strong>{formatCurrency(settlement.amount)} · {SETTLEMENT_METHOD_LABEL[settlement.method]}</strong><span>{new Date(settlement.settledAt).toLocaleDateString()}</span><p>{settlement.reference}{settlement.appliedToBill ? ` · ${settlement.appliedToBill}` : ''}</p></li>)}</ol> : null}
    {(state.requestedAmount ?? 0) > (state.recoveredAmount ?? 0) && state.recoveryOutcomeNote ? <p className="wk-table-sub">Remaining {formatCurrency((state.requestedAmount ?? 0) - (state.recoveredAmount ?? 0))} closed: {state.recoveryOutcomeNote}</p> : null}
    {proof ? <p className="wk-table-sub">Latest settlement checked by the customer against {proof.source === 'manual' ? 'their own records' : proof.source} on {new Date(proof.settledAt).toLocaleDateString()}.</p> : null}
    {state.reconciledAt ? <div className="wk-flow-inline"><p className="wk-mark wk-reconciliation-summary" data-tone="strong">Reconciled {new Date(state.reconciledAt).toLocaleDateString()} · {state.reconciliationNote}</p>{!editing ? <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => setEditing(true)}>Edit reconciliation</button> : null}</div> : null}
    {!state.reconciledAt || editing ? <>
      <div className="wk-evidence-checklist"><span className="wk-label">Accounting closeout</span><ul>
        <li>Locate the original bill or payment and check the current vendor balance.</li>
        {hasRefund ? <li>Match each cash refund amount and reference to the settled deposit, then use the vendor refund flow appropriate to the original transaction.</li> : null}
        {hasAppliedCredit ? <li>Confirm each credit or offset reduced the referenced bill; an issued but unused credit does not complete this step.</li> : null}
        <li>Confirm the returned value appears once in your books and document any amount closed without return.</li>
      </ul></div>
      <p className="wk-dim wk-flow-intro">Record the closeout you completed in your accounting system. Reclaim does not change your books.</p>
      <div className="wk-flow-fields">
        <div className="wk-field wk-flow-wide"><label htmlFor="reconciliation-note">Accounting entry or reconciliation note</label><textarea id="reconciliation-note" className="wk-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, cleared vendor overpayment against bank refund" /></div>
        <div className="wk-field"><label htmlFor="root-cause">Root cause (optional)</label><select id="root-cause" className="wk-input" value={rootCause} onChange={(e) => setRootCause(e.target.value)}><option value="">Choose a cause</option><option>Invoice entered twice</option><option>Vendor duplicate record</option><option>Invoice renumbered</option><option>Payment issued across systems</option><option>Payment retry</option><option>Vendor resent invoice</option><option>Credit memo never entered</option><option>Return not communicated to AP</option><option>Pricing mismatch</option><option>Contract cancellation missed</option><option>Accounting migration</option><option>Entity mismatch</option><option>Manual entry error</option><option>Other</option></select></div>
      </div>
      {error ? <p className="wk-field-error wk-flow-error" role="alert">{error}</p> : null}
      <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => { if (!note.trim()) { setError('Describe the reconciliation entry.'); return } setError(''); onReconcile(finding.id, note.trim(), rootCause); setEditing(false) }}>{state.reconciledAt ? 'Save reconciliation' : 'Mark reconciled'}</button>
    </> : null}
  </div>
}
