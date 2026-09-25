/**
 * Keeps an account's projects on the server. localStorage is the working
 * cache (synchronous, what the UI reads); the server copy is what survives
 * a new device or a cleared browser, and what makes the account boundary real.
 *
 * Writes are fire-and-forget with a retry queue: a failed push is retried on
 * the next push, when the browser comes back online, and on a timer.
 */
type Op = { kind: 'put'; project: Record<string, unknown> } | { kind: 'delete'; id: string }

class ProjectSync {
  private queue: Op[] = []
  private inflight: Promise<void> | null = null
  private fetchImpl: typeof fetch = (...args) => fetch(...args)
  private listeners = new Set<(pending: number) => void>()

  /** Tests inject a fetch bound to a live server. */
  useFetch(impl: typeof fetch): void {
    this.fetchImpl = impl
  }

  onPending(listener: (pending: number) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get pending(): number {
    return this.queue.length
  }

  push(project: Record<string, unknown>): void {
    // A newer write to the same project supersedes an older queued one.
    this.queue = this.queue.filter((op) => !(op.kind === 'put' && op.project.id === project.id))
    this.queue.push({ kind: 'put', project })
    void this.flush()
  }

  remove(id: string): void {
    this.queue = this.queue.filter((op) => !(op.kind === 'put' && op.project.id === id))
    this.queue.push({ kind: 'delete', id })
    void this.flush()
  }

  /** Pull everything the server has for the signed-in account. */
  async pull(): Promise<Record<string, unknown>[]> {
    const res = await this.fetchImpl('/api/projects', { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`Could not load your audits (${res.status}).`)
    const data = (await res.json()) as { projects: Record<string, unknown>[] }
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
    if (!this.inflight) this.inflight = this.drain().finally(() => (this.inflight = null))
    return this.inflight
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0]
        const res =
          op.kind === 'put'
            ? await this.fetchImpl(`/api/projects/${encodeURIComponent(op.project.id as string)}`, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(op.project),
              })
            : await this.fetchImpl(`/api/projects/${encodeURIComponent(op.id)}`, { method: 'DELETE', credentials: 'same-origin' })
        if (res.status === 401) {
          // Session gone — keep the queue; the next log-in flushes it.
          break
        }
        // A refusal that retrying cannot fix (plan limit, malformed, too large)
        // must not sit at the head of the queue blocking every later save.
        if (res.status === 400 || res.status === 402 || res.status === 403 || res.status === 409 || res.status === 413) {
          console.warn(`Reclaim: the server refused to save this audit (${res.status}); it stays in this browser only.`)
          this.queue.shift()
          continue
        }
        if (!res.ok && res.status !== 404) throw new Error(`sync ${op.kind} failed (${res.status})`)
        this.queue.shift()
      }
    } catch (err) {
      console.warn('Reclaim: sync will retry —', err instanceof Error ? err.message : err)
      setTimeout(() => void this.flush(), 15000)
    } finally {
      this.listeners.forEach((l) => l(this.queue.length))
    }
  }

  reset(): void {
    this.queue = []
  }
}

export const projectSync = new ProjectSync()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void projectSync.flush())
}
