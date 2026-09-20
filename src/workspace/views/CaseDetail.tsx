import { formatCurrency, formatDate } from '@/lib/format'
import { DECISION_LABEL, RECOVERY_STAGE_LABEL, type DecisionValue } from '@/ledger/caseState'
import type { CaseState } from '@/ledger/caseState'
import type { Finding } from '@/types'
import { evidenceOf, openQuestion, timelineFor } from '../selectors'
import { Strength } from './Overview'

interface CaseDetailProps {
  finding: Finding
  state: CaseState
  onDecide: (findingId: string, decision: DecisionValue, reason: string | null) => void
  onMarkRequested: (findingId: string) => void
  onRecordOutcome: (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="wk-section">
      <h2 className="wk-display wk-h2">{title}</h2>
      {children}
    </section>
  )
}

/** §29 — summary, evidence, recovery, accounting, with the timeline alongside. */
export function CaseDetail({ finding, state, onDecide, onMarkRequested, onRecordOutcome }: CaseDetailProps) {
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
                <button
                  type="button"
                  className="wk-btn"
                  data-variant="primary"
                  onClick={() => onDecide(finding.id, 'confirmed', null)}
                >
                  This is real
                </button>
                <button
                  type="button"
                  className="wk-btn"
                  data-variant="outline"
                  onClick={() => onDecide(finding.id, 'needs_info', null)}
                >
                  Need more detail
                </button>
                <button
                  type="button"
                  className="wk-btn"
                  data-variant="ghost"
                  onClick={() => onDecide(finding.id, 'expected', null)}
                >
                  Expected, dismiss
                </button>
              </>
            ) : (
              <>
                <span className="wk-mark" data-tone={state.decision === 'confirmed' ? 'strong' : 'quiet'}>
                  {DECISION_LABEL[state.decision]}
                </span>
                {state.recoveryStage === 'confirmed' ? (
                  <button
                    type="button"
                    className="wk-btn"
                    data-variant="primary"
                    data-size="sm"
                    onClick={() => onMarkRequested(finding.id)}
                  >
                    Mark request sent
                  </button>
                ) : null}
                {/* Only a settled amount moves a case onto the Recovered rung — a
                    sent request never does. See the ladder note in selectors.ts. */}
                {state.recoveryStage === 'requested' ? (
                  <>
                    <button
                      type="button"
                      className="wk-btn"
                      data-variant="primary"
                      data-size="sm"
                      onClick={() => onRecordOutcome(finding.id, 'recovered', finding.dollarImpact)}
                    >
                      Money came back
                    </button>
                    <button
                      type="button"
                      className="wk-btn"
                      data-variant="ghost"
                      data-size="sm"
                      onClick={() => onRecordOutcome(finding.id, 'not_recovered', null)}
                    >
                      Close without recovery
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      <Section title="Evidence">
        <table className="wk-table">
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
        </table>
        <p className="wk-table-sub">
          Every row above came from the ledger you loaded. Nothing here is inferred.
        </p>
      </Section>

      <Section title="Recovery">
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
      </Section>

      <Section title="Accounting">
        <div className="wk-card-flat">
          <p className="wk-dim" style={{ fontSize: 13.5, maxWidth: 620 }}>
            {state.recoveryStage === 'recovered' ? (
              <>
                {formatCurrency(state.recoveredAmount ?? finding.dollarImpact)} came back. Clear the vendor
                overpayment against the corresponding payable to close this out in your books.
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
