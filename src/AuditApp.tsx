import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isClaim } from '@/lib/claims'
import { checkRepeatUpload, rememberUpload } from '@/ledger/uploadRegistry'
import { repeatMessage } from '../server/uploads.ts'
import { useTheme } from '@/workspace/theme'
import { ArrowLeft, CheckCircle2, Plus } from 'lucide-react'
import { ImportDialog, type ImportIntent } from '@/components/audit/ImportDialog'
import { ClearLedgerDialog } from '@/components/audit/ClearLedgerDialog'
import { LegacyImportDialog } from '@/components/audit/LegacyImportDialog'
import { deferLegacyProjects, discardLegacyProjects, importLegacyProjects, legacyProjectsPresent, type LegacySummary } from '@/ledger/legacyMigration'
import { WorkspaceShell } from '@/workspace/WorkspaceShell'
import { Launch } from '@/workspace/views/Launch'
import { Onboarding, type OnboardingNext } from '@/onboarding/Onboarding'
import { emptyProfile, type OnboardingProfile } from '../server/onboarding.ts'
import { Dashboard } from '@/workspace/views/Dashboard'
import { Audits } from '@/workspace/views/Audits'
import { Findings } from '@/workspace/views/Findings'
import { Recoveries } from '@/workspace/views/Recoveries'
import { Reports } from '@/workspace/views/Reports'
import { Plans } from '@/workspace/views/Plans'
import { SettingsView } from '@/workspace/views/Settings'
import { CaseDetail } from '@/workspace/views/CaseDetail'
import { useAuditRoute, loadPersistedContext, type RouteMode } from '@/audit/useAuditRoute'
import {
  loadEnvironment,
  mergeImport,
  inspectImport,
  setCaseState,
  getCaseState,
  recordEvidence,
  acknowledgeNewFindings,
  type LedgerEnvironment,
  type MergeImportInput,
} from '@/ledger/store'
import {
  createProject,
  deleteProject,
  getActiveProjectId,
  hasMemoryOnlyProjects,
  listProjects,
  loadProject,
  migrateLegacyLedger,
  saveProject,
  toStorable,
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
import { approveRecovery, beginNewRequestReview, closeWithoutRecovery, recordHistoricalSettlement, recordVendorUpdate, reconcileRecovery, recordEmailSent, recordFollowUpSent, reopenRemainingBalance, setFollowUpAfterDays, setContactHold, setNextFollowUp, startRecoveryRequest, verifyRecovery } from '@/recovery/model'
import { activeReturned, verifiedReturned } from '@/recovery/financials'
import type { GmailSendReceipt } from '@/lib/gmailApi'
import { assertRecoveryEligible, evaluateEligibility, type RecoveryEvidence } from '@/recovery/eligibility'
import { useEntitlements, useOptionalAuth } from '@/lib/auth/AuthContext'
import { Locked } from '@/components/plan/Locked'
import { UpgradeDialog } from '@/components/plan/UpgradeDialog'
import { visibleFindingIds } from '@/workspace/planGates'
import { projectSync } from '@/ledger/projectSync'
import type { SenderProfile } from '@/lib/senderProfile'
import type { RequestPackage } from '@/workspace/views/RecoveryPanels'
import { overviewSummary, findCaseView } from '@/ledger/views'
import { getRecoverySampleEvidence, getRecoverySampleLedger, getSampleLedger } from '@/data/sampleLedger'
import type { ImportInput, QuickBooksImportContext } from '@/components/audit/ImportPanel'
import { describeQuickBooksSync, lastQuickBooksPull, mergeQuickBooksSync, planQuickBooksSync } from '@/ledger/quickbooksSync'
import { QuickBooksSyncStatus } from '@/components/audit/QuickBooksSource'
import { useQuickBooksAutoSync } from '@/components/audit/useQuickBooksAutoSync'
import { linkQuickBooksAudit } from '@/lib/quickbooksApi'

const TITLES: Record<RouteMode, string> = {
  dashboard: 'Overview',
  audits: 'Audits',
  findings: 'Findings',
  recoveries: 'Recoveries',
  reports: 'Reports',
  plans: 'Plans',
  settings: 'Settings',
}

function sampleImportInput(): MergeImportInput {
  return { sourceLabel: 'Sample payment ledger', mode: 'sample', parsed: getSampleLedger() }
}

export function AuditApp() {
  const { route, navigate, goBack } = useAuditRoute()
  const auth = useOptionalAuth()
  const entitlements = useEntitlements()
  // Lives here, not in Settings, so a `system` choice follows the OS on every screen.
  const { choice: themeChoice, resolved: resolvedTheme, choose: chooseTheme } = useTheme()
  const [limitDialog, setLimitDialog] = useState(false)
  const [onboardingRequested, setOnboardingRequested] = useState(false)
  const account = auth?.user && !auth.user.isGuest ? auth.user : null
  // Someone who arrived with a deliberate entry (`?entry=upload`, `?entry=sample`, `?sample=1`)
  // came to do that first. Kept for the whole visit, since running it clears the entry from the route.
  const [arrivedForAudit] = useState(() => route.entry !== null || ['1', 'recovery'].includes(new URLSearchParams(window.location.search).get('sample') ?? ''))
  // First run: the account (or guest tab) has not been through onboarding. For an arrival
  // like the above, onboarding waits for their next visit rather than standing in the way.
  const onboardingOpen =
    onboardingRequested || (auth !== null && auth.status === 'ready' && auth.user !== null && !auth.user.onboardingSeenAt && !arrivedForAudit)
  const actor = account ? account.name || account.email : null
  const sender = useMemo<SenderProfile>(
    () => ({ businessName: account?.onboardingProfile?.businessName || account?.company || '', senderName: account?.name ?? '', senderEmail: account?.email ?? '' }),
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
  /** What the last QuickBooks import did ("12 new payments, 1 changed, 30 already in this audit"). */
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [sampleSession, setSampleSession] = useState(false)
  const [legacy, setLegacy] = useState<LegacySummary | null>(() => legacyProjectsPresent())
  const [syncState, setSyncState] = useState(() => ({ pending: projectSync.pending, issue: projectSync.syncIssue }))

  const environmentRef = useRef(environment)
  const projectRef = useRef(project)
  const runActiveRef = useRef(false)
  /** Set once the QuickBooks auto-sync hook exists (it is declared after runImport). */
  const quickBooksRecheck = useRef<(() => void) | null>(null)
  environmentRef.current = environment
  projectRef.current = project
  const caseOriginRef = useRef<{ mode: RouteMode; y: number }>({ mode: route.mode, y: 0 })

  const refreshProjects = useCallback(() => setProjects(listProjects()), [])

  useEffect(() => {
    const refreshSyncState = () => setSyncState({ pending: projectSync.pending, issue: projectSync.syncIssue })
    const stop = projectSync.onPending(refreshSyncState)
    const synced = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail.id
      if (id !== projectRef.current?.id) return
      const saved = loadProject(id)
      if (!saved) return
      projectRef.current = saved
      environmentRef.current = saved.environment
      setProject(saved)
      setEnvironment(saved.environment)
      refreshProjects()
      refreshSyncState()
    }
    window.addEventListener('reclaim:project-synced', synced)
    return () => { stop(); window.removeEventListener('reclaim:project-synced', synced) }
  }, [refreshProjects])

  const downloadLocalCopy = () => {
    const current = projectRef.current
    if (!current) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(toStorable(current), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${current.id}-unsynced.json`
    link.click()
    URL.revokeObjectURL(url)
  }

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
    async (input: MergeImportInput, options: { replaceEnvironment?: boolean; persist?: boolean; targetProjectId?: string } = {}) => {
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
        // A QuickBooks company already in another audit is synced into that audit, not started again.
        if (options.targetProjectId && options.targetProjectId !== projectRef.current?.id) {
          const target = loadProject(options.targetProjectId)
          if (target) {
            projectRef.current = target
            environmentRef.current = target.environment
          }
        }
        const base = options.replaceEnvironment ? null : environmentRef.current
        let next: LedgerEnvironment
        if (input.quickbooks) {
          // QuickBooks names every payment, so a repeat import is a sync: no duplicate-file refusal.
          const synced = mergeQuickBooksSync(base, { ...input, quickbooks: input.quickbooks })
          next = synced.env
          setImportNotice(`QuickBooks import: ${describeQuickBooksSync(synced.summary)}.`)
          if (base && next === base) {
            const current = projectRef.current
            if (current) {
              setProject(current)
              navigate({ projectId: current.id, mode: 'dashboard', caseId: null, draft: false, entry: null }, { replace: true })
            }
            setEnvironment(base)
            return
          }
        } else {
          const inspection = inspectImport(base, input)
          if (inspection.duplicateFile) {
            setEntryError('This exact file is already in this audit. No records were added.')
            setImportDialogOpen(true)
            return
          }
          next = mergeImport(base, input)
          setImportNotice(null)
        }
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
          if (input.mode === 'upload') rememberUpload(input.parsed.records, saved.id)
          // This audit is now the one signing in keeps current with that QuickBooks company.
          if (input.quickbooks && account) void linkQuickBooksAudit(saved.id).then(() => quickBooksRecheck.current?.())
          refreshProjects()
          // A new audit counts against the plan once the server has it.
          if (!current || options.replaceEnvironment) void projectSync.flush().then(() => auth?.refreshEntitlements())
          navigate({ projectId: saved.id, mode: 'dashboard', caseId: null, draft: false, entry: null }, { replace: true })
        } else {
          projectRef.current = null
          setProject(null)
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
    [navigate, refreshProjects, auth, account]
  )

  const runSampleAudit = useCallback(() => {
    void runImport(sampleImportInput(), { replaceEnvironment: true, persist: false })
  }, [runImport])

  const completeOnboarding = useCallback(
    async (profile: OnboardingProfile, next: OnboardingNext) => {
      await auth?.saveOnboarding(profile)
      setOnboardingRequested(false)
      if (next === 'upload') openImport('new')
      else if (next === 'sample') runSampleAudit()
    },
    [auth, openImport, runSampleAudit]
  )

  // One-time bootstrap: honor a first-time `?sample=1` CTA from the landing
  // page, and restore the last working context on a bare reload (no query
  // string at all) so returning to /audit picks up exactly where it left off.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('sample') === 'recovery') {
      void runImport({ sourceLabel: 'Sample recovery exercise', mode: 'sample', parsed: getRecoverySampleLedger() }, { replaceEnvironment: true, persist: false })
      return
    }
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
    (findingId: string, update: (current: ReturnType<typeof getCaseState>) => ReturnType<typeof getCaseState>, command?: { type: string; input: unknown }) => {
      const env = environmentRef.current
      if (!env) return
      const current = getCaseState(env, findingId)
      const internal = env.result.findings.find((finding) => finding.id === findingId)?.class !== 'recoverable'
      const next = setCaseState(env, findingId, withHistory(current, update(current), actor, internal))
      const currentProject = projectRef.current
      if (currentProject) {
        const saved = saveProject({ ...currentProject, environment: next }, { sync: !account || !command })
        projectRef.current = saved
        setProject(saved)
        refreshProjects()
        if (account && command) projectSync.command(saved.id, findingId, command.type, command.input)
      }
      setEnvironment(next)
    },
    [refreshProjects, actor, account]
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
      persistCaseState(findingId, (current) => {
        const decided = current.decision === value
          ? updateCaseReason(current, reason)
          : value === 'confirmed'
            ? confirmCase(reason)
            : value === 'needs_info'
              ? markNeedsInfo(reason)
              : markExpected(reason, dismissalTag)
        return (current.activeRequestGeneration ?? 1) > 1
          ? { ...decided, activeRequestGeneration: current.activeRequestGeneration, archivedRequests: current.archivedRequests, recoverySettlements: current.recoverySettlements, recoveredAmount: verifiedReturned(current), legacyRecoveredAmount: current.legacyRecoveredAmount, requiresRevalidation: current.requiresRevalidation, history: current.history }
          : decided
      },
        { type: 'decision', input: { decision: value, reason } }
      )
    },
    [persistCaseState]
  )

  // Vendor-facing steps on a recovery candidate re-check the evidence gate here,
  // so a stale screen can never approve or send an ineligible request.
  const recoveryBlocked = useCallback((findingId: string, requestedAmount: number) => {
    const findings = environmentRef.current?.result.findings ?? []
    const finding = findings.find((row) => row.id === findingId)
    if (!finding || finding.class !== 'recoverable') return false
    try {
      assertRecoveryEligible(finding, findings, requestedAmount)
      const current = environmentRef.current ? getCaseState(environmentRef.current, findingId) : null
      if (current) {
        const previousReturn = verifiedReturned(current) - activeReturned(current)
        const potentialMinor = evaluateEligibility(finding, finding.evidence, findings).potentialAmountMinor ?? 0
        if (Math.round(requestedAmount * 100) > potentialMinor - Math.round(previousReturn * 100)) return true
      }
      return false
    } catch {
      return true
    }
  }, [])

  const handleBeginNewRequestReview = useCallback((findingId: string) => {
    persistCaseState(findingId, (current) => beginNewRequestReview(current), { type: 'begin_new_request_review', input: { acknowledged: true } })
  }, [persistCaseState])

  const handleHistoricalSettlement = useCallback((findingId: string, generation: number, proof: RecoveryVerification) => {
    persistCaseState(findingId, (current) => {
      const finding = environmentRef.current?.result.findings.find((row) => row.id === findingId)
      const findings = environmentRef.current?.result.findings ?? []
      const potentialMinor = finding ? evaluateEligibility(finding, finding.evidence, findings).potentialAmountMinor : null
      return recordHistoricalSettlement(current, generation, proof, potentialMinor == null ? 0 : potentialMinor / 100)
    }, { type: 'historical_settlement', input: { ...proof, generation } })
  }, [persistCaseState])

  const handleSaveEvidence = useCallback((findingId: string, evidence: RecoveryEvidence) => {
    const env = environmentRef.current
    if (!env) return
    const next = recordEvidence(env, findingId, evidence)
    const currentProject = projectRef.current
    if (currentProject) {
      const saved = saveProject({ ...currentProject, environment: next }, { sync: !account })
      projectRef.current = saved
      setProject(saved)
      refreshProjects()
      if (account) projectSync.command(saved.id, findingId, 'evidence', evidence)
    }
    setEnvironment(next)
  }, [refreshProjects, account])

  const handleMarkRequested = useCallback(
    (findingId: string, pkg: RequestPackage) => {
      if (recoveryBlocked(findingId, pkg.requestedAmount)) return
      persistCaseState(findingId, (current) => {
        const finding = environmentRef.current?.result.findings.find((row) => row.id === findingId)
        if (finding?.class !== 'recoverable') return markRecoveryRequested(updateRecoveryPackage(current, { subject: pkg.subject, body: pkg.body, requestedResolution: pkg.method }), finding ? Math.min(pkg.requestedAmount, finding.dollarImpact) : pkg.requestedAmount)
        if (current.recoverySubject !== pkg.subject || current.recoveryDraft !== pkg.body || current.requestedAmount !== pkg.requestedAmount || current.requestedResolution !== pkg.method || (current.recoveryRecipientEmail ?? '') !== pkg.recipientEmail || (current.recoveryEvidenceAttachment ?? null) !== (pkg.evidenceAttachment ?? null) || !pkg.recipientConfirmed) return current
        const requested = startRecoveryRequest(current, pkg.requestedAmount, Date.now(), finding?.dollarImpact)
        return sampleSession ? { ...requested, recoverySimulated: true } : requested
      }, { type: 'request', input: pkg })
    },
    [persistCaseState, recoveryBlocked, sampleSession]
  )

  const handleApproveRecovery = useCallback((findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => {
    if (recoveryBlocked(findingId, pkg.requestedAmount)) return
    persistCaseState(findingId, (current) => approveRecovery(updateRecoveryPackage(current, { ...pkg, requestedResolution: pkg.method }), { knownBeforeReclaim, knownBeforeNote }), { type: 'approve', input: { package: pkg, knownBeforeReclaim, knownBeforeNote } })
  }, [persistCaseState, recoveryBlocked])

  // For a team where the approver is also the sender: one step, one save, and
  // the history still shows the approval before the request.
  const handleApproveAndSend = useCallback((findingId: string, pkg: RequestPackage, knownBeforeReclaim: boolean, knownBeforeNote: string | null) => {
    if (recoveryBlocked(findingId, pkg.requestedAmount)) return
    persistCaseState(findingId, (current) => {
      const approved = approveRecovery(updateRecoveryPackage(current, { ...pkg, requestedResolution: pkg.method }), { knownBeforeReclaim, knownBeforeNote })
      return startRecoveryRequest(approved, pkg.requestedAmount)
    }, { type: 'approve_and_request', input: { package: pkg, knownBeforeReclaim, knownBeforeNote } })
  }, [persistCaseState, recoveryBlocked])

  // Gmail accepted the message: the request went out, so it is recorded even
  // if the case changed in the meantime. Nothing else marks a Gmail send.
  const handleEmailSent = useCallback((findingId: string, pkg: RequestPackage, receipt: GmailSendReceipt) => {
    persistCaseState(findingId, (current) => current.recoveryStage === 'confirmed'
      ? recordEmailSent(current, { channel: 'gmail', messageId: receipt.messageId, from: receipt.from, to: receipt.to, cc: receipt.cc, sentAt: receipt.sentAt }, pkg.requestedAmount)
      : current, { type: 'email_sent', input: { messageId: receipt.messageId } })
  }, [persistCaseState])

  const handleFollowUpSent = useCallback((findingId: string, receipt: GmailSendReceipt) => {
    persistCaseState(findingId, (current) => current.recoveryStage === 'requested'
      ? recordFollowUpSent(current, { channel: 'gmail', messageId: receipt.messageId, from: receipt.from, to: receipt.to, cc: receipt.cc, sentAt: receipt.sentAt })
      : current, { type: 'followup_sent', input: { messageId: receipt.messageId } })
  }, [persistCaseState])

  const handleFollowUpDays = useCallback((findingId: string, days: number) => {
    persistCaseState(findingId, (current) => setFollowUpAfterDays(current, days), { type: 'followup_days', input: { days } })
  }, [persistCaseState])

  const handleContactHold = useCallback((findingId: string, reason: string | null) => {
    persistCaseState(findingId, (current) => setContactHold(current, reason), { type: 'contact_hold', input: { reason } })
  }, [persistCaseState])

  const handleVendorUpdate = useCallback((findingId: string, update: VendorUpdate) => {
    persistCaseState(findingId, (current) => recordVendorUpdate(current, update), { type: 'vendor_update', input: update })
  }, [persistCaseState])

  const handleFollowUp = useCallback((findingId: string, at: number | null) => {
    persistCaseState(findingId, (current) => setNextFollowUp(current, at), { type: 'followup', input: { at } })
  }, [persistCaseState])

  const handleVerifyRecovery = useCallback((findingId: string, proof: RecoveryVerification) => {
    persistCaseState(findingId, (current) => verifyRecovery(current, proof), { type: 'settlement', input: proof })
  }, [persistCaseState])

  const handleCloseRecovery = useCallback((findingId: string, reason: string) => {
    persistCaseState(findingId, (current) => closeWithoutRecovery(current, reason), { type: 'close', input: { reason } })
  }, [persistCaseState])

  const handleReconcileRecovery = useCallback((findingId: string, note: string, rootCause: string) => {
    persistCaseState(findingId, (current) => reconcileRecovery(current, { note, rootCause }), { type: 'reconcile', input: { note, rootCause } })
  }, [persistCaseState])

  const handleRecordOutcome = useCallback(
    (findingId: string, outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null, method: RecoveryMethod | null) => {
      const finding = environmentRef.current?.result.findings.find((f) => f.id === findingId)
      // Money can only come back on a claim; anything else closes without an amount.
      const claim = finding ? isClaim(finding) : false
      persistCaseState(findingId, (current) =>
        claim ? recordRecoveryOutcome(current, outcome, amount, note, method) : recordRecoveryOutcome(current, 'not_recovered', null, note, null)
      , { type: 'close', input: { reason: note ?? 'Internal review closed' } })
    },
    [persistCaseState]
  )

  const handleReopen = useCallback(
    (findingId: string) => {
      persistCaseState(findingId, (current) =>
        current.recoveryStage === 'recovered' || current.recoveryStage === 'not_recovered'
          ? reopenOutcome(current)
          : reopenDecision(current)
      , { type: 'reopen', input: {} })
    },
    [persistCaseState]
  )

  const handleReopenBalance = useCallback((findingId: string) => {
    persistCaseState(findingId, (current) => reopenRemainingBalance(current), { type: 'reopen_balance', input: {} })
  }, [persistCaseState])

  /**
   * Where a QuickBooks import of this company goes: the open audit when adding
   * records to it, otherwise the audit that already holds this company, if any.
   */
  const quickBooksTarget = useCallback(
    (companyName: string): { id: string; name: string; environment: LedgerEnvironment } | null => {
      const open = projectRef.current
      const adding = importIntent === 'add' && route.entry !== 'upload'
      if (adding && open) return { id: open.id, name: open.name, environment: open.environment }
      const holds = (env: LedgerEnvironment | null | undefined) => Boolean(env?.imports.some((b) => b.quickbooks?.companyName === companyName))
      if (open && holds(open.environment)) return { id: open.id, name: open.name, environment: open.environment }
      for (const summary of listProjects()) {
        const candidate = loadProject(summary.id)
        if (candidate && holds(candidate.environment)) return { id: candidate.id, name: candidate.name, environment: candidate.environment }
      }
      return null
    },
    [importIntent, route.entry]
  )

  // Signed-in accounts only: guests and the sample never reach QuickBooks.
  const quickBooksAutoSync = useQuickBooksAutoSync(Boolean(account) && !sampleSession, (synced) => {
    refreshProjects()
    if (synced.id !== projectRef.current?.id || runActiveRef.current) return
    projectRef.current = synced
    environmentRef.current = synced.environment
    setProject(synced)
    setEnvironment(synced.environment)
  })

  quickBooksRecheck.current = quickBooksAutoSync.recheck

  const quickBooksContext = useMemo<QuickBooksImportContext>(
    () => ({
      sinceFor: (companyName) => lastQuickBooksPull(quickBooksTarget(companyName)?.environment ?? null, companyName),
      preview: (parsed, facts) => {
        const target = quickBooksTarget(facts.companyName)
        return { summary: planQuickBooksSync(target?.environment ?? null, parsed, facts).summary, targetName: target?.name ?? null, targetId: target?.id ?? null }
      },
    }),
    [quickBooksTarget]
  )

  const handleImport = useCallback(
    (input: ImportInput) => {
      const target = input.quickbooks ? quickBooksTarget(input.quickbooks.companyName) : null
      const replaceEnvironment = !target && (sampleSession || importIntent === 'new' || route.entry === 'upload')
      // Free: each ledger is audited once. A repeat — the same file, a renamed
      // copy, or a trimmed piece of it — is flagged here, before anything runs.
      // Re-importing a QuickBooks company into its own audit is a sync, never a repeat.
      if (entitlements.limits.blocksRepeatUploads) {
        const check = checkRepeatUpload(input.parsed.records, target?.id ?? (replaceEnvironment ? null : projectRef.current?.id ?? null))
        if (check.repeat) {
          setEntryError(repeatMessage(check))
          return
        }
      }
      setEntryError(null)
      return runImport({ sourceLabel: input.sourceLabel, mode: input.mode, parsed: input.parsed, ...(input.quickbooks ? { quickbooks: input.quickbooks } : {}) }, { replaceEnvironment, ...(target ? { targetProjectId: target.id } : {}) })
    },
    [importIntent, route.entry, runImport, entitlements.limits.blocksRepeatUploads, quickBooksTarget, sampleSession]
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

  // Onboarding takes the whole screen; when it ends, whatever comes next (the first audit
  // it asked for, the Overview, or the Settings page it was reopened from) renders in its place.
  if (auth?.user && onboardingOpen && legacy === null) {
    return (
      <Onboarding
        initial={auth.user.onboardingProfile ?? { ...emptyProfile(), businessName: account?.company ?? '' }}
        revisit={onboardingRequested}
        onComplete={completeOnboarding}
      />
    )
  }

  // Plans is reachable before a first audit too: it's where someone decides how to use Reclaim.
  if (!running && route.entry === null && !environment && route.mode === 'plans') {
    return (
      <>
        <WorkspaceShell
          mode="plans"
          onModeChange={(mode) => navigate({ mode, caseId: null, draft: false })}
          auditCount={projects.length}
          findingCount={0}
          recoveryCount={0}
          title={TITLES.plans}
          workspaceLabel={project?.name ?? 'No audit yet'}
          workspaceId={project?.id ?? null}
          availableWorkspaces={projects.map((item) => ({ id: item.id, name: item.name }))}
          onOpenWorkspace={handleOpenProject}
          actions={
            <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => openImport('new')}>
              <Plus aria-hidden="true" />
              Start an audit
            </button>
          }
        >
          <Plans onStartAudit={() => openImport('new')} />
        </WorkspaceShell>
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} intent="new" quickbooks={quickBooksContext} />
      </>
    )
  }

  if (running || route.entry !== null || !environment) {
    return (
      <>
        {legacyDialog}
        <WorkspaceShell
          mode={route.mode}
          onModeChange={(mode) => navigate({ mode, caseId: null, draft: false, entry: null })}
          auditCount={projects.length}
          findingCount={0}
          recoveryCount={0}
          title={TITLES[route.mode]}
          workspaceLabel={project?.name ?? 'No audit yet'}
          workspaceId={project?.id ?? null}
          availableWorkspaces={projects.map((item) => ({ id: item.id, name: item.name }))}
          onOpenWorkspace={handleOpenProject}
          tourReady={false}
        >
          {route.mode === 'settings' && !running && route.entry === null ? (
            <SettingsView
              onEditOnboarding={() => setOnboardingRequested(true)}
              env={null}
              onClear={() => {}}
              theme={themeChoice}
              resolvedTheme={resolvedTheme}
              onThemeChange={chooseTheme}
            />
          ) : (
            <Launch onRunSample={runSampleAudit} onUseOwn={() => openImport('new')} running={running} note={entryError ?? undefined} showHeading={route.mode === 'dashboard'} />
          )}
        </WorkspaceShell>
        <UpgradeDialog
          open={limitDialog}
          onOpenChange={setLimitDialog}
          reason={`You've used ${entitlements.usage.auditsThisMonth} of ${entitlements.limits.auditsPerMonth ?? '∞'} audits this month on the Free plan.`}
        />
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} error={entryError} intent="new" quickbooks={quickBooksContext} />
      </>
    )
  }

  // Findings reads its filters from the query string when it mounts, so they
  // are written right after navigating there.
  const openFindings = (params: Record<string, string>) => {
    navigate({ mode: 'findings', caseId: null, draft: false })
    const target = new URL(window.location.href)
    for (const key of ['kind', 'q', 'decision', 'sort']) target.searchParams.delete(key)
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
    window.history.replaceState(window.history.state, '', target.pathname + target.search)
  }
  const overview = overviewSummary(environment)
  const activeFinding = activeCase?.finding ?? null
  const activeDiscoveredAt = activeFinding ? environment.imports.find((batch) => batch.findingIds?.includes(activeFinding.id))?.importedAt ?? null : null
  const visible = visibleFindingIds(environment, entitlements)
  const activeLocked = activeFinding !== null && !visible.has(activeFinding.id)
  const auditCount = projects.length + (sampleSession ? 1 : 0)
  const auditLabel = sampleSession ? 'the sample ledger' : project?.name ?? 'this audit'

  return (
    <>
      <WorkspaceShell
        mode={activeFinding ? 'findings' : route.mode}
        onModeChange={(mode) => navigate({ mode, caseId: null, draft: false })}
        auditCount={auditCount}
        // The badges are workloads: findings still waiting on a decision, and
        // recoveries still moving (ready to send or out with a vendor).
        findingCount={environment.result.findings.filter((f) => getCaseState(environment, f.id).decision === null).length}
        recoveryCount={overview.recoveryActiveCount}
        workspaceLabel={sampleSession ? 'Sample payment ledger' : project?.name ?? 'Current audit'}
        workspaceId={sampleSession ? null : project?.id ?? null}
        availableWorkspaces={projects.map((item) => ({ id: item.id, name: item.name }))}
        onOpenWorkspace={handleOpenProject}
        searchableFindings={environment.result.findings.filter((finding) => visible.has(finding.id)).map((finding) => ({ id: finding.id, title: finding.title, vendor: finding.vendor }))}
        onOpenFinding={handleOpenCase}
        title={TITLES[route.mode]}
        finding={activeFinding ? (activeLocked ? 'Locked finding' : activeFinding.vendor) : null}
        actions={
          activeFinding ? (
            <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={goBack}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          ) : (
            <button type="button" className="wk-btn" data-variant="dark" data-size="sm" onClick={() => openImport('new')} aria-label="Start an audit">
              <Plus aria-hidden="true" />
              <span>Start an audit</span>
            </button>
          )
        }
      >
        {route.mode === 'dashboard' && !activeFinding ? <QuickBooksSyncStatus state={quickBooksAutoSync.state} onSyncNow={quickBooksAutoSync.syncNow} /> : null}
        {account && (syncState.issue || syncState.pending > 0) ? (
          <div className="wk-alert" role="status" data-testid="sync-notice" style={{ marginBottom: 20 }}>
            <p>{syncState.issue?.message ?? 'Saving this project to your account…'}</p>
            {syncState.issue?.status === null ? <button type="button" className="wk-linklike" onClick={() => projectSync.retry()}>Retry save</button> : null}
            {syncState.issue ? <button type="button" className="wk-linklike" onClick={downloadLocalCopy}>Download local copy</button> : null}
          </div>
        ) : null}
        {importNotice ? (
          <div className="wk-callout" data-tone="done" role="status" data-testid="import-notice" style={{ marginBottom: 20 }}>
            <CheckCircle2 aria-hidden="true" />
            <div className="wk-callout-body">
              <p>
                {importNotice}{' '}
                <button type="button" className="wk-linklike" onClick={() => setImportNotice(null)}>
                  Dismiss
                </button>
              </p>
            </div>
          </div>
        ) : null}
        {hasMemoryOnlyProjects() ? (
          <div className="wk-alert" role="status" data-testid="storage-notice" style={{ marginBottom: 20 }}>
            <p>
              {account
                ? syncState.pending ? 'This audit is too large for browser storage and is still saving to your account. Keep this tab open until the save finishes.' : 'This audit is too large to keep in this browser’s storage. It is saved to your account and will load from there next time.'
                : 'This audit is too large to keep in this browser’s storage. It works in this tab, but it will be gone when the tab closes — create an account to keep it.'}
            </p>
          </div>
        ) : null}
        {activeFinding && activeCase && activeLocked ? (
          <Locked
            title="This finding is part of Growth and Flat"
            note={`The Free plan shows the ${entitlements.limits.findingsVisible} lowest-value findings in full. Growth and Flat show every finding, with its evidence.`}
          >
            {/* A placeholder, not the real case: nothing about a locked finding is put in the page. */}
            <section className="wk-section" aria-hidden="true">
              <div className="wk-card" style={{ minHeight: 220 }}>
                <span className="wk-label">Locked finding</span>
                <p className="wk-dim" style={{ marginTop: 8 }}>Vendor, amount, evidence and recovery steps are part of Growth and Flat.</p>
              </div>
            </section>
          </Locked>
        ) : activeFinding && activeCase ? (
            <CaseDetail
              finding={activeFinding}
              findings={environment.result.findings}
              projectId={sampleSession ? undefined : project?.id}
              sample={sampleSession}
              owner={actor}
              sampleEvidence={sampleSession ? getRecoverySampleEvidence(activeCase.finding) : undefined}
              onSaveEvidence={handleSaveEvidence}
              state={activeCase.state}
              records={environment.records}
              imports={environment.imports}
              discoveredAt={activeDiscoveredAt}
              sender={sender}
              onDecide={handleDecide}
              onMarkRequested={handleMarkRequested}
              onRecordOutcome={handleRecordOutcome}
              onReopen={handleReopen}
              onReopenBalance={handleReopenBalance}
              onBeginNewRequestReview={handleBeginNewRequestReview}
              onHistoricalSettlement={handleHistoricalSettlement}
              onApproveRecovery={handleApproveRecovery}
              onApproveAndSend={handleApproveAndSend}
              onEmailSent={handleEmailSent}
              onFollowUpSent={handleFollowUpSent}
              onFollowUpDays={handleFollowUpDays}
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
            auditLabel={auditLabel}
            onOpenCase={handleOpenCase}
            onSeeAllFindings={() => openFindings({})}
            onSeeFindingsKind={(kind) => openFindings({ kind })}
            onSearchFindings={(q) => openFindings({ q })}
            onNavigate={(mode) => navigate({ mode, caseId: null, draft: false })}
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
          <Recoveries env={environment} onOpenCase={handleOpenCase} onOpenFindings={() => openFindings({})} />
        ) : route.mode === 'reports' ? (
          <Reports env={environment} />
        ) : route.mode === 'plans' ? (
          <Plans onStartAudit={() => openImport('new')} />
        ) : (
          <SettingsView
            onEditOnboarding={() => setOnboardingRequested(true)}
            env={environment}
            onClear={() => setClearDialogOpen(true)}
            theme={themeChoice}
            resolvedTheme={resolvedTheme}
            onThemeChange={chooseTheme}
          />
        )}
      </WorkspaceShell>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        error={entryError}
        intent={importIntent}
        quickbooks={quickBooksContext}
      />
      <ClearLedgerDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} onConfirm={handleClearLedger} />
      <UpgradeDialog
        open={limitDialog}
        onOpenChange={setLimitDialog}
        reason={`You've used ${entitlements.usage.auditsThisMonth} of ${entitlements.limits.auditsPerMonth ?? '∞'} audits this month on the Free plan.`}
      />
      {legacyDialog}
    </>
  )
}
