import { storageKey } from '@/lib/storageScope'
import { useCallback, useEffect, useRef, useState } from 'react'

/** The workspace destinations. */
export type RouteMode = 'dashboard' | 'audits' | 'findings' | 'recoveries' | 'reports' | 'plans' | 'settings'
export type EntryRoute = 'sample' | 'upload'

const ROUTE_MODES: RouteMode[] = ['dashboard', 'audits', 'findings', 'recoveries', 'reports', 'plans', 'settings']

/** Older bookmarks carry the previous section names; send them somewhere sensible. */
const RETIRED_MODES: Record<string, RouteMode> = {
  overview: 'dashboard',
  opportunities: 'findings',
  vendors: 'reports',
  data: 'audits',
  recovery: 'recoveries',
}

export interface AuditRouteState {
  projectId: string | null
  mode: RouteMode
  caseId: string | null
  draft: boolean
  /** A deliberate threshold before a new sample/import flow, never persisted. */
  entry: EntryRoute | null
}

function resolveMode(value: string | null): RouteMode {
  if (value && ROUTE_MODES.includes(value as RouteMode)) return value as RouteMode
  if (value && RETIRED_MODES[value]) return RETIRED_MODES[value]
  return 'dashboard'
}

export function parseAuditRoute(search: string): AuditRouteState {
  const params = new URLSearchParams(search)
  const mode = resolveMode(params.get('mode'))
  const caseId = params.get('case')
  const draft = caseId !== null && params.get('draft') === '1'
  const entryParam = params.get('entry')
  const entry: EntryRoute | null = entryParam === 'sample' || entryParam === 'upload' ? entryParam : null
  const projectId = params.get('project')
  return entry
    ? { projectId, mode: 'dashboard', caseId: null, draft: false, entry }
    : { projectId, mode, caseId, draft, entry: null }
}

export function buildAuditSearch(state: AuditRouteState): string {
  const params = new URLSearchParams()
  if (state.projectId) params.set('project', state.projectId)
  if (state.entry) {
    params.set('entry', state.entry)
    return `?${params.toString()}`
  }
  if (state.mode !== 'dashboard') params.set('mode', state.mode)
  if (state.caseId) {
    params.set('case', state.caseId)
    if (state.draft) params.set('draft', '1')
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

const CONTEXT_KEY = () => storageKey('reclaim.ledger.context.v1')

/** The last view a returning user was in — mode, case, draft — restored on a bare reload. */
export function loadPersistedContext(): AuditRouteState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONTEXT_KEY())
    if (!raw) return null
    return parseAuditRoute(buildAuditSearch(JSON.parse(raw) as AuditRouteState))
  } catch {
    return null
  }
}

function savePersistedContext(state: AuditRouteState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONTEXT_KEY(), JSON.stringify(state))
  } catch {
    // ignore — context restore is a convenience, not a correctness requirement
  }
}

interface NavigateOptions {
  replace?: boolean
}

/**
 * Keeps `/audit` query params in sync with the visible screen so direct
 * entry, refresh, and browser back/forward all resolve to a sensible view.
 * Also mirrors the current view to localStorage so a bare reload (no query
 * string at all) can restore exactly where the user left off, not just
 * whatever the URL happens to say.
 */
export function useAuditRoute() {
  const [route, setRoute] = useState<AuditRouteState>(() => parseAuditRoute(window.location.search))
  const routeRef = useRef(route)
  routeRef.current = route

  useEffect(() => {
    function onPopState() {
      const next = parseAuditRoute(window.location.search)
      routeRef.current = next
      setRoute(next)
      savePersistedContext(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((patch: Partial<AuditRouteState>, options: NavigateOptions = {}) => {
    const next: AuditRouteState = { ...routeRef.current, ...patch }
    const url = `${window.location.pathname}${buildAuditSearch(next)}`
    const historyState = options.replace
      ? { ...window.history.state, reclaimAudit: true }
      : { reclaimAudit: true, canReturnWithinAudit: true }
    if (options.replace) {
      window.history.replaceState(historyState, '', url)
    } else {
      window.history.pushState(historyState, '', url)
    }
    routeRef.current = next
    setRoute(next)
    savePersistedContext(next)
  }, [])

  const goBack = useCallback(() => {
    if (window.history.state?.canReturnWithinAudit === true) {
      window.history.back()
      return
    }
    navigate({ caseId: null, draft: false, entry: null }, { replace: true })
  }, [navigate])

  return { route, navigate, goBack }
}
