import { describe, expect, it, vi } from 'vitest'
import { projectSync } from '@/ledger/projectSync'
import { setStorageScope } from '@/lib/storageScope'

describe('project sync queue', () => {
  it('a refusal stays visible and preserves the queued local work', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      return new Response('{}', { status: url.endsWith('/blocked') ? 402 : 200 })
    })
    projectSync.reset()
    projectSync.useFetch(fetchImpl as unknown as typeof fetch)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    projectSync.push({ id: 'blocked' })
    projectSync.push({ id: 'later' })
    await projectSync.flush()
    await projectSync.flush()
    expect(calls).toEqual(['/api/projects/blocked'])
    expect(projectSync.pending).toBe(2)
    expect(projectSync.syncIssue).toMatchObject({ projectId: 'blocked', status: 402 })
    projectSync.reset()
    warn.mockRestore()
  })

  it('a session that expired keeps the queue for the next log-in instead of dropping work', async () => {
    projectSync.reset()
    projectSync.useFetch((async () => new Response('{}', { status: 401 })) as unknown as typeof fetch)
    projectSync.push({ id: 'p1' })
    await projectSync.flush()
    expect(projectSync.pending).toBe(1)
    projectSync.reset()
  })

  it('does not discard a case command when its project is missing on the server', async () => {
    projectSync.reset()
    projectSync.useFetch((async () => new Response('{}', { status: 404 })) as unknown as typeof fetch)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      projectSync.command('missing', 'f1', 'decision', { decision: 'confirmed' })
      await projectSync.flush()
      expect(projectSync.pending).toBe(1)
      expect(projectSync.syncIssue?.projectId).toBe('missing')
    } finally {
      projectSync.reset()
      warn.mockRestore()
    }
  })

  it('restores an unsent command with its original revision after reload and detects a newer server copy', async () => {
    setStorageScope('sync-reload-test')
    try {
      projectSync.reset()
      let sentRevision: number | null = null
      let online = false
      projectSync.useFetch((async (url: string, init?: RequestInit) => {
        if (url === '/api/projects') return Response.json({ projects: [], revisions: { p1: online ? 8 : 3 } })
        if (!online) return new Response('{}', { status: 401 })
        sentRevision = (JSON.parse(String(init?.body)) as { expectedRevision: number }).expectedRevision
        return new Response('{}', { status: 409 })
      }) as typeof fetch)
      await projectSync.pull()
      projectSync.command('p1', 'f1', 'decision', { decision: 'confirmed', reason: null })
      await projectSync.flush()
      expect(projectSync.pending).toBe(1)
      projectSync.reset(true)
      projectSync.restore()
      expect(projectSync.pending).toBe(1)
      online = true
      await projectSync.pull()
      projectSync.retry()
      await projectSync.flush()
      expect(sentRevision).toBe(3)
      expect(projectSync.syncIssue).toMatchObject({ status: 409 })
    } finally {
      projectSync.reset()
      setStorageScope(null)
    }
  })
})
