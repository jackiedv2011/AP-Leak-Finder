import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { LegacySummary } from '@/ledger/legacyMigration'
import '@/workspace/workspace.css'

interface LegacyImportDialogProps {
  summary: LegacySummary | null
  onImport: () => Promise<void>
  onDefer: () => void
  onDiscard: () => void
}

/**
 * Shown once per session to a signed-in account when this browser still
 * holds audits from before accounts existed. Nothing happens until the
 * person chooses — importing attaches them to *this* account only.
 */
export function LegacyImportDialog({ summary, onImport, onDefer, onDiscard }: LegacyImportDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  if (!summary) return null

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && !busy && onDefer()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(520px, calc(100vw - 32px))' }} data-testid="legacy-import">
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">
                {summary.count === 1 ? 'An audit was saved in this browser before you had an account' : `${summary.count} audits were saved in this browser before you had an account`}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                Reclaim can add {summary.count === 1 ? 'it' : 'them'} to this account, so {summary.count === 1 ? 'it follows' : 'they follow'} you to other devices. Only you will see
                {summary.count === 1 ? ' it' : ' them'}. If {summary.count === 1 ? 'it isn’t' : 'they aren’t'} yours, leave {summary.count === 1 ? 'it' : 'them'} or delete{' '}
                {summary.count === 1 ? 'it' : 'them'}.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close" disabled={busy}>
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <ul className="wk-list" style={{ margin: '0 24px' }}>
            {summary.names.map((name, i) => (
              <li key={`${name}-${i}`}>
                <div style={{ fontWeight: 500 }}>{name}</div>
              </li>
            ))}
          </ul>

          {error ? (
            <div className="wk-alert" role="alert" style={{ margin: '16px 24px 0' }}>
              <p>{error}</p>
            </div>
          ) : null}

          <div className="wk-panel-foot" style={{ flexWrap: 'wrap' }}>
            {confirmDiscard ? (
              <>
                <span className="wk-dim" style={{ fontSize: 13, marginRight: 'auto' }}>
                  Delete {summary.count === 1 ? 'it' : 'them'} from this browser? This cannot be undone.
                </span>
                <button type="button" className="wk-btn" data-variant="ghost" onClick={() => setConfirmDiscard(false)}>
                  Keep
                </button>
                <button type="button" className="wk-btn" data-variant="danger" onClick={onDiscard}>
                  Delete permanently
                </button>
              </>
            ) : (
              <>
                <button type="button" className="wk-btn" data-variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={busy} style={{ marginRight: 'auto' }}>
                  Delete
                </button>
                <button type="button" className="wk-btn" data-variant="ghost" onClick={onDefer} disabled={busy}>
                  Not now
                </button>
                <button
                  type="button"
                  className="wk-btn"
                  data-variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      await onImport()
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Import failed. Nothing was changed.')
                      setBusy(false)
                    }
                  }}
                >
                  {busy ? 'Adding…' : 'Add to my account'}
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
