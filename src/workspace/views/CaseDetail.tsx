import { useState } from 'react'
import { CalendarClock, CircleCheck, CircleHelp, CircleX, ListChecks, TriangleAlert } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { DECISION_LABEL, type DecisionValue, type DismissalTag, type RecoveryMethod, type RecoveryVerification, type VendorUpdate } from '@/ledger/caseState'
import { DecisionDialog } from '@/components/audit/DecisionDialog'
import { Locked } from '@/components/plan/Locked'
import { useEntitlements } from '@/lib/auth/AuthContext'
import type { CaseState } from '@/ledger/caseState'
import type { SenderProfile } from '@/lib/senderProfile'
import type { APRecord, Finding } from '@/types'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { recommendRecoveryMethod, recoveryNextAction, recoveryStatusLabel } from '@/recovery/model'
import { recoveryLedger, RECOVERY_LEDGER_LABEL } from '@/recovery/ledger'
import { playbookFor } from '@/recovery/playbooks'
import { evidenceOf, openQuestion, timelineFor } from '../selectors'
import { InternalReviewPanel, METHOD_LABEL, RecoveryRequestPanel, type RequestPackage } from './RecoveryPanels'
import { RecoveryAccountingPanel, RecoveryProgressPanel } from './RecoveryJourney'
import { KIND_LABEL, KindChip } from './KindChip'
import { Strength } from './Strength'
import { findingReference } from './findingText'

interface CaseDetailProps {
  finding: Finding
  state: CaseState
  records: APRecord[]
  discoveredAt: number | null
  sender: SenderProfile
  onDecide: (findingId: string, decision: DecisionValue, reason: string | null, dismissalTag?: DismissalTag | null) => void
  onMarkRequested: (findingId: string, pkg: RequestPackage) => void
  onRecordOutcome: (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null, method: RecoveryMethod | null) => void
  /** Take back the last step: a decision (until a request is sent) or a recorded outcome. */
  onReopen: (findingId: string) => void
  onReopenBalance: (findingId: string) => void
  onApproveRecovery: (findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => void
  onApproveAndSend?: (findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => void
  onContactHold: (findingId: string, reason: string | null) => void
  onVendorUpdate: (findingId: string, update: VendorUpdate) => void
  onFollowUp: (findingId: string, at: number | null) => void
  onVerifyRecovery: (findingId: string, proof: RecoveryVerification) => void
  onCloseRecovery: (findingId: string, reason: string) => void
  onReconcileRecovery: (findingId: string, note: string, rootCause: string) => void
}

const stamp = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const longDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const CHOICES: Array<{ value: DecisionValue; title: string; detail: string; internal: string; icon: typeof CircleCheck }> = [
  { value: 'confirmed', title: 'This is real', detail: 'The records show money to get back. Prepare the request next.', internal: 'Worth checking inside the business. Opens an internal review.', icon: CircleCheck },
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
function Evidence({ finding }: { finding: Finding }) {
  const records = finding.relatedRecords
  const showVendor = new Set(records.map((r) => r.vendor.trim().toLowerCase())).size > 1
  const playbook = finding.class === 'recoverable' ? playbookFor(finding) : null
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
  const internal = finding.class !== 'recoverable'
  const status = state.recoveryStage ? recoveryStatusLabel(state, internal) : state.decision ? DECISION_LABEL[state.decision] : 'Not reviewed'
  const rows: Array<[string, string, boolean?]> = []
  if (internal) {
    rows.push(['Flagged value', formatCurrency(finding.dollarImpact)], ['Status', status])
    if (state.recoveryOutcomeNote) rows.push(['Investigation outcome', state.recoveryOutcomeNote])
  } else {
    const requested = state.recoveryStage && state.recoveryStage !== 'confirmed' ? state.requestedAmount ?? finding.dollarImpact : null
    const received = state.recoveredAmount ?? null
    const closed = state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered'
    const remaining = requested !== null ? Math.max(0, requested - (received ?? 0)) : null
    const methods = new Set(state.recoverySettlements?.map((entry) => entry.method) ?? [])
    const method = state.recoveredVia ?? state.requestedResolution ?? null
    rows.push(['Records support', formatCurrency(finding.dollarImpact)], ['Status', status])
    if (requested !== null) rows.push(['Requested', formatCurrency(requested)])
    if ((received ?? 0) > 0 || state.recoveryStage === 'not_recovered') rows.push(['Received', formatCurrency(received ?? 0), (received ?? 0) > 0])
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

const STEPS = ['Review evidence', 'Approve request', 'Contact vendor', 'Verify return', 'Reconcile'] as const

function stepsDone(state: CaseState): boolean[] {
  const sent = ['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '')
  return [
    state.decision === 'confirmed',
    Boolean(state.approvedAt) || sent,
    sent,
    state.recoveryStage === 'recovered' && (state.recoveredAmount ?? 0) > 0,
    Boolean(state.reconciledAt),
  ]
}

/** §29 — what happened and the work in front of you, the decision and money alongside. */
export function CaseDetail(props: CaseDetailProps) {
  const { finding, state, records, discoveredAt, sender, onDecide, onMarkRequested, onRecordOutcome, onReopen, onReopenBalance, onApproveRecovery, onApproveAndSend, onContactHold, onVendorUpdate, onFollowUp, onVerifyRecovery, onCloseRecovery, onReconcileRecovery } = props
  const entitlements = useEntitlements()
  const [deciding, setDeciding] = useState<DecisionValue | null>(null)
  const internal = finding.class !== 'recoverable'
  const canChangeDecision = state.decision !== null && (state.recoveryStage === null || state.recoveryStage === 'confirmed')
  const canReopenOutcome = state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered'
  const hasClosedRemainder = !internal && state.recoveryStage === 'recovered' && (state.recoveredAmount ?? 0) > 0 && Math.round((state.requestedAmount ?? 0) * 100) > Math.round((state.recoveredAmount ?? 0) * 100)
  const evidence = evidenceOf(finding)
  const question = openQuestion(finding)
  const steps = timelineFor(finding, state, discoveredAt)
  const typeLabel = FINDING_TYPE_LABELS[finding.type] ?? finding.type
  const history = state.history ?? []
  const moneyEvents = internal ? [] : recoveryLedger(state)
  const now = Date.now()
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

  const workPanel =
    state.recoveryStage === 'confirmed' ? (
      <RecoveryRequestPanel
        key={finding.id}
        finding={finding}
        state={state}
        sender={sender}
        limits={entitlements.limits}
        onMarkRequested={(pkg) => onMarkRequested(finding.id, pkg)}
        onApprove={(pkg, known, note) => onApproveRecovery(finding.id, pkg, known, note)}
        onApproveAndSend={onApproveAndSend ? (pkg, known, note) => onApproveAndSend(finding.id, pkg, known, note) : undefined}
        onContactHold={(reason) => onContactHold(finding.id, reason)}
        recommendation={internal ? undefined : recommendRecoveryMethod(finding, records)}
      />
    ) : state.recoveryStage === 'requested' && !internal ? (
      <RecoveryProgressPanel key={finding.id} finding={finding} state={state} onVendorUpdate={onVendorUpdate} onFollowUp={onFollowUp} onVerify={onVerifyRecovery} onClose={onCloseRecovery} />
    ) : state.recoveryStage === 'requested' && internal ? (
      <InternalReviewPanel key={finding.id} onClose={(note) => onRecordOutcome(finding.id, 'not_recovered', null, note, null)} />
    ) : null

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
            <KindChip finding={finding} label={typeLabel} />
            <Strength level={evidence} />
          </div>
        </div>
        <div className="wk-head-copy wk-head-figure">
          <span className="wk-label">{internal ? 'Flagged value' : 'Records support'}</span>
          <strong className="wk-money">{formatCurrency(finding.dollarImpact)}</strong>
        </div>
      </header>

      <div className="wk-case">
        <div className="wk-case-main">
          <section className="wk-panelcard" data-m="what" aria-labelledby="case-what">
            <div className="wk-panelcard-head"><h2 id="case-what">What happened</h2></div>
            <div className="wk-panelcard-body wk-case-summary">
              <p>{finding.explanation}</p>
              {question && (state.decision === null || state.decision === 'needs_info') ? (
                <div className="wk-question" role="note">
                  <TriangleAlert aria-hidden="true" />
                  <span><strong>Still open:</strong> {question}</span>
                </div>
              ) : null}
            </div>
          </section>

          {workPanel ? <div className="wk-case-work" data-m="work">{workPanel}</div> : null}

          <Evidence finding={finding} />

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
            <div className="wk-panelcard-head"><h2 id="case-history-title">History</h2></div>
            <div className="wk-panelcard-body">
              {history.length > 0 && !entitlements.limits.fullRecoveryWorkflow ? (
                <Locked title="The full case history is part of Pro" note="Who did what, when, with the amounts and methods.">{timeline}</Locked>
              ) : timeline}
            </div>
          </section>
        </div>

        <aside className="wk-case-side">
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
                <p>{state.decision === null ? (internal ? 'This finding is reviewed inside your business.' : 'Nothing is sent to a vendor until you confirm.') : 'Recorded on this finding.'}</p>
              </div>
            </div>
            <div className="wk-panelcard-body">
              {state.decision === null ? (
                <div className="wk-decide" role="group" aria-label="Review this finding">
                  {CHOICES.map(({ value, title, detail, internal: internalDetail, icon: Icon }) => (
                    <button key={value} type="button" className="wk-decide-btn" data-primary={value === 'confirmed' || undefined} onClick={() => setDeciding(value)}>
                      <Icon aria-hidden="true" />
                      <span><strong>{title}</strong><small>{internal ? internalDetail : detail}</small></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="wk-stack">
                  <span className="wk-chip" data-tone={state.decision === 'confirmed' ? 'done' : undefined}>{DECISION_LABEL[state.decision]}</span>
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
