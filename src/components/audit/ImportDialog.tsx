import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'
import '@/workspace/workspace.css'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (input: ImportInput) => void
  error: string | null
}

/**
 * Returning-user import — an action inside the environment, never a gate.
 *
 * Radix owns the portal, the focus trap and escape; the workspace owns every
 * pixel of it, through `.wk-overlay` / `.wk-panel` in workspace.css.
 */
export function ImportDialog({ open, onOpenChange, onImport, error }: ImportDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel">
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">Add records to the ledger</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                New records merge into your existing ledger. Nothing already reviewed is reset.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <ImportPanel
            allowSample={false}
            error={error}
            onImport={onImport}
            intro="Upload a CSV to add more records to this ledger."
            confirmLabel="Add to ledger"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
