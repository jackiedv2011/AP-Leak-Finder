import { useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { UpgradeDialog } from './UpgradeDialog'

/**
 * Wraps content the current plan doesn't include. The content is rendered
 * blurred and inert behind a small notice with an Upgrade button, so the
 * person can see the shape of what a paid plan adds without reading it.
 */
export function Locked({ children, title, note, reason }: { children: ReactNode; title: string; note?: string; reason?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="wk-locked" data-testid="locked">
      <div className="wk-locked-content" aria-hidden="true" inert>
        {children}
      </div>
      <div className="wk-locked-notice">
        <div className="wk-locked-card" role="note">
          <Lock aria-hidden="true" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
            {note ? <div className="wk-dim" style={{ fontSize: 13, marginTop: 2 }}>{note}</div> : null}
          </div>
          <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => setOpen(true)}>
            See plans
          </button>
        </div>
      </div>
      <UpgradeDialog open={open} onOpenChange={setOpen} reason={reason ?? title} />
    </div>
  )
}
