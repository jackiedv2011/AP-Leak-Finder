import { useEffect, useState } from 'react'
import { FilePlus, Pencil, Trash2, ArrowRight, Check, X as XIcon } from 'lucide-react'
import { AuditShell } from '@/components/audit/AuditShell'
import { AccountMenu } from '@/components/app/AccountMenu'
import { useAuth } from '@/lib/auth/AuthContext'
import { formatCurrency } from '@/lib/format'
import {
  listHistory,
  renameHistoryEntry,
  deleteHistoryEntry,
  loadHistoryEnvironment,
  type AuditHistoryEntry,
} from '@/history/store'
import { saveEnvironment } from '@/ledger/store'
import '@/pages/auth.css'

const STATUS_LABEL: Record<AuditHistoryEntry['status'], string> = {
  new: 'Not started',
  in_review: 'In review',
  complete: 'Complete',
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function HistoryCard({ entry, onDeleted, onRenamed }: { entry: AuditHistoryEntry; onDeleted: (id: string) => void; onRenamed: (id: string, name: string) => void }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(entry.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleOpen() {
    const env = loadHistoryEnvironment(entry.id)
    if (!env) return
    saveEnvironment(env)
    window.location.href = '/audit'
  }

  function handleRenameSubmit() {
    const trimmed = name.trim()
    if (trimmed) {
      renameHistoryEntry(entry.id, trimmed)
      onRenamed(entry.id, trimmed)
    }
    setRenaming(false)
  }

  return (
    <article className="history-card">
      <div className="history-card-top">
        {renaming ? (
          <div className="history-card-rename">
            <input
              className="auth-input"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleRenameSubmit()
                if (event.key === 'Escape') { setName(entry.name); setRenaming(false) }
              }}
            />
            <button type="button" className="audit-btn" data-motion="pressable" data-size="sm" onClick={handleRenameSubmit} aria-label="Save name"><Check size={15} aria-hidden="true" /></button>
            <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" data-size="sm" onClick={() => { setName(entry.name); setRenaming(false) }} aria-label="Cancel rename"><XIcon size={15} aria-hidden="true" /></button>
          </div>
        ) : (
          <h3>{entry.name}</h3>
        )}
        <span className="audit-status-chip" data-class={entry.status === 'complete' ? 'recoverable' : entry.status === 'in_review' ? 'review' : 'opportunity'}>
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      <p className="history-card-meta">{formatDateTime(entry.updatedAt)} · {entry.recordCount} records · {entry.findingsCount} findings</p>

      <div className="history-card-value">
        <span>Recoverable</span>
        <strong>{formatCurrency(entry.recoverableTotal)}</strong>
      </div>

      {confirmingDelete ? (
        <div className="history-card-confirm">
          <span>Delete this audit?</span>
          <button type="button" className="audit-btn" data-motion="pressable" data-size="sm" onClick={() => onDeleted(entry.id)}>Delete</button>
          <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" data-size="sm" onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </div>
      ) : (
        <div className="history-card-actions">
          <button type="button" className="audit-btn" data-motion="pressable" data-motion-arrow="true" data-variant="primary" data-size="sm" onClick={handleOpen}>
            Open <ArrowRight aria-hidden="true" size={15} />
          </button>
          <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" data-size="sm" onClick={() => setRenaming(true)} aria-label="Rename audit">
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" data-size="sm" onClick={() => setConfirmingDelete(true)} aria-label="Delete audit">
            <Trash2 aria-hidden="true" size={15} />
          </button>
        </div>
      )}
    </article>
  )
}

export function HistoryPage() {
  const { user, isGuest } = useAuth()
  const [entries, setEntries] = useState<AuditHistoryEntry[]>([])

  useEffect(() => {
    if (user && !isGuest) setEntries(listHistory(user.id))
  }, [user, isGuest])

  function handleDeleted(id: string) {
    deleteHistoryEntry(id)
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  function handleRenamed(id: string, name: string) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, name } : entry)))
  }

  if (!user || isGuest) {
    return (
      <AuditShell variant="full" topBarRight={<AccountMenu />}>
        <div className="audit-workspace history-page">
          <div className="audit-empty-state">
            <h2>Audit history needs an account</h2>
            <p>Guest audits stay only for this browser session. Create a free account to save every audit you run and come back to it later.</p>
            <a className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" href="/signup" style={{ marginTop: '1.25rem', width: 'max-content' }}>
              Create account
            </a>
          </div>
        </div>
      </AuditShell>
    )
  }

  return (
    <AuditShell variant="full" topBarRight={<AccountMenu />}>
      <div className="audit-workspace history-page">
        <header className="audit-overview-heading" style={{ marginBottom: '2rem' }}>
          <span>Audit history</span>
          <h1 className="audit-overview-title">Every audit you&apos;ve saved.</h1>
          <p>Open a past audit to keep working, or start a new one.</p>
        </header>

        {entries.length === 0 ? (
          <div className="audit-empty-state">
            <h2>No saved audits yet</h2>
            <p>Run an audit and save it from the Overview screen to see it here.</p>
            <a className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" href="/audit?entry=upload" style={{ marginTop: '1.25rem', width: 'max-content' }}>
              <FilePlus aria-hidden="true" size={16} />
              Start your first audit
            </a>
          </div>
        ) : (
          <div className="history-grid">
            {entries.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} onDeleted={handleDeleted} onRenamed={handleRenamed} />
            ))}
          </div>
        )}
      </div>
    </AuditShell>
  )
}
