/**
 * The browser side of the QuickBooks connection. The browser never holds a
 * QuickBooks token: connecting is a full-page trip through the server to
 * Intuit and back, and an import asks the server for the ledger as CSV.
 */
export interface QuickBooksStatus {
  /** False for guests, when the server is unreachable, or when it has no QuickBooks keys. */
  available: boolean
  environment?: 'sandbox'
  connected?: boolean
  companyName?: string | null
  connectedAt?: number | null
  lastSyncAt?: number | null
}

export const QUICKBOOKS_CONNECT_URL = '/api/integrations/quickbooks/connect'

async function call(path: string, method: 'GET' | 'POST' = 'GET'): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? '{}' : undefined })
  const text = await res.text()
  try {
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null }
  } catch {
    return { status: res.status, body: null }
  }
}

export async function fetchQuickBooksStatus(): Promise<QuickBooksStatus> {
  try {
    const { status, body } = await call('/api/integrations/quickbooks')
    if (status === 200 && body) return body as unknown as QuickBooksStatus
  } catch {
    // server unreachable — treat as not available
  }
  return { available: false }
}

export type QuickBooksImportResult = { ok: true; file: File; companyName: string } | { ok: false; message: string; reconnect: boolean }

/** Pulls the connected company's bills and payments as a CSV file for the normal import review. */
export async function importFromQuickBooks(): Promise<QuickBooksImportResult> {
  try {
    const { status, body } = await call('/api/integrations/quickbooks/sync', 'POST')
    if (status === 200 && body && typeof body.csv === 'string') {
      const companyName = typeof body.companyName === 'string' ? body.companyName : 'QuickBooks'
      const slug = companyName.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'company'
      return { ok: true, companyName, file: new File([body.csv], `quickbooks-${slug}.csv`, { type: 'text/csv' }) }
    }
    return { ok: false, message: typeof body?.message === 'string' ? body.message : 'QuickBooks import failed. Try again.', reconnect: body?.code === 'quickbooks_reconnect' }
  } catch {
    return { ok: false, message: 'Couldn’t reach Reclaim’s server. Check your connection and try again.', reconnect: false }
  }
}

export async function disconnectQuickBooks(): Promise<boolean> {
  try {
    return (await call('/api/integrations/quickbooks/disconnect', 'POST')).status === 200
  } catch {
    return false
  }
}

/** What the server's redirect back from Intuit means, in words. */
export function connectOutcome(param: string | null): { tone: 'done' | 'warn' | 'danger'; text: string } | null {
  switch (param) {
    case 'connected': return { tone: 'done', text: 'QuickBooks is connected. Import your bills and payments below.' }
    case 'cancelled': return { tone: 'warn', text: 'QuickBooks wasn’t connected: the request was cancelled on Intuit’s page.' }
    case 'state': return { tone: 'danger', text: 'That QuickBooks sign-in couldn’t be verified, so nothing was connected. Start again from this screen.' }
    case 'signed_out': return { tone: 'danger', text: 'Your Reclaim session ended before QuickBooks finished. Log in and connect again.' }
    case 'unavailable': return { tone: 'warn', text: 'QuickBooks isn’t set up on this server yet.' }
    case 'failed': return { tone: 'danger', text: 'QuickBooks didn’t finish connecting. Try again in a minute.' }
    default: return null
  }
}
