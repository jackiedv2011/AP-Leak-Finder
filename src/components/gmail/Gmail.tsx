import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertCircle, CheckCircle2, Clock, Mail, Send, ShieldCheck, X } from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import { formatCurrency } from '@/lib/format'
import { projectSync } from '@/ledger/projectSync'
import { disconnectGmail, fetchGmailStatus, gmailConnectOutcome, gmailConnectUrl, parseCc, sendFollowUpWithGmail, sendWithGmail, type GmailSendReceipt, type GmailStatus } from '@/lib/gmailApi'
import { generateFollowUp } from '@/lib/followUps'
import { followUpAfterDays, followUpStatus } from '@/recovery/model'
import type { CaseState } from '@/ledger/caseState'
import type { SenderProfile } from '@/lib/senderProfile'
import type { Finding } from '@/types'

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

const MAX_FOLLOW_UPS = 5
const dateOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * Follow-ups on a sent request, inside the same send-only permission. When
 * there's no recorded vendor reply N days after the last email (7 by default,
 * set per case), it offers "Follow up": a polite draft the customer edits,
 * then confirms. Nothing is ever sent without that confirmation. Renders
 * nothing for guests or when the server can't send through Gmail.
 */
export function GmailFollowUp({ finding, state, projectId, sender, onChangeDays, onSent }: {
  finding: Finding
  state: CaseState
  projectId?: string
  sender: SenderProfile
  onChangeDays: (days: number) => void
  onSent: (receipt: GmailSendReceipt) => void
}) {
  const { status: gmail, refresh } = useGmailStatus()
  const [daysInput, setDaysInput] = useState(String(followUpAfterDays(state)))
  const [open, setOpen] = useState(false)
  const [confirmStep, setConfirmStep] = useState(false)
  const [draft, setDraft] = useState({ to: '', ccLine: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [checkedSent, setCheckedSent] = useState(false)
  useEffect(() => setDaysInput(String(followUpAfterDays(state))), [state])
  const followUp = followUpStatus(state)
  if (!gmail?.available || !followUp || !projectId) return null

  const days = Number(daysInput)
  const daysError = !Number.isInteger(days) || days < 1 || days > 90 ? 'Between 1 and 90 days.' : null
  const atLimit = followUp.sequence > MAX_FOLLOW_UPS
  const cc = parseCc(draft.ccLine)
  const fieldError = !EMAIL.test(draft.to.trim())
    ? 'Enter the vendor’s email address.'
    : cc.length > 5 || cc.some((a) => !EMAIL.test(a))
      ? 'Cc takes up to five valid addresses.'
      : !draft.subject.trim() || /[\r\n]/.test(draft.subject)
        ? 'Enter a one-line subject.'
        : !draft.body.trim()
          ? 'Enter the message.'
          : null

  function start() {
    const letter = generateFollowUp(finding, state, sender, followUp!.lastOutreachAt)
    const original = state.recoverySentEmail
    setDraft({ to: original?.to ?? state.recoveryRecipientEmail ?? '', ccLine: (original?.cc ?? []).join(', '), subject: letter.subject, body: letter.body })
    setConfirmStep(false)
    setError(null)
    setUncertain(false)
    setCheckedSent(false)
    setOpen(true)
  }

  async function send() {
    setSending(true)
    setError(null)
    try {
      await projectSync.flush()
      if (projectSync.pending) {
        setError('This audit isn’t saved to your account yet, so it can’t be sent. Check your connection and try again.')
        return
      }
      const result = await sendFollowUpWithGmail({ projectId: projectId!, findingId: finding.id, sequence: followUp!.sequence, to: draft.to.trim(), cc, subject: draft.subject, body: draft.body, retryUncertain: uncertain && checkedSent ? true : undefined })
      if (result.ok) {
        setOpen(false)
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
    <section className="wk-panelcard" data-testid="gmail-follow-up" aria-labelledby="follow-up-title">
      <div className="wk-panelcard-head">
        <div>
          <h2 id="follow-up-title">Follow up</h2>
          <p>Reclaim offers a follow-up when the vendor hasn’t replied. It never sends one on its own.</p>
        </div>
      </div>
      <div className="wk-panelcard-body wk-stack">
        {followUp.repliedAt ? (
          <p className="wk-field-hint" data-testid="follow-up-state">The vendor replied on {dateOnly.format(followUp.repliedAt)}, so no follow-up is due. Record their next reply below.</p>
        ) : atLimit ? (
          <p className="wk-field-hint" data-testid="follow-up-state">You’ve sent {MAX_FOLLOW_UPS} follow-ups on this case. Call the vendor, or close the case below.</p>
        ) : followUp.due ? (
          <div className="wk-callout" data-tone="warn" data-testid="follow-up-state">
            <Clock aria-hidden="true" />
            <p><strong>No reply since {dateOnly.format(followUp.lastOutreachAt)}.</strong> Send a short follow-up from your Gmail, in the same conversation.</p>
          </div>
        ) : (
          <p className="wk-field-hint" data-testid="follow-up-state">If there’s no reply by {dateOnly.format(followUp.dueAt)}, a follow-up will be offered here.</p>
        )}

        {followUp.due && !atLimit ? (
          <div className="wk-actions">
            {gmail.connected ? (
              <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={start}>
                <Mail aria-hidden="true" />
                Follow up
              </button>
            ) : (
              <a className="wk-btn" data-variant="outline" data-size="sm" href={gmailConnectUrl(here())}>
                <Mail aria-hidden="true" />
                Connect Gmail to follow up
              </a>
            )}
          </div>
        ) : null}

        <div className="wk-inline-form">
          <div className="wk-field">
            <label htmlFor="follow-up-days">Follow up if there’s no reply after (days)</label>
            <input id="follow-up-days" className="wk-input" inputMode="numeric" value={daysInput} onChange={(e) => setDaysInput(e.target.value)} aria-invalid={daysError ? 'true' : undefined} />
            {daysError ? <span className="wk-field-error" role="alert">{daysError}</span> : null}
          </div>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" disabled={Boolean(daysError) || days === followUpAfterDays(state)} onClick={() => onChangeDays(days)}>Save</button>
        </div>
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="wk wk-overlay" />
          <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(680px, calc(100vw - 32px))' }} data-testid="follow-up-dialog">
            <header className="wk-panel-head">
              <div>
                <DialogPrimitive.Title className="wk-display wk-h2">{confirmStep ? `Send this follow-up to ${draft.to.trim()}?` : `Follow up with ${finding.vendor}`}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="wk-dim">
                  {confirmStep
                    ? `It goes from ${gmail.email} to ${draft.to.trim()}${cc.length ? `, cc ${cc.join(', ')}` : ''}, in the same Gmail conversation as your request. Once Gmail accepts it, it’s added to the case history.`
                    : 'Read it through and change anything you like. Nothing is sent until you confirm on the next step.'}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="wk-panel-close" aria-label="Close" disabled={sending}>
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <div className="wk-stack" style={{ padding: '0 24px' }}>
              {confirmStep ? (
                <>
                  <p style={{ fontWeight: 500 }}>{draft.subject}</p>
                  <pre className="wk-letter" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', fontFamily: 'inherit', fontSize: 13 }}>{draft.body}</pre>
                </>
              ) : (
                <>
                  <div className="wk-fields" data-columns="2">
                    <div className="wk-field">
                      <label htmlFor="follow-up-to">To</label>
                      <input id="follow-up-to" className="wk-input" type="email" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                    </div>
                    <div className="wk-field">
                      <label htmlFor="follow-up-cc">Cc (optional)</label>
                      <input id="follow-up-cc" className="wk-input" value={draft.ccLine} onChange={(e) => setDraft({ ...draft, ccLine: e.target.value })} />
                    </div>
                  </div>
                  <div className="wk-field">
                    <label htmlFor="follow-up-subject">Subject</label>
                    <input id="follow-up-subject" className="wk-input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                  </div>
                  <div className="wk-field">
                    <label htmlFor="follow-up-body">Message</label>
                    <textarea id="follow-up-body" className="wk-input wk-letter" rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                  </div>
                  {fieldError ? <p className="wk-field-hint">{fieldError}</p> : null}
                </>
              )}
              {error ? <p className="wk-field-error" role="alert">{error}</p> : null}
              {uncertain ? (
                <label className="wk-radio">
                  <input type="checkbox" checked={checkedSent} onChange={(e) => setCheckedSent(e.target.checked)} />
                  <span>I checked my Gmail Sent folder and this follow-up isn’t there</span>
                </label>
              ) : null}
            </div>
            <div className="wk-panel-foot">
              {confirmStep ? (
                <>
                  <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" disabled={sending} onClick={() => setConfirmStep(false)}>Go back and edit</button>
                  <button type="button" className="wk-btn" data-variant="primary" data-size="sm" disabled={sending || (uncertain && !checkedSent)} onClick={() => void send()}>
                    <Send aria-hidden="true" />
                    {sending ? 'Sending…' : uncertain ? 'Try again' : 'Send follow-up'}
                  </button>
                </>
              ) : (
                <>
                  <DialogPrimitive.Close className="wk-btn" data-variant="ghost" data-size="sm">Cancel</DialogPrimitive.Close>
                  <button type="button" className="wk-btn" data-variant="primary" data-size="sm" disabled={Boolean(fieldError)} onClick={() => { setError(null); setConfirmStep(true) }}>Review and send</button>
                </>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  )
}
