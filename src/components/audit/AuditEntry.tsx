import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'
import { TutorialTour, type TutorialStep } from '@/components/tutorial/TutorialTour'

interface AuditEntryProps {
  error: string | null
  onRunSample: () => void
  onImport: (input: ImportInput) => void
  variant?: 'default' | 'upload'
}

const ENTRY_TOUR_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Reclaim',
    body: 'An audit scans a payments ledger for duplicate payments, overpayments, and other recoverable money — then shows you the exact evidence behind every flag.',
  },
  {
    id: 'upload',
    title: 'Upload your ledger',
    body: 'Drop a CSV export from QuickBooks, Xero, or your own AP system here, or click Upload CSV to choose a file.',
    target: '[data-tutorial="entry-upload"]',
    placement: 'top',
  },
  {
    id: 'sample',
    title: 'No file yet? Try the sample',
    body: 'This runs the same detection rules on a bundled sample ledger, so you can see exactly how Reclaim works before uploading your own.',
    target: '[data-tutorial="entry-sample"]',
    placement: 'top',
  },
]

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
      {!isUpload && <TutorialTour tourId="entry" steps={ENTRY_TOUR_STEPS} />}
    </div>
  )
}
