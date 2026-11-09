/**
 * Keeps an account's projects on the server. localStorage is the working
 * cache (synchronous, what the UI reads); the server copy is what survives
 * a new device or a cleared browser, and what makes the account boundary real.
 *
 * Writes are fire-and-forget with a retry queue: a failed push is retried on
 * the next push, when the browser comes back online, and on a timer.
 */
type Op = { kind: 'put'; project: Record<string, unknown> } | { kind: 'delete'; id: string } | { kind: 'command'; id: string; findingId: string; type: string; input: unknown; commandId: string }
import { getStorageScope, storageKey } from '@/lib/storageScope'

const QUEUE_KEY = 'reclaim.project.sync.v1'

export type SyncIssue = { projectId: string; status: number | null; message: string } | null

class ProjectSync {
  private queue: Op[] = []
  private inflight: Promise<void> | null = null
  private fetchImpl: typeof fetch = (...args) => fetch(...args)
  private listeners = new Set<(pending: number) => void>()
  private appliedListeners = new Set<(project: Record<string, unknown>) => void>()
  private revisions = new Map<string, number>()
  private issue: SyncIssue = null

  private persist(): void {
    const scope = getStorageScope()
    if (!scope || scope === 'guest' || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey(QUEUE_KEY), JSON.stringify({ queue: this.queue, revisions: [...this.revisions] }))
    } catch {
      this.issue = { projectId: '', status: null, message: 'Browser storage is full. Keep this tab open and download a local copy before leaving.' }
    }
  }

  /** Recover the account's unsent operations before pulling newer server data. */
  restore(): void {
    if (typeof window === 'undefined') return
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(QUEUE_KEY)) ?? 'null') as { queue?: Op[]; revisions?: Array<[string, number]> } | null
      this.queue = Array.isArray(saved?.queue) ? saved.queue : []
      this.revisions = new Map(Array.isArray(saved?.revisions) ? saved.revisions : [])
      this.issue = null
      this.changed()
    } catch {
      this.issue = { projectId: '', status: null, message: 'Saved actions could not be read. Download a local copy before editing.' }
      this.changed()
    }
  }

  /** Tests inject a fetch bound to a live server. */
  useFetch(impl: typeof fetch): void {
    this.fetchImpl = impl
  }

  onPending(listener: (pending: number) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onApplied(listener: (project: Record<string, unknown>) => void): () => void {
    this.appliedListeners.add(listener)
    return () => this.appliedListeners.delete(listener)
  }

  get syncIssue(): SyncIssue { return this.issue }

  get pending(): number {
    return this.queue.length
  }

  private changed(): void { this.listeners.forEach((listener) => listener(this.queue.length)) }

  push(project: Record<string, unknown>): void {
    // Coalesce adjacent project writes only. A case command between them must
    // keep its position, especially when the first write creates the project.
    const last = this.queue.at(-1)
    if (last?.kind === 'put' && last.project.id === project.id) this.queue[this.queue.length - 1] = { kind: 'put', project }
    else this.queue.push({ kind: 'put', project })
    this.persist()
    this.changed()
    void this.flush()
  }

  command(id: string, findingId: string, type: string, input: unknown): void {
    this.queue.push({ kind: 'command', id, findingId, type, input, commandId: crypto.randomUUID() })
    this.persist()
    this.changed()
    void this.flush()
  }

  remove(id: string): void {
    this.queue = this.queue.filter((op) => !(op.kind === 'put' && op.project.id === id))
    this.queue.push({ kind: 'delete', id })
    this.persist()
    this.changed()
    void this.flush()
  }

  /** Pull everything the server has for the signed-in account. */
  async pull(): Promise<Record<string, unknown>[]> {
    const res = await this.fetchImpl('/api/projects', { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`Could not load your audits (${res.status}).`)
    const data = (await res.json()) as { projects: Record<string, unknown>[]; revisions?: Record<string, number> }
    for (const [id, revision] of Object.entries(data.revisions ?? {})) {
      if (!this.queue.some((op) => (op.kind === 'put' ? op.project.id : op.id) === id)) this.revisions.set(id, revision)
    }
    this.persist()
    return data.projects
  }

  /** Legacy import: the server keeps ids and reports which it already had. */
  async import(projects: Record<string, unknown>[]): Promise<{ imported: string[]; skipped: string[]; blocked?: string[] }> {
    const res = await this.fetchImpl('/api/projects/import', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects }),
    })
    if (!res.ok) throw new Error(`Import failed (${res.status}).`)
    return (await res.json()) as { imported: string[]; skipped: string[]; blocked?: string[] }
  }

  /** Drains the queue. Awaiting it means "everything queued so far has reached the server (or was refused)". */
  flush(): Promise<void> {
    if (this.issue) return Promise.resolve()
    if (!this.inflight) this.inflight = this.drain().finally(() => (this.inflight = null))
    return this.inflight
  }

  retry(): void {
    this.issue = null
    this.changed()
    void this.flush()
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0]
        const id = op.kind === 'put' ? op.project.id as string : op.id
        const revision = this.revisions.get(id)
        const res = op.kind === 'put'
          ? await this.fetchImpl(`/api/projects/${encodeURIComponent(id)}`, {
              method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(revision !== undefined ? { 'If-Match': String(revision) } : {}) }, body: JSON.stringify(op.project),
            })
          : op.kind === 'command'
            ? await this.fetchImpl(`/api/projects/${encodeURIComponent(id)}/case-commands`, {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commandId: op.commandId, expectedRevision: revision ?? 0, findingId: op.findingId, type: op.type, input: op.input }),
              })
            : await this.fetchImpl(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
        if (res.status === 401) {
          // Session gone — keep the queue; the next log-in flushes it.
          this.issue = { projectId: id, status: 401, message: 'Your session ended before this save reached your account. The local copy is still here; sign in again to retry.' }
          break
        }
        if (res.status === 400 || res.status === 402 || res.status === 403 || res.status === 409 || res.status === 413 || (res.status === 404 && op.kind !== 'delete')) {
          this.issue = { projectId: id, status: res.status, message: `The server refused this save (${res.status}). Your changes remain in this browser. Review the conflict before retrying.` }
          break
        }
        // A missing project is an idempotent delete, never a successful save.
        if (!res.ok && !(op.kind === 'delete' && res.status === 404)) throw new Error(`sync ${op.kind} failed (${res.status})`)
        if (res.ok && op.kind !== 'delete') {
          const data = (await res.json()) as { revision?: number; project?: Record<string, unknown> }
          if (typeof data.revision === 'number') this.revisions.set(id, data.revision)
          if (data.project && !this.queue.slice(1).some((queued) => (queued.kind === 'put' ? queued.project.id : queued.id) === id)) {
            this.appliedListeners.forEach((listener) => listener(data.project!))
          }
        }
        if (op.kind === 'delete') this.revisions.delete(id)
        this.queue.shift()
        this.issue = null
        this.persist()
      }
    } catch (err) {
      this.issue = { projectId: this.queue[0] ? (this.queue[0].kind === 'put' ? String(this.queue[0].project.id) : this.queue[0].id) : '', status: null, message: 'The save is waiting for a connection. Your changes remain in this browser.' }
      console.warn('Reclaim: sync will retry —', err instanceof Error ? err.message : err)
      setTimeout(() => this.retry(), 15000)
    } finally {
      this.changed()
    }
  }

  reset(preserveStored = false): void {
    this.queue = []
    this.revisions.clear()
    this.issue = null
    if (!preserveStored && typeof window !== 'undefined') window.localStorage.removeItem(storageKey(QUEUE_KEY))
    this.changed()
  }
}

export const projectSync = new ProjectSync()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => projectSync.retry())
}
