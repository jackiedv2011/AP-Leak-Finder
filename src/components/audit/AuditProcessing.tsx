import { AlertTriangle, Check, CircleDashed, Database } from 'lucide-react'
import type { DataReadiness } from '@/audit/dataReadiness'
import type { ScanReceiptSummary } from '@/ledger/views'
import { ScanReceipt } from '@/components/audit/ScanReceipt'

export type AuditProcessingPhase = 'running' | 'complete' | 'failed'

interface AuditProcessingProps {
  phase: AuditProcessingPhase
  sourceLabel: string
  mode: 'sample' | 'upload'
  readiness: DataReadiness
  receipt?: ScanReceiptSummary
  error?: string
  onContinue: () => void
}

const steps = ['Reading the ledger', 'Validating the data', 'Connecting vendor identities', 'Running payment checks', 'Building evidence-backed cases', 'Complete']

/** One truthful processing surface for sample and real ledgers—without invented percentages or delays. */
export function AuditProcessing({ phase, sourceLabel, mode, readiness, receipt, error, onContinue }: AuditProcessingProps) {
  const running = phase === 'running'
  const failed = phase === 'failed'
  const title = failed ? 'This scan could not be completed.' : running ? 'Running the payment checks.' : 'Scan complete. Your review is ready.'
  const detail = failed ? error ?? 'Reclaim could not finish processing this ledger.' : running ? 'The file is parsed and validated. Reclaim is now applying the seven existing checks to the ledger.' : 'Review what was analyzed and the coverage available before opening Overview.'

  return (
    <section className="audit-processing" aria-labelledby="audit-processing-title" aria-live="polite">
      <div className="audit-processing-shell" data-phase={phase}>
        <header className="audit-processing-heading">
          <span className="audit-processing-eyebrow"><i aria-hidden="true" />{failed ? 'Scan interrupted' : running ? 'Processing locally' : 'Processing complete'}</span>
          <h1 id="audit-processing-title">{title}</h1><p>{detail}</p>
        </header>
        {!failed && (
          <div className="audit-processing-ledger" aria-label="Ledger processing status">
            <div className="audit-processing-ledger-top"><span><Database aria-hidden="true" /> <strong title={sourceLabel}>{sourceLabel}</strong></span><small>{mode === 'sample' ? 'Included sample' : 'CSV upload'}</small></div>
            <div className="audit-processing-stats"><span><strong>{readiness.recordCount}</strong> valid records</span><span><strong>{readiness.vendorCount}</strong> vendors</span><span><strong>{readiness.skippedCount}</strong> rows skipped</span></div>
            <ol className="audit-processing-steps">
              {steps.map((step, index) => {
                const isActive = running && index === 3
                const isDone = phase === 'complete' || (running && index < 3)
                return <li key={step} data-state={isDone ? 'done' : isActive ? 'active' : 'pending'}><span aria-hidden="true">{isDone ? <Check /> : <CircleDashed />}</span>{step}{isActive && <small>Current phase</small>}</li>
              })}
            </ol>
          </div>
        )}
        {failed && <div className="audit-processing-error" role="alert"><AlertTriangle aria-hidden="true" /><p>{detail}</p></div>}
        {phase === 'complete' && receipt && <ScanReceipt summary={receipt} />}
        {phase !== 'running' && <div className="audit-processing-actions"><button type="button" className="audit-btn" data-variant="primary" data-motion="pressable" onClick={onContinue}>{failed ? 'Choose another file' : 'Open Overview'}</button></div>}
      </div>
    </section>
  )
}
