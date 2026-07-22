import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'

interface AuditEntryProps {
  error: string | null
  onRunSample: () => void
  onImport: (input: ImportInput) => void
  variant?: 'default' | 'upload'
}

/** First-time entry — the only moment that feels like a threshold, since there's no ledger yet. */
export function AuditEntry({ error, onRunSample, onImport, variant = 'default' }: AuditEntryProps) {
  const isUpload = variant === 'upload'
  return (
    <div className="audit-entry">
      <ImportPanel
        allowSample
        autoFocusUpload
        error={error}
        onImport={onImport}
        onRunSample={onRunSample}
        intro={isUpload ? 'Start with your own ledger, then follow each finding back to its original records.' : 'Identify potential payment errors and review the evidence behind them.'}
        confirmLabel={isUpload ? 'Add to my ledger' : 'Start the ledger'}
      />
    </div>
  )
}
