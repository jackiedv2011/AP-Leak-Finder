import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'

interface AuditEntryProps {
  error: string | null
  onRunSample: () => void
  onImport: (input: ImportInput) => void
}

/** First-time entry — the only moment that feels like a threshold, since there's no ledger yet. */
export function AuditEntry({ error, onRunSample, onImport }: AuditEntryProps) {
  return (
    <div className="audit-entry">
      <ImportPanel
        allowSample
        autoFocusUpload
        error={error}
        onImport={onImport}
        onRunSample={onRunSample}
        intro="Identify potential payment errors and review the evidence behind them."
        confirmLabel="Start the ledger"
      />
    </div>
  )
}
