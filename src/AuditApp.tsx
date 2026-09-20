import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ImportDialog } from '@/components/audit/ImportDialog'
import { ClearLedgerDialog } from '@/components/audit/ClearLedgerDialog'
import { WorkspaceShell } from '@/workspace/WorkspaceShell'
import { Launch } from '@/workspace/views/Launch'
import { Overview } from '@/workspace/views/Overview'
import { Opportunities } from '@/workspace/views/Opportunities'
import { Recoveries } from '@/workspace/views/Recoveries'
import { Vendors } from '@/workspace/views/Vendors'
import { Reports, DataView, SettingsView } from '@/workspace/views/Simple'
import { CaseDetail } from '@/workspace/views/CaseDetail'
import { useAuditRoute, loadPersistedContext, type RouteMode } from '@/audit/useAuditRoute'
import {
  loadEnvironment,
  mergeImport,
  setCaseState,
  getCaseState,
  acknowledgeNewFindings,
  type LedgerEnvironment,
  type MergeImportInput,
} from '@/ledger/store'
import {
  createProject,
  deleteProject,
  getActiveProjectId,
  loadProject,
  migrateLegacyLedger,
  saveProject,
  type LedgerProject,
} from '@/ledger/projects'
import {
  confirmCase,
  markExpected,
  markNeedsInfo,
  markRecoveryRequested,
  recordRecoveryOutcome,
  updateCaseReason,
  updateRecoveryPackage,
  type DecisionValue,
} from '@/ledger/caseState'
import { overviewSummary, findCaseView } from '@/ledger/views'
import { getSampleLedger } from '@/data/sampleLedger'
import type { ImportInput } from '@/components/audit/ImportPanel'

const TITLES: Record<RouteMode, string> = {
  overview: 'Overview',
  opportunities: 'Opportunities',
  recoveries: 'Recoveries',
  vendors: 'Vendors',
  reports: 'Reports',
  data: 'Data',
  settings: 'Settings',
}

function sampleImportInput(): MergeImportInput {
  return { sourceLabel: 'Sample payment ledger', mode: 'sample', parsed: getSampleLedger() }
}

export function AuditApp() {
  const { route, navigate, goBack } = useAuditRoute()
  const [project, setProject] = useState<LedgerProject | null>(() => {
    migrateLegacyLedger(loadEnvironment)
    const projectId = route.projectId ?? getActiveProjectId()
    return projectId ? loadProject(projectId) : null
  })
  const [environment, setEnvironment] = useState<LedgerEnvironment | null>(() => project?.environment ?? null)
  const [running, setRunning] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)
  // `?entry=upload` (and /scanner, which rewrites to it) is a deliberate
  // "I have a file" entry, so the import surface opens with the screen rather
  // than hiding behind the secondary button.
  const [importDialogOpen, setImportDialogOpen] = useState(() => route.entry === 'upload')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [sampleSession, setSampleSession] = useState(false)

  const environmentRef = useRef(environment)
  const projectRef = useRef(project)
  const runActiveRef = useRef(false)
  environmentRef.current = environment
  projectRef.current = project
  const caseOriginRef = useRef<{ mode: RouteMode; y: number }>({ mode: route.mode, y: 0 })

  const runImport = useCallback(
    async (input: MergeImportInput, options: { replaceEnvironment?: boolean; persist?: boolean } = {}) => {
      if (runActiveRef.current) return
      runActiveRef.current = true
      setEntryError(null)
      setImportDialogOpen(false)
      setRunning(true)
      // Yield one tick so the running label actually paints before the
      // (synchronous) merge/detection work runs — honest for large files,
      // imperceptible for small ones. No artificial minimum duration. A
      // macrotask yield (not requestAnimationFrame) since rAF doesn't fire
      // reliably in a backgrounded or non-compositing tab.
      await new Promise((resolve) => setTimeout(resolve, 0))
      try {
        const next = mergeImport(options.replaceEnvironment ? null : environmentRef.current, input)
        if (options.persist !== false) {
          const current = projectRef.current
          const latestImport = next.imports.at(-1)
          const saved = current && !options.replaceEnvironment
            ? saveProject({ ...current, environment: next, sourceLabel: latestImport?.sourceLabel ?? current.sourceLabel })
            : createProject({
                name: input.sourceLabel.replace(/\.[^.]+$/, '') || 'Ledger review',
                sourceLabel: input.sourceLabel,
                mode: input.mode,
                environment: next,
              })
          projectRef.current = saved
          setProject(saved)
          navigate({ projectId: saved.id, mode: 'overview', caseId: null, draft: false, entry: null }, { replace: true })
        } else {
          navigate({ projectId: null, mode: 'overview', caseId: null, draft: false, entry: null }, { replace: true })
        }
        environmentRef.current = next
        setEnvironment(next)
        setSampleSession(options.persist === false)
      } catch (err) {
        console.error('Reclaim: import failed', err)
        setEntryError('Something went wrong processing that file. No scan results were saved.')
      } finally {
        runActiveRef.current = false
        setRunning(false)
      }
    },
    [navigate]
  )

  const runSampleAudit = useCallback(() => {
    void runImport(sampleImportInput(), { replaceEnvironment: true, persist: false })
  }, [runImport])

  // One-time bootstrap: honor a first-time `?sample=1` CTA from the landing
  // page, and restore the last working context on a bare reload (no query
  // string at all) so returning to /audit picks up exactly where it left off.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!environmentRef.current) {
      if (params.get('sample') === '1') void runImport(sampleImportInput(), { replaceEnvironment: true, persist: false })
      return
    }
    if (window.location.search === '') {
      const persisted = loadPersistedContext()
      if (persisted && (persisted.mode !== 'overview' || persisted.caseId)) {
        navigate(persisted, { replace: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arriving at (or being sent to) the upload entry re-opens it, including the
  // hand-off after clearing a ledger, which leaves the workspace with nothing
  // to show.
  useEffect(() => {
    if (route.entry === 'upload') setImportDialogOpen(true)
  }, [route.entry])

  useEffect(() => {
    if (!route.projectId || route.projectId === projectRef.current?.id) return
    const selected = loadProject(route.projectId)
    if (!selected) {
      navigate({ projectId: projectRef.current?.id ?? null, caseId: null, draft: false }, { replace: true })
      return
    }
    projectRef.current = selected
    environmentRef.current = selected.environment
    setProject(selected)
    setEnvironment(selected.environment)
  }, [navigate, route.projectId])

  // Viewing the queue counts as having seen what's new since the last import.
  useEffect(() => {
    if (route.mode === 'opportunities' && environment && environment.newFindingIds.length > 0) {
      const next = acknowledgeNewFindings(environment)
      const currentProject = projectRef.current
      if (currentProject) {
        const saved = saveProject({ ...currentProject, environment: next })
        projectRef.current = saved
        setProject(saved)
      }
      setEnvironment(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.mode, environment])

  const activeCase = useMemo(
    () => (environment && route.caseId ? findCaseView(environment, route.caseId) : null),
    [environment, route.caseId]
  )

  // Drop a stale/unknown case id from the URL instead of dead-ending the user.
  useEffect(() => {
    if (environment && route.caseId && !activeCase) {
      navigate({ caseId: null, draft: false }, { replace: true })
    }
  }, [environment, route.caseId, activeCase, navigate])

  // Restore the exact list position when a case folds back into its origin.
  useEffect(() => {
    if (route.caseId || route.mode !== caseOriginRef.current.mode) return
    const targetY = caseOriginRef.current.y
    // Browser history restores its own scroll position after popstate. Waiting a
    // task lets the product's exact case origin win that race consistently.
    const timeout = window.setTimeout(() => {
      try {
        window.scrollTo({ top: targetY, left: 0, behavior: 'instant' })
      } catch {
        // scrollTo is unavailable in some test environments — non-fatal
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [route.caseId, route.mode])

  const persistCaseState = useCallback(
    (findingId: string, update: (current: ReturnType<typeof getCaseState>) => ReturnType<typeof getCaseState>) => {
      const env = environmentRef.current
      if (!env) return
      const current = getCaseState(env, findingId)
      const next = setCaseState(env, findingId, update(current))
      const currentProject = projectRef.current
      if (currentProject) {
        const saved = saveProject({ ...currentProject, environment: next })
        projectRef.current = saved
        setProject(saved)
      }
      setEnvironment(next)
    },
    []
  )

  const handleOpenCase = useCallback(
    (findingId: string) => {
      caseOriginRef.current = { mode: route.mode, y: window.scrollY }
      navigate({ caseId: findingId, draft: false, entry: null })
      // Opening a case is a new scene, not a continuation of the queue below it.
      // Reset twice so the post-navigation layout cannot restore the previous scroll position.
      const resetCaseScroll = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      resetCaseScroll()
      window.requestAnimationFrame(resetCaseScroll)
    },
    [navigate, route.mode]
  )

  const handleDecide = useCallback(
    (findingId: string, value: DecisionValue, reason: string | null) => {
      persistCaseState(findingId, (current) =>
        current.decision === value
          ? updateCaseReason(current, reason)
          : value === 'confirmed'
            ? confirmCase(reason)
            : value === 'needs_info'
              ? markNeedsInfo(reason)
              : markExpected(reason)
      )
    },
    [persistCaseState]
  )

  const handleMarkRequested = useCallback(
    (findingId: string, subject: string, body: string) => {
      persistCaseState(findingId, (current) =>
        markRecoveryRequested(updateRecoveryPackage(current, { subject, body, requestedResolution: 'refund' }))
      )
    },
    [persistCaseState]
  )

  const handleRecordOutcome = useCallback(
    (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null) => {
      persistCaseState(findingId, (current) => recordRecoveryOutcome(current, outcome, amount, null))
    },
    [persistCaseState]
  )

  const handleImport = useCallback(
    (input: ImportInput) =>
      runImport(
        { sourceLabel: input.sourceLabel, mode: input.mode, parsed: input.parsed },
        { replaceEnvironment: route.entry === 'upload' }
      ),
    [route.entry, runImport]
  )

  const handleClearLedger = useCallback(() => {
    const currentProject = projectRef.current
    if (!sampleSession && currentProject) deleteProject(currentProject.id)
    const nextProjectId = getActiveProjectId()
    const nextProject = nextProjectId ? loadProject(nextProjectId) : null
    projectRef.current = nextProject
    environmentRef.current = nextProject?.environment ?? null
    setProject(nextProject)
    setEnvironment(nextProject?.environment ?? null)
    setSampleSession(false)
    setClearDialogOpen(false)
    setEntryError(null)
    navigate(
      {
        projectId: nextProject?.id ?? null,
        mode: 'overview',
        caseId: null,
        draft: false,
        entry: nextProject ? null : 'upload',
      },
      { replace: true }
    )
  }, [navigate, sampleSession])

  // The entry sequence and the running state share one screen, so arriving from
  // the marketing site never flashes through a differently-styled interstitial.
  if (running || route.entry !== null || !environment) {
    return (
      <>
        <Launch
          onRunSample={runSampleAudit}
          onUseOwn={() => setImportDialogOpen(true)}
          running={running}
          note={entryError ?? undefined}
        />
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} />
      </>
    )
  }

  const overview = overviewSummary(environment)
  const activeFinding = activeCase?.finding ?? null

  return (
    <>
      <WorkspaceShell
        mode={route.mode}
        onModeChange={(mode) => navigate({ mode, caseId: null, draft: false })}
        opportunityCount={environment.result.findings.length}
        recoveryCount={overview.recoveryActiveCount + overview.recoveredCount}
        vendorCount={overview.vendorCount}
        title={activeFinding ? activeFinding.vendor : TITLES[route.mode]}
        subtitle={activeFinding ? 'Recovery case' : undefined}
        actions={
          activeFinding ? (
            <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={goBack}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          ) : (
            <button
              type="button"
              className="wk-btn"
              data-variant="outline"
              data-size="sm"
              onClick={() => setImportDialogOpen(true)}
            >
              Add a file
            </button>
          )
        }
      >
        {activeFinding && activeCase ? (
          <CaseDetail
            finding={activeFinding}
            state={activeCase.state}
            onDecide={handleDecide}
            onMarkRequested={(findingId) =>
              handleMarkRequested(findingId, `Regarding ${activeFinding.vendor}`, activeFinding.explanation)
            }
            onRecordOutcome={handleRecordOutcome}
          />
        ) : route.mode === 'overview' ? (
          <Overview
            env={environment}
            onOpenCase={handleOpenCase}
            onSeeAll={() => navigate({ mode: 'opportunities', caseId: null, draft: false })}
          />
        ) : route.mode === 'opportunities' ? (
          <Opportunities env={environment} onOpenCase={handleOpenCase} />
        ) : route.mode === 'recoveries' ? (
          <Recoveries env={environment} onOpenCase={handleOpenCase} />
        ) : route.mode === 'vendors' ? (
          <Vendors env={environment} />
        ) : route.mode === 'reports' ? (
          <Reports env={environment} />
        ) : route.mode === 'data' ? (
          <DataView env={environment} onImport={() => setImportDialogOpen(true)} />
        ) : (
          <SettingsView env={environment} onClear={() => setClearDialogOpen(true)} />
        )}
      </WorkspaceShell>

      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} />
      <ClearLedgerDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} onConfirm={handleClearLedger} />
    </>
  )
}
