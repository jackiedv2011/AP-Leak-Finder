import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertCircle, CheckCircle2, Mail, Send, ShieldCheck, X } from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { formatCurrency } from '@/lib/format'
import { projectSync } from '@/ledger/projectSync'
import { disconnectGmail, fetchGmailStatus, gmailConnectOutcome, gmailConnectUrl, parseCc, sendWithGmail, type GmailSendReceipt, type GmailStatus } from '@/lib/gmailApi'

const SEND_ONLY_NOTE = 'Send-only: Reclaim can send the emails you approve from this address. It can’t read, search or delete anything in your inbox.'
const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const EMAIL = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/

/** The server's view of the Gmail connection; null while loading, and for good for a guest. */
function useGmailStatus() {
  const auth = useOptionalAuth()
  const guest = auth?.user ? auth.user.isGuest : auth !== null
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const refresh = () => fetchGmailStatus().then(setStatus)
  useEffect(() => {
    if (guest) return
    let live = true
    fetchGmailStatus().then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [guest])
  return { status: guest ? null : status, refresh }
}

/** Read once, on first render: the router tidies the URL after Google sends the customer back. */
function initialOutcome() {
  if (typeof window === 'undefined') return null
  return gmailConnectOutcome(new URLSearchParams(window.location.search).get('gmail'))
}
const here = () => (typeof window === 'undefined' ? undefined : `${window.location.pathname}${window.location.search}`.replace(/([?&])gmail=[^&]*&?/, '$1').replace(/[?&]$/, ''))

function Outcome({ outcome }: { outcome: { tone: 'done' | 'warn' | 'danger'; text: string } | null }) {
  if (!outcome) return null
  return (
    <p className="wk-table-sub" role="status" data-testid="gmail-outcome" style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'flex-start', color: outcome.tone === 'danger' ? 'var(--danger)' : undefined }}>
      {outcome.tone === 'done' ? <CheckCircle2 aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} /> : <AlertCircle aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} />}
      {outcome.text}
    </p>
  )
}

/** Settings → Connected accounts. Renders nothing for guests or when the server can't send through Gmail. */
export function GmailSettings() {
  const { status, refresh } = useGmailStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome] = useState(initialOutcome)
  if (!status?.available) return null

  async function disconnect() {
    setBusy(true)
    setError(null)
    const ok = await disconnectGmail()
    setBusy(false)
    if (!ok) setError('Couldn’t disconnect Gmail. Try again.')
    void refresh()
  }

  return (
    <div className="wk-card" data-testid="gmail-settings">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 15, fontWeight: 500 }}>Gmail</p>
          <p className="wk-dim" style={{ marginTop: 4, fontSize: 13 }}>
            {status.connected
              ? `Sending from ${status.email}${status.connectedAt ? `, connected ${dateTime.format(status.connectedAt)}` : ''}.`
              : 'Not connected. Connect it to send approved recovery requests from your own address. Available on every plan.'}
          </p>
          <p className="wk-table-sub" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <ShieldCheck aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} />
            {SEND_ONLY_NOTE} Access is stored encrypted, and disconnecting cancels it with Google and deletes it here.
          </p>
        </div>
        {status.connected ? (
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={() => void disconnect()} disabled={busy}>
            {busy ? 'Disconnecting…' : 'Disconnect Gmail'}
          </button>
        ) : (
          <a className="wk-btn" data-variant="outline" data-size="sm" href={gmailConnectUrl('/audit?mode=settings')}>
            Connect Gmail
          </a>
        )}
      </div>
      <Outcome outcome={outcome} />
      {error ? (
        <p className="wk-table-sub" role="alert" style={{ marginTop: 10, color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export interface GmailSendPackage {
  projectId: string
  findingId: string
  vendor: string
  to: string
  subject: string
  body: string
  amount: number
  methodLabel: string
}

/**
 * The send step of an approved request: connect Gmail if needed, then
 * "Send from you@gmail.com" with a final confirmation that names the
 * recipient and the amount. `onSent` runs only with Gmail's own receipt.
 * Renders nothing for guests or when the server can't send through Gmail,
 * leaving the copy-and-send-yourself path.
 */
export function GmailSendStep({ pkg, ready, blockedReason, onSent }: { pkg: GmailSendPackage; ready: boolean; blockedReason: string | null; onSent: (receipt: GmailSendReceipt) => void }) {
  const { status, refresh } = useGmailStatus()
  const [outcome] = useState(initialOutcome)
  const [ccLine, setCcLine] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [checkedSent, setCheckedSent] = useState(false)
  if (!status?.available) return null

  const cc = parseCc(ccLine)
  const ccError = cc.length > 5 ? 'Up to five addresses.' : cc.find((a) => !EMAIL.test(a)) ? `“${cc.find((a) => !EMAIL.test(a))}” isn’t an email address.` : null
  const toMissing = !EMAIL.test(pkg.to)
  const disabledReason = blockedReason ?? (toMissing ? 'Add the vendor’s email above and approve the request with it.' : !ready ? 'Approve this version of the request above first.' : ccError)

  async function send() {
    setSending(true)
    setError(null)
    try {
      await projectSync.flush()
      if (projectSync.pending) {
        setError('This audit isn’t saved to your account yet, so it can’t be sent. Check your connection and try again.')
        return
      }
      const result = await sendWithGmail({ projectId: pkg.projectId, findingId: pkg.findingId, to: pkg.to, cc, subject: pkg.subject, body: pkg.body, amountRequested: pkg.amount, retryUncertain: uncertain && checkedSent ? true : undefined })
      if (result.ok) {
        setConfirming(false)
        onSent(result.receipt)
        return
      }
      setUncertain(result.code === 'gmail_send_uncertain')
      setCheckedSent(false)
      if (result.code === 'gmail_reconnect' || result.code === 'gmail_not_connected') void refresh()
      setError(result.fields ? Object.values(result.fields).join(' ') : result.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="wk-panelcard-body wk-stack wk-subsection" data-testid="gmail-send" aria-labelledby="gmail-send-title">
      <div>
        <h3 id="gmail-send-title" className="wk-subhead">Send it from your Gmail</h3>
        <p className="wk-field-hint">{SEND_ONLY_NOTE}</p>
      </div>
      <Outcome outcome={outcome} />
      {!status.connected ? (
        <div className="wk-actions">
          <a className="wk-btn" data-variant="outline" data-size="sm" href={gmailConnectUrl(here())}>
            <Mail aria-hidden="true" />
            Connect Gmail
          </a>
          <span className="wk-field-hint">Or copy the letter and send it yourself, then mark it sent.</span>
        </div>
      ) : (
        <>
          <div className="wk-fields" data-columns="2">
            <div className="wk-field">
              <label htmlFor="gmail-from">From</label>
              <input id="gmail-from" className="wk-input" value={status.email ?? ''} readOnly />
            </div>
            <div className="wk-field">
              <label htmlFor="gmail-cc">Cc (optional)</label>
              <input id="gmail-cc" className="wk-input" type="text" value={ccLine} onChange={(e) => setCcLine(e.target.value)} placeholder="controller@yourcompany.com" aria-invalid={ccError ? 'true' : undefined} />
              {ccError ? <span className="wk-field-error" role="alert">{ccError}</span> : null}
            </div>
          </div>
          <div className="wk-actions">
            <button type="button" className="wk-btn" data-variant="primary" data-size="sm" disabled={Boolean(disabledReason)} onClick={() => { setError(null); setConfirming(true) }}>
              <Send aria-hidden="true" />
              Send from {status.email}
            </button>
          </div>
          {disabledReason ? <p className="wk-field-hint">{disabledReason}</p> : null}
          {error && !confirming ? <p className="wk-field-error" role="alert">{error}</p> : null}
        </>
      )}

      <DialogPrimitive.Root open={confirming} onOpenChange={(open) => !sending && setConfirming(open)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="wk wk-overlay" />
          <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(640px, calc(100vw - 32px))' }} data-testid="gmail-confirm">
            <header className="wk-panel-head">
              <div>
                <DialogPrimitive.Title className="wk-display wk-h2">Send this request to {pkg.to}?</DialogPrimitive.Title>
                <DialogPrimitive.Description className="wk-dim">
                  It goes from {status.email} to {pkg.vendor} at {pkg.to}{cc.length ? `, cc ${cc.join(', ')}` : ''}, asking for {formatCurrency(pkg.amount)} as {pkg.methodLabel.toLowerCase()}. Once Gmail accepts it, the case is marked sent.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="wk-panel-close" aria-label="Close" disabled={sending}>
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <div className="wk-stack" style={{ padding: '0 24px' }}>
              <p style={{ fontWeight: 500 }}>{pkg.subject}</p>
              <pre className="wk-letter" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', fontFamily: 'inherit', fontSize: 13 }}>{pkg.body}</pre>
              {error ? <p className="wk-field-error" role="alert">{error}</p> : null}
              {uncertain ? (
                <label className="wk-radio">
                  <input type="checkbox" checked={checkedSent} onChange={(e) => setCheckedSent(e.target.checked)} />
                  <span>I checked my Gmail Sent folder and this email isn’t there</span>
                </label>
              ) : null}
            </div>
            <div className="wk-panel-foot">
              <DialogPrimitive.Close className="wk-btn" data-variant="ghost" data-size="sm" disabled={sending}>Go back and edit</DialogPrimitive.Close>
              <button type="button" className="wk-btn" data-variant="primary" data-size="sm" disabled={sending || (uncertain && !checkedSent)} onClick={() => void send()}>
                <Send aria-hidden="true" />
                {sending ? 'Sending…' : uncertain ? 'Try again' : `Send ${formatCurrency(pkg.amount)} request`}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}
