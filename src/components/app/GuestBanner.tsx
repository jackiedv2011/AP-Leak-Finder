import { useState } from 'react'
import { X } from 'lucide-react'

const DISMISS_KEY = 'reclaim.guestBanner.dismissed.v1'

export function GuestBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem(DISMISS_KEY) === '1'
  })

  if (dismissed) return null

  function handleDismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="guest-banner" role="status">
      <p>
        You&apos;re using <strong>Guest mode</strong> — this audit won&apos;t be saved after you leave.{' '}
        <a href="/signup">Create an account</a> to keep your audit history.
      </p>
      <button type="button" className="guest-banner-dismiss" data-motion="pressable" onClick={handleDismiss} aria-label="Dismiss">
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  )
}
