import { useState } from 'react'
import { CircleCheck, CircleHelp, CircleX, FileCheck2, TriangleAlert } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { DECISION_LABEL, RECOVERY_STAGE_LABEL, type DecisionValue, type DismissalTag, type RecoveryMethod } from '@/ledger/caseState'
import { DecisionDialog } from '@/components/audit/DecisionDialog'
import { Locked } from '@/components/plan/Locked'
import { useEntitlements } from '@/lib/auth/AuthContext'
import type { CaseState } from '@/ledger/caseState'
import type { SenderProfile } from '@/lib/senderProfile'
import type { APRecord, Finding } from '@/types'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { evidenceOf, openQuestion, timelineFor } from '../selectors'
import { METHOD_LABEL, RecoveryOutcomePanel, RecoveryRequestPanel, type RequestPackage } from './RecoveryPanels'
import { KIND_LABEL, KindChip } from './KindChip'
import { Strength } from './Strength'
import { findingReference } from './findingText'

interface CaseDetailProps {
  finding: Finding
  state: CaseState
  sender: SenderProfile
  onDecide: (findingId: string, decision: DecisionValue, reason: string | null, dismissalTag?: DismissalTag | null) => void
  onMarkRequested: (findingId: string, pkg: RequestPackage) => void
  onRecordOutcome: (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null, method: RecoveryMethod | null) => void
  /** Take back the last step: a decision (until a request is sent) or a recorded outcome. */
  onReopen: (findingId: string) => void
}

const stamp = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const CHOICES: Array<{ value: DecisionValue; title: string; detail: string; icon: typeof CircleCheck }> = [
  { value: 'confirmed', title: 'This is real', detail: 'The records show money to get back. Prepare the request next.', icon: CircleCheck },
  { value: 'needs_info', title: 'I need more detail', detail: 'Keep it open while you check a PO, statement or the vendor.', icon: CircleHelp },
  { value: 'expected', title: 'Not an issue', detail: 'Expected, or a detection mistake. It leaves the open findings.', icon: CircleX },
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
  const repeated = (column: Column, record: APRecord) => {
    if (records.length < 2) return false
    const key = column.key(record)
    return key !== null && records.filter((r) => column.key(r) === key).length > 1
  }
  return (
    <section className="wk-panelcard" aria-labelledby="case-evidence">
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
                {COLUMNS.map((c) => (
                  <td key={c.label} className={c.right ? 'wk-right wk-table-money' : 'wk-num'}>
                    {repeated(c, record) ? <span className="wk-cell-hit">{c.value(record)}</span> : c.value(record)}
                  </td>
                ))}
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
                  <dd>{repeated(c, record) ? <span className="wk-cell-hit">{c.value(record)}</span> : c.value(record)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Only the figures that exist yet. A column of dashes says nothing. */
function RecoveryFacts({ finding, state }: { finding: Finding; state: CaseState }) {
  const requested = state.recoveryStage && state.recoveryStage !== 'confirmed' ? state.requestedAmount ?? finding.dollarImpact : null
  const received = state.recoveryStage === 'recovered' ? state.recoveredAmount ?? 0 : state.recoveryStage === 'not_recovered' ? 0 : null
  const outstanding = requested !== null && received !== null ? Math.max(0, requested - received) : null
  const method = state.recoveredVia ?? state.requestedResolution ?? null
  const rows: Array<[string, string, boolean?]> = [
    ['Records support', formatCurrency(finding.dollarImpact)],
    ['Status', state.recoveryStage ? RECOVERY_STAGE_LABEL[state.recoveryStage] : state.decision ? DECISION_LABEL[state.decision] : 'Not reviewed'],
  ]
  if (requested !== null) rows.push(['Requested', formatCurrency(requested)])
  if (received !== null) rows.push(['Received', formatCurrency(received), received > 0])
  if (outstanding !== null) rows.push(['Still outstanding', formatCurrency(outstanding)])
  if (method) rows.push(['Method', METHOD_LABEL[method]])
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

/** §29 — summary and evidence to read, the decision and money alongside, history below. */
export function CaseDetail({ finding, state, sender, onDecide, onMarkRequested, onRecordOutcome, onReopen }: CaseDetailProps) {
  const entitlements = useEntitlements()
  const [deciding, setDeciding] = useState<DecisionValue | null>(null)
  const canChangeDecision = state.decision !== null && (state.recoveryStage === null || state.recoveryStage === 'confirmed')
  const canReopenOutcome = state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered'
  const evidence = evidenceOf(finding)
  const question = openQuestion(finding)
  const steps = timelineFor(finding, state)
  const typeLabel = FINDING_TYPE_LABELS[finding.type] ?? finding.type
  const history = state.history ?? []

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
        <div className="wk-head-copy" style={{ alignItems: 'flex-end', textAlign: 'right' }}>
          <span className="wk-label">Records support</span>
          <strong className="wk-money" style={{ fontSize: 'clamp(40px, 4vw, 56px)', lineHeight: 0.9 }}>{formatCurrency(finding.dollarImpact)}</strong>
        </div>
      </header>

      <div className="wk-case">
        <div className="wk-case-main">
          <section className="wk-panelcard" aria-labelledby="case-what">
            <div className="wk-panelcard-head"><h2 id="case-what">What happened</h2></div>
            <div className="wk-panelcard-body wk-case-summary">
              <p>{finding.explanation}</p>
              {question ? (
                <div className="wk-question" role="note">
                  <TriangleAlert aria-hidden="true" />
                  <span><strong>Still open:</strong> {question}</span>
                </div>
              ) : null}
            </div>
          </section>

          <Evidence finding={finding} />

          {state.recoveryStage === 'confirmed' ? (
            <RecoveryRequestPanel
              key={finding.id}
              finding={finding}
              state={state}
              sender={sender}
              limits={entitlements.limits}
              onMarkRequested={(pkg) => onMarkRequested(finding.id, pkg)}
            />
          ) : null}
          {state.recoveryStage === 'requested' ? (
            <RecoveryOutcomePanel
              key={finding.id}
              finding={finding}
              state={state}
              limits={entitlements.limits}
              onRecordOutcome={(outcome, amount, note, method) => onRecordOutcome(finding.id, outcome, amount, note, method)}
            />
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
          <section className="wk-panelcard" aria-labelledby="case-decision">
            <div className="wk-panelcard-head">
              <div>
                <h2 id="case-decision">{state.decision === null ? 'Your decision' : 'Decision'}</h2>
                <p>{state.decision === null ? 'Nothing is sent to a vendor until you confirm.' : 'Recorded on this finding.'}</p>
              </div>
            </div>
            <div className="wk-panelcard-body">
              {state.decision === null ? (
                <div className="wk-decide" role="group" aria-label="Review this finding">
                  {CHOICES.map(({ value, title, detail, icon: Icon }) => (
                    <button key={value} type="button" className="wk-decide-btn" data-primary={value === 'confirmed' || undefined} onClick={() => setDeciding(value)}>
                      <Icon aria-hidden="true" />
                      <span><strong>{title}</strong><small>{detail}</small></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span className="wk-chip" data-tone={state.decision === 'confirmed' ? 'done' : undefined}>{DECISION_LABEL[state.decision]}</span>
                  {canChangeDecision ? (
                    <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>Change decision</button>
                  ) : null}
                  {canReopenOutcome ? (
                    <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>Reopen outcome</button>
                  ) : null}
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

          <section className="wk-panelcard" aria-labelledby="case-money">
            <div className="wk-panelcard-head"><h2 id="case-money">Recovery</h2></div>
            <div className="wk-panelcard-body">
              <RecoveryFacts finding={finding} state={state} />
            </div>
          </section>

          {state.recoveryStage === 'recovered' ? (
            <section className="wk-panelcard" aria-labelledby="case-books">
              <div className="wk-panelcard-head"><h2 id="case-books">In your books</h2></div>
              <div className="wk-panelcard-body" style={{ display: 'flex', gap: 10 }}>
                <FileCheck2 aria-hidden="true" style={{ width: 16, height: 16, flex: 'none', marginTop: 2, color: 'var(--accent-ink)' }} />
                <p className="wk-dim" style={{ fontSize: 13 }}>
                  {formatCurrency(state.recoveredAmount ?? 0)} came back
                  {state.recoveredVia ? ` as ${METHOD_LABEL[state.recoveredVia].toLowerCase()}` : ''}. Clear it against the matching payable to close this out.
                </p>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  )
}
