import { useRef, useState } from 'react'
import { Upload, Sparkles, Download, HelpCircle, ShieldCheck, FileText, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { parseCsv } from '@/lib/csv'
import type { ParseResult } from '@/types'
import { assessDataReadiness, assessFatalFile } from '@/audit/dataReadiness'

export interface ImportInput {
  file: File
  parsed: ParseResult
  sourceLabel: string
  mode: 'upload'
}

interface ImportPanelProps {
  /** Sample data is only offered where there's no ledger yet — see AuditEntry. */
  allowSample: boolean
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
  { name: 'invoice_date', description: 'Date on the invoice (YYYY-MM-DD)' },
  { name: 'payment_date', description: 'Date the business paid (YYYY-MM-DD, required)' },
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
 */
export function ImportPanel({ allowSample, autoFocusUpload, error, onImport, onRunSample, intro, confirmLabel }: ImportPanelProps) {
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
                )} — Reclaim needs those to run an audit.`
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
    return (
      <div className="audit-entry-card" data-motion-state="confirmed">
        <div className="audit-entry-body">
          <div className="audit-entry-intro">
            <h2 className="sr-only">Confirm before adding to the ledger</h2>
            <p style={{ margin: 0 }}>Reclaim read this file. Review it, then add it to the ledger.</p>
          </div>

          <div className="audit-confirm-file">
            <div className="audit-confirm-file-meta">
              <strong title={pending.file.name}>{pending.file.name}</strong>
              <span>{formatFileSize(pending.file.size)}</span>
            </div>
            <FileText className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
          </div>

          <div className="audit-stage-detail" style={{ width: '100%' }} aria-live="polite">
            <span>{pending.parsed.records.length} valid record{pending.parsed.records.length === 1 ? '' : 's'} parsed</span>
            <span>
              {new Set(pending.parsed.records.map((r) => r.vendor)).size} vendor
              {new Set(pending.parsed.records.map((r) => r.vendor)).size === 1 ? '' : 's'} identified
            </span>
            {readiness.dateRangeLabel && <span>{readiness.dateRangeLabel}</span>}
            {pending.parsed.skippedCount > 0 && (
              <span>
                {pending.parsed.skippedCount} row{pending.parsed.skippedCount === 1 ? '' : 's'}{' '}
                {pending.parsed.skippedCount === 1 ? 'needs' : 'need'} attention and will be skipped
              </span>
            )}
          </div>

          {readiness.weakerChecks.length > 0 && (
            <div className="audit-readiness-note" style={{ width: '100%' }}>
              <span className="audit-readiness-note-label">Some checks will be weaker for this file</span>
              <ul>
                {readiness.weakerChecks.map((check) => (
                  <li key={check.label}>{check.label}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="audit-confirm-actions">
            <button type="button" className="audit-btn" data-motion="pressable" data-motion-ray="true" onClick={() => setPending(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
              Choose a different file
            </button>
            <button
              type="button"
              className="audit-btn"
              data-motion="pressable"
              data-motion-ray="true"
              data-variant="primary"
              onClick={() =>
                onImport({ file: pending.file, parsed: pending.parsed, sourceLabel: pending.file.name, mode: 'upload' })
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="audit-entry-card">
      <div className="audit-entry-body">
        <div className="audit-entry-intro">
          <h2 className="sr-only">Add records</h2>
          <p>{intro}</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="audit-dropzone"
          data-dragging={isDragging}
        >
          <span className="audit-dropzone-icon" aria-hidden="true">
            <Upload className="h-5 w-5" />
          </span>
          <div className="audit-dropzone-copy">
            <strong>Drop a CSV here, or choose a file</strong>
            <span>Accepts .csv exports from QuickBooks, Xero, or your own AP ledger</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleInputChange}
            aria-label="Upload a CSV ledger"
          />
          <button
            type="button"
            className="audit-btn"
            data-motion="pressable"
            data-motion-ray="true"
            data-variant="primary"
            data-tutorial="entry-upload"
            autoFocus={autoFocusUpload}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload CSV
          </button>
        </div>

        {allowSample && onRunSample && (
          <>
            <div className="audit-divider">or</div>
            <button type="button" className="audit-link" data-motion="pressable" data-tutorial="entry-sample" style={{ width: '100%', justifyContent: 'center' }} onClick={onRunSample}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              See how this works with sample data
            </button>
          </>
        )}

        {(error || parseError) && (
          <div className="audit-error-banner" role="alert">
            <p>{error ?? parseError}</p>
            <ul>
              <li>
                <button type="button" className="audit-link" data-motion="pressable" onClick={() => setFormatOpen(true)}>
                  View required format
                </button>
              </li>
              <li>
                <a className="audit-link" data-motion="pressable" href="/sample-ledger.csv" download>
                  Download sample CSV
                </a>
              </li>
            </ul>
          </div>
        )}

        <div className="audit-entry-links">
          <a className="audit-link" data-motion="pressable" href="/sample-ledger.csv" download>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download sample CSV
          </a>
          <button type="button" className="audit-link" data-motion="pressable" onClick={() => setFormatOpen(true)}>
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            See required format
          </button>
        </div>

        <p className="audit-privacy-note">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          This prototype runs entirely in your browser. Your ledger stays on your device.
        </p>
      </div>

      <Dialog open={formatOpen} onOpenChange={setFormatOpen}>
        <DialogContent className="audit-dialog-content">
          <DialogHeader>
            <DialogTitle style={{ color: '#eef1ec' }}>Required CSV format</DialogTitle>
            <DialogDescription style={{ color: '#9aa39d' }}>
              Column headers are matched case-insensitively. Currency values may include $ and commas.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'rgb(238 241 236 / 0.18)' }}>
                <TableHead style={{ color: '#9aa39d' }}>Column</TableHead>
                <TableHead style={{ color: '#9aa39d' }}>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REQUIRED_COLUMNS.map((col) => (
                <TableRow key={col.name} style={{ borderColor: 'rgb(238 241 236 / 0.1)' }}>
                  <TableCell className="font-mono text-xs" style={{ color: '#eef1ec' }}>
                    {col.name}
                  </TableCell>
                  <TableCell className="text-sm" style={{ color: '#9aa39d' }}>
                    {col.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  )
}
