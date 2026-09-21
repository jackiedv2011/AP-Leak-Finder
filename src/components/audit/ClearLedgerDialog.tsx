import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import '@/workspace/workspace.css'

interface ClearLedgerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/** Deleting an audit removes persisted data, not just an in-memory session — worth a real confirm step. */
export function ClearLedgerDialog({ open, onOpenChange, onConfirm }: ClearLedgerDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(460px, calc(100vw - 32px))' }}>
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">Delete this audit?</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                This permanently deletes every record, finding, decision and recovery note in this audit. It cannot be undone.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <div className="wk-panel-foot">
            <button type="button" className="wk-btn" data-variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="button" className="wk-btn" data-variant="danger" onClick={onConfirm}>
              Delete audit
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
