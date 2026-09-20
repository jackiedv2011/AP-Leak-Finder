import { useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Upload, Sparkles, Download, HelpCircle, ShieldCheck, FileText, X } from 'lucide-react'
import { parseCsv } from '@/lib/csv'
import type { ParseResult } from '@/types'
import { assessDataReadiness, assessFatalFile } from '@/audit/dataReadiness'
import '@/workspace/workspace.css'

export interface ImportInput {
  file: File
  parsed: ParseResult
  sourceLabel: string
  mode: 'upload'
}

interface ImportPanelProps {
  /** Sample data is only offered where there's no ledger yet — see AuditEntry. */
  allowSample: boolean
  animateEntry?: boolean
  autoFocusUpload?: boolean
  error: string | null
  onImport: (input: ImportInput) => void
  onRunSample?: () => void
  intro: string
  confirmLabel: string
}

const REQUIRED_COLUMNS: { name: string; description: string }[] = [
  { name: 'vendor', description: 'Vendor / supplier name' },
  { name: 'invoice_number', description: 'Invoice ID as printed' },
  { name: 'invoice_date', description: 'Date on the invoice (YYYY-MM-DD or MM/DD/YYYY)' },
  { name: 'payment_date', description: 'Date the business paid (YYYY-MM-DD or MM/DD/YYYY, required)' },
  { name: 'invoice_amount', description: 'Amount the invoice was for' },
  { name: 'amount_paid', description: 'Amount actually paid (required)' },
  { name: 'terms', description: 'e.g. 2/10 net 30, net 30, net 15, or blank' },
  { name: 'bank_account_last4', description: 'Last 4 digits of the vendor bank account paid to (may be blank)' },
  { name: 'category', description: 'GL category, optional' },
]

interface PendingUpload {
  file: File
  parsed: ParseResult
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The one piece of UI that turns a CSV into ledger-ready records — reused as
 * the full-page first-time entry (AuditEntry) and as a lightweight "Add
 * records" dialog for a returning user. Never gates a returning user; it
 * only ever produces an ImportInput for the caller to merge into the ledger.
 *
 * Dressed in the workspace's own primitives (see workspace.css): it carries
 * `wk` so it holds the tokens wherever it is mounted, including inside a
 * portalled `.wk-panel`, which is outside `.wk` in the DOM.
 */
export function ImportPanel({ allowSample, animateEntry = false, autoFocusUpload, error, onImport, onRunSample, intro, confirmLabel }: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [pending, setPending] = useState<PendingUpload | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setParseError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.records.length === 0) {
        const guidance = assessFatalFile(parsed)
        if (guidance.missingRequiredColumns.length > 0) {
          setParseError(
            guidance.detectedColumns.length > 0
              ? `We recognized ${guidance.detectedColumns.join(', ')}, but couldn't find ${guidance.missingRequiredColumns.join(
                  ', '
                )}. Reclaim needs those to run an audit.`
              : `We couldn't recognize any expected columns in this file's header row. Reclaim needs ${guidance.missingRequiredColumns.join(
                  ', '
                )} at minimum.`
          )
        } else {
          setParseError(
            "We recognized the required columns, but none of the rows had valid values in all of them. Check the required format below."
          )
        }
        return
      }
      setPending({ file, parsed })
    } catch {
      setParseError('Could not read that file. Please upload a valid CSV.')
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (pending) {
    const readiness = assessDataReadiness(pending.parsed)
    const vendorCount = new Set(pending.parsed.records.map((r) => r.vendor)).size
    return (
      <div className="wk wk-import" data-state="confirmed">
        <h2 className="wk-sr">Confirm before adding to the ledger</h2>
        <p className="wk-dim" style={{ fontSize: 13.5 }}>Reclaim read this file. Review it, then add it to the ledger.</p>

        <div
          className="wk-card-flat"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 16 }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              className="wk-num"
              style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={pending.file.name}
            >
              {pending.file.name}
            </div>
            <div className="wk-table-sub">{formatFileSize(pending.file.size)}</div>
          </div>
          <FileText aria-hidden="true" style={{ width: 18, height: 18, flex: 'none', color: 'var(--text-muted)' }} />
        </div>

        <ul className="wk-notes" aria-live="polite">
          <li>{pending.parsed.records.length} valid record{pending.parsed.records.length === 1 ? '' : 's'} parsed</li>
          <li>
            {vendorCount} vendor{vendorCount === 1 ? '' : 's'} identified
          </li>
          {readiness.dateRangeLabel && <li>{readiness.dateRangeLabel}</li>}
          {pending.parsed.skippedCount > 0 && (
            <li>
              {pending.parsed.skippedCount} row{pending.parsed.skippedCount === 1 ? '' : 's'}{' '}
              {pending.parsed.skippedCount === 1 ? 'needs' : 'need'} attention and will be skipped
            </li>
          )}
        </ul>

        {readiness.weakerChecks.length > 0 && (
          <div>
            <span className="wk-label">Some checks will be weaker for this file</span>
            <ul className="wk-notes" style={{ marginTop: 8 }}>
              {readiness.weakerChecks.map((check) => (
                <li key={check.label}>{check.label}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="wk-btn" data-variant="outline" onClick={() => setPending(null)}>
            <X aria-hidden="true" />
            Choose a different file
          </button>
          <button
            type="button"
            className="wk-btn"
            data-variant="primary"
            onClick={() =>
              onImport({ file: pending.file, parsed: pending.parsed, sourceLabel: pending.file.name, mode: 'upload' })
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wk wk-import" data-reveal={animateEntry}>
      <h2 className="wk-sr">Add records</h2>
      <p className="wk-dim" style={{ fontSize: 13.5 }}>{intro}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className="wk-drop"
        data-dragging={isDragging}
      >
        <Upload aria-hidden="true" />
        <div>
          <strong>Drop a CSV here, or choose a file</strong>
          <span>Accepts .csv exports from QuickBooks, Xero, or your own AP ledger</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          aria-label="Upload a CSV ledger"
        />
        <button
          type="button"
          className="wk-btn"
          data-variant="primary"
          autoFocus={autoFocusUpload}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload aria-hidden="true" />
          Upload CSV
        </button>
      </div>

      {allowSample && onRunSample && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <hr className="wk-rule" style={{ flex: 1 }} />
            <span className="wk-label">or</span>
            <hr className="wk-rule" style={{ flex: 1 }} />
          </div>
          <button
            type="button"
            className="wk-btn"
            data-variant="ghost"
            data-size="sm"
            style={{ width: '100%', marginTop: 14 }}
            onClick={onRunSample}
          >
            <Sparkles aria-hidden="true" />
            See how this works with sample data
          </button>
        </div>
      )}

      {(error || parseError) && (
        <div className="wk-alert" role="alert">
          <p>{error ?? parseError}</p>
          <ul className="wk-alert-actions">
            <li>
              <button type="button" className="wk-link" onClick={() => setFormatOpen(true)}>
                View required format
              </button>
            </li>
            <li>
              <a className="wk-link" href="/sample-ledger.csv" download>
                Download sample CSV
              </a>
            </li>
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        <a className="wk-link" href="/sample-ledger.csv" download>
          <Download aria-hidden="true" />
          Download sample CSV
        </a>
        <button type="button" className="wk-link" onClick={() => setFormatOpen(true)}>
          <HelpCircle aria-hidden="true" />
          See required format
        </button>
      </div>

      <p className="wk-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <ShieldCheck aria-hidden="true" style={{ width: 14, height: 14, flex: 'none' }} />
        The checks run in your browser. With an account, the audit is saved to that account; as a guest it stays in this tab.
      </p>

      <DialogPrimitive.Root open={formatOpen} onOpenChange={setFormatOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="wk wk-overlay" />
          <DialogPrimitive.Content className="wk wk-panel">
            <header className="wk-panel-head">
              <div>
                <DialogPrimitive.Title className="wk-display wk-h2">Required CSV format</DialogPrimitive.Title>
                <DialogPrimitive.Description className="wk-dim">
                  Column headers are matched case-insensitively. Currency values may include $ and commas.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>

            <table className="wk-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {REQUIRED_COLUMNS.map((col) => (
                  <tr key={col.name} style={{ cursor: 'default' }}>
                    <td className="wk-num" style={{ fontSize: 12.5 }}>
                      {col.name}
                    </td>
                    <td className="wk-dim" style={{ fontSize: 13 }}>
                      {col.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}
