import { fromStorable, listLegacyProjects, removeLegacyProjects, replaceLocalProjects, toStorable } from '@/ledger/projects'
import { projectSync } from '@/ledger/projectSync'
import { getStorageScope } from '@/lib/storageScope'

/**
 * Audits saved before accounts existed live under the bare (unscoped) keys.
 * They belong to whoever used this browser, which the software cannot know —
 * so they are never attached to an account silently. The first signed-in
 * person to see them decides: import into this account, leave them for
 * later, or delete them. Once imported (or deleted) the bare keys are gone,
 * so no other account can ever pick them up.
 */
const DEFERRED_KEY = 'reclaim.legacy.deferred'

export interface LegacySummary {
  count: number
  names: string[]
}

export function legacyProjectsPresent(): LegacySummary | null {
  const scope = getStorageScope()
  if (!scope || scope === 'guest') return null
  if (typeof window !== 'undefined' && window.sessionStorage.getItem(DEFERRED_KEY) === '1') return null
  const legacy = listLegacyProjects()
  if (legacy.length === 0) return null
  return { count: legacy.length, names: legacy.map((p) => p.name) }
}

/** Upload the legacy audits into the signed-in account (ids preserved; the server skips any it already has), then remove the bare copies. */
export async function importLegacyProjects(): Promise<{ imported: number; skipped: number }> {
  const legacy = listLegacyProjects()
  const result = await projectSync.import(legacy.map(toStorable))
  const projects = await projectSync.pull()
  replaceLocalProjects(projects.map(fromStorable))
  removeLegacyProjects()
  return { imported: result.imported.length, skipped: result.skipped.length }
}

/** Ask again next session; nothing is touched. */
export function deferLegacyProjects(): void {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(DEFERRED_KEY, '1')
}

export function discardLegacyProjects(): void {
  removeLegacyProjects()
}
