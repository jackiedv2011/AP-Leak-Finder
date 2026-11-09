import { useState, type ReactNode } from 'react'
import { evaluateEligibility, type RecoveryEvidence } from '@/recovery/eligibility'
import { EvidencePanel } from './EvidencePanel'
import { CalendarClock, CircleCheck, CircleHelp, CircleX, ListChecks, TriangleAlert } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { DECISION_LABEL, type DecisionValue, type DismissalTag, type RecoveryMethod, type RecoveryVerification, type VendorUpdate } from '@/ledger/caseState'
import { DecisionDialog } from '@/components/audit/DecisionDialog'
import { Locked } from '@/components/plan/Locked'
import { useEntitlements } from '@/lib/auth/AuthContext'
import type { CaseState } from '@/ledger/caseState'
import type { ImportBatch } from '@/ledger/store'
import type { SenderProfile } from '@/lib/senderProfile'
import type { APRecord, Finding } from '@/types'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { recommendRecoveryMethod, recoveryNextAction } from '@/recovery/model'
import { recoveryLedger, RECOVERY_LEDGER_LABEL } from '@/recovery/ledger'
import { activeReturned, validSettlements, verifiedReturned } from '@/recovery/financials'
import { latestVendorPosition } from '@/recovery/vendorStatus'
import { playbookFor } from '@/recovery/playbooks'
import { evidenceOf, openQuestion, timelineFor } from '../selectors'
import { StatusChip } from './StatusChip'
import { InternalReviewPanel, METHOD_LABEL, RecoveryRequestPanel, type RequestPackage } from './RecoveryPanels'
import type { GmailSendReceipt } from '@/lib/gmailApi'
import { GmailAttemptActivity, GmailFollowUp } from '@/components/gmail/Gmail'
import { RecoveryAccountingPanel, RecoveryProgressPanel } from './RecoveryJourney'
import { KIND_LABEL, KindChip } from './KindChip'
import { Strength } from './Strength'
import { CaseAssistant } from './CaseAssistant'
import { findingReference, nextActionLabel } from './findingText'

interface CaseDetailProps {
  finding: Finding
  findings?: Finding[]
  projectId?: string
  sample?: boolean
  owner?: string | null
  sampleEvidence?: RecoveryEvidence
  onSaveEvidence?: (findingId: string, evidence: RecoveryEvidence) => void
  state: CaseState
  records: APRecord[]
  /** The ledger's import batches: a QuickBooks import's credit, refund and void searches pre-fill evidence. */
  imports?: ImportBatch[]
  discoveredAt: number | null
  sender: SenderProfile
  onDecide: (findingId: string, decision: DecisionValue, reason: string | null, dismissalTag?: DismissalTag | null) => void
  onMarkRequested: (findingId: string, pkg: RequestPackage) => void
  onRecordOutcome: (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null, method: RecoveryMethod | null) => void
  /** Take back the last step: a decision (until a request is sent) or a recorded outcome. */
  onReopen: (findingId: string) => void
  onReopenBalance: (findingId: string) => void
  onBeginNewRequestReview?: (findingId: string) => void
  onHistoricalSettlement?: (findingId: string, generation: number, proof: RecoveryVerification) => void
  onApproveRecovery: (findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => void
  onApproveAndSend?: (findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => void
  /** Gmail accepted the request; record it as sent. */
  onEmailSent?: (findingId: string, pkg: RequestPackage, receipt: GmailSendReceipt) => void
  /** Gmail accepted a follow-up the customer confirmed; record it. */
  onFollowUpSent?: (findingId: string, receipt: GmailSendReceipt) => void
  /** "Follow up if there's no reply after N days" changed. */
  onFollowUpDays?: (findingId: string, days: number) => void
  onContactHold: (findingId: string, reason: string | null) => void
  onVendorUpdate: (findingId: string, update: VendorUpdate) => void
  onFollowUp: (findingId: string, at: number | null) => void
  onVerifyRecovery: (findingId: string, proof: RecoveryVerification) => void
  onCloseRecovery: (findingId: string, reason: string) => void
  onReconcileRecovery: (findingId: string, note: string, rootCause: string) => void
}

const stamp = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const longDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function HistoricalSettlementForm({ findingId, generation, onRecord }: { findingId: string; generation: number; onRecord: NonNullable<CaseDetailProps['onHistoricalSettlement']> }) {
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState<RecoveryMethod>('refund')
  const [appliedToBill, setAppliedToBill] = useState('')
  const [settledDate, setSettledDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [error, setError] = useState<string | null>(null)
  const record = () => {
    const parsed = Number(amount)
    const settledAt = new Date(`${settledDate}T00:00:00`).getTime()
    if (!Number.isFinite(parsed) || parsed <= 0 || Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.000001 || !reference.trim() || !Number.isFinite(settledAt) || settledAt > Date.now() + 60_000 || ((method === 'credit' || method === 'offset') && !appliedToBill.trim())) {
      setError('Enter a valid amount, settlement date, and reference. For a credit or offset, include the bill where it was applied.')
      return
    }
    try {
      onRecord(findingId, generation, { amount: parsed, method, source: 'manual', reference: reference.trim(), settledAt, appliedToBill: appliedToBill.trim() || undefined })
      setAmount(''); setReference(''); setAppliedToBill(''); setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The earlier return could not be recorded.')
    }
  }
  return <div className="wk-stack">
    <strong>Record a later return for request {generation}</strong>
    <div className="wk-fields" data-columns="3">
      <label>Amount<input className="wk-input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Method<select className="wk-input" value={method} onChange={(event) => setMethod(event.target.value as RecoveryMethod)}><option value="refund">Refund</option><option value="credit">Applied credit</option><option value="offset">Offset</option></select></label>
      <label>Settlement reference<input className="wk-input" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
      <label>Settled on<input className="wk-input" type="date" value={settledDate} onChange={(event) => setSettledDate(event.target.value)} /></label>
    </div>
    {method !== 'refund' ? <label>Bill where applied<input className="wk-input" value={appliedToBill} onChange={(event) => setAppliedToBill(event.target.value)} /></label> : null}
    {error ? <p role="alert" className="wk-field-error">{error}</p> : null}
    <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={record}>Record earlier return</button>
  </div>
}

const CHOICES: Array<{ value: DecisionValue; title: string; detail: string; internal: string; icon: typeof CircleCheck }> = [
  { value: 'confirmed', title: 'I reviewed this check', detail: 'You believe these records describe a possible duplicate. The evidence and request amount still need review before outreach.', internal: 'You believe this needs an internal review. No supplier request is created.', icon: CircleCheck },
  { value: 'needs_info', title: 'I need more detail', detail: 'Keep it open while you check a PO, statement or the vendor.', internal: 'Keep it open while you gather more context.', icon: CircleHelp },
  { value: 'expected', title: 'Not an issue', detail: 'Expected, or a detection mistake. It leaves the open findings.', internal: 'Expected, or a detection mistake. It leaves the open findings.', icon: CircleX },
]

type Column = { label: string; value: (r: APRecord) => string; key: (r: APRecord) => string | null; right?: boolean }
const COLUMNS: Column[] = [
  { label: 'Invoice', value: (r) => r.invoiceNumber ?? '—', key: (r) => r.invoiceNumber },
  { label: 'Invoice date', value: (r) => formatDate(r.invoiceDate), key: (r) => r.invoiceDate?.toDateString() ?? null },
  { label: 'Paid on', value: (r) => formatDate(r.paymentDate), key: (r) => r.paymentDate.toDateString() },
  { label: 'Invoiced', value: (r) => (r.invoiceAmount === null ? '—' : formatCurrency(r.invoiceAmount)), key: (r) => (r.invoiceAmount === null ? null : String(r.invoiceAmount)), right: true },
  { label: 'Amount paid', value: (r) => formatCurrency(r.amountPaid), key: (r) => String(r.amountPaid), right: true },
]

/** The records behind the finding. Values repeated across rows are what made them match, so they are marked. */
function EvidenceReference({ reference }: { reference: string }) {
  try {
    const url = new URL(reference)
    if (url.protocol === 'https:' || url.protocol === 'http:') return <a href={url.href} target="_blank" rel="noreferrer">{reference}</a>
  } catch {
    // File names and accounting references are displayed as text.
  }
  return <>{reference}</>
}

function Evidence({ finding, checklist = true }: { finding: Finding; checklist?: boolean }) {
  const records = finding.relatedRecords
  const showVendor = new Set(records.map((r) => r.vendor.trim().toLowerCase())).size > 1
  const playbook = checklist && finding.class === 'recoverable' ? playbookFor(finding) : null
  const repeated = (column: Column, record: APRecord) => {
    if (records.length < 2) return false
    const key = column.key(record)
    return key !== null && records.filter((r) => column.key(r) === key).length > 1
  }
  const cell = (c: Column, record: APRecord) => (repeated(c, record) ? <span className="wk-cell-hit">{c.value(record)}</span> : c.value(record))
  return (
    <section className="wk-panelcard" data-m="evidence" aria-labelledby="case-evidence">
      <div className="wk-panelcard-head">
        <div>
          <h2 id="case-evidence">Evidence</h2>
          <p>
            {records.length} {records.length === 1 ? 'payment' : 'payments'} from the ledger you loaded
            {records.length > 1 ? '. Highlighted values match across rows.' : '.'}
          </p>
        </div>
      </div>
      {finding.evidence ? (
        <ul className="wk-panelcard-body">
          <li>Bill {finding.evidence.obligation.obligationId} · <EvidenceReference reference={finding.evidence.obligation.reference} /></li>
          {finding.evidence.payments.map((payment) => <li key={payment.recordId}>Payment {payment.paymentId} · <EvidenceReference reference={payment.reference} /></li>)}
          {finding.evidence.priorReturns?.map((entry, index) => <li key={index}>{entry.method === 'refund' ? 'Refund' : 'Applied credit'} · <EvidenceReference reference={entry.reference} /></li>)}
        </ul>
      ) : null}
      <details className="wk-panelcard-body wk-evq-details">
      <summary>Matched ledger rows</summary>
      <div className="wk-evidence-table" style={{ overflowX: 'auto' }}>
        <table className="wk-table">
          <thead>
            <tr>
              {showVendor ? <th>Vendor</th> : null}
              {COLUMNS.map((c) => <th key={c.label} className={c.right ? 'wk-right' : undefined}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} style={{ cursor: 'default' }}>
                {showVendor ? <td className="wk-table-vendor">{record.vendor}</td> : null}
                {COLUMNS.map((c) => <td key={c.label} className={c.right ? 'wk-right wk-table-money' : 'wk-num'}>{cell(c, record)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="wk-evidence-cards">
        {records.map((record) => (
          <li key={record.id}>
            {showVendor ? <strong>{record.vendor}</strong> : null}
            <dl className="wk-kv">
              {COLUMNS.map((c) => (
                <div key={c.label}>
                  <dt>{c.label}</dt>
                  <dd>{cell(c, record)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      </details>
      {playbook ? (
        <div className="wk-panelcard-body wk-subsection wk-stack">
          <h3 className="wk-subhead"><ListChecks aria-hidden="true" />Before asking the vendor</h3>
          <ul className="wk-checklist">
            {playbook.checks.map((check) => <li key={check}>{check}</li>)}
          </ul>
          <p className="wk-field-hint">{playbook.nextStep}</p>
        </div>
      ) : null}
    </section>
  )
}

/** Only the figures that exist yet. A column of dashes says nothing. */
function RecoveryFacts({ finding, state }: { finding: Finding; state: CaseState }) {
  const internal = !historicalRecoveryClaim(finding, state)
  const status = <StatusChip state={state} internal={internal} />
  const rows: Array<[string, ReactNode, boolean?]> = []
  if (internal) {
    rows.push(['Flagged value', formatCurrency(finding.dollarImpact)], ['Status', status])
    if (state.recoveryOutcomeNote) rows.push(['Investigation outcome', state.recoveryOutcomeNote])
  } else {
    const requested = state.recoveryStage && state.recoveryStage !== 'confirmed' ? state.requestedAmount ?? null : null
    const received = verifiedReturned(state)
    const closed = state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered'
    const remaining = requested !== null ? Math.max(0, requested - activeReturned(state)) : null
    const methods = new Set(state.recoverySettlements?.map((entry) => entry.method) ?? [])
    const method = state.recoveredVia ?? state.requestedResolution ?? null
    rows.push(['Flagged value', formatCurrency(finding.dollarImpact)], ['Status', status])
    if (requested !== null) rows.push(['Requested', formatCurrency(requested)])
    if (received > 0 || state.recoveryStage === 'not_recovered') rows.push(['Return recorded by customer', formatCurrency(received), received > 0])
    if ((state.legacyRecoveredAmount ?? 0) > 0) rows.push(['Older unverified amount (not counted)', formatCurrency(state.legacyRecoveredAmount!)])
    if (requested === null && state.recoveryStage === 'requested') rows.push(['Requested amount', 'Missing from legacy case; confirm the original request'])
    if (remaining !== null && (remaining > 0 || !closed)) rows.push([closed ? 'Unreturned balance' : 'Still outstanding', formatCurrency(remaining)])
    if (methods.size > 1) rows.push(['Method', 'Mixed methods'])
    else if (method) rows.push(['Method', METHOD_LABEL[method]])
  }
  return (
    <dl className="wk-kv" data-testid="recovery-facts">
      {rows.map(([label, value, accent]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd data-accent={accent || undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const STEPS = ['Prove it', 'Approve the request', 'Send it to the vendor', 'Money comes back', 'Record it in your books'] as const

function historicalRecoveryClaim(finding: Finding, state: CaseState): boolean {
  return finding.class === 'recoverable' || (['exact_duplicate', 'near_duplicate'].includes(finding.type) &&
    (state.recoveryStage === 'requested' || state.recoveryStage === 'recovered') && (state.requestedAmount != null || verifiedReturned(state) > 0))
}

function stepsDone(state: CaseState): boolean[] {
  const sent = ['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '')
  return [
    state.decision === 'confirmed',
    Boolean(state.approvedAt) || sent,
    sent,
    state.recoveryStage === 'recovered' && activeReturned(state) > 0,
    Boolean(state.reconciledAt),
  ]
}

/** §29 — what happened and the work in front of you, the decision and money alongside. */
export function CaseDetail(props: CaseDetailProps) {
  const { finding, findings = [], imports, projectId, onSaveEvidence, state, records, discoveredAt, sender, onDecide, onMarkRequested, onRecordOutcome, onReopen, onReopenBalance, onBeginNewRequestReview, onHistoricalSettlement, onApproveRecovery, onApproveAndSend, onEmailSent, onFollowUpSent, onFollowUpDays, onContactHold, onVendorUpdate, onFollowUp, onVerifyRecovery, onCloseRecovery, onReconcileRecovery } = props
  const gate = evaluateEligibility(finding, finding.evidence, findings)
  const entitlements = useEntitlements()
  const [deciding, setDeciding] = useState<DecisionValue | null>(null)
  const internal = !historicalRecoveryClaim(finding, state)
  const duplicate = finding.type === 'exact_duplicate' || finding.type === 'near_duplicate'
  const canChangeDecision = state.decision !== null && (state.recoveryStage === null || state.recoveryStage === 'confirmed')
  const canReopenOutcome = !state.requiresRevalidation && (state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered')
  const hasClosedRemainder = !internal && !state.requiresRevalidation && state.recoveryStage === 'recovered' && activeReturned(state) > 0 && Math.round((state.requestedAmount ?? 0) * 100) > Math.round(activeReturned(state) * 100)
  const evidence = evidenceOf(finding)
  const question = openQuestion(finding)
  const steps = timelineFor(finding, state, discoveredAt)
  const typeLabel = FINDING_TYPE_LABELS[finding.type] ?? finding.type
  const history = state.history ?? []
  const moneyEvents = internal ? [] : recoveryLedger(state)
  const now = Date.now()
  const prior = gate.amountBreakdown
  const settlements = validSettlements(state)
  const refunds = prior.refundedMinor + settlements.filter((entry) => entry.method === 'refund').reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)
  const credits = prior.appliedCreditMinor + settlements.filter((entry) => entry.method !== 'refund').reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)
  const openAmount = Math.max(0, prior.overpaymentMinor - refunds - credits - prior.ledgerAdjustmentMinor)
  const response = latestVendorPosition(state)
  const waitingForReturn = state.recoveryStage === 'requested' && openAmount > 0
  const supplier = finding.evidence?.supplier
  const entityId = finding.evidence?.entity?.entityId
  const contactMatches = supplier && entityId ? findings.flatMap((candidate) => {
    const evidence = candidate.evidence
    const contact = evidence?.supplier?.contact
    return evidence?.entity?.entityId === entityId && evidence.supplier?.supplierId === supplier.supplierId && contact?.source === 'supplier_record' ? [contact] : []
  }) : []
  const suggestedContact = supplier?.contact ?? (new Set(contactMatches.map((contact) => contact.email.toLowerCase())).size === 1 ? contactMatches[0] : undefined)
  const caseOwner = history.findLast((event) => event.action === 'recovery:approved')?.actor ?? props.owner ?? 'Workspace account'
  const nextAction = state.recoveryStage ? recoveryNextAction(state, now, internal) : null
  const done = stepsDone(state)
  const currentStep = done.findIndex((isDone) => !isDone)

  const timeline = history.length > 0 ? (
    <ul className="wk-timeline" data-testid="case-history">
      <li data-done="true">
        <span className="wk-timeline-when">{steps[0].when}</span>
        <span className="wk-timeline-dot" aria-hidden="true" />
        <div>
          <div className="wk-timeline-what">Finding created</div>
          <div className="wk-timeline-detail">{steps[0].detail}</div>
        </div>
      </li>
      {history.map((event, i) => (
        <li key={`${event.at}-${i}`} data-done="true">
          <span className="wk-timeline-when">{stamp(event.at)}</span>
          <span className="wk-timeline-dot" aria-hidden="true" />
          <div>
            <div className="wk-timeline-what">
              {event.summary}
              {event.amount != null ? ` · ${formatCurrency(event.amount)}` : ''}
              {event.method ? ` · ${METHOD_LABEL[event.method]}` : ''}
            </div>
            <div className="wk-timeline-detail">
              {event.actor ? `By ${event.actor}` : 'Guest session'}
              {event.note ? ` · ${event.note}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <ul className="wk-timeline">
      {steps.map((step) => (
        <li key={step.what} data-done={step.done || undefined}>
          <span className="wk-timeline-when">{step.done ? step.when : ''}</span>
          <span className="wk-timeline-dot" aria-hidden="true" />
          <div>
            <div className="wk-timeline-what">{step.what}</div>
            {step.detail ? <div className="wk-timeline-detail">{step.detail}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  )

  // Vendor outreach needs a passed evidence gate; internal reviews keep their note-to-team flow.
  const workPanel =
    state.recoveryStage === 'confirmed' && (internal || (gate.eligible && !state.requiresRevalidation)) ? (
      <RecoveryRequestPanel
        key={finding.id}
        projectId={projectId}
        sample={props.sample}
        finding={finding}
        suggestedContact={suggestedContact}
        state={state}
        sender={sender}
        limits={entitlements.limits}
        onMarkRequested={(pkg) => onMarkRequested(finding.id, pkg)}
        onApprove={(pkg, known, note) => onApproveRecovery(finding.id, pkg, known, note)}
        onApproveAndSend={onApproveAndSend ? (pkg, known, note) => onApproveAndSend(finding.id, pkg, known, note) : undefined}
        onEmailSent={onEmailSent ? (pkg, receipt) => onEmailSent(finding.id, pkg, receipt) : undefined}
        onContactHold={(reason) => onContactHold(finding.id, reason)}
        recommendation={internal ? undefined : recommendRecoveryMethod(finding, records)}
      />
    ) : state.recoveryStage === 'requested' && !internal ? (
      <>
        {!state.requiresRevalidation && onFollowUpSent && onFollowUpDays ? (
          <GmailFollowUp key={`follow-up-${finding.id}`} finding={finding} state={state} projectId={projectId} sender={sender} onSent={(receipt) => onFollowUpSent(finding.id, receipt)} onChangeDays={(days) => onFollowUpDays(finding.id, days)} />
        ) : null}
        <RecoveryProgressPanel key={finding.id} finding={finding} state={state} onVendorUpdate={onVendorUpdate} onFollowUp={onFollowUp} onVerify={onVerifyRecovery} onClose={onCloseRecovery} />
      </>
    ) : state.recoveryStage === 'requested' && internal ? (
      <InternalReviewPanel key={finding.id} onClose={(note) => onRecordOutcome(finding.id, 'not_recovered', null, note, null)} />
    ) : null

  const canEditEvidence = Boolean(onSaveEvidence && !['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '') && (finding.type === 'exact_duplicate' || finding.type === 'near_duplicate'))

  return (
    <>
      <header className="wk-head">
        <div className="wk-head-copy">
          <div className="wk-head-meta">
            <span>{KIND_LABEL[finding.class]}</span>
            <span>{findingReference(finding)}</span>
          </div>
          <h1>{finding.vendor}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <StatusChip state={state} internal={internal} size="lg" />
            <KindChip finding={finding} label={typeLabel} />
            <Strength level={evidence} />
          </div>
        </div>
        <div className="wk-head-copy wk-head-figure">
          <span className="wk-label">Flagged value</span>
          <strong className="wk-money">{formatCurrency(finding.dollarImpact)}</strong>
        </div>
      </header>

      <div className="wk-case">
        <div className="wk-case-main">
          <section className="wk-panelcard" data-m="what" aria-labelledby="case-what">
            <div className="wk-panelcard-head"><h2 id="case-what">Why it was flagged</h2></div>
            <div className="wk-panelcard-body wk-case-summary">
              <p>{finding.explanation}</p>
              <p className="wk-field-hint">{typeLabel} · {findingReference(finding)}</p>
              {duplicate ? <p className="wk-field-hint">{gate.eligible ? 'The cited records support a claim after reviewer confirmation.' : 'Possible issue. Supplier outreach requires a completed evidence review.'}</p> : null}
              {question && (state.decision === null || state.decision === 'needs_info') ? (
                <div className="wk-question" role="note">
                  <TriangleAlert aria-hidden="true" />
                  <span><strong>Still open:</strong> {question}</span>
                </div>
              ) : null}
            </div>
          </section>

          {duplicate && gate.eligible ? (
            <section className="wk-panelcard" aria-labelledby="case-amount">
              <div className="wk-panelcard-head"><div><h2 id="case-amount">Amount</h2><p>Outstanding <strong>{formatCurrency(openAmount / 100)}</strong></p></div></div>
              <div className="wk-panelcard-body wk-stack">
                <details className="wk-evq-details"><summary>Show calculation</summary>
                  <dl className="wk-kv">
                    <div><dt>Original overpayment</dt><dd>{formatCurrency(prior.overpaymentMinor / 100)}</dd></div>
                    <div><dt>Confirmed refunds</dt><dd>−{formatCurrency(refunds / 100)}</dd></div>
                    <div><dt>Confirmed applied credits</dt><dd>−{formatCurrency(credits / 100)}</dd></div>
                    {prior.ledgerAdjustmentMinor ? <div><dt>Adjustment already included in the ledger flag</dt><dd>−{formatCurrency(prior.ledgerAdjustmentMinor / 100)}</dd></div> : null}
                    <div><dt>Outstanding</dt><dd>{formatCurrency(openAmount / 100)}</dd></div>
                  </dl>
                  <p className="wk-field-hint">Returns are confirmed by your team against the cited records.</p>
                </details>
                {waitingForReturn && response?.status === 'promised' ? <p>Promised {response.method === 'credit' ? 'credit' : 'refund'}{response.amount ? ` · ${formatCurrency(response.amount)}` : ''} · awaiting confirmation of the balance</p> : null}
                {waitingForReturn && response?.status === 'credit_issued' ? <p>Issued credit{response.amount ? ` · ${formatCurrency(response.amount)}` : ''} · awaiting confirmation of application</p> : null}
                {state.recoveryRequestedAt ? <p className="wk-field-hint">{props.sample ? 'Simulated send · ' : ''}Case owner · {caseOwner}</p> : null}
              </div>
            </section>
          ) : null}

          {workPanel ? <div className="wk-case-work" data-m="work">{workPanel}</div> : null}

          {state.requiresRevalidation && ['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '') ? (
            <section className="wk-panelcard" aria-labelledby="historical-review-title">
              <div className="wk-panelcard-head"><h2 id="historical-review-title">Historical request</h2></div>
              <div className="wk-panelcard-body wk-stack">
                <p>This sent request stays in history. Record any replies and returns here. Further supplier contact requires fresh evidence, a new decision, and a new approval.</p>
                {onBeginNewRequestReview ? <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => onBeginNewRequestReview(finding.id)} disabled={!state.requestedAmount || Math.max(state.legacyRecoveredAmount ?? 0, state.recoveredAmount ?? 0) > verifiedReturned(state)}>Start a separate request review</button> : null}
                {!state.requestedAmount ? <p className="wk-field-hint">The original request amount is missing. This record needs correction before a new request can begin.</p> : null}
                {Math.max(state.legacyRecoveredAmount ?? 0, state.recoveredAmount ?? 0) > verifiedReturned(state) ? <p className="wk-field-hint">An older return amount has no settlement reference. Resolve that historical record before a new request can begin.</p> : null}
              </div>
            </section>
          ) : null}

          {(state.archivedRequests ?? []).length > 0 ? (
            <section className="wk-panelcard" aria-labelledby="archived-requests-title">
              <div className="wk-panelcard-head"><h2 id="archived-requests-title">Earlier requests</h2></div>
              <div className="wk-panelcard-body wk-stack">
                {state.archivedRequests!.map((request) => (
                  <div key={request.generation}>
                    <strong>Request {request.generation} · {formatCurrency(request.requestedAmount ?? 0)}</strong>
                    <p>{request.recoverySentEmail ? `Sent ${longDate(request.recoverySentEmail.sentAt)} to ${request.recoverySentEmail.to}` : request.recoveryRequestedAt ? `Recorded sent ${longDate(request.recoveryRequestedAt)}` : 'Sent date unavailable'} · {request.recoveryStage === 'recovered' ? 'Closed with return' : request.recoveryStage === 'not_recovered' ? 'Closed without return' : 'Was open when archived'}</p>
                    {request.legacyApprovedAt ? <p>Earlier approval recorded {longDate(request.legacyApprovedAt)}; fresh approval is required for a new request.</p> : null}
                    {request.recoverySubject ? <p>Subject: {request.recoverySubject}</p> : null}
                    {!request.recoverySentEmail && request.recoveryRecipientEmail ? <p>Recipient recorded: {request.recoveryRecipientEmail}</p> : null}
                    {request.recoveryDraft ? <details><summary>Original request text</summary><p style={{ whiteSpace: 'pre-wrap' }}>{request.recoveryDraft}</p></details> : null}
                    {request.recoveryEvidenceAttachment ? <details><summary>Original payment-evidence.txt</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{request.recoveryEvidenceAttachment}</pre></details> : null}
                    {request.vendorUpdates?.map((update, index) => <p key={`${update.at}-${index}`}>{longDate(update.at)} · {update.status.replace(/_/g, ' ')}: {update.note}</p>)}
                    {request.recoveryFollowUps?.map((receipt) => <p key={receipt.messageId}>Follow-up sent {longDate(receipt.sentAt)} to {receipt.to}</p>)}
                    <p>{formatCurrency((state.recoverySettlements ?? []).filter((entry) => (entry.requestGeneration ?? 1) === request.generation).reduce((sum, entry) => sum + entry.amount, 0))} in customer-recorded returns for this request</p>
                    {onHistoricalSettlement ? <HistoricalSettlementForm findingId={finding.id} generation={request.generation} onRecord={onHistoricalSettlement} /> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Only duplicate rules have a recovery gate; savings and security findings never collect recovery evidence. */}
          {/* Duplicates ask these checks in the evidence questions below, so the short checklist would repeat them. */}
          <Evidence finding={finding} checklist={!canEditEvidence} />

          {canEditEvidence && onSaveEvidence ? <EvidencePanel key={`evidence-${finding.id}`} finding={finding} findings={findings} imports={imports} initialEvidence={props.sampleEvidence} onSave={(evidence) => onSaveEvidence(finding.id, evidence)} /> : null}

          {!internal ? <RecoveryAccountingPanel finding={finding} state={state} onReconcile={onReconcileRecovery} /> : null}

          {moneyEvents.length > 0 ? (
            <section className="wk-panelcard" aria-labelledby="case-money-timeline">
              <div className="wk-panelcard-head">
                <div>
                  <h2 id="case-money-timeline">Money timeline</h2>
                  <p>Each row is its own financial step. A promise or an issued credit is never added to money back.</p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="wk-table">
                  <thead><tr><th>Step</th><th>Date</th><th className="wk-right">Amount</th><th>Reference</th></tr></thead>
                  <tbody>
                    {moneyEvents.map((event, index) => (
                      <tr key={`${event.kind}-${event.at}-${index}`} style={{ cursor: 'default' }}>
                        <td>{RECOVERY_LEDGER_LABEL[event.kind]}</td>
                        <td className="wk-num">{stamp(event.at)}</td>
                        <td className="wk-right wk-table-money">{event.amount === null ? '—' : formatCurrency(event.amount)}</td>
                        <td className="wk-table-sub">{event.reference ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="wk-panelcard" aria-labelledby="case-history-title">
            <div className="wk-panelcard-head"><h2 id="case-history-title">Activity</h2></div>
            <div className="wk-panelcard-body">
              {history.length > 0 && !entitlements.limits.fullRecoveryWorkflow ? (
                <Locked title="The full case history is part of Growth and Flat" note="Who did what, when, with the amounts and methods.">{timeline}</Locked>
              ) : timeline}
              {state.recoveryRequestedAt && state.recoverySubject ? <details className="wk-evq-details">
                <summary>Supplier request · {state.recoverySimulated ? 'simulated' : state.recoverySentEmail ? 'Gmail accepted' : 'sent manually'}</summary>
                <p>To {state.recoveryRecipientEmail} · {stamp(state.recoveryRequestedAt)}</p>
                <p>{state.recoverySubject}</p>
                <p style={{ whiteSpace: 'pre-wrap' }}>{state.recoveryDraft}</p>
                {state.recoveryEvidenceAttachment ? <details><summary>payment-evidence.txt</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{state.recoveryEvidenceAttachment}</pre></details> : null}
              </details> : null}
              {!internal && projectId ? <GmailAttemptActivity key={`${projectId}-${finding.id}`} projectId={projectId} findingId={finding.id} /> : null}
            </div>
          </section>
        </div>

        <aside className="wk-case-side">
          <CaseAssistant projectId={projectId} findingId={finding.id} />
          {nextAction ? (
            <section className="wk-panelcard wk-next" data-m="lead" aria-labelledby="case-next">
              <div className="wk-panelcard-body wk-stack">
                <span className="wk-label" id="case-next">Next step</span>
                <strong className="wk-next-title">{nextAction.label}</strong>
                <p className="wk-field-hint">{nextAction.detail}</p>
                {nextAction.dueAt ? (
                  <p className="wk-next-due" data-overdue={nextAction.dueAt <= now || undefined}>
                    <CalendarClock aria-hidden="true" />
                    {nextAction.dueAt <= now ? `Due since ${longDate(nextAction.dueAt)}` : `Due ${longDate(nextAction.dueAt)}`}
                  </p>
                ) : null}
                {!internal ? (
                  <ol className="wk-steps" aria-label="Recovery steps">
                    {STEPS.map((label, index) => (
                      <li key={label} data-state={done[index] ? 'done' : index === currentStep ? 'current' : undefined}>{label}</li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="wk-panelcard" data-m="decision" aria-labelledby="case-decision">
            <div className="wk-panelcard-head">
              <div>
                <h2 id="case-decision">{state.decision === null ? 'Your decision' : 'Decision'}</h2>
                <p>{state.decision === null ? <>Next: <strong>{nextActionLabel(finding, gate.eligible)}</strong>. {!internal ? 'Nothing is sent to a vendor until you authorize it.' : duplicate ? 'Fill in “Confirm the evidence” and save, and this becomes money you can ask the vendor for. If it’s clearly not a duplicate, choose Not an issue.' : 'This is checked inside your business. It is not money owed by a vendor.'}</> : 'Recorded on this finding.'}</p>
              </div>
            </div>
            <div className="wk-panelcard-body">
              {state.decision === null ? (
                <div className="wk-decide" role="group" aria-label="Review this finding">
                  {(state.activeRequestGeneration ?? 1) > 1 && state.requiresRevalidation ? <p className="wk-field-hint">Review and save fresh evidence before confirming a new request. You can still mark a false alarm or ask for more detail.</p> : null}
                  {CHOICES.map(({ value, title, detail, internal: internalDetail, icon: Icon }) => {
                    // An unproven duplicate becomes a claim through the evidence questions, not an internal review.
                    const toEvidence = value === 'confirmed' && ((internal && duplicate) || ((state.activeRequestGeneration ?? 1) > 1 && state.requiresRevalidation)) && onSaveEvidence !== undefined
                    return <button key={value} type="button" className="wk-decide-btn" onClick={() => {
                      if (!toEvidence) return setDeciding(value)
                      const form = document.getElementById('evidence-review')
                      form?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      form?.querySelector<HTMLInputElement>('input:not([type=checkbox])')?.focus({ preventScroll: true })
                    }}>
                      <Icon aria-hidden="true" />
                      <span><strong>{title}</strong><small>{toEvidence ? 'Answer the evidence questions to turn it into a claim.' : internal ? internalDetail : detail}</small></span>
                    </button>
                  })}
                </div>
              ) : (
                <div className="wk-stack">
                  <StatusChip status={{ label: DECISION_LABEL[state.decision], tone: state.decision === 'needs_info' ? 'action' : 'neutral' }} />
                  <div className="wk-actions">
                    {canChangeDecision ? <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>Change decision</button> : null}
                    {hasClosedRemainder ? <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => onReopenBalance(finding.id)}>Reopen remaining balance</button> : null}
                    {canReopenOutcome ? (
                      <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>
                        {state.recoveryStage === 'recovered' && !internal ? 'Correct returned value' : 'Reopen case'}
                      </button>
                    ) : null}
                  </div>
                  {state.recoveryStage === 'recovered' && !internal ? <p className="wk-field-hint">Correcting clears the current settlement proof. The original entries stay in the history and the money timeline.</p> : null}
                </div>
              )}
              <DecisionDialog
                finding={finding}
                open={deciding !== null}
                initial={deciding ?? 'confirmed'}
                onOpenChange={(open) => { if (!open) setDeciding(null) }}
                onSave={(input) => {
                  setDeciding(null)
                  onDecide(finding.id, input.decision, input.reason, input.dismissalTag)
                }}
              />
            </div>
          </section>

          <section className="wk-panelcard" data-m="facts" aria-labelledby="case-money">
            <div className="wk-panelcard-head"><h2 id="case-money">{internal ? 'Internal review' : 'Recovery'}</h2></div>
            <div className="wk-panelcard-body">
              <RecoveryFacts finding={finding} state={state} />
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
