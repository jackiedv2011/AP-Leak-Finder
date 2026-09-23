import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { ArrowLeft, Plus } from 'lucide-react'
import { ImportDialog, type ImportIntent } from '@/components/audit/ImportDialog'
import { ClearLedgerDialog } from '@/components/audit/ClearLedgerDialog'
import { LegacyImportDialog } from '@/components/audit/LegacyImportDialog'
import { deferLegacyProjects, discardLegacyProjects, importLegacyProjects, legacyProjectsPresent, type LegacySummary } from '@/ledger/legacyMigration'
import { WorkspaceShell } from '@/workspace/WorkspaceShell'
import { Launch } from '@/workspace/views/Launch'
import { Dashboard } from '@/workspace/views/Dashboard'
import { Audits } from '@/workspace/views/Audits'
import { Findings } from '@/workspace/views/Findings'
import { Recoveries } from '@/workspace/views/Recoveries'
import { Reports } from '@/workspace/views/Reports'
import { SettingsView } from '@/workspace/views/Settings'
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
  listProjects,
  loadProject,
  migrateLegacyLedger,
  saveProject,
  type LedgerProject,
  type LedgerProjectSummary,
} from '@/ledger/projects'
import {
  confirmCase,
  markExpected,
  markNeedsInfo,
  markRecoveryRequested,
  recordRecoveryOutcome,
  reopenDecision,
  reopenOutcome,
  updateCaseReason,
  updateRecoveryPackage,
  withHistory,
  type DecisionValue,
  type DismissalTag,
  type RecoveryMethod,
  type RecoveryVerification,
  type VendorUpdate,
} from '@/ledger/caseState'
import { approveRecovery, closeWithoutRecovery, recordVendorUpdate, reconcileRecovery, reopenRemainingBalance, setContactHold, setNextFollowUp, startRecoveryRequest, verifyRecovery } from '@/recovery/model'
import { useEntitlements, useOptionalAuth } from '@/lib/auth/AuthContext'
import { Locked } from '@/components/plan/Locked'
import { OnboardingTour } from '@/components/tutorial/OnboardingTour'
import { UpgradeDialog } from '@/components/plan/UpgradeDialog'
import { visibleFindingIds } from '@/workspace/planGates'
import { projectSync } from '@/ledger/projectSync'
import type { SenderProfile } from '@/lib/senderProfile'
import type { RequestPackage } from '@/workspace/views/RecoveryPanels'
import { overviewSummary, findCaseView } from '@/ledger/views'
import { getSampleLedger } from '@/data/sampleLedger'
import type { ImportInput } from '@/components/audit/ImportPanel'

const TITLES: Record<RouteMode, string> = {
  dashboard: 'Dashboard',
  audits: 'Audits',
  findings: 'Findings',
  recoveries: 'Recoveries',
  reports: 'Reports',
  settings: 'Settings',
}

function sampleImportInput(): MergeImportInput {
  return { sourceLabel: 'Sample payment ledger', mode: 'sample', parsed: getSampleLedger() }
}

export function AuditApp() {
  const { route, navigate, goBack } = useAuditRoute()
  const auth = useOptionalAuth()
  const entitlements = useEntitlements()
  const [limitDialog, setLimitDialog] = useState(false)
  const [tourRequested, setTourRequested] = useState(false)
  const account = auth?.user && !auth.user.isGuest ? auth.user : null
  // First run: the account (or guest tab) has not been through the tour.
  const tourOpen = tourRequested || (auth !== null && auth.status === 'ready' && auth.user !== null && !auth.user.onboardingSeenAt)
  const closeTour = useCallback(() => {
    setTourRequested(false)
    void auth?.markOnboardingSeen()
  }, [auth])
  const actor = account ? account.name || account.email : null
  const sender = useMemo<SenderProfile>(
    () => ({ businessName: account?.company ?? '', senderName: account?.name ?? '', senderEmail: account?.email ?? '' }),
    [account]
  )
  const [project, setProject] = useState<LedgerProject | null>(() => {
    migrateLegacyLedger(loadEnvironment)
    const projectId = route.projectId ?? getActiveProjectId()
    return projectId ? loadProject(projectId) : null
  })
  const [projects, setProjects] = useState<LedgerProjectSummary[]>(() => listProjects())
  const [environment, setEnvironment] = useState<LedgerEnvironment | null>(() => project?.environment ?? null)
  const [running, setRunning] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)
  // `?entry=upload` (and /scanner, which rewrites to it) is a deliberate
  // "I have a file" entry, so the import surface opens with the screen rather
  // than hiding behind the secondary button.
  const [importDialogOpen, setImportDialogOpen] = useState(() => route.entry === 'upload')
  const [importIntent, setImportIntent] = useState<ImportIntent>('new')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [sampleSession, setSampleSession] = useState(false)
  const [legacy, setLegacy] = useState<LegacySummary | null>(() => legacyProjectsPresent())

  const environmentRef = useRef(environment)
  const projectRef = useRef(project)
  const runActiveRef = useRef(false)
  environmentRef.current = environment
  projectRef.current = project
  const caseOriginRef = useRef<{ mode: RouteMode; y: number }>({ mode: route.mode, y: 0 })

  const refreshProjects = useCallback(() => setProjects(listProjects()), [])

  const openImport = useCallback(
    (intent: ImportIntent) => {
      // Starting a new audit counts against the plan; adding records to an open one does not.
      if (intent === 'new' && account && !entitlements.canStartAudit) {
        setLimitDialog(true)
        return
      }
      setImportIntent(intent)
      setImportDialogOpen(true)
    },
    [account, entitlements.canStartAudit]
  )

  const runImport = useCallback(
    async (input: MergeImportInput, options: { replaceEnvironment?: boolean; persist?: boolean } = {}) => {
      if (runActiveRef.current) return
      runActiveRef.current = true
      setEntryError(null)
      setImportDialogOpen(false)
      setRunning(true)
      // Yield one tick so the running label actually paints before the
      // (synchronous) merge/detection work runs — honest for large files,
      // imperceptible for small ones. A macrotask yield (not requestAnimationFrame)
      // since rAF doesn't fire reliably in a backgrounded or non-compositing tab.
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
          refreshProjects()
          // A new audit counts against the plan once the server has it.
          if (!current || options.replaceEnvironment) void projectSync.flush().then(() => auth?.refreshEntitlements())
          navigate({ projectId: saved.id, mode: 'dashboard', caseId: null, draft: false, entry: null }, { replace: true })
        } else {
          navigate({ projectId: null, mode: 'dashboard', caseId: null, draft: false, entry: null }, { replace: true })
        }
        environmentRef.current = next
        setEnvironment(next)
        setSampleSession(options.persist === false)
      } catch (err) {
        console.error('Reclaim: import failed', err)
        setEntryError('Something went wrong processing that file. No audit results were saved.')
      } finally {
        runActiveRef.current = false
        setRunning(false)
      }
    },
    [navigate, refreshProjects, auth]
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
      if (persisted && (persisted.mode !== 'dashboard' || persisted.caseId)) {
        navigate(persisted, { replace: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arriving at (or being sent to) the upload entry re-opens it, including the
  // hand-off after deleting an audit, which leaves the workspace with nothing
  // to show.
  useEffect(() => {
    if (route.entry === 'upload') openImport('new')
  }, [route.entry, openImport])

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
    setSampleSession(false)
  }, [navigate, route.projectId])

  // Viewing the findings list counts as having seen what's new since the last import.
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

  // Restore the exact list position when a case folds back into its origin.
  useEffect(() => {
    if (route.caseId || route.mode !== caseOriginRef.current.mode) return
    const targetY = caseOriginRef.current.y
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
      const internal = env.result.findings.find((finding) => finding.id === findingId)?.class !== 'recoverable'
      const next = setCaseState(env, findingId, withHistory(current, update(current), actor, internal))
      const currentProject = projectRef.current
      if (currentProject) {
        const saved = saveProject({ ...currentProject, environment: next })
        projectRef.current = saved
        setProject(saved)
        refreshProjects()
      }
      setEnvironment(next)
    },
    [refreshProjects, actor]
  )

  const handleOpenCase = useCallback(
    (findingId: string) => {
      caseOriginRef.current = { mode: route.mode, y: window.scrollY }
      navigate({ caseId: findingId, draft: false, entry: null })
      const resetCaseScroll = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      resetCaseScroll()
      window.requestAnimationFrame(resetCaseScroll)
    },
    [navigate, route.mode]
  )

  const handleDecide = useCallback(
    (findingId: string, value: DecisionValue, reason: string | null, dismissalTag: DismissalTag | null = null) => {
      persistCaseState(findingId, (current) =>
        current.decision === value
          ? updateCaseReason(current, reason)
          : value === 'confirmed'
            ? confirmCase(reason)
            : value === 'needs_info'
              ? markNeedsInfo(reason)
              : markExpected(reason, dismissalTag)
      )
    },
    [persistCaseState]
  )

  const handleMarkRequested = useCallback(
    (findingId: string, pkg: RequestPackage) => {
      persistCaseState(findingId, (current) => {
        const finding = environmentRef.current?.result.findings.find((row) => row.id === findingId)
        if (finding?.class !== 'recoverable') return markRecoveryRequested(updateRecoveryPackage(current, { subject: pkg.subject, body: pkg.body, requestedResolution: pkg.method }), pkg.requestedAmount)
        if (current.recoverySubject !== pkg.subject || current.recoveryDraft !== pkg.body || current.requestedAmount !== pkg.requestedAmount || current.requestedResolution !== pkg.method || (current.recoveryRecipientEmail ?? '') !== pkg.recipientEmail) return current
        return startRecoveryRequest(current, pkg.requestedAmount)
      })
    },
    [persistCaseState]
  )

  const handleApproveRecovery = useCallback((findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => {
    persistCaseState(findingId, (current) => approveRecovery(updateRecoveryPackage(current, { subject: pkg.subject, body: pkg.body, recipientEmail: pkg.recipientEmail, requestedResolution: pkg.method, requestedAmount: pkg.requestedAmount }), { knownBeforeReclaim, knownBeforeNote }))
  }, [persistCaseState])

  const handleContactHold = useCallback((findingId: string, reason: string | null) => {
    persistCaseState(findingId, (current) => setContactHold(current, reason))
  }, [persistCaseState])

  const handleVendorUpdate = useCallback((findingId: string, update: VendorUpdate) => {
    persistCaseState(findingId, (current) => recordVendorUpdate(current, update))
  }, [persistCaseState])

  const handleFollowUp = useCallback((findingId: string, at: number | null) => {
    persistCaseState(findingId, (current) => setNextFollowUp(current, at))
  }, [persistCaseState])

  const handleVerifyRecovery = useCallback((findingId: string, proof: RecoveryVerification) => {
    persistCaseState(findingId, (current) => verifyRecovery(current, proof))
  }, [persistCaseState])

  const handleCloseRecovery = useCallback((findingId: string, reason: string) => {
    persistCaseState(findingId, (current) => closeWithoutRecovery(current, reason))
  }, [persistCaseState])

  const handleReconcileRecovery = useCallback((findingId: string, note: string, rootCause: string) => {
    persistCaseState(findingId, (current) => reconcileRecovery(current, { note, rootCause }))
  }, [persistCaseState])

  const handleRecordOutcome = useCallback(
    (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null, method: RecoveryMethod | null) => {
      persistCaseState(findingId, (current) => recordRecoveryOutcome(current, outcome, amount, note, method))
    },
    [persistCaseState]
  )

  const handleReopen = useCallback(
    (findingId: string) => {
      persistCaseState(findingId, (current) =>
        current.recoveryStage === 'recovered' || current.recoveryStage === 'not_recovered'
          ? reopenOutcome(current)
          : reopenDecision(current)
      )
    },
    [persistCaseState]
  )

  const handleReopenBalance = useCallback((findingId: string) => {
    persistCaseState(findingId, (current) => reopenRemainingBalance(current))
  }, [persistCaseState])

  const handleImport = useCallback(
    (input: ImportInput) =>
      runImport(
        { sourceLabel: input.sourceLabel, mode: input.mode, parsed: input.parsed },
        { replaceEnvironment: importIntent === 'new' || route.entry === 'upload' }
      ),
    [importIntent, route.entry, runImport]
  )

  const handleOpenProject = useCallback(
    (id: string) => {
      navigate({ projectId: id, mode: 'dashboard', caseId: null, draft: false, entry: null })
    },
    [navigate]
  )

  /** After an import the account's project list (and possibly the open audit) changed under us: reload from the cache. */
  const reloadFromCache = useCallback(() => {
    refreshProjects()
    const nextId = getActiveProjectId()
    const next = nextId ? loadProject(nextId) : null
    projectRef.current = next
    environmentRef.current = next?.environment ?? null
    setProject(next)
    setEnvironment(next?.environment ?? null)
    setSampleSession(false)
    navigate({ projectId: next?.id ?? null, mode: 'dashboard', caseId: null, draft: false, entry: next ? null : 'upload' }, { replace: true })
  }, [navigate, refreshProjects])

  const handleImportLegacy = useCallback(async () => {
    await importLegacyProjects()
    setLegacy(null)
    reloadFromCache()
  }, [reloadFromCache])

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
    refreshProjects()
    navigate(
      {
        projectId: nextProject?.id ?? null,
        mode: 'dashboard',
        caseId: null,
        draft: false,
        entry: nextProject ? null : 'upload',
      },
      { replace: true }
    )
  }, [navigate, refreshProjects, sampleSession])

  // The entry sequence and the running state share one screen, so arriving from
  // the marketing site never flashes through a differently-styled interstitial.
  const tour = auth ? <OnboardingTour open={tourOpen && legacy === null} entitlements={entitlements} onDone={closeTour} /> : null

  const legacyDialog = (
    <LegacyImportDialog
      summary={legacy}
      onImport={handleImportLegacy}
      onDefer={() => {
        deferLegacyProjects()
        setLegacy(null)
      }}
      onDiscard={() => {
        discardLegacyProjects()
        setLegacy(null)
      }}
    />
  )

  if (running || route.entry !== null || !environment) {
    return (
      <>
        {legacyDialog}
        {tour}
        <Launch onRunSample={runSampleAudit} onUseOwn={() => openImport('new')} running={running} note={entryError ?? undefined} />
        <UpgradeDialog
          open={limitDialog}
          onOpenChange={setLimitDialog}
          reason={`You've used ${entitlements.usage.auditsThisMonth} of ${entitlements.limits.auditsPerMonth ?? '∞'} audits this month on the Free plan.`}
        />
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} intent="new" />
      </>
    )
  }

  const overview = overviewSummary(environment)
  const activeFinding = activeCase?.finding ?? null
  const activeDiscoveredAt = activeFinding ? environment.imports.find((batch) => batch.findingIds?.includes(activeFinding.id))?.importedAt ?? null : null
  const visible = visibleFindingIds(environment, entitlements)
  const activeLocked = activeFinding !== null && !visible.has(activeFinding.id)
  const auditCount = projects.length + (sampleSession ? 1 : 0)

  return (
    <>
      <WorkspaceShell
        mode={route.mode}
        onModeChange={(mode) => navigate({ mode, caseId: null, draft: false })}
        auditCount={auditCount}
        // The badges are workloads: findings still waiting on a decision, and
        // recoveries still moving (ready to send or out with a vendor).
        findingCount={environment.result.findings.filter((f) => getCaseState(environment, f.id).decision === null).length}
        recoveryCount={overview.recoveryActiveCount}
        title={activeFinding ? activeFinding.vendor : TITLES[route.mode]}
        subtitle={activeFinding ? activeCase?.state.recoveryStage ? activeFinding.class === 'recoverable' ? 'Recovery case' : 'Internal review' : 'Finding' : sampleSession ? 'Sample ledger' : project?.name}
        actions={
          activeFinding ? (
            <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={goBack}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          ) : (
            <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => openImport('new')}>
              <Plus aria-hidden="true" />
              Start an audit
            </button>
          )
        }
      >
        {activeFinding && activeCase && activeLocked ? (
          <Locked
            title="This finding is part of Pro"
            note={`The Free plan shows the ${entitlements.limits.findingsVisible} lowest-value findings in full. Pro shows every finding, including this ${formatCurrency(activeFinding.dollarImpact)} one.`}
          >
            <CaseDetail
              finding={activeFinding}
              state={activeCase.state}
              records={environment.records}
              discoveredAt={activeDiscoveredAt}
              sender={sender}
              onDecide={() => {}}
              onMarkRequested={() => {}}
              onRecordOutcome={() => {}}
              onReopen={() => {}}
              onReopenBalance={() => {}}
              onApproveRecovery={() => {}}
              onContactHold={() => {}}
              onVendorUpdate={() => {}}
              onFollowUp={() => {}}
              onVerifyRecovery={() => {}}
              onCloseRecovery={() => {}}
              onReconcileRecovery={() => {}}
            />
          </Locked>
        ) : activeFinding && activeCase ? (
            <CaseDetail
              finding={activeFinding}
              state={activeCase.state}
              records={environment.records}
              discoveredAt={activeDiscoveredAt}
              sender={sender}
              onDecide={handleDecide}
              onMarkRequested={handleMarkRequested}
              onRecordOutcome={handleRecordOutcome}
              onReopen={handleReopen}
              onReopenBalance={handleReopenBalance}
              onApproveRecovery={handleApproveRecovery}
              onContactHold={handleContactHold}
              onVendorUpdate={handleVendorUpdate}
              onFollowUp={handleFollowUp}
              onVerifyRecovery={handleVerifyRecovery}
              onCloseRecovery={handleCloseRecovery}
              onReconcileRecovery={handleReconcileRecovery}
            />
        ) : route.mode === 'dashboard' ? (
          <Dashboard
            env={environment}
            visible={visible}
            onOpenCase={handleOpenCase}
            onSeeAllFindings={() => navigate({ mode: 'findings', caseId: null, draft: false })}
            onSeeRecoveries={() => navigate({ mode: 'recoveries', caseId: null, draft: false })}
            onStartAudit={() => openImport('new')}
          />
        ) : route.mode === 'audits' ? (
          <Audits
            env={environment}
            projects={projects}
            activeProjectId={project?.id ?? null}
            sampleSession={sampleSession}
            onOpenProject={handleOpenProject}
            onStartAudit={() => openImport('new')}
            onAddRecords={() => openImport('add')}
            onRunSample={runSampleAudit}
          />
        ) : route.mode === 'findings' ? (
          <Findings env={environment} visible={visible} onOpenCase={handleOpenCase} />
        ) : route.mode === 'recoveries' ? (
          <Recoveries env={environment} onOpenCase={handleOpenCase} />
        ) : route.mode === 'reports' ? (
          <Reports env={environment} />
        ) : (
          <SettingsView env={environment} onClear={() => setClearDialogOpen(true)} onShowTour={() => setTourRequested(true)} />
        )}
      </WorkspaceShell>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        error={entryError}
        intent={importIntent}
      />
      <ClearLedgerDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} onConfirm={handleClearLedger} />
      <UpgradeDialog
        open={limitDialog}
        onOpenChange={setLimitDialog}
        reason={`You've used ${entitlements.usage.auditsThisMonth} of ${entitlements.limits.auditsPerMonth ?? '∞'} audits this month on the Free plan.`}
      />
      {legacyDialog}
      {tour}
    </>
  )
}
