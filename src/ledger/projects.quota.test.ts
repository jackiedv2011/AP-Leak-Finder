import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { mergeImport } from '@/ledger/store'
import { createProject, hasMemoryOnlyProjects, loadProject, saveProject } from '@/ledger/projects'

describe('an audit larger than browser storage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('still imports and stays usable in the tab instead of failing the whole upload', () => {
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith('reclaim.project.v1.')) throw new DOMException('quota', 'QuotaExceededError')
      return real.call(this, key, value)
    })
    const environment = mergeImport(null, { sourceLabel: 'big.csv', mode: 'upload', parsed: getSampleLedger() })
    const project = createProject({ name: 'big', sourceLabel: 'big.csv', mode: 'upload', environment })
    expect(hasMemoryOnlyProjects()).toBe(true)
    const loaded = loadProject(project.id)
    expect(loaded?.environment.result.findings.length).toBe(environment.result.findings.length)
    const saved = saveProject({ ...loaded!, name: 'renamed' })
    expect(loadProject(saved.id)?.name).toBe('renamed')
  })
})

describe('when browser storage is completely full', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a new audit still appears in the audit list and opens as the active one', async () => {
    const { listProjects, getActiveProjectId } = await import('@/ledger/projects')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const environment = mergeImport(null, { sourceLabel: 'full.csv', mode: 'upload', parsed: getSampleLedger() })
    const project = createProject({ name: 'full', sourceLabel: 'full.csv', mode: 'upload', environment })
    expect(listProjects().map((p) => p.id)).toContain(project.id)
    expect(getActiveProjectId()).toBe(project.id)
  })
})
