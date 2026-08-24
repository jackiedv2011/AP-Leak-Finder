import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ImportPanel, type ImportInput } from '@/components/audit/ImportPanel'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (input: ImportInput) => void
  error: string | null
}

/** Returning-user import — an action inside the environment, never a gate. */
export function ImportDialog({ open, onOpenChange, onImport, error }: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audit-dialog-content">
        <DialogHeader>
          <DialogTitle style={{ color: '#eef1ec' }}>Add records to the ledger</DialogTitle>
          <DialogDescription style={{ color: '#9aa39d' }}>
            New records merge into your existing ledger. Nothing already reviewed is reset.
          </DialogDescription>
        </DialogHeader>
        <ImportPanel
          allowSample={false}
          error={error}
          onImport={onImport}
          intro="Upload a CSV to add more records to this ledger."
          confirmLabel="Add to ledger"
        />
      </DialogContent>
    </Dialog>
  )
}
