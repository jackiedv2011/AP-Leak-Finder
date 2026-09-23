import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, LayoutGrid, FolderSearch, Search, Banknote, FileBarChart, Settings as SettingsIcon, LogOut, ChevronDown, CornerDownLeft, Menu, X } from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import './workspace.css'
import './vercel.css'

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
  subtitle?: string
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
  dashboard: 'Your payment review, in one place.',
  audits: 'Ledgers reviewed and the findings each audit produced.',
  findings: 'Investigate what the checks found in your payment records.',
  recoveries: 'Follow confirmed cases from request to money returned.',
  reports: 'A clear account of what each audit found.',
  settings: 'Manage your workspace and account preferences.',
}

export function WorkspaceShell({ mode, onModeChange, auditCount, findingCount, recoveryCount, workspaceLabel, workspaceId, availableWorkspaces, onOpenWorkspace, searchableFindings = [], onOpenFinding, title, subtitle, actions, children }: WorkspaceShellProps) {
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const findInput = useRef<HTMLInputElement>(null)
  const findTrigger = useRef<HTMLButtonElement>(null)
  const projectMenu = useRef<HTMLDivElement>(null)
  const primary: NavEntry[] = [
    { mode: 'dashboard', label: 'Overview', icon: LayoutGrid },
    { mode: 'audits', label: 'Audits', icon: FolderSearch, count: auditCount },
    { mode: 'findings', label: 'Findings', icon: Search, count: findingCount },
    { mode: 'recoveries', label: 'Recoveries', icon: Banknote, count: recoveryCount },
    { mode: 'reports', label: 'Reports', icon: FileBarChart },
  ]
  const secondary: NavEntry[] = [{ mode: 'settings', label: 'Settings', icon: SettingsIcon }]
  const query = findQuery.trim().toLowerCase()
  const pageMatches = primary.concat(secondary).filter((entry) => !query || entry.label.toLowerCase().includes(query))
  const findingMatches = query ? searchableFindings.filter((f) => `${f.vendor} ${f.title} ${f.id}`.toLowerCase().includes(query)).slice(0, 7) : []
  const results = [
    ...pageMatches.map((entry) => ({ key: entry.mode, label: entry.label, detail: 'Page', icon: entry.icon, open: () => onModeChange(entry.mode) })),
    ...findingMatches.map((finding) => ({ key: finding.id, label: finding.vendor, detail: finding.title, icon: Search, open: () => onOpenFinding?.(finding.id) })),
  ]

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
      else if (!findOpen && event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) { event.preventDefault(); openFind() }
      else if (event.key === 'Escape') { if (findOpen) closeFind(); else { setMobileNavOpen(false); setProjectMenuOpen(false) } }
      else if (findOpen && event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => results.length ? (index + 1) % results.length : 0) }
      else if (findOpen && event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0) }
      else if (findOpen && event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); results[activeIndex].open(); closeFind() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  useEffect(() => {
    if (!projectMenuOpen) return
    function closeOnOutside(event: MouseEvent) {
      if (!projectMenu.current?.contains(event.target as Node)) setProjectMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [projectMenuOpen])

  const renderItem = ({ mode: entryMode, label, icon: Icon, count }: NavEntry) => <li key={entryMode}>
    <button type="button" className="wk-nav-item" aria-current={mode === entryMode ? 'page' : undefined} onClick={() => { onModeChange(entryMode); setMobileNavOpen(false) }}>
      <Icon aria-hidden="true" /><span>{label}</span>{count !== undefined && count > 0 ? <span className="wk-nav-count">{count}</span> : null}
    </button>
  </li>
  async function handleLogOut() { await auth?.logOut(); window.location.href = '/login' }

  return <div className="wk wk-vercel">
    {mobileNavOpen ? <button className="wk-mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
    <aside className="wk-side" data-mobile-open={mobileNavOpen || undefined}>
      <button type="button" className="wk-team-switcher" onClick={() => onModeChange('dashboard')} aria-label="Reclaim workspace overview">
        <span className="wk-brand-icon"><Mark /></span><span className="wk-team-name">Reclaim</span>
        <span className="wk-team-plan">{!user ? 'Local' : user.isGuest ? 'Guest' : user.plan === 'pro' ? 'Pro' : 'Free'}</span>
      </button>
      <button ref={findTrigger} type="button" className="wk-find-trigger" onClick={openFind}><Search aria-hidden="true" /><span>Find</span><kbd aria-hidden="true">F</kbd></button>
      <nav aria-label="Workspace" className="wk-sidebar-nav"><ul className="wk-nav">{primary.map(renderItem)}</ul><div className="wk-nav-separator" /><ul className="wk-nav">{secondary.map(renderItem)}</ul></nav>
      <div className="wk-side-foot">
        {user ? <><div className="wk-account"><span className="wk-avatar" aria-hidden="true">{initialsOf(user.name)}</span><div className="wk-account-copy"><div className="wk-account-name">{user.isGuest ? 'Guest session' : user.name}</div><div className="wk-account-sub">{user.isGuest ? 'Local workspace' : user.company || user.email}</div></div></div><button type="button" className="wk-logout" onClick={handleLogOut}><LogOut aria-hidden="true" />{user.isGuest ? 'Exit guest session' : 'Log out'}</button></> : <span className="wk-local-label">Local workspace</span>}
      </div>
    </aside>
    <div className="wk-main">
      <header className="wk-topbar">
        <div className="wk-topbar-project" ref={projectMenu}><button type="button" className="wk-project-switcher" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)} aria-label={`Current audit: ${workspaceLabel}. Choose an audit`}><span className="wk-project-icon"><Mark /></span><span>{workspaceLabel}</span><ChevronDown aria-hidden="true" /></button>{projectMenuOpen ? <div className="wk-project-menu"><span className="wk-project-menu-label">Audits</span>{workspaceId === null ? <div className="wk-project-menu-current">{workspaceLabel}<span>Current session</span></div> : null}{availableWorkspaces.map((workspace) => <button key={workspace.id} type="button" aria-current={workspace.id === workspaceId ? 'true' : undefined} onClick={() => { onOpenWorkspace(workspace.id); setProjectMenuOpen(false) }}><span>{workspace.name}</span>{workspace.id === workspaceId ? <small>Current</small> : null}</button>)}<div className="wk-project-menu-divider" /><button type="button" onClick={() => { onModeChange('audits'); setProjectMenuOpen(false) }}>View all audits <ArrowRight aria-hidden="true" /></button></div> : null}</div>
        <span className="wk-topbar-center">{title}</span><div className="wk-topbar-actions">{actions}</div>
      </header>
      <main className="wk-body" id="workspace-main">{mode === 'dashboard' && subtitle !== 'Finding' ? <h1 className="wk-sr-only">{title}</h1> : <div className="wk-page-head"><div>{subtitle === 'Finding' ? <span className="wk-page-eyebrow">Finding detail</span> : null}<h1>{title}</h1>{subtitle === 'Finding' ? null : <p>{descriptions[mode]}</p>}</div></div>}{children}</main>
    </div>
    <div className="wk-mobile-bar"><button type="button" onClick={openFind}><Search aria-hidden="true" />Find</button><button type="button" onClick={() => setMobileNavOpen(true)}><Menu aria-hidden="true" />Menu</button></div>
    {findOpen ? <div className="wk-command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFind() }}><section className="wk-command" role="dialog" aria-modal="true" aria-labelledby="wk-command-title">
      <h2 id="wk-command-title" className="wk-sr-only">Find in workspace</h2><div className="wk-command-input-row"><Search aria-hidden="true" /><input ref={findInput} type="search" value={findQuery} onChange={(event) => { setFindQuery(event.target.value); setActiveIndex(0) }} placeholder="Find pages or findings..." aria-label="Find pages or findings" /><button type="button" aria-label="Close search" onClick={closeFind}><X aria-hidden="true" /></button></div>
      <div className="wk-command-results"><span className="wk-command-caption">{query ? 'Results' : 'Navigate'}</span>{results.length ? results.map((result, index) => { const Icon = result.icon; return <button key={result.key} type="button" className="wk-command-result" data-active={index === activeIndex || undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => { result.open(); closeFind() }}><Icon aria-hidden="true" /><span><strong>{result.label}</strong><small>{result.detail}</small></span>{index === activeIndex ? <CornerDownLeft aria-hidden="true" /> : null}</button> }) : <p className="wk-command-empty">No matching pages or findings</p>}</div>
      <div className="wk-command-footer"><span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span></div>
    </section></div> : null}
  </div>
}
