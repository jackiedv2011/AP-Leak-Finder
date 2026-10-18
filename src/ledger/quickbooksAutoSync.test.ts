import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { parseCsv } from '@/lib/csv'
import { toLedgerImport, type QuickBooksPull } from '../../server/quickbooks.ts'
import { createProject, getActiveProjectId, loadProject, setActiveProject } from './projects'
import { mergeQuickBooksSync } from './quickbooksSync'
import { mergeImport } from './store'
import { AUTO_SYNC_AFTER_MS, autoSyncLabel, autoSyncQuickBooks, relativeTime } from './quickbooksAutoSync'
import { QuickBooksSyncStatus } from '@/components/audit/QuickBooksSource'

const REALM = '9341458505092846'
const NOW = Date.UTC(2026, 9, 17, 15)
const PULLED = NOW - 2 * 3600_000
const payment = (Id: string, TxnDate: string, amount: number) => ({ Id, TxnDate, TotalAmt: amount, PayType: 'Check', VendorRef: { value: '56', name: 'Acme Supply' }, Line: [{ Amount: amount, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] })
const ledger = (payments: object[]): QuickBooksPull => ({ company: { CompanyName: 'Sandbox Co' }, entities: { Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250 }], BillPayment: payments, VendorCredit: [], Deposit: [], Purchase: [] } })

function qboAudit() {
  const { csv, facts } = toLedgerImport(ledger([payment('201', '2026-08-20', 1250)]), PULLED, { realmId: REALM, mode: 'full', since: null, touched: [], removed: [] })
  return createProject({ name: 'Sandbox Co', sourceLabel: 'quickbooks.csv', mode: 'upload', environment: mergeQuickBooksSync(null, { sourceLabel: 'quickbooks.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: facts }).env })
}
function otherAudit() {
  const csv = 'vendor,invoice_number,payment_date,amount_paid\nNorthwind,N-1,2026-08-01,90\n'
  return createProject({ name: 'Other', sourceLabel: 'other.csv', mode: 'upload', environment: mergeImport(null, { sourceLabel: 'other.csv', mode: 'upload', parsed: parseCsv(csv) }) })
}

/** The server, as the browser sees it. `sync` answers /sync; every request is recorded. */
function server(status: Record<string, unknown>, sync: (body: { since?: number }) => { status: number; body: unknown } = () => ({ status: 500, body: {} })) {
  const calls: Array<{ url: string; body: any }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, body })
    if (url.endsWith('/sync')) {
      const reply = sync(body ?? {})
      return new Response(JSON.stringify(reply.body), { status: reply.status })
    }
    if (url.endsWith('/link')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
    return new Response(JSON.stringify(status), { status: 200 })
  }))
  return calls
}
const connected = (extra: Record<string, unknown> = {}) => ({ available: true, environment: 'sandbox', connected: true, companyName: 'Sandbox Co', lastSyncAt: PULLED, ...extra })
const changesSince = (since: number, payments: object[]) => ({ status: 200, body: { companyName: 'Sandbox Co', ...toLedgerImport(ledger(payments), NOW, { realmId: REALM, mode: 'changes', since, touched: payments.map((p: any) => `BillPayment:${p.Id}`), removed: [] }) } })

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('checking QuickBooks automatically on sign-in', () => {
  it('does nothing when QuickBooks is not connected', async () => {
    qboAudit()
    const calls = server({ available: true, environment: 'sandbox', connected: false })
    expect((await autoSyncQuickBooks({ now: NOW })).state).toEqual({ kind: 'off' })
    expect(calls.map((c) => c.url)).toEqual(['/api/integrations/quickbooks'])
  })

  it('says up to date, without asking QuickBooks, within 15 minutes of the last sync', async () => {
    const audit = qboAudit()
    const calls = server(connected({ linkedAuditId: audit.id, lastSyncAt: NOW - 5 * 60_000 }))
    expect((await autoSyncQuickBooks({ now: NOW })).state).toEqual({ kind: 'up_to_date', at: NOW - 5 * 60_000 })
    expect(calls.some((c) => c.url.endsWith('/sync'))).toBe(false)
  })

  it('pulls what changed into the linked audit, re-runs the checks, and leaves the open audit alone', async () => {
    const audit = qboAudit()
    const other = otherAudit()
    setActiveProject(other.id)
    const calls = server(connected({ linkedAuditId: audit.id, lastSyncAt: NOW - AUTO_SYNC_AFTER_MS - 1 }), (body) => changesSince(body.since!, [payment('202', '2026-10-16', 1250)]))

    const result = await autoSyncQuickBooks({ now: NOW })
    expect(calls.find((c) => c.url.endsWith('/sync'))?.body).toEqual({ since: PULLED })
    expect(result.state).toEqual({ kind: 'synced', summary: { mode: 'changes', added: 1, changed: 0, removed: 0, unchanged: 1 }, at: NOW })
    expect(autoSyncLabel(result.state)).toBe('Checked 1 new QuickBooks payment')

    const saved = loadProject(audit.id)!
    expect(saved.environment.records.map((r) => r.externalTransactionId)).toEqual(['qbo:BillPayment:201', 'qbo:BillPayment:202'])
    // The two payments of Bill 101 are now a finding: the checks ran.
    expect(saved.environment.result.findings.some((f) => f.type === 'exact_duplicate')).toBe(true)
    expect(result.project?.id).toBe(audit.id)
    expect(getActiveProjectId()).toBe(other.id)
    expect(loadProject(other.id)!.environment.records).toHaveLength(1)
  })

  it('says up to date when QuickBooks has nothing new', async () => {
    const audit = qboAudit()
    server(connected({ linkedAuditId: audit.id, lastSyncAt: null }), (body) => changesSince(body.since!, []))
    expect((await autoSyncQuickBooks({ now: NOW })).state).toEqual({ kind: 'up_to_date', at: NOW })
  })

  it('links the audit that already holds the company when no link was stored yet', async () => {
    const audit = qboAudit()
    otherAudit()
    const calls = server(connected({ lastSyncAt: NOW - 60_000 }))
    await autoSyncQuickBooks({ now: NOW })
    expect(calls.find((c) => c.url.endsWith('/link'))?.body).toEqual({ auditId: audit.id })
  })

  it('"Sync now" ignores the 15-minute window', async () => {
    const audit = qboAudit()
    const calls = server(connected({ linkedAuditId: audit.id, lastSyncAt: NOW - 60_000 }), (body) => changesSince(body.since!, []))
    await autoSyncQuickBooks({ now: NOW, force: true })
    expect(calls.some((c) => c.url.endsWith('/sync'))).toBe(true)
  })

  it('never throws: a refused token asks to reconnect, anything else is a quiet error', async () => {
    const audit = qboAudit()
    const stale = connected({ linkedAuditId: audit.id, lastSyncAt: null })
    server(stale, () => ({ status: 409, body: { code: 'quickbooks_reconnect', message: 'QuickBooks needs to be connected again.' } }))
    expect((await autoSyncQuickBooks({ now: NOW })).state).toEqual({ kind: 'reconnect' })
    server(stale, () => ({ status: 502, body: { code: 'quickbooks_failed' } }))
    expect((await autoSyncQuickBooks({ now: NOW })).state).toEqual({ kind: 'error' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    // An unreachable server reads as "not available", which shows nothing rather than an error.
    expect((await autoSyncQuickBooks({ now: NOW })).state).toEqual({ kind: 'off' })
    expect(loadProject(audit.id)!.environment.records).toHaveLength(1)
  })
})

describe('the status line', () => {
  it('reads as a quiet sentence with the right action', () => {
    const onSyncNow = vi.fn()
    const { rerender } = render(createElement(QuickBooksSyncStatus, { state: { kind: 'synced', summary: { mode: 'changes', added: 3, changed: 0, removed: 0, unchanged: 30 }, at: Date.now() }, onSyncNow }))
    expect(screen.getByTestId('quickbooks-sync-status')).toHaveTextContent('Checked 3 new QuickBooks payments · just now')
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(onSyncNow).toHaveBeenCalled()

    rerender(createElement(QuickBooksSyncStatus, { state: { kind: 'up_to_date', at: Date.now() - 2 * 60_000 }, onSyncNow }))
    expect(screen.getByTestId('quickbooks-sync-status')).toHaveTextContent('Up to date with QuickBooks · 2 min ago')

    rerender(createElement(QuickBooksSyncStatus, { state: { kind: 'error' }, onSyncNow }))
    expect(screen.getByTestId('quickbooks-sync-status')).toHaveTextContent('Couldn’t reach QuickBooks')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    rerender(createElement(QuickBooksSyncStatus, { state: { kind: 'reconnect' }, onSyncNow }))
    expect(screen.getByRole('link', { name: 'Reconnect QuickBooks' })).toHaveAttribute('href', '/api/integrations/quickbooks/connect')

    rerender(createElement(QuickBooksSyncStatus, { state: { kind: 'off' }, onSyncNow }))
    expect(screen.queryByTestId('quickbooks-sync-status')).toBeNull()
  })

  it('relative times', () => {
    expect(relativeTime(NOW - 20_000, NOW)).toBe('just now')
    expect(relativeTime(NOW - 2 * 60_000, NOW)).toBe('2 min ago')
    expect(relativeTime(NOW - 3 * 3600_000, NOW)).toBe('3 h ago')
  })
})
