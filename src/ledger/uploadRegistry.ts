import type { APRecord } from '@/types'
import { checkRepeat, rowFingerprint, type RepeatCheck } from '../../server/uploads.ts'
import { storageKey } from '@/lib/storageScope'
import { listProjects, loadProject } from '@/ledger/projects'

/**
 * Which audit each uploaded payment row went to, for the Free track's
 * repeat-upload rule. The server enforces the same rule for accounts; this
 * copy lets the browser flag a repeat before anything is processed, and is
 * the only check a guest session has.
 */
const BASE = 'reclaim.upload-rows.v1'

type Registry = Record<string, string>

function read(): Registry {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(BASE)) ?? '{}') as Registry
  } catch {
    return {}
  }
}

function write(registry: Registry): void {
  try {
    window.localStorage.setItem(storageKey(BASE), JSON.stringify(registry))
  } catch {
    // Storage full: the server still enforces the rule for accounts.
  }
}

export function fingerprintsOf(records: Pick<APRecord, 'vendor' | 'invoiceNumber' | 'paymentDate' | 'amountPaid'>[]): string[] {
  return records.map(rowFingerprint)
}

/** Every row already uploaded, including audits saved before this registry existed. */
function known(): Registry {
  const registry = read()
  for (const summary of listProjects()) {
    if (Object.values(registry).includes(summary.id)) continue
    const project = loadProject(summary.id)
    for (const fp of fingerprintsOf(project?.environment.records ?? [])) registry[fp] ??= summary.id
  }
  return registry
}

/** Would uploading these rows into `projectId` (null for a new audit) repeat a ledger already uploaded? */
export function checkRepeatUpload(records: APRecord[], projectId: string | null): RepeatCheck {
  const registry = known()
  const fresh = fingerprintsOf(records).filter((fp) => !projectId || registry[fp] !== projectId)
  return checkRepeat(fresh, (fp) => registry[fp] !== undefined && registry[fp] !== projectId)
}

export function rememberUpload(records: APRecord[], projectId: string): void {
  const registry = read()
  for (const fp of fingerprintsOf(records)) registry[fp] ??= projectId
  write(registry)
}
