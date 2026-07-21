import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Check, ArrowRight } from 'lucide-react'
import type { Finding } from '@/types'
import { generateLetter } from '@/lib/letters'
import { RECOVERY_STAGE_LABEL, type CaseState, type RecoveryStage } from '@/ledger/caseState'
import type { EvidenceFieldKey } from '@/components/audit/EvidenceComparison'

interface RecoveryDraftPanelProps {
  finding: Finding
  state: CaseState
  onHighlightField: (field: EvidenceFieldKey | null) => void
  onAdvanceStage: () => void
  onDraftChange: (text: string) => void
}

const LINKED_CHIPS: { field: EvidenceFieldKey; label: string }[] = [
  { field: 'vendor', label: 'Vendor' },
  { field: 'invoice', label: 'Invoice' },
  { field: 'amount', label: 'Amount' },
  { field: 'date', label: 'Payment date' },
]

const ADVANCE_LABEL: Partial<Record<RecoveryStage, string>> = {
  ready_to_prepare: 'Mark ready to contact',
  ready_to_contact: 'Mark vendor contacted',
  awaiting_response: 'Mark resolved',
}

export function RecoveryDraftPanel({ finding, state, onHighlightField, onAdvanceStage, onDraftChange }: RecoveryDraftPanelProps) {
  const letter = useMemo(() => generateLetter(finding), [finding])
  const isInternal = finding.class !== 'recoverable'
  const [text, setText] = useState(state.recoveryDraft ?? letter.body)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const statusTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setText(state.recoveryDraft ?? letter.body)
    setStatusMessage(null)
  }, [letter, state.recoveryDraft])

  useEffect(() => {
    const timeout = window.setTimeout(() => onDraftChange(text), 250)
    return () => window.clearTimeout(timeout)
  }, [text, onDraftChange])

  useEffect(
    () => () => {
      if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current)
    },
    []
  )

  function flashStatus(message: string) {
    setStatusMessage(message)
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = window.setTimeout(() => setStatusMessage(null), 2400)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      flashStatus('Copied')
    } catch {
      textareaRef.current?.select()
      flashStatus('Clipboard is blocked here — the text is selected, press Cmd/Ctrl+C to copy')
    }
  }

  function handleDownload() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${finding.type}-${finding.vendor.replace(/\s+/g, '-').toLowerCase()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    flashStatus('Downloaded')
  }

  const advanceLabel = state.recoveryStage ? ADVANCE_LABEL[state.recoveryStage] : undefined

  return (
    <div className="audit-panel">
      <h2>{isInternal ? 'Internal review note' : 'Recovery draft'}</h2>
      <p className="audit-panel-hint">{letter.subject}</p>

      <div className="audit-draft-linked-row">
        {LINKED_CHIPS.map((chip) => (
          <button
            type="button"
            className="audit-linked-chip"
            key={chip.field}
            onMouseEnter={() => onHighlightField(chip.field)}
            onMouseLeave={() => onHighlightField(null)}
            onFocus={() => onHighlightField(chip.field)}
            onBlur={() => onHighlightField(null)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <label htmlFor="audit-draft-textarea" className="sr-only">
        {isInternal ? 'Internal review note text' : 'Recovery draft text'}
      </label>
      <textarea
        id="audit-draft-textarea"
        ref={textareaRef}
        className="audit-draft-textarea"
        name="recovery-draft"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />

      <div className="audit-draft-status" role="status" aria-live="polite">
        {statusMessage && (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {statusMessage}
          </>
        )}
      </div>

      <div className="audit-case-actions">
        <button type="button" className="audit-btn" onClick={handleCopy}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy
        </button>
        <button type="button" className="audit-btn" onClick={handleDownload}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download
        </button>
      </div>

      {state.recoveryStage ? (
        <div className="audit-recovery-stage">
          <p className="audit-panel-hint">Currently: {RECOVERY_STAGE_LABEL[state.recoveryStage]}</p>
          {advanceLabel && (
            <button type="button" className="audit-btn" data-variant="primary" onClick={onAdvanceStage}>
              {advanceLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <p className="audit-panel-hint">Confirm this finding to move it into the recovery track.</p>
      )}
    </div>
  )
}
