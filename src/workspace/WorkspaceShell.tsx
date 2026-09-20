import type { ReactNode } from 'react'
import {
  LayoutGrid,
  Search,
  Banknote,
  Building2,
  FileBarChart,
  Database,
  Settings as SettingsIcon,
} from 'lucide-react'
import './workspace.css'

/** The seven destinations from the V2 spec (§27). Deliberately small. */
export type WorkspaceMode =
  | 'overview'
  | 'opportunities'
  | 'recoveries'
  | 'vendors'
  | 'reports'
  | 'data'
  | 'settings'

interface NavEntry {
  mode: WorkspaceMode
  label: string
  icon: typeof LayoutGrid
  /** Rendered as plain tabular text beside the label — never a filled badge. */
  count?: number
}

export interface WorkspaceShellProps {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
  opportunityCount: number
  recoveryCount: number
  vendorCount: number
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

/** Reclaim's hexagon mark — the same six paths as #hx-wheel on the marketing site. */
function Mark() {
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

export function WorkspaceShell({
  mode,
  onModeChange,
  opportunityCount,
  recoveryCount,
  vendorCount,
  title,
  subtitle,
  actions,
  children,
}: WorkspaceShellProps) {
  const primary: NavEntry[] = [
    { mode: 'overview', label: 'Overview', icon: LayoutGrid },
    { mode: 'opportunities', label: 'Opportunities', icon: Search, count: opportunityCount },
    { mode: 'recoveries', label: 'Recoveries', icon: Banknote, count: recoveryCount },
    { mode: 'vendors', label: 'Vendors', icon: Building2, count: vendorCount },
  ]
  const secondary: NavEntry[] = [
    { mode: 'reports', label: 'Reports', icon: FileBarChart },
    { mode: 'data', label: 'Data', icon: Database },
    { mode: 'settings', label: 'Settings', icon: SettingsIcon },
  ]

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
          <div className="wk-label">Sample ledger</div>
          <p className="wk-muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Demo data. Every figure traces to a row you can open.
          </p>
        </div>
      </aside>

      <div className="wk-main">
        <header className="wk-topbar">
          <div className="wk-topbar-title">
            {subtitle ? <span className="wk-label">{subtitle}</span> : null}
            <h1 className="wk-display wk-h1">{title}</h1>
          </div>
          {actions ? <div style={{ display: 'flex', gap: 10 }}>{actions}</div> : null}
        </header>
        <main className="wk-body">{children}</main>
      </div>
    </div>
  )
}
