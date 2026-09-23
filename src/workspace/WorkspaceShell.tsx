import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Banknote,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  FileBarChart,
  FolderSearch,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { CustomizeSheet } from './Customize'
import { PreferencesProvider, usePreferences } from './preferences'
import { resolveTheme } from './theme'
import './workspace.css'
import './reclaim.css'

export type WorkspaceMode = 'dashboard' | 'audits' | 'findings' | 'recoveries' | 'reports' | 'settings'
interface NavEntry { mode: WorkspaceMode; label: string; icon: typeof LayoutGrid; count?: number }
export interface WorkspaceShellProps {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
  auditCount: number
  findingCount: number
  recoveryCount: number
  workspaceLabel: string
  workspaceId: string | null
  availableWorkspaces: Array<{ id: string; name: string }>
  onOpenWorkspace: (id: string) => void
  searchableFindings?: Array<{ id: string; title: string; vendor: string }>
  onOpenFinding?: (id: string) => void
  title: string
  /** Set on a finding's page: the page draws its own header, the crumb shows the finding. */
  finding?: string | null
  actions?: ReactNode
  children: ReactNode
}

export function Mark() {
  return <svg viewBox="-13 -11.5 26 23" aria-hidden="true">
    <path d="M-2.056,-4.6 L-5.751,-11 L5.751,-11 L2.056,-4.6 Z" />
    <path d="M2.956,-4.081 L6.651,-10.481 L12.402,-0.520 L5.012,-0.520 Z" />
    <path d="M5.012,0.520 L12.402,0.520 L6.651,10.481 L2.956,4.081 Z" />
    <path d="M2.056,4.6 L5.751,11 L-5.751,11 L-2.056,4.6 Z" />
    <path d="M-2.956,4.081 L-6.651,10.481 L-12.402,-0.520 L-5.012,-0.520 Z" />
    <path d="M-5.012,-0.520 L-12.402,-0.520 L-6.651,-10.481 L-2.956,-4.081 Z" />
  </svg>
}

/** True when a keystroke belongs to a field, so single-key shortcuts leave it alone. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'R'
}

const descriptions: Record<WorkspaceMode, string> = {
  dashboard: '',
  audits: 'Each ledger you have run through Reclaim, and what it produced.',
  findings: 'Every finding in this audit. Open one to see the records behind it and decide what happens next.',
  recoveries: 'Confirmed findings, from the request you send to the money that comes back.',
  reports: 'What this audit found, by check and by vendor.',
  settings: 'Your account, your plan, and this audit’s data.',
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <PreferencesProvider>
      <Shell {...props} />
    </PreferencesProvider>
  )
}

function Shell({ mode, onModeChange, auditCount, findingCount, recoveryCount, workspaceLabel, workspaceId, availableWorkspaces, onOpenWorkspace, searchableFindings = [], onOpenFinding, title, finding = null, actions, children }: WorkspaceShellProps) {
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const { prefs, update, theme, setTheme } = usePreferences()
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const findInput = useRef<HTMLInputElement>(null)
  const findTrigger = useRef<HTMLButtonElement>(null)
  const switcher = useRef<HTMLDivElement>(null)

  // Findings and Recoveries are the daily work, so they sit right under Overview.
  const primary: NavEntry[] = [
    { mode: 'dashboard', label: 'Overview', icon: LayoutGrid },
    { mode: 'findings', label: 'Findings', icon: Search, count: findingCount },
    { mode: 'recoveries', label: 'Recoveries', icon: Banknote, count: recoveryCount },
    { mode: 'reports', label: 'Reports', icon: FileBarChart },
    { mode: 'audits', label: 'Audits', icon: FolderSearch, count: auditCount },
  ]
  const secondary: NavEntry[] = [{ mode: 'settings', label: 'Settings', icon: SettingsIcon }]
  const query = findQuery.trim().toLowerCase()
  const pageMatches = primary.concat(secondary).filter((entry) => !query || entry.label.toLowerCase().includes(query))
  const findingMatches = query ? searchableFindings.filter((f) => `${f.vendor} ${f.title} ${f.id}`.toLowerCase().includes(query)).slice(0, 7) : []
  const results = [
    ...pageMatches.map((entry) => ({ key: entry.mode, label: entry.label, detail: 'Page', icon: entry.icon, open: () => onModeChange(entry.mode) })),
    ...findingMatches.map((f) => ({ key: f.id, label: f.vendor, detail: f.title, icon: Search, open: () => onOpenFinding?.(f.id) })),
  ]
  const resolvedTheme = resolveTheme(theme)
  const plan = !user ? 'local' : user.isGuest ? 'guest' : user.plan === 'pro' ? 'pro' : 'free'

  function openFind() { setFindQuery(''); setActiveIndex(0); setFindOpen(true); setMobileNavOpen(false) }
  function closeFind() { setFindOpen(false); findTrigger.current?.focus() }

  useEffect(() => {
    if (!findOpen) return
    const frame = requestAnimationFrame(() => findInput.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [findOpen])
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openFind() }
      else if (!findOpen && !customizeOpen && event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) { event.preventDefault(); openFind() }
      else if (event.key === 'Escape') { if (findOpen) closeFind(); else { setMobileNavOpen(false); setSwitcherOpen(false) } }
      else if (findOpen && event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => results.length ? (index + 1) % results.length : 0) }
      else if (findOpen && event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0) }
      else if (findOpen && event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); results[activeIndex].open(); closeFind() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  useEffect(() => {
    if (!switcherOpen) return
    function closeOnOutside(event: MouseEvent) {
      if (!switcher.current?.contains(event.target as Node)) setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [switcherOpen])

  const renderItem = ({ mode: entryMode, label, icon: Icon, count }: NavEntry) => <li key={entryMode}>
    <button type="button" className="wk-nav-item" aria-current={mode === entryMode ? 'page' : undefined} title={prefs.sidebarCollapsed ? label : undefined} onClick={() => { onModeChange(entryMode); setMobileNavOpen(false) }}>
      <Icon aria-hidden="true" /><span>{label}</span>{count !== undefined && count > 0 ? <span className="wk-nav-count">{count}</span> : null}
    </button>
  </li>
  async function handleLogOut() { await auth?.logOut(); window.location.href = '/login' }

  return <div className="wk wk-app" data-collapsed={prefs.sidebarCollapsed || undefined}>
    {mobileNavOpen ? <button className="wk-mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
    <aside className="wk-side" data-mobile-open={mobileNavOpen || undefined}>
      <button type="button" className="wk-brandrow" onClick={() => onModeChange('dashboard')} aria-label="Reclaim overview">
        <Mark /><b>Reclaim</b><span className="wk-plan-chip" data-plan={plan}>{plan === 'local' ? 'Local' : plan}</span>
      </button>
      <button ref={findTrigger} type="button" className="wk-find" onClick={openFind} title="Find (F)"><Search aria-hidden="true" /><span>Find</span><kbd aria-hidden="true">F</kbd></button>
      <nav aria-label="Workspace">
        <ul className="wk-nav">{primary.map(renderItem)}</ul>
        <div className="wk-nav-rule" />
        <ul className="wk-nav">{secondary.map(renderItem)}</ul>
      </nav>
      <div className="wk-side-foot">
        <button type="button" className="wk-side-btn" onClick={() => { setCustomizeOpen(true); setMobileNavOpen(false) }} title="Customize"><SlidersHorizontal aria-hidden="true" /><span>Customize</span></button>
        <button type="button" className="wk-side-btn wk-collapse-btn" onClick={() => update({ sidebarCollapsed: !prefs.sidebarCollapsed })} title={prefs.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {prefs.sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}<span>Collapse sidebar</span>
        </button>
        {user ? <div className="wk-account">
          <span className="wk-avatar" aria-hidden="true">{initialsOf(user.name)}</span>
          <div className="wk-account-copy" style={{ minWidth: 0 }}><div className="wk-account-name">{user.isGuest ? 'Guest session' : user.name}</div><div className="wk-account-sub">{user.isGuest ? 'Saved in this browser' : user.company || user.email}</div></div>
          <button type="button" className="wk-icon-btn" onClick={handleLogOut} aria-label={user.isGuest ? 'Exit guest session' : 'Log out'} title={user.isGuest ? 'Exit guest session' : 'Log out'}><LogOut aria-hidden="true" /></button>
        </div> : null}
      </div>
    </aside>
    <div className="wk-main">
      <header className="wk-topbar">
        <button type="button" className="wk-icon-btn wk-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu aria-hidden="true" /></button>
        <div className="wk-crumbs">
          <div className="wk-switcher" ref={switcher}>
            <button type="button" className="wk-switcher-btn" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)} aria-label={`Current audit: ${workspaceLabel}. Choose an audit`}>
              <span className="wk-switcher-icon"><Mark /></span><span>{workspaceLabel}</span><ChevronDown aria-hidden="true" />
            </button>
            {switcherOpen ? <div className="wk-menu">
              <span className="wk-label wk-menu-label">Audits</span>
              {workspaceId === null ? <div className="wk-menu-current"><span>{workspaceLabel}</span><small>Open</small></div> : null}
              {availableWorkspaces.map((workspace) => <button key={workspace.id} type="button" aria-current={workspace.id === workspaceId ? 'true' : undefined} onClick={() => { onOpenWorkspace(workspace.id); setSwitcherOpen(false) }}><span>{workspace.name}</span>{workspace.id === workspaceId ? <small>Open</small> : null}</button>)}
              <div className="wk-menu-rule" />
              <button type="button" onClick={() => { onModeChange('audits'); setSwitcherOpen(false) }}>All audits <ArrowRight aria-hidden="true" /></button>
            </div> : null}
          </div>
          <ChevronRight aria-hidden="true" />
          {finding ? <><button type="button" className="wk-more" style={{ marginRight: 0 }} onClick={() => onModeChange('findings')}>Findings</button><ChevronRight aria-hidden="true" /><strong>{finding}</strong></> : <strong>{title}</strong>}
        </div>
        <div className="wk-topbar-actions">
          <button type="button" className="wk-icon-btn" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button type="button" className="wk-icon-btn" onClick={() => setCustomizeOpen(true)} aria-label="Customize" title="Customize"><SlidersHorizontal aria-hidden="true" /></button>
          {actions}
        </div>
      </header>
      <main className="wk-body" id="workspace-main" key={finding ? `finding:${finding}` : mode}>
        {mode === 'dashboard' || finding ? null : <header className="wk-head"><div className="wk-head-copy"><h1>{title}</h1><p>{descriptions[mode]}</p></div></header>}
        {children}
      </main>
    </div>
    <CustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />
    {findOpen ? <div className="wk-command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFind() }}><section className="wk-command" role="dialog" aria-modal="true" aria-labelledby="wk-command-title">
      <h2 id="wk-command-title" className="wk-sr-only">Find in workspace</h2><div className="wk-command-input-row"><Search aria-hidden="true" /><input ref={findInput} type="search" value={findQuery} onChange={(event) => { setFindQuery(event.target.value); setActiveIndex(0) }} placeholder="Find a page, vendor or finding…" aria-label="Find pages or findings" /><button type="button" className="wk-icon-btn" aria-label="Close search" onClick={closeFind}><X aria-hidden="true" /></button></div>
      <div className="wk-command-results"><span className="wk-label wk-command-caption">{query ? 'Results' : 'Go to'}</span>{results.length ? results.map((result, index) => { const Icon = result.icon; return <button key={result.key} type="button" className="wk-command-result" data-active={index === activeIndex || undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => { result.open(); closeFind() }}><Icon aria-hidden="true" /><span><strong>{result.label}</strong><small>{result.detail}</small></span>{index === activeIndex ? <CornerDownLeft aria-hidden="true" /> : null}</button> }) : <p className="wk-command-empty">Nothing matches “{findQuery}”</p>}</div>
      <div className="wk-command-footer"><span>↑↓ Move</span><span>↵ Open</span><span>Esc Close</span></div>
    </section></div> : null}
  </div>
}
