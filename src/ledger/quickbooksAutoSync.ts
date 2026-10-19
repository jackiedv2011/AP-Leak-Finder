import { parseCsv } from '@/lib/csv'
import { fetchQuickBooksStatus, importFromQuickBooks, linkQuickBooksAudit, type QuickBooksStatus } from '@/lib/quickbooksApi'
import { getActiveProjectId, listProjects, loadProject, saveProject, setActiveProject, type LedgerProject } from './projects'
import { lastQuickBooksPull, mergeQuickBooksSync, type QuickBooksSyncSummary } from './quickbooksSync'
import { rememberUpload } from './uploadRegistry'

/**
 * Keeping a signed-in user's QuickBooks audit current without a click. When
 * QuickBooks is connected and the last sync is older than this, opening the
 * dashboard pulls what changed into the audit linked to that company and
 * re-runs the checks (detection runs in the browser). Read-only, through the
 * same /sync endpoint as a manual import.
 */
export const AUTO_SYNC_AFTER_MS = 15 * 60 * 1000

export type QuickBooksAutoSyncState =
  /** No QuickBooks, a guest, a sample, or no audit tied to the company yet: show nothing. */
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'synced'; summary: QuickBooksSyncSummary; at: number }
  | { kind: 'up_to_date'; at: number }
  | { kind: 'error' }
  | { kind: 'reconnect' }

export interface AutoSyncResult {
  state: QuickBooksAutoSyncState
  /** The linked audit after the sync, when it changed. */
  project?: LedgerProject
}

const holdsCompany = (project: LedgerProject, companyName: string) => project.environment.imports.some((b) => b.quickbooks?.companyName === companyName)

/** The audit tied to this connection: the server's link, or (for audits imported before links existed) the one holding the company. */
async function linkedAudit(status: QuickBooksStatus): Promise<LedgerProject | null> {
  const company = status.companyName ?? ''
  const linked = status.linkedAuditId ? loadProject(status.linkedAuditId) : null
  if (linked && holdsCompany(linked, company)) return linked
  for (const summary of listProjects()) {
    const candidate = loadProject(summary.id)
    if (candidate && holdsCompany(candidate, company)) {
      await linkQuickBooksAudit(candidate.id)
      return candidate
    }
  }
  return null
}

/**
 * One automatic (or "Sync now") pass. `force` ignores the 15-minute window.
 * Never throws: every failure becomes a quiet state for the status line.
 */
export async function autoSyncQuickBooks({ force = false, now = Date.now() }: { force?: boolean; now?: number } = {}): Promise<AutoSyncResult> {
  try {
    const status = await fetchQuickBooksStatus()
    if (!status.available || !status.connected || !status.companyName) return { state: { kind: 'off' } }
    const audit = await linkedAudit(status)
    if (!audit) return { state: { kind: 'off' } }
    const lastSync = status.lastSyncAt ?? null
    if (!force && lastSync !== null && now - lastSync < AUTO_SYNC_AFTER_MS) return { state: { kind: 'up_to_date', at: lastSync } }

    const result = await importFromQuickBooks(lastQuickBooksPull(audit.environment, status.companyName))
    if (!result.ok) return { state: result.reconnect ? { kind: 'reconnect' } : { kind: 'error' } }
    if (!result.facts) return { state: { kind: 'error' } }
    const parsed = parseCsv(await result.file.text())
    // Re-read: a manual import may have saved this audit while the request was out.
    const current = loadProject(audit.id) ?? audit
    const synced = mergeQuickBooksSync(current.environment, { sourceLabel: result.file.name, mode: 'upload', parsed, quickbooks: result.facts })
    const changed = synced.summary.added + synced.summary.changed + synced.summary.removed > 0
    if (!changed) return { state: { kind: 'up_to_date', at: now } }
    // Saving makes a project active; a background sync must not switch the user's open audit.
    const active = getActiveProjectId()
    const saved = saveProject({ ...current, environment: synced.env })
    setActiveProject(active)
    // Keep the browser's Free-plan registry in step: these rows belong to this audit.
    rememberUpload(saved.environment.records, saved.id)
    return { state: { kind: 'synced', summary: synced.summary, at: now }, project: saved }
  } catch {
    return { state: { kind: 'error' } }
  }
}

/** "Checked 3 new QuickBooks payments", "Up to date with QuickBooks", … — the status line's words, without the time. */
export function autoSyncLabel(state: QuickBooksAutoSyncState): string | null {
  switch (state.kind) {
    case 'checking':
      return 'Checking QuickBooks…'
    case 'up_to_date':
      return 'Up to date with QuickBooks'
    case 'synced': {
      const { added, changed, removed } = state.summary
      const parts = [added ? `Checked ${added} new QuickBooks ${added === 1 ? 'payment' : 'payments'}` : `Checked QuickBooks`]
      if (changed) parts.push(`${changed} changed`)
      if (removed) parts.push(`${removed} voided or deleted`)
      return parts.join(', ')
    }
    case 'error':
      return 'Couldn’t reach QuickBooks'
    case 'reconnect':
      return 'QuickBooks needs to be connected again'
    default:
      return null
  }
}

/** "just now", "2 min ago", "3 h ago", "Oct 14" */
export function relativeTime(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(at)
}
