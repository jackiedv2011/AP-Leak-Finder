import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { AuditShell } from '@/components/audit/AuditShell'
import { AuditEntry } from '@/components/audit/AuditEntry'
import { AuditLaunch } from '@/components/audit/AuditLaunch'
import { AuditProcessing, type SampleAuditPhase } from '@/components/audit/AuditProcessing'
import { IngestStatus } from '@/components/audit/IngestStatus'
import { LivingCapsule } from '@/components/audit/LivingCapsule'
import { OverviewView } from '@/components/audit/OverviewView'
import { FindingsView } from '@/components/audit/FindingsView'
import { RecoveryView } from '@/components/audit/RecoveryView'
import { FindingCase } from '@/components/audit/FindingCase'
import { ImportDialog } from '@/components/audit/ImportDialog'
import { ClearLedgerDialog } from '@/components/audit/ClearLedgerDialog'
import { SaveToHistoryDialog } from '@/components/audit/SaveToHistoryDialog'
import { GuestGateDialog } from '@/components/audit/GuestGateDialog'
import { AccountMenu } from '@/components/app/AccountMenu'
import { GuestBanner } from '@/components/app/GuestBanner'
import { useAuth } from '@/lib/auth/AuthContext'
import { saveToHistory } from '@/history/store'
import { useAuditRoute, loadPersistedContext } from '@/audit/useAuditRoute'
import { TutorialTour, type TutorialStep } from '@/components/tutorial/TutorialTour'
import { resetTutorial } from '@/components/tutorial/tutorialState'
import {
  loadEnvironment,
  saveEnvironment,
  clearEnvironment,
  mergeImport,
  setCaseState,
  getCaseState,
  acknowledgeNewFindings,
  type LedgerEnvironment,
  type MergeImportInput,
} from '@/ledger/store'
import {
  confirmCase,
  markExpected,
  markNeedsInfo,
  advanceRecoveryStage,
  updateCaseReason,
  updateRecoveryDraft,
  type DecisionValue,
} from '@/ledger/caseState'
import { overviewSummary, findingsQueue, recoveryQueue, findCaseView } from '@/ledger/views'
import { getSampleLedger } from '@/data/sampleLedger'
import type { ImportInput } from '@/components/audit/ImportPanel'
import { MOTION_TRANSITION, sceneVariants } from '@/motion/system'

const MODE_POSITION = { overview: 0, findings: 1, recovery: 2 } as const

const DASHBOARD_TOUR_STEPS: TutorialStep[] = [
  {
    id: 'ledger',
    title: 'This is your standing ledger',
    body: 'Every import builds up one ledger. Reclaim keeps the original evidence attached to every finding so nothing is a black box.',
  },
  {
    id: 'modes',
    title: 'Overview, Findings, Recovery',
    body: 'Switch between the summary, the queue of findings to review, and cases actively moving through recovery.',
    target: '[data-tutorial="mode-tabs"]',
    placement: 'bottom',
  },
  {
    id: 'total',
    title: 'Your open exposure',
    body: 'The total dollar amount across every case still awaiting a decision — the number to watch.',
    target: '[data-tutorial="overview-total"]',
    placement: 'bottom',
  },
  {
    id: 'summary',
    title: 'Case mix and exposure',
    body: 'See what’s ready to verify, what needs more context, and where the dollar value is concentrated.',
    target: '[data-tutorial="overview-summary"]',
    placement: 'top',
  },
  {
    id: 'footer',
    title: 'Add, clear, or save',
    body: 'Add more records any time, clear the ledger to start fresh, or save the current audit to your history.',
    target: '[data-tutorial="overview-footer"]',
    placement: 'top',
  },
  {
    id: 'account',
    title: 'Your account',
    body: 'Open audit history, settings, or your profile from here — and log out whenever you’re done.',
    target: '[data-tutorial="account-menu"]',
    placement: 'bottom',
  },
]

function sampleImportInput(): MergeImportInput {
  return { sourceLabel: 'Sample payment ledger', mode: 'sample', parsed: getSampleLedger() }
}

export function AuditApp() {
  const { route, navigate, goBack } = useAuditRoute()
  const { user, isGuest } = useAuth()
  const [environment, setEnvironment] = useState<LedgerEnvironment | null>(() => loadEnvironment())
  const [ingestLabel, setIngestLabel] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [guestGateOpen, setGuestGateOpen] = useState(false)
  const [sampleSession, setSampleSession] = useState(false)
  const [sampleAuditPhase, setSampleAuditPhase] = useState<SampleAuditPhase | null>(null)
  const reduceMotion = useReducedMotion()

  const environmentRef = useRef(environment)
  const sampleAuditRunRef = useRef(0)
  environmentRef.current = environment
  const caseOriginRef = useRef<{ mode: typeof route.mode; y: number }>({ mode: route.mode, y: 0 })
  const previousModeRef = useRef(route.mode)
  const modeDirection = Math.sign(MODE_POSITION[route.mode] - MODE_POSITION[previousModeRef.current])

  useEffect(() => {
    previousModeRef.current = route.mode
  }, [route.mode])

  useEffect(() => () => {
    // A pending sample launch must not pull someone back into the audit if
    // they used browser Back to leave the route mid-sequence.
    sampleAuditRunRef.current += 1
  }, [])

  const runImport = useCallback(
    async (input: MergeImportInput, options: { replaceEnvironment?: boolean; persist?: boolean } = {}) => {
      setEntryError(null)
      setImportDialogOpen(false)
      const count = input.parsed.records.length
      setIngestLabel(`Reading ${count} record${count === 1 ? '' : 's'}…`)
      // Yield one tick so the ingest label actually paints before the
      // (synchronous) merge/detection work runs — honest for large files,
      // imperceptible for small ones. No artificial minimum duration. A
      // macrotask yield (not requestAnimationFrame) since rAF doesn't fire
      // reliably in a backgrounded or non-compositing tab.
      await new Promise((resolve) => setTimeout(resolve, 0))
      try {
        const next = mergeImport(options.replaceEnvironment ? null : environmentRef.current, input)
        if (options.persist !== false) saveEnvironment(next)
        setEnvironment(next)
        setSampleSession(options.persist === false)
        navigate({ mode: 'overview', caseId: null, draft: false, entry: null }, { replace: true })
      } catch (err) {
        console.error('Reclaim: import failed', err)
        setEntryError('Something went wrong reading that file. Please try again.')
      } finally {
        setIngestLabel(null)
      }
    },
    [navigate]
  )

  const runSampleAudit = useCallback(async () => {
    const runId = sampleAuditRunRef.current + 1
    sampleAuditRunRef.current = runId
    const isCurrentRun = () => sampleAuditRunRef.current === runId
    const pause = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration))

    setSampleAuditPhase('reading')
    await pause(360)
    if (!isCurrentRun()) return

    setSampleAuditPhase('matching')
    await pause(480)
    if (!isCurrentRun()) return

    setSampleAuditPhase('ready')
    await pause(520)
    if (!isCurrentRun()) return

    try {
      await runImport(sampleImportInput(), { replaceEnvironment: true, persist: false })
    } finally {
      if (isCurrentRun()) setSampleAuditPhase(null)
    }
  }, [runImport])

  // One-time bootstrap: honor a first-time `?sample=1` CTA from the landing
  // page, and restore the last working context on a bare reload (no query
  // string at all) so returning to /audit picks up exactly where it left off.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!environmentRef.current) {
      if (params.get('sample') === '1') runImport(sampleImportInput())
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

  // Viewing Findings counts as having seen what's new since the last import.
  useEffect(() => {
    if (route.mode === 'findings' && environment && environment.newFindingIds.length > 0) {
      const next = acknowledgeNewFindings(environment)
      saveEnvironment(next)
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
    saveEnvironment(next)
    setEnvironment(next)
  }, [])

  const handleDraftChange = useCallback((findingId: string, text: string) => {
    const env = environmentRef.current
    if (!env) return
    const current = getCaseState(env, findingId)
    const next = setCaseState(env, findingId, updateRecoveryDraft(current, text))
    saveEnvironment(next)
    setEnvironment(next)
  }, [])

  const handleAdvanceStage = useCallback((findingId: string) => {
    const env = environmentRef.current
    if (!env) return
    const current = getCaseState(env, findingId)
    const next = setCaseState(env, findingId, advanceRecoveryStage(current))
    saveEnvironment(next)
    setEnvironment(next)
  }, [])

  const handleImport = useCallback(
    (input: ImportInput) => runImport({ sourceLabel: input.sourceLabel, mode: input.mode, parsed: input.parsed }),
    [runImport]
  )

  const handleClearLedger = useCallback(() => {
    if (!sampleSession) clearEnvironment()
    setEnvironment(null)
    setSampleSession(false)
    setClearDialogOpen(false)
    setEntryError(null)
    navigate({ mode: 'overview', caseId: null, draft: false, entry: sampleSession ? 'upload' : null }, { replace: true })
  }, [navigate, sampleSession])

  const handleCloseCase = useCallback(() => {
    goBack()
  }, [goBack])

  const handleRequestSaveToHistory = useCallback(() => {
    if (!user || isGuest) {
      setGuestGateOpen(true)
      return
    }
    setSaveDialogOpen(true)
  }, [user, isGuest])

  const handleConfirmSaveToHistory = useCallback(
    (name: string) => {
      const env = environmentRef.current
      if (!env || !user || isGuest) return
      saveToHistory(user.id, name, env)
      setSaveDialogOpen(false)
    },
    [user, isGuest]
  )

  if (sampleAuditPhase) {
    return (
      <AuditShell variant="minimal">
        <AuditProcessing phase={sampleAuditPhase} />
      </AuditShell>
    )
  }

  if (ingestLabel) {
    return (
      <AuditShell variant="minimal">
        <IngestStatus label={ingestLabel} />
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
        <AuditEntry error={entryError} onRunSample={() => runImport(sampleImportInput())} onImport={handleImport} />
      </AuditShell>
    )
  }

  const overview = overviewSummary(environment)
  const findingsCount = overview.readyToVerifyCount + overview.needsContextCount + overview.worthNotingCount
  const caseIndex = activeCase ? environment.result.findings.findIndex((finding) => finding.id === activeCase.finding.id) : -1
  const capsuleAction = activeCase
    ? activeCase.state.decision === null
      ? { label: 'Confirm', run: () => handleDecide(activeCase.finding.id, 'confirmed', null) }
      : activeCase.state.decision === 'confirmed' && !route.draft
        ? { label: 'Prepare', run: handleOpenDraft }
        : null
    : null

  return (
    <AuditShell
      variant="full"
      banner={isGuest ? <GuestBanner /> : null}
      topBarRight={
        <>
          <a className="audit-btn" data-motion="pressable" data-motion-arrow="true" data-variant="ghost" data-size="sm" href="/">
            <ArrowLeft aria-hidden="true" />
            Back to home
          </a>
          <AccountMenu onRestartTutorial={() => { resetTutorial(); window.location.reload() }} />
        </>
      }
    >
      <LayoutGroup id="audit-scene">
        {activeCase ? (
          <LivingCapsule
            kind="case"
            backLabel={route.mode === 'recovery' ? 'Recovery' : route.mode === 'findings' ? 'Findings' : 'Overview'}
            vendor={activeCase.finding.vendor}
            positionLabel={caseIndex >= 0 ? `${caseIndex + 1} of ${environment.result.findings.length}` : 'Case'}
            actionLabel={capsuleAction?.label}
            onBack={handleCloseCase}
            onAction={capsuleAction?.run}
          />
        ) : (
          <LivingCapsule
            kind="ledger"
            mode={route.mode}
            findingsCount={findingsCount}
            recoveryCount={overview.recoveryActiveCount}
            onModeChange={(mode) => navigate({ mode, caseId: null, draft: false })}
          />
        )}

        <div className="audit-scene" data-depth={activeCase ? (route.draft ? 'action' : 'case') : 'ledger'}>
          <motion.div
            className="audit-scene-frame"
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
                  activeCase={activeCase}
                  draftOpen={route.draft}
                  onOpenCase={handleOpenCase}
                  onCloseCase={handleCloseCase}
                  onOpenDraft={handleOpenDraft}
                  onDecide={handleDecide}
                  onAdvanceStage={handleAdvanceStage}
                  onDraftChange={handleDraftChange}
                  onOpenImport={() => setImportDialogOpen(true)}
                  onClearLedger={() => setClearDialogOpen(true)}
                  onSaveToHistory={handleRequestSaveToHistory}
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
                  onDecide={handleDecide}
                  onAdvanceStage={handleAdvanceStage}
                  onDraftChange={handleDraftChange}
                />
              )}
              {route.mode === 'findings' && !activeCase && <FindingsView queue={findingsQueue(environment)} onOpenCase={handleOpenCase} />}
              {route.mode === 'recovery' && !activeCase && <RecoveryView queue={recoveryQueue(environment)} onOpenCase={handleOpenCase} />}
          </motion.div>
        </div>
      </LayoutGroup>

      {route.mode === 'overview' && !activeCase && <TutorialTour tourId="dashboard" steps={DASHBOARD_TOUR_STEPS} />}

      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} />
      <ClearLedgerDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} onConfirm={handleClearLedger} />
      <SaveToHistoryDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleConfirmSaveToHistory}
        defaultName={`Audit — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
      />
      <GuestGateDialog open={guestGateOpen} onOpenChange={setGuestGateOpen} feature="Saving audit history" />
    </AuditShell>
  )
}
