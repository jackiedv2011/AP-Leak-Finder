import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface GuestGateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feature?: string
}

/** Shown when a guest tries to use an account-gated feature (e.g. saving audit history). */
export function GuestGateDialog({ open, onOpenChange, feature = 'Saving audit history' }: GuestGateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audit-dialog-content">
        <DialogHeader>
          <DialogTitle style={{ color: '#eef1ec' }}>Create a free account</DialogTitle>
          <DialogDescription style={{ color: '#9aa39d' }}>
            {feature} needs an account so Reclaim knows where to keep it. Guest audits stay only for this browser session.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="audit-btn" data-motion="pressable" onClick={() => onOpenChange(false)}>
            Maybe later
          </button>
          <a className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" href="/signup">
            Sign up
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
