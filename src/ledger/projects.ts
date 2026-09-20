import { deserializeEnvironment, serializeEnvironment, type LedgerEnvironment } from '@/ledger/store'
import {
  ACTIVE_PROJECT_KEY,
  COMBINED_PROJECTS_KEY,
  LEGACY_LEDGER_KEY,
  PROJECT_INDEX_BASE,
  readProjectIndex,
  writeProjectIndex,
  type LedgerProjectSummary,
} from '@/ledger/projectIndex'
import { getStorageScope, storageKey } from '@/lib/storageScope'
import { projectSync } from '@/ledger/projectSync'

export type { LedgerProjectSummary } from '@/ledger/projectIndex'

export interface LedgerProject {
  id: string
  name: string
  sourceLabel: string
  mode: 'sample' | 'upload'
  createdAt: number
  updatedAt: number
  environment: LedgerEnvironment
}

const PROJECT_KEY_PREFIX = 'reclaim.project.v1.'

/** Serialize a project for storage or the wire. */
export function toStorable(project: LedgerProject): Record<string, unknown> {
  return { ...project, environment: JSON.parse(serializeEnvironment(project.environment)) }
}

/** Revive a stored/wire project into a live one (Dates, record identity). */
export function fromStorable(raw: Record<string, unknown>): LedgerProject {
  const project = raw as Omit<LedgerProject, 'environment'> & { environment: unknown }
  return { ...project, environment: deserializeEnvironment(JSON.stringify(project.environment)) }
}

function projectId() {
  return `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function summaryFor(project: LedgerProject): LedgerProjectSummary {
  const openFindings = project.environment.result.findings.filter((finding) => {
    const state = project.environment.caseStates[finding.id]
    return state?.decision === null || state?.decision === undefined || state.decision === 'needs_info' || state.recoveryStage === 'confirmed' || state.recoveryStage === 'requested'
  })
  const recoveryValue = openFindings.reduce((total, finding) => total + finding.dollarImpact, 0)
  const activeRecovery = project.environment.result.findings.filter((finding) => {
    const stage = project.environment.caseStates[finding.id]?.recoveryStage
    return stage === 'confirmed' || stage === 'requested'
  })

  return {
    id: project.id,
    name: project.name,
    sourceLabel: project.sourceLabel,
    mode: project.mode,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    recordCount: project.environment.records.length,
    openCaseCount: openFindings.length,
    recoveryValue,
    recoveryActiveCount: activeRecovery.length,
    recoveryActiveValue: activeRecovery.reduce((total, finding) => total + finding.dollarImpact, 0),
  }
}

function projectKey(id: string) {
  return storageKey(`${PROJECT_KEY_PREFIX}${id}`)
}

function readProjectPayload(id: string): LedgerProject | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(projectKey(id))
    if (!raw) return null
    return fromStorable(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeProjectPayload(project: LedgerProject) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(projectKey(project.id), JSON.stringify(toStorable(project)))
}

/**
 * Write projects that arrived from the server (or a legacy import) into the
 * current scope without echoing them back to the server.
 */
export function replaceLocalProjects(projects: LedgerProject[]): void {
  if (typeof window === 'undefined') return
  for (const existing of readProjectIndex()) window.localStorage.removeItem(projectKey(existing.id))
  projects.forEach(writeProjectPayload)
  writeProjectIndex(projects.map(summaryFor))
  const active = window.localStorage.getItem(ACTIVE_PROJECT_KEY())
  if (!active || !projects.some((p) => p.id === active)) {
    const newest = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (newest) window.localStorage.setItem(ACTIVE_PROJECT_KEY(), newest.id)
    else window.localStorage.removeItem(ACTIVE_PROJECT_KEY())
  }
}

/** Projects saved in this browser before accounts existed: the bare, unscoped keys. */
export function listLegacyProjects(): LedgerProject[] {
  if (typeof window === 'undefined') return []
  try {
    const index = JSON.parse(window.localStorage.getItem(PROJECT_INDEX_BASE) ?? '[]') as LedgerProjectSummary[]
    return index
      .map((summary) => {
        const raw = window.localStorage.getItem(`${PROJECT_KEY_PREFIX}${summary.id}`)
        return raw ? fromStorable(JSON.parse(raw)) : null
      })
      .filter((p): p is LedgerProject => p !== null)
  } catch {
    return []
  }
}

/** Remove the unscoped legacy copies (after they were imported into an account, or on request). */
export function removeLegacyProjects(): void {
  if (typeof window === 'undefined') return
  for (const project of listLegacyProjects()) window.localStorage.removeItem(`${PROJECT_KEY_PREFIX}${project.id}`)
  window.localStorage.removeItem(PROJECT_INDEX_BASE)
  window.localStorage.removeItem('reclaim.projects.active.v1')
  window.localStorage.removeItem(LEGACY_LEDGER_KEY)
  window.localStorage.removeItem(COMBINED_PROJECTS_KEY)
}

/** Only real accounts sync; guests and unscoped (legacy/test) storage stay local. */
function syncing(): boolean {
  const scope = getStorageScope()
  return scope !== null && scope !== 'guest'
}

/** Moves the short-lived combined project store to indexed, per-project storage. */
function migrateCombinedProjects(): void {
  if (typeof window === 'undefined' || getStorageScope() !== null || readProjectIndex().length > 0) return
  try {
    const raw = window.localStorage.getItem(COMBINED_PROJECTS_KEY)
    if (!raw) return
    const projects = (JSON.parse(raw) as Array<Omit<LedgerProject, 'environment'> & { environment: unknown }>).map((project) => ({
      ...project,
      environment: deserializeEnvironment(JSON.stringify(project.environment)),
    }))
    projects.forEach(writeProjectPayload)
    writeProjectIndex(projects.map(summaryFor))
    window.localStorage.removeItem(COMBINED_PROJECTS_KEY)
  } catch {
    // Leave the previous store untouched when migration cannot complete.
  }
}

/**
 * Converts the single-ledger v1 store into one named local review. It is
 * intentionally idempotent so a failed write never destroys the original.
 */
export function migrateLegacyLedger(loadLegacy: () => LedgerEnvironment | null): void {
  if (typeof window === 'undefined' || getStorageScope() !== null) return
  migrateCombinedProjects()
  if (readProjectIndex().length > 0) return
  const legacy = loadLegacy()
  if (!legacy) return

  const latestImport = legacy.imports.at(-1)
  const project: LedgerProject = {
    id: projectId(),
    name: latestImport?.sourceLabel.replace(/\.[^.]+$/, '') || 'Recovered ledger review',
    sourceLabel: latestImport?.sourceLabel || 'Existing local ledger',
    mode: latestImport?.mode || 'upload',
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    environment: legacy,
  }
  writeProjectPayload(project)
  writeProjectIndex([summaryFor(project)])
  window.localStorage.setItem(ACTIVE_PROJECT_KEY(), project.id)
  window.localStorage.removeItem(LEGACY_LEDGER_KEY)
}

export function listProjects(): LedgerProjectSummary[] {
  migrateCombinedProjects()
  return readProjectIndex()
}

export function loadProject(id: string): LedgerProject | null {
  migrateCombinedProjects()
  return readProjectPayload(id)
}

export function getActiveProjectId(): string | null {
  if (typeof window === 'undefined') return null
  const activeId = window.localStorage.getItem(ACTIVE_PROJECT_KEY())
  if (activeId && loadProject(activeId)) return activeId
  return listProjects()[0]?.id ?? null
}

export function setActiveProject(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(ACTIVE_PROJECT_KEY(), id)
  else window.localStorage.removeItem(ACTIVE_PROJECT_KEY())
}

export function createProject(input: Omit<LedgerProject, 'id' | 'createdAt' | 'updatedAt'>): LedgerProject {
  const now = Date.now()
  const project: LedgerProject = { ...input, id: projectId(), createdAt: now, updatedAt: now }
  writeProjectPayload(project)
  writeProjectIndex([...readProjectIndex(), summaryFor(project)])
  setActiveProject(project.id)
  if (syncing()) projectSync.push(toStorable(project))
  return project
}

export function saveProject(project: LedgerProject): LedgerProject {
  const next = { ...project, updatedAt: Date.now() }
  writeProjectPayload(next)
  const projects = readProjectIndex()
  const index = projects.findIndex((item) => item.id === project.id)
  const summary = summaryFor(next)
  writeProjectIndex(index >= 0 ? projects.toSpliced(index, 1, summary) : [...projects, summary])
  setActiveProject(next.id)
  if (syncing()) projectSync.push(toStorable(next))
  return next
}

export function deleteProject(id: string) {
  const wasActive = typeof window !== 'undefined' && window.localStorage.getItem(ACTIVE_PROJECT_KEY()) === id
  const projects = readProjectIndex().filter((project) => project.id !== id)
  if (typeof window !== 'undefined') window.localStorage.removeItem(projectKey(id))
  writeProjectIndex(projects)
  if (wasActive) setActiveProject(projects[0]?.id ?? null)
  if (syncing()) projectSync.remove(id)
}
