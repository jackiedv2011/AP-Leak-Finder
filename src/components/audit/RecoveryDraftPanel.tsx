import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, Printer, Send } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Finding } from '@/types'
import { generateLetter } from '@/lib/letters'
import { RECOVERY_STAGE_LABEL, type CaseState, type RecoveryMethod } from '@/ledger/caseState'
import type { EvidenceFieldKey } from '@/components/audit/EvidenceComparison'
import { formatCurrency, formatDate } from '@/lib/format'
import { MOTION_TRANSITION } from '@/motion/system'

interface RecoveryDraftPanelProps {
  finding: Finding
  state: CaseState
  onHighlightField: (field: EvidenceFieldKey | null) => void
  onPackageChange: (update: { subject?: string; body?: string; requestedResolution?: RecoveryMethod }) => void
  onMarkRequested: (recoveryPackage: { subject: string; body: string; requestedResolution: RecoveryMethod }) => void
  onRecordOutcome: (outcome: 'recovered' | 'not_recovered', amount: number | null, note: string | null) => void
}

const LINKED_CHIPS: { field: EvidenceFieldKey; label: string }[] = [
  { field: 'vendor', label: 'Vendor' },
  { field: 'invoice', label: 'Invoice' },
  { field: 'amount', label: 'Amount' },
  { field: 'date', label: 'Payment date' },
]

const METHOD_LABEL: Record<RecoveryMethod, string> = {
  refund: 'Refund',
  credit: 'Account credit',
  offset: 'Future-payment offset',
}

function caseReference(finding: Finding) {
  return finding.relatedRecords.find((record) => record.invoiceNumber)?.invoiceNumber ?? finding.id
}

export function RecoveryDraftPanel({ finding, state, onHighlightField, onPackageChange, onMarkRequested, onRecordOutcome }: RecoveryDraftPanelProps) {
  const letter = useMemo(() => generateLetter(finding), [finding])
  const isInternal = finding.class !== 'recoverable'
  const [subject, setSubject] = useState(state.recoverySubject ?? letter.subject)
  const [text, setText] = useState(state.recoveryDraft ?? letter.body)
  const [requestedResolution, setRequestedResolution] = useState<RecoveryMethod>(state.requestedResolution ?? 'refund')
  const [recoveredAmount, setRecoveredAmount] = useState(String(state.recoveredAmount ?? finding.dollarImpact))
  const [outcomeNote, setOutcomeNote] = useState(state.recoveryOutcomeNote ?? '')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const statusTimeoutRef = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setSubject(state.recoverySubject ?? letter.subject)
    setText(state.recoveryDraft ?? letter.body)
    setRequestedResolution(state.requestedResolution ?? 'refund')
    setRecoveredAmount(String(state.recoveredAmount ?? finding.dollarImpact))
    setOutcomeNote(state.recoveryOutcomeNote ?? '')
    setStatusMessage(null)
  }, [finding.dollarImpact, letter, state.recoveredAmount, state.recoveryDraft, state.recoveryOutcomeNote, state.recoverySubject, state.requestedResolution])

  useEffect(() => {
    const timeout = window.setTimeout(() => onPackageChange({ subject, body: text, requestedResolution }), 250)
    return () => window.clearTimeout(timeout)
  }, [subject, text, requestedResolution, onPackageChange])

  useEffect(() => () => {
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current)
  }, [])

  const packageText = useMemo(() => {
    const evidence = finding.relatedRecords.map((record) =>
      `${formatDate(record.paymentDate)} | ${record.vendor} | ${record.invoiceNumber ?? 'No invoice'} | ${formatCurrency(record.amountPaid)} | Source row ${record.rowIndex + 1}`
    ).join('\n')
    return [
      `Subject: ${subject}`,
      `Case: ${caseReference(finding)}`,
      `Vendor: ${finding.vendor}`,
      `Amount at issue: ${formatCurrency(finding.dollarImpact)}`,
      `Requested resolution: ${METHOD_LABEL[requestedResolution]}`,
      '',
      'Evidence index',
      evidence,
      '',
      'Request',
      text,
    ].join('\n')
  }, [finding, requestedResolution, subject, text])

  function flashStatus(message: string) {
    setStatusMessage(message)
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = window.setTimeout(() => setStatusMessage(null), 2400)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(packageText)
      flashStatus('Recovery package copied')
    } catch {
      textareaRef.current?.select()
      flashStatus('Clipboard is blocked. The request text is selected.')
    }
  }

  function handleDownload() {
    const blob = new Blob([packageText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reclaim-${caseReference(finding).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    flashStatus('Recovery package downloaded')
  }

  function handleRequested() {
    onMarkRequested({ subject, body: text, requestedResolution })
    flashStatus('Request marked as sent')
  }

  function handleRecovered() {
    const amount = Number(recoveredAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      flashStatus('Enter the money actually recovered')
      return
    }
    onRecordOutcome('recovered', amount, outcomeNote.trim() || null)
    flashStatus('Recovery recorded')
  }

  function handleNotRecovered() {
    onRecordOutcome('not_recovered', null, outcomeNote.trim() || null)
    flashStatus('Case closed without recovery')
  }

  return (
    <div className="audit-panel audit-recovery-package" data-stage={state.recoveryStage ?? 'potential'}>
      <div className="audit-package-heading">
        <div><span>Evidence-backed outreach</span><h2>{isInternal ? 'Internal review package' : 'Recovery package'}</h2></div>
        {state.recoveryStage && <strong>{RECOVERY_STAGE_LABEL[state.recoveryStage]}</strong>}
      </div>

      <div className="audit-package-summary">
        <div><span>Case</span><strong>{caseReference(finding)}</strong></div>
        <div><span>Vendor</span><strong>{finding.vendor}</strong></div>
        <div><span>Amount at issue</span><strong>{formatCurrency(finding.dollarImpact)}</strong></div>
        <div><span>Source records</span><strong>{finding.relatedRecords.length}</strong></div>
      </div>

      <div className="audit-draft-linked-row">
        {LINKED_CHIPS.map((chip) => <button type="button" className="audit-linked-chip" data-motion="pressable" key={chip.field} onMouseEnter={() => onHighlightField(chip.field)} onMouseLeave={() => onHighlightField(null)} onFocus={() => onHighlightField(chip.field)} onBlur={() => onHighlightField(null)}>{chip.label}</button>)}
      </div>

      <label className="audit-package-field">Subject<input type="text" name="recovery-subject" autoComplete="off" value={subject} onChange={(event) => setSubject(event.target.value)} onBlur={() => onPackageChange({ subject, body: text, requestedResolution })} /></label>
      <label className="audit-package-field">Requested resolution<select name="requested-resolution" value={requestedResolution} onChange={(event) => setRequestedResolution(event.target.value as RecoveryMethod)} onBlur={() => onPackageChange({ subject, body: text, requestedResolution })}><option value="refund">Refund</option><option value="credit">Account credit</option><option value="offset">Future-payment offset</option></select></label>
      <label htmlFor="audit-draft-textarea" className="audit-package-field">{isInternal ? 'Internal review note' : 'Recovery request'}
        <textarea id="audit-draft-textarea" ref={textareaRef} className="audit-draft-textarea" name="recovery-draft" autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} onBlur={() => onPackageChange({ subject, body: text, requestedResolution })} spellCheck />
      </label>

      <details className="audit-package-evidence"><summary>Evidence index included with this package</summary>{finding.relatedRecords.map((record) => <div key={record.id}><span>Row {record.rowIndex + 1}</span><time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><strong>{record.invoiceNumber ?? 'No invoice'}</strong><b>{formatCurrency(record.amountPaid)}</b></div>)}</details>

      <div className="audit-draft-status" role="status" aria-live="polite"><AnimatePresence initial={false}>{statusMessage && <motion.span key={statusMessage} initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 4px, 0)' }} animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }} exit={{ opacity: 0 }} transition={reduceMotion ? { duration: 0.08 } : MOTION_TRANSITION.state}><Check className="h-3.5 w-3.5" aria-hidden="true" />{statusMessage}</motion.span>}</AnimatePresence></div>

      <div className="audit-case-actions audit-package-actions">
        <button type="button" className="audit-btn" data-motion="pressable" onClick={handleCopy}><Copy className="h-4 w-4" aria-hidden="true" />Copy package</button>
        <button type="button" className="audit-btn" data-motion="pressable" onClick={handleDownload}><Download className="h-4 w-4" aria-hidden="true" />Download</button>
        <button type="button" className="audit-btn" data-motion="pressable" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />Print</button>
      </div>

      <aside className="audit-fee-boundary"><strong>Fee tracking is not connected yet.</strong><p>This local workspace records the case and money outcome. Production recovery work must require an accepted fee agreement before outreach and use a minimal server-side engagement record without uploading the ledger.</p></aside>

      {state.recoveryStage === 'confirmed' && <div className="audit-recovery-stage"><div><strong>Ready to request</strong><p>The exact records and requested resolution are included above.</p></div><button type="button" className="audit-btn" data-motion="pressable" data-motion-state="confirmed" data-variant="primary" onClick={handleRequested}><Send className="h-4 w-4" aria-hidden="true" />Mark request sent</button></div>}

      {(state.recoveryStage === 'requested' || state.recoveryStage === 'recovered' || state.recoveryStage === 'not_recovered') && <div className="audit-outcome-panel">
        <div className="audit-outcome-heading"><span>Money outcome</span><strong>{state.recoveryStage === 'requested' ? 'What happened after the request?' : `Recorded as ${RECOVERY_STAGE_LABEL[state.recoveryStage].toLowerCase()}`}</strong></div>
        <label className="audit-package-field">Amount actually recovered<input type="number" min="0" step="0.01" inputMode="decimal" name="recovered-amount" autoComplete="off" value={recoveredAmount} onChange={(event) => setRecoveredAmount(event.target.value)} /></label>
        <label className="audit-package-field">Outcome note<textarea name="recovery-outcome-note" autoComplete="off" value={outcomeNote} placeholder="Example: refund reference RF-102…" onChange={(event) => setOutcomeNote(event.target.value)} /></label>
        <div className="audit-case-actions"><button type="button" className="audit-btn" data-motion="pressable" data-variant="primary" onClick={handleRecovered}>Record money recovered</button><button type="button" className="audit-btn" data-motion="pressable" onClick={handleNotRecovered}>Close as not recovered</button></div>
      </div>}
    </div>
  )
}
