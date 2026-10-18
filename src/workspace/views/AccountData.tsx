import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'

/** Settings → Your data: download everything, or delete the account. Signed-in accounts only. */
export function AccountData({ onDeleted = () => window.location.assign('/?account=deleted') }: { onDeleted?: () => void } = {}) {
  const auth = useOptionalAuth()
  const user = auth?.user
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!auth || !user || user.isGuest) return null

  const matches = typed.trim().toLowerCase() === user.email.trim().toLowerCase()
  const close = (next: boolean) => {
    if (busy) return
    setOpen(next)
    if (!next) {
      setTyped('')
      setError(null)
    }
  }
  const confirm = async () => {
    setBusy(true)
    setError(null)
    const result = await auth.deleteAccount(typed)
    setBusy(false)
    if (!result.ok) {
      setError(result.fields?.confirmEmail ?? result.message)
      return
    }
    onDeleted()
  }

  return (
    <section className="wk-section" data-testid="account-data">
      <h2 className="wk-display wk-h2">Your data</h2>
      <div className="wk-card-flat">
        <ul className="wk-list">
          <li>
            <div>
              <div style={{ fontWeight: 500 }}>Export my data</div>
              <div className="wk-table-sub">Your account details and every audit, with its records, findings, decisions and recovery notes, as one JSON file.</div>
            </div>
            <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => void auth.exportAccountData()}>
              Download
            </button>
          </li>
          <li>
            <div>
              <div style={{ fontWeight: 500 }}>Delete my account</div>
              <div className="wk-table-sub">Removes your account and everything in it from Reclaim, and disconnects QuickBooks. It cannot be undone.</div>
            </div>
            <button type="button" className="wk-btn" data-variant="danger" data-size="sm" onClick={() => setOpen(true)}>
              Delete account
            </button>
          </li>
        </ul>
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={close}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="wk wk-overlay" />
          <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(520px, calc(100vw - 32px))' }} data-testid="delete-account-dialog">
            <header className="wk-panel-head">
              <div>
                <DialogPrimitive.Title className="wk-display wk-h2">Delete your account?</DialogPrimitive.Title>
                <DialogPrimitive.Description className="wk-dim">
                  This permanently deletes your account, every audit, finding and recovery note, and your sign-in. QuickBooks is disconnected. Download your data first if you want a copy.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <div style={{ padding: '0 24px 8px', display: 'grid', gap: 8 }}>
              <label htmlFor="delete-confirm-email" style={{ fontSize: 13, fontWeight: 500 }}>
                Type <strong>{user.email}</strong> to confirm
              </label>
              <input
                id="delete-confirm-email"
                className="wk-input"
                type="email"
                autoComplete="off"
                value={typed}
                aria-invalid={error ? true : undefined}
                onChange={(e) => setTyped(e.target.value)}
              />
              {error ? (
                <p className="wk-field-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="wk-panel-foot" style={{ alignItems: 'center' }}>
              <DialogPrimitive.Close className="wk-btn" data-variant="outline" data-size="sm" disabled={busy}>
                Cancel
              </DialogPrimitive.Close>
              <button type="button" className="wk-btn" data-variant="danger" data-size="sm" disabled={!matches || busy} onClick={() => void confirm()}>
                {busy ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  )
}
