import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { AuditShell } from '@/components/audit/AuditShell'
import { UpgradeDialog } from '@/components/billing/UpgradeDialog'
import { useEntitlement } from '@/billing/useEntitlement'
import { lockedSummary } from '@/billing/entitlement'
import { AuditEntry } from '@/components/audit/AuditEntry'
import { AuditLaunch } from '@/components/audit/AuditLaunch'
import { AuditProcessing, type AuditProcessingPhase } from '@/components/audit/AuditProcessing'
import { OverviewView } from '@/components/audit/OverviewView'
import { FindingsView } from '@/components/audit/FindingsView'
import { RecoveryView } from '@/components/audit/RecoveryView'
import { RecordsView } from '@/components/audit/RecordsView'
import { SettingsView } from '@/components/audit/SettingsView'
import { FindingCase } from '@/components/audit/FindingCase'
import { ImportDialog } from '@/components/audit/ImportDialog'
import { ClearLedgerDialog } from '@/components/audit/ClearLedgerDialog'
import { ProjectSwitcher } from '@/components/audit/ProjectSwitcher'
import { useAuditRoute, loadPersistedContext } from '@/audit/useAuditRoute'
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
  listProjects,
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
  updateDismissal,
  updateRecoveryPackage,
  updateRequestedEvidence,
  type DecisionValue,
  type DismissalTag,
  type RecoveryMethod,
} from '@/ledger/caseState'
import { overviewSummary, findingsQueue, recoveryQueue, findCaseView, lastScanReceipt, type ScanReceiptSummary } from '@/ledger/views'
import { assessDataReadiness, type DataReadiness } from '@/audit/dataReadiness'
import { getSampleLedger } from '@/data/sampleLedger'
import type { ImportInput } from '@/components/audit/ImportPanel'
import type { Finding } from '@/types'
import { MOTION_TRANSITION, sceneVariants } from '@/motion/system'

const MODE_POSITION = { overview: 0, findings: 1, recovery: 2, records: 3, settings: 4 } as const

interface ProcessingRun {
  phase: AuditProcessingPhase
  sourceLabel: string
  mode: 'sample' | 'upload'
  readiness: DataReadiness
  receipt?: ScanReceiptSummary
  error?: string
}

/** Stable identity so the entitlement memo doesn't rebuild on every render. */
const NO_FINDINGS: Finding[] = []

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
  const [projects, setProjects] = useState(() => listProjects())
  const [processing, setProcessing] = useState<ProcessingRun | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [sampleSession, setSampleSession] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  // Entitlement is derived above every early return so hook order stays stable
  // across the entry, processing, and workspace renders.
  const findings = environment?.result.findings ?? NO_FINDINGS
  const { plan, entitlement, upgrade, downgrade } = useEntitlement(findings)
  const locked = useMemo(() => lockedSummary(entitlement, findings), [entitlement, findings])

  const environmentRef = useRef(environment)
  const projectRef = useRef(project)
  const processingActiveRef = useRef(false)
  environmentRef.current = environment
  projectRef.current = project
  const caseOriginRef = useRef<{ mode: typeof route.mode; y: number }>({ mode: route.mode, y: 0 })
  const previousModeRef = useRef(route.mode)
  const modeDirection = Math.sign(MODE_POSITION[route.mode] - MODE_POSITION[previousModeRef.current])

  useEffect(() => {
    previousModeRef.current = route.mode
  }, [route.mode])

  const runImport = useCallback(
    async (input: MergeImportInput, options: { replaceEnvironment?: boolean; persist?: boolean } = {}) => {
      if (processingActiveRef.current) return
      processingActiveRef.current = true
      const readiness = assessDataReadiness(input.parsed)
      setEntryError(null)
      setImportDialogOpen(false)
      setProcessing({ phase: 'running', sourceLabel: input.sourceLabel, mode: input.mode, readiness })
      // Yield one tick so the ingest label actually paints before the
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
          setProjects(listProjects())
          navigate({ projectId: saved.id, mode: 'overview', caseId: null, draft: false, entry: null }, { replace: true })
        } else {
          navigate({ projectId: null, mode: 'overview', caseId: null, draft: false, entry: null }, { replace: true })
        }
        environmentRef.current = next
        setEnvironment(next)
        setSampleSession(options.persist === false)
        const receipt = lastScanReceipt(next)
        if (!receipt) throw new Error('Scan receipt could not be derived')
        setProcessing({ phase: 'complete', sourceLabel: input.sourceLabel, mode: input.mode, readiness, receipt })
      } catch (err) {
        console.error('Reclaim: import failed', err)
        const message = 'Something went wrong processing that file. No scan results were saved.'
        setEntryError(message)
        setProcessing({ phase: 'failed', sourceLabel: input.sourceLabel, mode: input.mode, readiness, error: message })
      }
    },
    [navigate]
  )

  const runSampleAudit = useCallback(() => {
    void runImport(sampleImportInput(), { replaceEnvironment: true, persist: false })
  }, [runImport])

  const handleProcessingContinue = useCallback(() => {
    const retryExistingLedger = processing?.phase === 'failed' && environmentRef.current && route.entry !== 'upload'
    processingActiveRef.current = false
    setProcessing(null)
    if (retryExistingLedger) setImportDialogOpen(true)
  }, [processing?.phase, route.entry])

  // One-time bootstrap: honor a first-time `?sample=1` CTA from the landing
  // page, and restore the last working context on a bare reload (no query
  // string at all) so returning to /audit picks up exactly where it left off.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!environmentRef.current) {
      if (params.get('sample') === '1') runImport(sampleImportInput(), { replaceEnvironment: true, persist: false })
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

  // Viewing Findings counts as having seen what's new since the last import.
  useEffect(() => {
    if (route.mode === 'findings' && environment && environment.newFindingIds.length > 0) {
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

  // Restore the exact list/overview position when a case folds back into its origin.
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

  const handleOpenDraft = useCallback(() => {
    navigate({ draft: true }, { replace: true })
  }, [navigate])

  const handleCloseDraft = useCallback(() => {
    navigate({ draft: false }, { replace: true })
  }, [navigate])

  const handleDecide = useCallback((findingId: string, value: DecisionValue, reason: string | null) => {
    const env = environmentRef.current
    if (!env) return
    const current = getCaseState(env, findingId)
    const state =
      current.decision === value
        ? updateCaseReason(current, reason)
        : value === 'confirmed'
          ? confirmCase(reason)
          : value === 'needs_info'
            ? markNeedsInfo(reason)
            : markExpected(reason)
    const next = setCaseState(env, findingId, state)
    const currentProject = projectRef.current
    if (currentProject) {
      const saved = saveProject({ ...currentProject, environment: next })
      projectRef.current = saved
      setProject(saved)
    }
    setEnvironment(next)
  }, [])

  const persistCaseState = useCallback((findingId: string, update: (current: ReturnType<typeof getCaseState>) => ReturnType<typeof getCaseState>) => {
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
  }, [])

  const handlePackageChange = useCallback((findingId: string, update: { subject?: string; body?: string; recipientEmail?: string; requestedResolution?: RecoveryMethod }) => {
    persistCaseState(findingId, (current) => updateRecoveryPackage(current, update))
  }, [persistCaseState])

  // Dismissing a finding always asks why first — see FindingCase's dismiss
  // prompt. This commits it once the reviewer actually picks a reason.
  const handleDismiss = useCallback((findingId: string, tag: DismissalTag, reason: string | null) => {
    persistCaseState(findingId, (current) =>
      current.decision === 'expected' ? updateDismissal(current, tag, reason) : markExpected(reason, tag)
    )
  }, [persistCaseState])

  const handleUpdateRequestedEvidence = useCallback((findingId: string, requestedEvidence: string[], reason: string | null) => {
    persistCaseState(findingId, (current) => updateRequestedEvidence(current, requestedEvidence, reason))
  }, [persistCaseState])

  const handleMarkRequested = useCallback((findingId: string, recoveryPackage: { subject: string; body: string; recipientEmail?: string; requestedResolution: RecoveryMethod }) => {
    persistCaseState(findingId, (current) => markRecoveryRequested(updateRecoveryPackage(current, recoveryPackage)))
  }, [persistCaseState])

  const handleRecordOutcome = useCallback((findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null) => {
    persistCaseState(findingId, (current) => recordRecoveryOutcome(current, outcome, amount, note))
  }, [persistCaseState])

  const handleImport = useCallback(
    (input: ImportInput) => runImport(
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
    setProjects(listProjects())
    setSampleSession(false)
    setClearDialogOpen(false)
    setEntryError(null)
    navigate({
      projectId: nextProject?.id ?? null,
      mode: 'overview',
      caseId: null,
      draft: false,
      entry: nextProject ? null : 'upload',
    }, { replace: true })
  }, [navigate, sampleSession])

  const handleSwitchProject = useCallback((projectId: string) => {
    const selected = loadProject(projectId)
    if (!selected) return
    projectRef.current = selected
    environmentRef.current = selected.environment
    setProject(selected)
    setEnvironment(selected.environment)
    setSampleSession(false)
    navigate({ projectId, mode: 'overview', caseId: null, draft: false, entry: null })
  }, [navigate])

  const handleCloseCase = useCallback(() => {
    goBack()
  }, [goBack])

  if (processing) {
    return (
      <AuditShell variant="minimal">
        <AuditProcessing {...processing} entitlement={entitlement} onContinue={handleProcessingContinue} />
      </AuditShell>
    )
  }

  if (route.entry === 'sample') {
    return (
      <AuditShell variant="minimal">
        <AuditLaunch
          onRunSample={runSampleAudit}
          onUseLedger={() => navigate({ entry: 'upload', caseId: null, draft: false }, { replace: true })}
        />
      </AuditShell>
    )
  }

  if (route.entry === 'upload') {
    return (
      <AuditShell variant="minimal">
        <AuditEntry
          variant="upload"
          error={entryError}
          onRunSample={runSampleAudit}
          onImport={handleImport}
        />
      </AuditShell>
    )
  }

  if (!environment) {
    return (
      <AuditShell variant="minimal">
        <AuditEntry error={entryError} onRunSample={runSampleAudit} onImport={handleImport} />
      </AuditShell>
    )
  }

  const overview = overviewSummary(environment)
  const receipt = lastScanReceipt(environment)
  // Rows referenced by at least one finding — the Records view marks these so
  // "links back to the exact source rows" is checkable, not just claimed.
  const flaggedRecordIds = new Set(
    environment.result.findings.flatMap((finding) => finding.relatedRecords.map((record) => record.id))
  )
  const findingsCount = overview.readyToVerifyCount + overview.needsContextCount + overview.worthNotingCount
  const caseIndex = activeCase ? environment.result.findings.findIndex((finding) => finding.id === activeCase.finding.id) : -1
  const capsuleAction = activeCase
    ? activeCase.state.decision === null
      ? { label: 'Confirm', run: () => handleDecide(activeCase.finding.id, 'confirmed', null) }
      : activeCase.state.decision === 'confirmed' && !route.draft
        ? { label: 'Prepare', run: handleOpenDraft }
        : null
    : null

  const MODE_TITLE = {
    overview: 'Dashboard',
    findings: 'Money found',
    recovery: 'Claims',
    records: 'Records',
    settings: 'Settings',
  } as const

  return (
    <AuditShell
      variant="full"
      mode={route.mode}
      onModeChange={(mode) => navigate({ mode, caseId: null, draft: false })}
      findingsCount={findingsCount}
      recoveryCount={overview.recoveryActiveCount}
      recordCount={overview.recordCount}
      plan={plan}
      lockedCount={locked.lockedCount}
      lockedValue={locked.lockedValue}
      onUpgrade={() => setUpgradeOpen(true)}
      topBar={
        activeCase ? (
          <>
            <button type="button" className="rc-btn" data-variant="ghost" data-size="sm" onClick={handleCloseCase}>
              <ArrowLeft aria-hidden="true" />
              {MODE_TITLE[route.mode]}
            </button>
            <div className="rc-topbar-title">
              <span>{caseIndex >= 0 ? `Case ${caseIndex + 1} of ${environment.result.findings.length}` : 'Case'}</span>
              <strong>{activeCase.finding.vendor}</strong>
            </div>
          </>
        ) : (
          <div className="rc-topbar-title">
            <span>{project?.sourceLabel ?? (sampleSession ? 'Sample ledger' : 'Review')}</span>
            <strong>{MODE_TITLE[route.mode]}</strong>
          </div>
        )
      }
      topBarRight={
        <>
          {activeCase && capsuleAction && (
            <button type="button" className="rc-btn" data-variant="mint" data-size="sm" onClick={capsuleAction.run}>
              {capsuleAction.label}
            </button>
          )}
          {!activeCase && project && projects.length > 0 && (
            <ProjectSwitcher projects={projects} value={project.id} onValueChange={handleSwitchProject} />
          )}
          {!activeCase && (
            <button
              className="rc-btn"
              data-variant="outline"
              data-size="sm"
              type="button"
              onClick={() => navigate({ projectId: null, mode: 'overview', caseId: null, draft: false, entry: 'upload' })}
            >
              New review
            </button>
          )}
        </>
      }
    >
      <LayoutGroup id="audit-scene">
        <div className="rc-scene" data-depth={activeCase ? (route.draft ? 'action' : 'case') : 'ledger'}>
          <motion.div
            className="rc-scene-frame"
            key={activeCase ? `case-${activeCase.finding.id}` : `ledger-${route.mode}`}
            custom={modeDirection}
            variants={reduceMotion ? undefined : sceneVariants}
            initial={reduceMotion ? { opacity: 0 } : 'enter'}
            animate={reduceMotion ? { opacity: 1 } : 'center'}
            transition={reduceMotion ? { duration: 0.1 } : MOTION_TRANSITION.enter}
          >
              {route.mode === 'overview' && (
                <OverviewView
                  summary={overview}
                  receipt={receipt}
                  entitlement={entitlement}
                  locked={locked}
                  onUpgrade={() => setUpgradeOpen(true)}
                  activeCase={activeCase}
                  draftOpen={route.draft}
                  onOpenCase={handleOpenCase}
                  onCloseCase={handleCloseCase}
                  onOpenDraft={handleOpenDraft}
                  onCloseDraft={handleCloseDraft}
                  onDecide={handleDecide}
                  onDismiss={handleDismiss}
                  onUpdateRequestedEvidence={handleUpdateRequestedEvidence}
                  onPackageChange={handlePackageChange}
                  onMarkRequested={handleMarkRequested}
                  onRecordOutcome={handleRecordOutcome}
                  onOpenImport={() => setImportDialogOpen(true)}
                  onClearLedger={() => setClearDialogOpen(true)}
                  onGoToFindings={() => navigate({ mode: 'findings', caseId: null, draft: false })}
                />
              )}
              {route.mode !== 'overview' && activeCase && (
                <FindingCase
                  key={activeCase.finding.id}
                  finding={activeCase.finding}
                  state={activeCase.state}
                  isNew={activeCase.isNew}
                  draftOpen={route.draft}
                  onOpenDraft={handleOpenDraft}
                  onCloseDraft={handleCloseDraft}
                  onDecide={handleDecide}
                  onDismiss={handleDismiss}
                  onUpdateRequestedEvidence={handleUpdateRequestedEvidence}
                  onPackageChange={handlePackageChange}
                  onMarkRequested={handleMarkRequested}
                  onRecordOutcome={handleRecordOutcome}
                />
              )}
              {route.mode === 'findings' && !activeCase && (
                <FindingsView
                  queue={findingsQueue(environment)}
                  entitlement={entitlement}
                  locked={locked}
                  onOpenCase={handleOpenCase}
                  onUpgrade={() => setUpgradeOpen(true)}
                />
              )}
              {route.mode === 'recovery' && !activeCase && <RecoveryView queue={recoveryQueue(environment)} onOpenCase={handleOpenCase} />}
              {route.mode === 'records' && !activeCase && (
                <RecordsView
                  records={environment.records}
                  flaggedRecordIds={flaggedRecordIds}
                  onOpenImport={() => setImportDialogOpen(true)}
                />
              )}
              {route.mode === 'settings' && !activeCase && (
                <SettingsView
                  plan={plan}
                  locked={locked}
                  recordCount={overview.recordCount}
                  vendorCount={overview.vendorCount}
                  importCount={overview.importCount}
                  sourceLabel={overview.lastImportLabel}
                  recoveredValue={overview.recoveredValue}
                  onUpgrade={() => setUpgradeOpen(true)}
                  onDowngrade={downgrade}
                  onClearLedger={() => setClearDialogOpen(true)}
                  onOpenImport={() => setImportDialogOpen(true)}
                />
              )}
          </motion.div>
        </div>
      </LayoutGroup>

      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} />
      <ClearLedgerDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} onConfirm={handleClearLedger} />
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        onConfirm={upgrade}
        lockedCount={locked.lockedCount}
        lockedValue={locked.lockedValue}
      />
    </AuditShell>
  )
}
