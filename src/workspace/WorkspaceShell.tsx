import type { ReactNode } from 'react'
import { LayoutGrid, FolderSearch, Search, Banknote, FileBarChart, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import './workspace.css'

export type WorkspaceMode = 'dashboard' | 'audits' | 'findings' | 'recoveries' | 'reports' | 'settings'

interface NavEntry {
  mode: WorkspaceMode
  label: string
  icon: typeof LayoutGrid
  count?: number
}

export interface WorkspaceShellProps {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
  auditCount: number
  findingCount: number
  recoveryCount: number
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

/** Reclaim's hexagon mark — the same six paths as #hx-wheel on the marketing site. */
export function Mark() {
  return (
    <svg viewBox="-13 -11.5 26 23" aria-hidden="true">
      <path d="M-2.056,-4.6 L-5.751,-11 L5.751,-11 L2.056,-4.6 Z" />
      <path d="M2.956,-4.081 L6.651,-10.481 L12.402,-0.520 L5.012,-0.520 Z" />
      <path d="M5.012,0.520 L12.402,0.520 L6.651,10.481 L2.956,4.081 Z" />
      <path d="M2.056,4.6 L5.751,11 L-5.751,11 L-2.056,4.6 Z" />
      <path d="M-2.956,4.081 L-6.651,10.481 L-12.402,0.520 L-5.012,0.520 Z" />
      <path d="M-5.012,-0.520 L-12.402,-0.520 L-6.651,-10.481 L-2.956,-4.081 Z" />
    </svg>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '') || 'R'
}

export function WorkspaceShell({
  mode,
  onModeChange,
  auditCount,
  findingCount,
  recoveryCount,
  title,
  subtitle,
  actions,
  children,
}: WorkspaceShellProps) {
  const auth = useOptionalAuth()
  const user = auth?.user ?? null

  const primary: NavEntry[] = [
    { mode: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { mode: 'audits', label: 'Audits', icon: FolderSearch, count: auditCount },
    { mode: 'findings', label: 'Findings', icon: Search, count: findingCount },
    { mode: 'recoveries', label: 'Recoveries', icon: Banknote, count: recoveryCount },
    { mode: 'reports', label: 'Reports', icon: FileBarChart },
  ]
  const secondary: NavEntry[] = [{ mode: 'settings', label: 'Settings', icon: SettingsIcon }]

  const renderItem = ({ mode: entryMode, label, icon: Icon, count }: NavEntry) => (
    <li key={entryMode}>
      <button
        type="button"
        className="wk-nav-item"
        aria-current={mode === entryMode ? 'page' : undefined}
        onClick={() => onModeChange(entryMode)}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
        {count !== undefined && count > 0 ? <span className="wk-nav-count">{count}</span> : <span />}
      </button>
    </li>
  )

  async function handleLogOut() {
    await auth?.logOut()
    window.location.href = '/login'
  }

  return (
    <div className="wk">
      <aside className="wk-side">
        <a className="wk-brand" href="/">
          <Mark />
          <b>Reclaim</b>
        </a>

        <nav aria-label="Workspace">
          <ul className="wk-nav">{primary.map(renderItem)}</ul>
          <div className="wk-nav-group">
            <span className="wk-label">Account</span>
          </div>
          <ul className="wk-nav">{secondary.map(renderItem)}</ul>
        </nav>

        <div className="wk-side-foot">
          {user ? (
            <>
              <div className="wk-account">
                <span className="wk-avatar" aria-hidden="true">
                  {initialsOf(user.name)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="wk-account-name">{user.isGuest ? 'Guest session' : user.name}</div>
                  <div className="wk-account-sub">
                    {user.isGuest ? 'Nothing is saved to an account' : `${user.plan === 'pro' ? 'Pro' : 'Free'} plan · ${user.company || user.email}`}
                  </div>
                </div>
              </div>
              <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={handleLogOut} style={{ justifyContent: 'flex-start' }}>
                <LogOut aria-hidden="true" />
                {user.isGuest ? 'Exit guest session' : 'Log out'}
              </button>
            </>
          ) : null}
        </div>
      </aside>

      <div className="wk-main">
        <header className="wk-topbar">
          <div className="wk-topbar-title">
            {subtitle ? <span className="wk-label">{subtitle}</span> : null}
            <h1 className="wk-display wk-h1">{title}</h1>
          </div>
          {actions ? <div className="wk-topbar-actions">{actions}</div> : null}
        </header>
        <main className="wk-body">{children}</main>
      </div>
    </div>
  )
}
