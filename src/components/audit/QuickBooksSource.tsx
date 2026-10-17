import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import type { QuickBooksFacts } from '../../../server/quickbooksFacts.ts'
import { QUICKBOOKS_CONNECT_URL, connectOutcome, disconnectQuickBooks, fetchQuickBooksStatus, importFromQuickBooks, type QuickBooksStatus } from '@/lib/quickbooksApi'

const READ_ONLY_NOTE = 'Read-only: Reclaim reads bills, bill payments, vendors and credits. It never changes anything in QuickBooks.'
const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * The server's view of the connection, or null while loading. A guest (or a
 * sample session) gets null for good: connecting belongs to a saved account.
 */
function useQuickBooksStatus() {
  const auth = useOptionalAuth()
  const guest = auth?.user ? auth.user.isGuest : auth !== null
  const [status, setStatus] = useState<QuickBooksStatus | null>(null)
  const refresh = () => fetchQuickBooksStatus().then(setStatus)
  useEffect(() => {
    if (guest) return
    let live = true
    fetchQuickBooksStatus().then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [guest])
  return { status: guest ? null : status, refresh }
}

/** Read once, on first render: the import dialog opens before the router tidies the URL. */
function initialOutcome() {
  if (typeof window === 'undefined') return null
  return connectOutcome(new URLSearchParams(window.location.search).get('quickbooks'))
}

/**
 * The QuickBooks row in the import panel: connect, or pull the connected
 * company's ledger as a CSV that goes through the same review as an upload.
 * Renders nothing for guests or when the server has no QuickBooks keys.
 */
export function QuickBooksImport({ onFile }: { onFile: (file: File, facts: QuickBooksFacts | null) => void }) {
  const { status, refresh } = useQuickBooksStatus()
  const [outcome] = useState(initialOutcome)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!status?.available) return null

  async function runImport() {
    setBusy(true)
    setError(null)
    const result = await importFromQuickBooks()
    setBusy(false)
    if (result.ok) {
      onFile(result.file, result.facts)
      void refresh()
    } else {
      setError(result.message)
      if (result.reconnect) void refresh()
    }
  }

  return (
    <div className="wk-card" data-testid="quickbooks-source" style={{ display: 'grid', gap: 10 }}>
      {outcome && !error ? (
        <div className="wk-callout" data-tone={outcome.tone} role="status">
          {outcome.tone === 'done' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          <div className="wk-callout-body">
            <p>{outcome.text}</p>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 500 }}>
            {status.connected ? `QuickBooks Online · ${status.companyName || 'connected company'}` : 'Or connect QuickBooks Online'}{' '}
            <span className="wk-chip" data-tone="quiet">Sandbox</span>
          </p>
          <p className="wk-table-sub" style={{ marginTop: 4 }}>
            {status.connected && status.lastSyncAt ? `Last imported ${dateTime.format(status.lastSyncAt)}. ` : ''}
            {READ_ONLY_NOTE}
          </p>
        </div>
        {status.connected ? (
          <button type="button" className="wk-btn" data-variant="outline" onClick={() => void runImport()} disabled={busy}>
            {busy ? 'Importing from QuickBooks…' : 'Import from QuickBooks'}
          </button>
        ) : (
          <a className="wk-btn" data-variant="outline" href={QUICKBOOKS_CONNECT_URL}>
            Connect QuickBooks
          </a>
        )}
      </div>
      {error ? (
        <div className="wk-callout" data-tone="danger" role="alert">
          <AlertCircle aria-hidden="true" />
          <div className="wk-callout-body">
            <p>{error}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Settings → Connected accounts: who is connected, and a way to end it. */
export function QuickBooksSettings() {
  const { status, refresh } = useQuickBooksStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!status?.available) return null

  async function disconnect() {
    setBusy(true)
    setError(null)
    const ok = await disconnectQuickBooks()
    setBusy(false)
    if (!ok) setError('Couldn’t disconnect QuickBooks. Try again.')
    void refresh()
  }

  return (
    <section className="wk-section" data-testid="connected-accounts">
      <h2 className="wk-display wk-h2">Connected accounts</h2>
      <div className="wk-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ fontSize: 15, fontWeight: 500 }}>
              QuickBooks Online <span className="wk-chip" data-tone="quiet">Sandbox</span>
            </p>
            <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>
              {status.connected
                ? `Connected to ${status.companyName || 'a QuickBooks company'}${status.connectedAt ? ` since ${dateTime.format(status.connectedAt)}` : ''}.`
                : 'Not connected.'}
            </p>
            <p className="wk-table-sub" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <ShieldCheck aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} />
              {READ_ONLY_NOTE} Access is stored encrypted, and disconnecting cancels it with Intuit and deletes it here.
            </p>
          </div>
          {status.connected ? (
            <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => void disconnect()} disabled={busy}>
              {busy ? 'Disconnecting…' : 'Disconnect QuickBooks'}
            </button>
          ) : (
            <a className="wk-btn" data-variant="outline" data-size="sm" href={QUICKBOOKS_CONNECT_URL}>
              Connect QuickBooks
            </a>
          )}
        </div>
        {error ? (
          <p className="wk-table-sub" role="alert" style={{ marginTop: 10, color: 'var(--danger)' }}>
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
