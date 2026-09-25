import { describe, expect, it, vi } from 'vitest'
import { projectSync } from '@/ledger/projectSync'

describe('project sync queue', () => {
  it('a permanent refusal (plan limit) is dropped so later saves still reach the server', async () => {
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
    expect(calls).toEqual(['/api/projects/blocked', '/api/projects/later'])
    expect(projectSync.pending).toBe(0)
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
})
