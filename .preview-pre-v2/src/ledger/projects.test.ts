import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { mergeImport, serializeEnvironment } from '@/ledger/store'
import {
  createProject,
  deleteProject,
  getActiveProjectId,
  listProjects,
  loadProject,
  migrateLegacyLedger,
  saveProject,
} from '@/ledger/projects'

function environment() {
  return mergeImport(null, { sourceLabel: 'march-payments.csv', mode: 'upload', parsed: getSampleLedger() })
}

describe('local ledger projects', () => {
  afterEach(() => window.localStorage.clear())

  it('creates separate projects and keeps the newest one active', () => {
    const first = createProject({ name: 'March', sourceLabel: 'march.csv', mode: 'upload', environment: environment() })
    const second = createProject({ name: 'April', sourceLabel: 'april.csv', mode: 'upload', environment: environment() })

    expect(listProjects()).toHaveLength(2)
    expect(getActiveProjectId()).toBe(second.id)
    expect(loadProject(first.id)?.environment.records[0].paymentDate).toBeInstanceOf(Date)
    expect(window.localStorage.getItem('reclaim.projects.index.v1')).not.toContain('records')
    expect(window.localStorage.getItem(`reclaim.project.v1.${first.id}`)).toContain('records')
  })

  it('updates one project without changing another', () => {
    const first = createProject({ name: 'March', sourceLabel: 'march.csv', mode: 'upload', environment: environment() })
    const second = createProject({ name: 'April', sourceLabel: 'april.csv', mode: 'upload', environment: environment() })
    saveProject({ ...first, name: 'March review' })

    expect(loadProject(first.id)?.name).toBe('March review')
    expect(loadProject(second.id)?.name).toBe('April')
  })

  it('deletes only the chosen project and activates the remaining review', () => {
    const first = createProject({ name: 'March', sourceLabel: 'march.csv', mode: 'upload', environment: environment() })
    const second = createProject({ name: 'April', sourceLabel: 'april.csv', mode: 'upload', environment: environment() })
    deleteProject(second.id)

    expect(listProjects().map((project) => project.id)).toEqual([first.id])
    expect(getActiveProjectId()).toBe(first.id)
  })

  it('migrates a legacy ledger once and removes it only after the project write succeeds', () => {
    const legacy = environment()
    window.localStorage.setItem('reclaim.ledger.v1', serializeEnvironment(legacy))
    const loadLegacy = vi.fn(() => legacy)

    migrateLegacyLedger(loadLegacy)
    migrateLegacyLedger(loadLegacy)

    expect(listProjects()).toHaveLength(1)
    expect(loadLegacy).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('reclaim.ledger.v1')).toBeNull()
  })
})
