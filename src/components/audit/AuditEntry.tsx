import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'
import { motion, useReducedMotion } from 'motion/react'

interface AuditEntryProps {
  error: string | null
  onRunSample: () => void
  onImport: (input: ImportInput) => void
  variant?: 'default' | 'upload'
}

/** First-time entry — the only moment that feels like a threshold, since there's no ledger yet. */
export function AuditEntry({ error, onRunSample, onImport, variant = 'default' }: AuditEntryProps) {
  const isUpload = variant === 'upload'
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="audit-entry"
      data-entry-state="arriving"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 12px, 0) scale(0.985)' }}
      animate={{ opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }}
      transition={reduceMotion ? { duration: 0.08 } : { duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
    >
      <ImportPanel
        allowSample
        animateEntry={!reduceMotion}
        autoFocusUpload
        error={error}
        onImport={onImport}
        onRunSample={onRunSample}
        intro={isUpload ? 'Start with your own ledger, then follow each finding back to its original records.' : 'Identify potential payment errors and review the evidence behind them.'}
        confirmLabel={isUpload ? 'Add to my ledger' : 'Start the ledger'}
      />
    </motion.div>
  )
}
