import { useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertCircle, AlertTriangle, Download, FileText, HelpCircle, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import { parseCsv } from '@/lib/csv'
import type { ParseResult } from '@/types'
import { assessDataReadiness, assessFatalFile } from '@/audit/dataReadiness'
import '@/workspace/workspace.css'
import '@/workspace/reclaim.css'

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

/** Well above any real SMB AP export (50k rows is ~6 MB); guards the tab against reading something enormous. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

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
 * Dressed in the dashboard's primitives (reclaim.css, "launch and import"
 * section): it carries `wk` so it holds the tokens wherever it is mounted,
 * including inside a portalled `.wk-panel`, which is outside `.wk` in the DOM.
 */
export function ImportPanel({ allowSample, animateEntry = false, autoFocusUpload, error, onImport, onRunSample, intro, confirmLabel }: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [pending, setPending] = useState<PendingUpload | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setParseError(null)
    if (/\.(xlsx|xlsm|xls|numbers|ods)$/i.test(file.name)) {
      setParseError('Spreadsheet files can’t be read directly yet. In Excel or Sheets, use File → Save As / Download → CSV, then upload that file.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setParseError(`That file is ${formatFileSize(file.size)}. Reclaim reads files up to ${formatFileSize(MAX_UPLOAD_BYTES)} — split the export by date range and add each part to the same audit.`)
      return
    }
    try {
      const text = await file.text()
      // A ZIP header (every .xlsx) or NUL bytes mean this is not a text CSV, whatever it is named.
      if (text.startsWith('PK\u0003\u0004') || text.slice(0, 4096).includes('\u0000')) {
        setParseError('That file isn’t a CSV. Export the ledger as CSV (comma-separated values) and upload that.')
        return
      }
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
    const recordCount = pending.parsed.records.length
    const vendorCount = new Set(pending.parsed.records.map((r) => r.vendor)).size
    const skipped = pending.parsed.skippedCount
    return (
      <div className="wk wk-import" data-state="confirmed">
        <h2 className="wk-sr">Confirm before adding to the ledger</h2>
        <p className="wk-import-intro">Reclaim read this file. Review it, then add it to the ledger.</p>

        <div className="wk-import-file">
          <span className="wk-import-file-icon" aria-hidden="true">
            <FileText />
          </span>
          <div className="wk-import-file-copy">
            <strong title={pending.file.name}>{pending.file.name}</strong>
            <small>{formatFileSize(pending.file.size)}</small>
          </div>
          <span className="wk-chip" data-tone="accent">Read</span>
        </div>

        <dl className="wk-import-stats" aria-live="polite">
          <div>
            <dt className="wk-label">Valid records</dt>
            <dd>{recordCount}</dd>
          </div>
          <div>
            <dt className="wk-label">Vendors</dt>
            <dd>{vendorCount}</dd>
          </div>
          {readiness.dateRangeLabel ? (
            <div data-wide>
              <dt className="wk-label">Payments dated</dt>
              <dd>{readiness.dateRangeLabel}</dd>
            </div>
          ) : null}
        </dl>

        {skipped > 0 && (
          <div className="wk-callout" data-tone="warn">
            <AlertTriangle aria-hidden="true" />
            <p>
              {skipped} row{skipped === 1 ? '' : 's'} {skipped === 1 ? 'needs' : 'need'} attention and will be skipped
            </p>
          </div>
        )}

        {readiness.weakerChecks.length > 0 && (
          <div className="wk-import-weaker">
            <span className="wk-label">Some checks will be weaker for this file</span>
            <ul>
              {readiness.weakerChecks.map((check) => (
                <li key={check.label}>{check.label}</li>
              ))}
            </ul>
          </div>
        )}

        {error ? (
          <div className="wk-alert" role="alert" data-testid="import-flag">
            <p>{error}</p>
          </div>
        ) : null}

        <div className="wk-panel-foot">
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

  const shownError = error ?? parseError

  return (
    <div className="wk wk-import" data-reveal={animateEntry}>
      <h2 className="wk-sr">Add records</h2>
      <p className="wk-import-intro">{intro}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          // Moving between the zone's own children fires dragleave too; only a real exit clears it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false)
        }}
        onDrop={handleDrop}
        onClick={(e) => {
          // The whole zone opens the picker. The input's own click bubbles back here, so skip it.
          if (e.target === fileInputRef.current) return
          fileInputRef.current?.click()
        }}
        className="wk-drop"
        data-dragging={isDragging}
        data-invalid={shownError ? true : undefined}
      >
        <span className="wk-drop-icon" aria-hidden="true">
          <Upload />
        </span>
        <div className="wk-drop-copy">
          <strong>{isDragging ? 'Drop the file to read it' : 'Drop a CSV here, or choose a file'}</strong>
          <span>Accepts .csv exports from QuickBooks, Xero, or your own AP ledger</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          aria-label="Upload a CSV ledger"
        />
        {/* A click here bubbles to the zone, which opens the picker once. */}
        <button type="button" className="wk-btn" data-variant="primary" autoFocus={autoFocusUpload}>
          <Upload aria-hidden="true" />
          Upload CSV
        </button>
      </div>

      {shownError && (
        <div className="wk-callout" data-tone="danger" role="alert">
          <AlertCircle aria-hidden="true" />
          <div className="wk-callout-body">
            <p>{shownError}</p>
            <ul className="wk-callout-actions">
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
        </div>
      )}

      <div className="wk-import-links">
        <a className="wk-link" href="/sample-ledger.csv" download>
          <Download aria-hidden="true" />
          Download sample CSV
        </a>
        <button type="button" className="wk-link" onClick={() => setFormatOpen(true)}>
          <HelpCircle aria-hidden="true" />
          See required format
        </button>
      </div>

      {allowSample && onRunSample && (
        <div className="wk-import-sample">
          <div className="wk-import-or">
            <hr className="wk-rule" />
            <span className="wk-label">or</span>
            <hr className="wk-rule" />
          </div>
          <button type="button" className="wk-btn" data-variant="outline" onClick={onRunSample}>
            <Sparkles aria-hidden="true" />
            See how this works with sample data
          </button>
        </div>
      )}

      <p className="wk-import-privacy">
        <ShieldCheck aria-hidden="true" />
        The checks run in your browser. With an account, the audit is saved to that account; as a guest it stays in this tab.
      </p>

      <DialogPrimitive.Root open={formatOpen} onOpenChange={setFormatOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="wk wk-overlay" />
          <DialogPrimitive.Content className="wk wk-panel wk-flow-panel" data-size="wide">
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

            <div className="wk-table-wrap wk-format-table">
              <table className="wk-table">
                <thead>
                  <tr>
                    <th scope="col">Column</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {REQUIRED_COLUMNS.map((col) => (
                    <tr key={col.name}>
                      <td>
                        <code>{col.name}</code>
                      </td>
                      <td>{col.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}
