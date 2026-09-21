import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'
import '@/workspace/workspace.css'

export type ImportIntent = 'new' | 'add'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (input: ImportInput) => void
  error: string | null
  /** `new` starts a separate audit; `add` merges records into the open one. */
  intent: ImportIntent
}

const COPY: Record<ImportIntent, { title: string; description: string; intro: string; confirm: string }> = {
  new: {
    title: 'Start an audit',
    description: 'Upload a payment ledger. Reclaim runs every check it can against the columns it finds.',
    intro: 'A CSV export of payments from QuickBooks, Xero, or your own AP ledger.',
    confirm: 'Run the audit',
  },
  add: {
    title: 'Add records to this audit',
    description: 'New records merge into the open ledger. Nothing already reviewed is reset.',
    intro: 'Upload another CSV to add more records to this audit.',
    confirm: 'Add to audit',
  },
}

/**
 * Radix owns the portal, the focus trap and escape; the workspace owns every
 * pixel of it, through `.wk-overlay` / `.wk-panel` in workspace.css.
 */
export function ImportDialog({ open, onOpenChange, onImport, error, intent }: ImportDialogProps) {
  const copy = COPY[intent]
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel">
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">{copy.title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">{copy.description}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <ImportPanel allowSample={false} error={error} onImport={onImport} intro={copy.intro} confirmLabel={copy.confirm} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
