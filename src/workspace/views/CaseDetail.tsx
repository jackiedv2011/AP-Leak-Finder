import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/format'
import { DECISION_LABEL, RECOVERY_STAGE_LABEL, type DecisionValue, type DismissalTag, type RecoveryMethod } from '@/ledger/caseState'
import { DecisionDialog } from '@/components/audit/DecisionDialog'
import { Locked } from '@/components/plan/Locked'
import { useEntitlements } from '@/lib/auth/AuthContext'
import type { CaseState } from '@/ledger/caseState'
import type { SenderProfile } from '@/lib/senderProfile'
import type { Finding } from '@/types'
import { evidenceOf, openQuestion, timelineFor } from '../selectors'
import { Facts } from './Reports'
import { METHOD_LABEL, RecoveryOutcomePanel, RecoveryRequestPanel, type RequestPackage } from './RecoveryPanels'
import { Strength } from './Strength'

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
  const requested = state.recoveryStage && state.recoveryStage !== 'confirmed' ? state.requestedAmount ?? finding.dollarImpact : null
  const received = state.recoveryStage === 'recovered' ? state.recoveredAmount ?? 0 : null
  const remaining = requested !== null && state.recoveryStage === 'recovered' ? Math.max(0, requested - (received ?? 0)) : null
  const method = state.recoveredVia ?? state.requestedResolution ?? null
  return (
    <Facts
      rows={[
        ['Original opportunity', formatCurrency(finding.dollarImpact)],
        ['Confirmed', state.decision === 'confirmed' ? formatCurrency(finding.dollarImpact) : '—'],
        ['Requested', requested === null ? '—' : formatCurrency(requested)],
        ['Received', received === null ? (state.recoveryStage === 'not_recovered' ? formatCurrency(0) : '—') : formatCurrency(received)],
        ['Still outstanding', remaining === null ? (state.recoveryStage === 'not_recovered' && requested !== null ? formatCurrency(requested) : '—') : formatCurrency(remaining)],
        ['Status', state.recoveryStage ? RECOVERY_STAGE_LABEL[state.recoveryStage] : state.decision ? DECISION_LABEL[state.decision] : 'Not reviewed'],
        ['Method', method ? METHOD_LABEL[method] : '—'],
      ]}
    />
  )
}

/** §29 — summary, evidence, recovery, accounting, with the timeline alongside. */
export function CaseDetail({ finding, state, sender, onDecide, onMarkRequested, onRecordOutcome, onReopen }: CaseDetailProps) {
  const entitlements = useEntitlements()
  const [deciding, setDeciding] = useState(false)
  const canChangeDecision = state.decision !== null && (state.recoveryStage === null || state.recoveryStage === 'confirmed')
  const canReopenOutcome = state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered'
  const evidence = evidenceOf(finding)
  const question = openQuestion(finding)
  const steps = timelineFor(finding, state)

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
                <span className="wk-mark" data-tone={state.recoveryStage === 'recovered' ? 'strong' : 'info'}>
                  {RECOVERY_STAGE_LABEL[state.recoveryStage]}
                </span>
              ) : null}
            </div>
          </div>

          {question ? (
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
                  <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={() => onReopen(finding.id)}>
                    Reopen outcome
                  </button>
                ) : null}
              </>
            )}
          </div>
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
      </Section>

      <Section title="Recovery">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RecoverySummary finding={finding} state={state} />
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
        </div>
      </Section>

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

      <Section title="Accounting">
        <div className="wk-card-flat">
          <p className="wk-dim" style={{ fontSize: 13.5, maxWidth: 620 }}>
            {state.recoveryStage === 'recovered' ? (
              <>
                {formatCurrency(state.recoveredAmount ?? 0)} came back
                {state.recoveredVia ? ` as ${METHOD_LABEL[state.recoveredVia].toLowerCase()}` : ''}. Clear that amount against the
                corresponding payable to close this out in your books.
              </>
            ) : (
              <>
                Nothing to reconcile yet. Once a refund or credit actually settles, this is where the entry to
                make against your books will appear.
              </>
            )}
          </p>
        </div>
      </Section>
    </>
  )
}
