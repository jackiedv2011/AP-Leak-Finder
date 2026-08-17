export interface LedgerProjectSummary {
  id: string
  name: string
  sourceLabel: string
  mode: 'sample' | 'upload'
  createdAt: number
  updatedAt: number
  recordCount: number
  openCaseCount: number
  recoveryValue: number
  recoveryActiveCount: number
  recoveryActiveValue: number
}

export const PROJECT_INDEX_KEY = 'reclaim.projects.index.v1'
export const ACTIVE_PROJECT_KEY = 'reclaim.projects.active.v1'
export const COMBINED_PROJECTS_KEY = 'reclaim.projects.v1'
export const LEGACY_LEDGER_KEY = 'reclaim.ledger.v1'

export function readProjectIndex(): LedgerProjectSummary[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PROJECT_INDEX_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as LedgerProjectSummary[]).toSorted((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export function writeProjectIndex(projects: LedgerProjectSummary[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(projects))
}

export function hasSavedLocalWork(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (readProjectIndex().length > 0) return true
    const transitional = JSON.parse(window.localStorage.getItem(COMBINED_PROJECTS_KEY) ?? '[]') as unknown[]
    return transitional.length > 0 || window.localStorage.getItem(LEGACY_LEDGER_KEY) !== null
  } catch {
    return window.localStorage.getItem(LEGACY_LEDGER_KEY) !== null
  }
}
