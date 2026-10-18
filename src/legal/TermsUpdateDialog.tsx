import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/legal/terms'
import '@/workspace/workspace.css'

/**
 * Shown by TermsUpdateGate when the Terms or Privacy Policy changed since
 * this account accepted them. It can't be dismissed: the choices are accept,
 * or log out.
 */
export function TermsUpdateDialog() {
  const { user, acceptTerms, logOut } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    const result = await acceptTerms()
    setBusy(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content
          className="wk wk-panel"
          style={{ width: 'min(560px, calc(100vw - 32px))' }}
          data-testid="terms-update"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">We’ve updated our Terms and Privacy Policy</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                To keep using Reclaim, please read and accept the new version (effective {TERMS_EFFECTIVE_DATE}).
                {user?.termsVersion ? ` You last accepted version ${user.termsVersion}.` : ''}
              </DialogPrimitive.Description>
            </div>
          </header>
          <div style={{ padding: '0 24px 8px', display: 'grid', gap: 14 }}>
            <p className="wk-dim" style={{ fontSize: 13 }}>
              <a className="wk-link" href="/terms" target="_blank" rel="noreferrer">
                Terms of Service
              </a>
              {' · '}
              <a className="wk-link" href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              {` · version ${TERMS_VERSION}`}
            </p>
            <label className="wk-check">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I agree to the updated Terms of Service and Privacy Policy.</span>
            </label>
            {error ? (
              <p className="wk-field-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="wk-panel-foot" style={{ alignItems: 'center' }}>
            <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => void logOut()}>
              Log out
            </button>
            <button type="button" className="wk-btn" data-variant="primary" data-size="sm" disabled={!agreed || busy} onClick={() => void accept()}>
              {busy ? 'Saving…' : 'Accept and continue'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
