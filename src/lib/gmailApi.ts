/**
 * The browser side of sending from the customer's own Gmail. The browser
 * never holds a Google token: connecting is a full-page trip through the
 * server to Google and back, and a send asks the server to send.
 */
export interface GmailStatus {
  /** False for guests, when the server is unreachable, or when it has no Gmail key. */
  available: boolean
  connected?: boolean
  /** The connected Gmail address. */
  email?: string | null
  connectedAt?: number | null
}

/** What Gmail accepted. Recorded on the case as the request going out. */
export interface GmailSendReceipt {
  messageId: string
  from: string
  to: string
  cc: string[]
  sentAt: number
}

export interface GmailSendRequest {
  projectId: string
  findingId: string
  to: string
  cc: string[]
  subject: string
  body: string
  amountRequested: number
  /** Only after the customer checked their Sent folder following an unconfirmed send. */
  retryUncertain?: boolean
}

export type GmailSendResult =
  | { ok: true; receipt: GmailSendReceipt; alreadySent: boolean }
  | { ok: false; message: string; code: string | null; fields?: Record<string, string> }

/** Connect, and come back to `next` (the page you're on) with `?gmail=<outcome>`. */
export const gmailConnectUrl = (next?: string) => `/api/integrations/gmail/connect${next ? `?next=${encodeURIComponent(next)}` : ''}`

async function call(path: string, method: 'GET' | 'POST' = 'GET', payload: unknown = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? JSON.stringify(payload) : undefined })
  const text = await res.text()
  try {
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null }
  } catch {
    return { status: res.status, body: null }
  }
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  try {
    const { status, body } = await call('/api/integrations/gmail')
    if (status === 200 && body) return body as unknown as GmailStatus
  } catch {
    // server unreachable — treat as not available
  }
  return { available: false }
}

export async function disconnectGmail(): Promise<boolean> {
  try {
    return (await call('/api/integrations/gmail/disconnect', 'POST')).status === 200
  } catch {
    return false
  }
}

const isReceipt = (v: unknown): v is GmailSendReceipt => {
  const r = v as GmailSendReceipt | null
  return Boolean(r && typeof r.messageId === 'string' && r.messageId && typeof r.to === 'string' && Number.isFinite(r.sentAt))
}

/** Asks the server to send. `ok` only when Gmail accepted the message and returned its id. */
export async function sendWithGmail(request: GmailSendRequest): Promise<GmailSendResult> {
  try {
    const { status, body } = await call('/api/integrations/gmail/send', 'POST', request)
    const receipt = body?.send
    if (status === 200 && isReceipt(receipt)) return { ok: true, receipt, alreadySent: false }
    if (status === 409 && body?.code === 'gmail_already_sent' && isReceipt(receipt)) return { ok: true, receipt, alreadySent: true }
    return {
      ok: false,
      message: typeof body?.message === 'string' ? body.message : 'Gmail didn’t send it. Try again.',
      code: typeof body?.code === 'string' ? body.code : null,
      fields: body?.fields && typeof body.fields === 'object' ? (body.fields as Record<string, string>) : undefined,
    }
  } catch {
    // The request may or may not have reached the server; treat it like an unconfirmed send.
    return { ok: false, message: 'Couldn’t reach Reclaim’s server, so it isn’t known whether the email went out. Check your Gmail Sent folder before trying again.', code: 'gmail_send_uncertain' }
  }
}

/** Splits a typed Cc line into addresses. */
export const parseCc = (line: string) => line.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)

/** What the server's redirect back from Google means, in words. */
export function gmailConnectOutcome(param: string | null): { tone: 'done' | 'warn' | 'danger'; text: string } | null {
  switch (param) {
    case 'connected': return { tone: 'done', text: 'Gmail is connected. Approved requests can now be sent from your address.' }
    case 'cancelled': return { tone: 'warn', text: 'Gmail wasn’t connected: the request was cancelled on Google’s page.' }
    case 'scope': return { tone: 'warn', text: 'Gmail wasn’t connected because the “Send email on your behalf” permission was unticked. Connect again and leave it ticked.' }
    case 'state': return { tone: 'danger', text: 'That Google sign-in couldn’t be verified, so nothing was connected. Start again from this screen.' }
    case 'signed_out': return { tone: 'danger', text: 'Your Reclaim session ended before Google finished. Log in and connect again.' }
    case 'unavailable': return { tone: 'warn', text: 'Gmail sending isn’t set up on this server yet.' }
    case 'failed': return { tone: 'danger', text: 'Gmail didn’t finish connecting. Try again in a minute.' }
    default: return null
  }
}
