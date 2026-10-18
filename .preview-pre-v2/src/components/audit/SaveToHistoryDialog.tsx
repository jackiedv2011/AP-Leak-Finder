import { useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import '@/pages/auth.css'

interface SaveToHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
  defaultName: string
}

export function SaveToHistoryDialog({ open, onOpenChange, onSave, defaultName }: SaveToHistoryDialogProps) {
  const [name, setName] = useState(defaultName)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave(name.trim() || defaultName)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setName(defaultName); onOpenChange(next) }}>
      <DialogContent className="audit-dialog-content">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle style={{ color: '#171917' }}>Save this audit</DialogTitle>
            <DialogDescription style={{ color: '#5f625d' }}>
              Give it a name you&apos;ll recognize in your audit history. You can rename it later.
            </DialogDescription>
          </DialogHeader>
          <input
            className="auth-input"
            style={{ marginTop: '1rem' }}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={defaultName}
          />
          <DialogFooter style={{ marginTop: '1.25rem' }}>
            <button type="button" className="audit-btn" data-motion="pressable" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary">
              Save audit
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
