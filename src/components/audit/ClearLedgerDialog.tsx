import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface ClearLedgerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/** Clearing the ledger now deletes persisted data, not just an in-memory session — worth a real confirm step. */
export function ClearLedgerDialog({ open, onOpenChange, onConfirm }: ClearLedgerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audit-dialog-content">
        <DialogHeader>
          <DialogTitle style={{ color: '#eef1ec' }}>Clear this ledger?</DialogTitle>
          <DialogDescription style={{ color: '#9aa39d' }}>
            This permanently deletes every imported record and decision on this device. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="audit-btn" data-motion="pressable" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" onClick={onConfirm}>
            Delete ledger
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
