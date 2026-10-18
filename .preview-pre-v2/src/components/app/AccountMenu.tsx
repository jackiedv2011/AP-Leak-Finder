import { useEffect, useRef, useState } from 'react'
import { User, LayoutDashboard, FilePlus, History, Settings, HelpCircle, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'

interface AccountMenuProps {
  onRestartTutorial?: () => void
}

export function AccountMenu({ onRestartTutorial }: AccountMenuProps) {
  const { user, isGuest, logOut } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const initial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'G'

  function handleLogOut() {
    logOut()
    window.location.href = '/'
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        data-motion="pressable"
        data-tutorial="account-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-menu-avatar" aria-hidden="true">{initial}</span>
        <span className="account-menu-name">{isGuest ? 'Guest' : user?.name ?? 'Account'}</span>
      </button>

      {open && (
        <div className="account-menu-panel" role="menu">
          <div className="account-menu-header">
            <strong>{isGuest ? 'Guest mode' : user?.name}</strong>
            {!isGuest && user?.email && <span>{user.email}</span>}
            {isGuest && <span>Audits aren&apos;t saved after you leave</span>}
          </div>

          <a className="account-menu-item" role="menuitem" href="/audit"><LayoutDashboard aria-hidden="true" size={16} />Dashboard</a>
          <a className="account-menu-item" role="menuitem" href="/audit?entry=upload"><FilePlus aria-hidden="true" size={16} />New audit</a>
          <a className="account-menu-item" role="menuitem" href="/history" data-disabled={isGuest || undefined}>
            <History aria-hidden="true" size={16} />Audit history
          </a>
          <a className="account-menu-item" role="menuitem" href="/settings"><Settings aria-hidden="true" size={16} />Settings</a>
          {onRestartTutorial && (
            <button type="button" className="account-menu-item" role="menuitem" onClick={() => { setOpen(false); onRestartTutorial() }}>
              <HelpCircle aria-hidden="true" size={16} />Restart tutorial
            </button>
          )}
          {isGuest ? (
            <a className="account-menu-item" role="menuitem" data-emphasis="true" href="/signup"><User aria-hidden="true" size={16} />Create account</a>
          ) : (
            <a className="account-menu-item" role="menuitem" href="/profile"><User aria-hidden="true" size={16} />Profile</a>
          )}
          <button type="button" className="account-menu-item" role="menuitem" onClick={handleLogOut}>
            <LogOut aria-hidden="true" size={16} />{isGuest ? 'Exit guest mode' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  )
}
