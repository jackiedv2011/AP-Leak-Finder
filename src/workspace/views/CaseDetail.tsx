import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/format'
import { DECISION_LABEL, type DecisionValue, type DismissalTag, type RecoveryMethod, type RecoveryVerification, type VendorUpdate } from '@/ledger/caseState'
import { DecisionDialog } from '@/components/audit/DecisionDialog'
import { Locked } from '@/components/plan/Locked'
import { useEntitlements } from '@/lib/auth/AuthContext'
import type { CaseState } from '@/ledger/caseState'
import type { SenderProfile } from '@/lib/senderProfile'
import type { APRecord, Finding } from '@/types'
import { evidenceOf, openQuestion, timelineFor } from '../selectors'
import { recommendRecoveryMethod, recoveryStatusLabel } from '@/recovery/model'
import { recoveryLedger, RECOVERY_LEDGER_LABEL } from '@/recovery/ledger'
import { playbookFor } from '@/recovery/playbooks'
import { Facts } from './Reports'
import { InternalReviewPanel, METHOD_LABEL, RecoveryRequestPanel, type RequestPackage } from './RecoveryPanels'
import { RecoveryAccountingPanel, RecoveryProgressPanel } from './RecoveryJourney'
import { Strength } from './Strength'

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
  onContactHold: (findingId: string, reason: string | null) => void
  onVendorUpdate: (findingId: string, update: VendorUpdate) => void
  onFollowUp: (findingId: string, at: number | null) => void
  onVerifyRecovery: (findingId: string, proof: RecoveryVerification) => void
  onCloseRecovery: (findingId: string, reason: string) => void
  onReconcileRecovery: (findingId: string, note: string, rootCause: string) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="wk-section">
      <h2 className="wk-display wk-h2">{title}</h2>
      {children}
    </section>
  )
}

const stamp = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()

/**
 * The money on a case, each figure kept apart: what the records support,
 * what was asked for, what actually arrived, and what is still outstanding.
 */
function RecoverySummary({ finding, state }: { finding: Finding; state: CaseState }) {
  if (finding.class !== 'recoverable') return <Facts rows={[
    ['Flagged value', formatCurrency(finding.dollarImpact)],
    ['Status', state.recoveryStage ? recoveryStatusLabel(state, true) : state.decision ? DECISION_LABEL[state.decision] : 'Not reviewed'],
    ['Investigation outcome', state.recoveryOutcomeNote ?? '—'],
  ]} />
  const requested = state.recoveryStage && state.recoveryStage !== 'confirmed' ? state.requestedAmount ?? finding.dollarImpact : null
  const received = state.recoveredAmount ?? null
  const remaining = requested !== null ? Math.max(0, requested - (received ?? 0)) : null
  const method = state.recoveredVia ?? state.requestedResolution ?? null
  const mixedMethods = new Set(state.recoverySettlements?.map((entry) => entry.method) ?? []).size > 1
  return (
    <Facts
      rows={[
        ['Original opportunity', formatCurrency(finding.dollarImpact)],
        ['Reviewed value', state.decision === 'confirmed' ? formatCurrency(finding.dollarImpact) : '—'],
        ['Requested', requested === null ? '—' : formatCurrency(requested)],
        ['Received', received === null ? (state.recoveryStage === 'not_recovered' ? formatCurrency(0) : '—') : formatCurrency(received)],
        [state.recoveryStage === 'recovered' ? 'Unreturned balance' : 'Still outstanding', remaining === null ? '—' : formatCurrency(remaining)],
        ['Status', state.recoveryStage ? recoveryStatusLabel(state, finding.class !== 'recoverable') : state.decision ? DECISION_LABEL[state.decision] : 'Not reviewed'],
        ['Method', mixedMethods ? 'Mixed methods' : method ? METHOD_LABEL[method] : '—'],
      ]}
    />
  )
}

/** §29 — summary, evidence, recovery, accounting, with the timeline alongside. */
export function CaseDetail({ finding, state, records, discoveredAt, sender, onDecide, onMarkRequested, onRecordOutcome, onReopen, onReopenBalance, onApproveRecovery, onContactHold, onVendorUpdate, onFollowUp, onVerifyRecovery, onCloseRecovery, onReconcileRecovery }: CaseDetailProps) {
  const entitlements = useEntitlements()
  const [deciding, setDeciding] = useState(false)
  const canChangeDecision = state.decision !== null && (state.recoveryStage === null || state.recoveryStage === 'confirmed')
  const canReopenOutcome = state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered'
  const hasClosedRemainder = finding.class === 'recoverable' && state.recoveryStage === 'recovered' && (state.recoveredAmount ?? 0) > 0 && Math.round((state.requestedAmount ?? 0) * 100) > Math.round((state.recoveredAmount ?? 0) * 100)
  const evidence = evidenceOf(finding)
  const question = openQuestion(finding)
  const steps = timelineFor(finding, state, discoveredAt)
  const recommendation = recommendRecoveryMethod(finding, records)
  const moneyEvents = recoveryLedger(state)
  const playbook = playbookFor(finding)

  return (
    <>
      <section className="wk-section">
        <div className="wk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span className="wk-label">{finding.vendor}</span>
              <h2 className="wk-display wk-figure-sm" style={{ marginTop: 8 }}>
                {formatCurrency(finding.dollarImpact)}
              </h2>
              <p className="wk-dim" style={{ marginTop: 8, maxWidth: 560 }}>
                {finding.explanation}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <Strength level={evidence} />
              {state.recoveryStage ? (
                <span className="wk-mark" data-tone={state.recoveryStage === 'recovered' && (finding.class !== 'recoverable' || (state.recoveredAmount ?? 0) > 0) ? 'strong' : 'info'}>
                  {recoveryStatusLabel(state, finding.class !== 'recoverable')}
                </span>
              ) : null}
            </div>
          </div>

          {question && (state.decision === null || state.decision === 'needs_info') ? (
            <>
              <hr className="wk-rule" style={{ margin: '18px 0' }} />
              <span className="wk-label">Still open</span>
              <p style={{ marginTop: 6, fontSize: 13.5 }}>{question}</p>
            </>
          ) : null}

          <hr className="wk-rule" style={{ margin: '18px 0' }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {state.decision === null ? (
              <>
                <button type="button" className="wk-btn" data-variant="primary" onClick={() => setDeciding(true)}>
                  Review this finding
                </button>
                <span className="wk-dim" style={{ fontSize: 12.5, alignSelf: 'center' }}>
                  Say whether it&apos;s real, needs a closer look, or was expected.
                </span>
                <DecisionDialog
                  finding={finding}
                  open={deciding}
                  onOpenChange={setDeciding}
                  onSave={(input) => {
                    setDeciding(false)
                    onDecide(finding.id, input.decision, input.reason, input.dismissalTag)
                  }}
                />
              </>
            ) : (
              <>
                <span className="wk-mark" data-tone={state.decision === 'confirmed' ? 'strong' : 'quiet'}>
                  {DECISION_LABEL[state.decision]}
                </span>
                {canChangeDecision ? (
                  <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>
                    Change decision
                  </button>
                ) : null}
                {canReopenOutcome ? (
                  <>
                  {hasClosedRemainder ? <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => onReopenBalance(finding.id)}>Reopen remaining balance</button> : null}
                  <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>
                    {state.recoveryStage === 'recovered' && finding.class === 'recoverable' ? 'Correct returned value' : 'Reopen case'}
                  </button>
                  </>
                ) : null}
              </>
            )}
          </div>
          {state.recoveryStage === 'recovered' && finding.class === 'recoverable' ? <p className="wk-table-sub" style={{ marginTop: 8 }}>Correct returned value clears the current settlement proof. Its original entries stay in the history and recovery ledger.</p> : null}
        </div>
      </section>

      <Section title="Evidence">
        <div className="wk-table-wrap"><table className="wk-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Invoice</th>
              <th>Paid</th>
              <th className="wk-right">Invoiced</th>
              <th className="wk-right">Amount paid</th>
            </tr>
          </thead>
          <tbody>
            {finding.relatedRecords.map((record) => (
              <tr key={record.id} style={{ cursor: 'default' }}>
                <td>{record.vendor}</td>
                <td className="wk-num">{record.invoiceNumber ?? '—'}</td>
                <td className="wk-num">{formatDate(record.paymentDate)}</td>
                <td className="wk-right wk-table-money">
                  {record.invoiceAmount === null ? '—' : formatCurrency(record.invoiceAmount)}
                </td>
                <td className="wk-right wk-table-money">{formatCurrency(record.amountPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="wk-table-sub">
          Every row above came from the ledger you loaded. Nothing here is inferred.
        </p>
        {finding.class === 'recoverable' ? <div className="wk-evidence-checklist"><span className="wk-label">Before asking the vendor · {playbook.title}</span><ul>{playbook.checks.map((check) => <li key={check}>{check}</li>)}</ul><p>{playbook.nextStep}</p></div> : null}
      </Section>

      <Section title={finding.class === 'recoverable' ? 'Recovery' : 'Internal review'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RecoverySummary finding={finding} state={state} />
          {finding.class === 'recoverable' && state.recoveryStage ? <div className="wk-journey" aria-label="Recovery steps">
            {['Review evidence', 'Approve request', 'Contact vendor', 'Verify return', 'Reconcile'].map((step, index) => <div key={step} data-done={index === 0 || (index === 1 && Boolean(state.approvedAt)) || (index === 2 && ['requested', 'recovered', 'not_recovered'].includes(state.recoveryStage ?? '')) || (index === 3 && state.recoveryStage === 'recovered') || (index === 4 && Boolean(state.reconciledAt)) || undefined}><span>{String(index + 1).padStart(2, '0')}</span>{step}</div>)}
          </div> : null}
          {state.recoveryStage === 'confirmed' ? (
            <RecoveryRequestPanel
              key={finding.id}
              finding={finding}
              state={state}
              sender={sender}
              limits={entitlements.limits}
              onMarkRequested={(pkg) => onMarkRequested(finding.id, pkg)}
              onApprove={(pkg, knownBeforeReclaim, knownBeforeNote) => onApproveRecovery(finding.id, pkg, knownBeforeReclaim, knownBeforeNote)}
              onContactHold={(reason) => onContactHold(finding.id, reason)}
              recommendation={recommendation}
            />
          ) : null}
          {state.recoveryStage === 'requested' && finding.class === 'recoverable' ? <RecoveryProgressPanel finding={finding} state={state} onVendorUpdate={onVendorUpdate} onFollowUp={onFollowUp} onVerify={onVerifyRecovery} onClose={onCloseRecovery} /> : null}
          {state.recoveryStage === 'requested' && finding.class !== 'recoverable' ? (
            <InternalReviewPanel key={finding.id} onClose={(note) => onRecordOutcome(finding.id, 'not_recovered', null, note, null)} />
          ) : null}
        </div>
      </Section>

      {finding.class === 'recoverable' && moneyEvents.length > 0 ? <Section title="Recovery ledger">
        <p className="wk-dim" style={{ fontSize: 13 }}>Each row records a different financial step. A promise or issued credit is not added to returned value.</p>
        <div className="wk-table-wrap"><table className="wk-table"><thead><tr><th>Event</th><th>Date</th><th className="wk-right">Amount</th><th>Reference</th></tr></thead><tbody>{moneyEvents.map((event, index) => <tr key={`${event.kind}-${event.at}-${index}`} style={{ cursor: 'default' }}><td>{RECOVERY_LEDGER_LABEL[event.kind]}</td><td className="wk-num">{stamp(event.at)}</td><td className="wk-right wk-table-money">{event.amount === null ? '—' : formatCurrency(event.amount)}</td><td className="wk-table-sub">{event.reference ?? '—'}</td></tr>)}</tbody></table></div>
      </Section> : null}

      <Section title="History">
        {state.history && state.history.length > 0 && !entitlements.limits.fullRecoveryWorkflow ? (
          <Locked title="The full case history is part of Pro" note="Who did what, when, with the amounts and methods — for every case.">
            <ul className="wk-timeline">
              {state.history.map((event, i) => (
                <li key={i} data-done="true">
                  <span className="wk-timeline-when">{stamp(event.at)}</span>
                  <span className="wk-timeline-dot" aria-hidden="true" />
                  <div>
                    <div className="wk-timeline-what">{event.summary}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Locked>
        ) : state.history && state.history.length > 0 ? (
          <ul className="wk-timeline" data-testid="case-history">
            <li data-done="true">
              <span className="wk-timeline-when">{steps[0].when}</span>
              <span className="wk-timeline-dot" aria-hidden="true" />
              <div>
                <div className="wk-timeline-what">Finding created</div>
                <div className="wk-timeline-detail">{steps[0].detail}</div>
              </div>
            </li>
            {state.history.map((event, i) => (
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
                <span className="wk-timeline-when">{step.done ? step.when : '—'}</span>
                <span className="wk-timeline-dot" aria-hidden="true" />
                <div>
                  <div className="wk-timeline-what">{step.what}</div>
                  {step.detail ? <div className="wk-timeline-detail">{step.detail}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {finding.class === 'recoverable' ? <Section title="Accounting">
        <RecoveryAccountingPanel finding={finding} state={state} onReconcile={onReconcileRecovery} />
      </Section> : null}
    </>
  )
}
