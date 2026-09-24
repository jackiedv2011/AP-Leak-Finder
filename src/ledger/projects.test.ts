import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSampleLedger } from '@/data/sampleLedger'
import { mergeImport, serializeEnvironment, setCaseState } from '@/ledger/store'
import { confirmCase, markRecoveryRequested, recordRecoveryOutcome } from '@/ledger/caseState'
import { ladder } from '@/workspace/selectors'
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

  it('keeps internal reviews out of the project recovery shortcut', () => {
    let env = environment()
    const review = env.result.findings.find((finding) => finding.class === 'review')!
    env = setCaseState(env, review.id, confirmCase('Investigate bank change'))
    createProject({ name: 'Internal review', sourceLabel: 'march.csv', mode: 'upload', environment: env })
    expect(listProjects()[0].recoveryActiveCount).toBe(0)
  })

  it('every recovery field survives save → reload, and the dashboard figures come back identical', () => {
    let env = environment()
    const [first, second] = env.result.findings.filter((f) => f.class === 'recoverable')
    env = setCaseState(env, first.id, recordRecoveryOutcome(markRecoveryRequested(confirmCase('yes')), 'recovered', 123.45, 'CM-9'))
    env = setCaseState(env, second.id, markRecoveryRequested(confirmCase(null)))
    const project = createProject({ name: 'March', sourceLabel: 'march.csv', mode: 'upload', environment: env })
    const before = ladder(env)

    const reloaded = loadProject(project.id)!
    expect(reloaded.environment.caseStates[first.id]).toMatchObject({
      decision: 'confirmed',
      reason: 'yes',
      recoveryStage: 'recovered',
      recoveredAmount: 123.45,
      recoveryOutcomeNote: 'CM-9',
    })
    expect(reloaded.environment.caseStates[first.id].recoveryRequestedAt).toBeTypeOf('number')
    expect(reloaded.environment.caseStates[first.id].recoveryResolvedAt).toBeTypeOf('number')
    expect(ladder(reloaded.environment)).toEqual(before)
    expect(ladder(reloaded.environment).recovered).toBe(123.45)
    expect(listProjects()[0].recoveryActiveCount).toBe(1)
  })

  it('findings keep their identity across a reload, so a decision made before still applies after', () => {
    let env = environment()
    const target = env.result.findings[0]
    env = setCaseState(env, target.id, confirmCase(null))
    const project = createProject({ name: 'March', sourceLabel: 'march.csv', mode: 'upload', environment: env })
    const reloaded = loadProject(project.id)!
    expect(reloaded.environment.result.findings.map((f) => f.id)).toEqual(env.result.findings.map((f) => f.id))
    expect(reloaded.environment.caseStates[target.id].decision).toBe('confirmed')
    // and the related records are the live revived ones, not stale JSON clones
    const revived = reloaded.environment.result.findings[0].relatedRecords[0]
    expect(reloaded.environment.records).toContain(revived)
  })

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
