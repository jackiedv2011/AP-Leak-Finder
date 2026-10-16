import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QuickBooksImport, QuickBooksSettings } from '@/components/audit/QuickBooksSource'

/** Answers the QuickBooks endpoints the way the server would; records what was asked. */
function stubServer(status: Record<string, unknown>, sync: { status: number; body: Record<string, unknown> } = { status: 200, body: {} }) {
  const calls: Array<{ url: string; method: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    const reply = url.endsWith('/sync') ? sync : url.endsWith('/disconnect') ? { status: 200, body: { ok: true } } : { status: 200, body: status }
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }))
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('QuickBooks in the import panel', () => {
  it('shows nothing when QuickBooks is not available (guest, or no keys on the server)', async () => {
    stubServer({ available: false })
    const { container } = render(<QuickBooksImport onFile={() => {}} />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('offers to connect, through the server, and says it is read-only', async () => {
    stubServer({ available: true, environment: 'sandbox', connected: false })
    render(<QuickBooksImport onFile={() => {}} />)
    const link = await screen.findByRole('link', { name: 'Connect QuickBooks' })
    expect(link).toHaveAttribute('href', '/api/integrations/quickbooks/connect')
    expect(screen.getByTestId('quickbooks-source')).toHaveTextContent('never changes anything in QuickBooks')
    expect(screen.getByTestId('quickbooks-source')).toHaveTextContent('Sandbox')
  })

  it('imports the connected company as a CSV file for the normal review', async () => {
    const calls = stubServer({ available: true, environment: 'sandbox', connected: true, companyName: 'Sandbox Co', lastSyncAt: null }, { status: 200, body: { companyName: 'Sandbox Co', csv: 'vendor,payment_date,amount_paid\nAcme,2026-08-20,1250\n' } })
    const onFile = vi.fn()
    render(<QuickBooksImport onFile={onFile} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Import from QuickBooks' }))
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1))
    const file = onFile.mock.calls[0][0] as File
    expect(file.name).toBe('quickbooks-sandbox-co.csv')
    expect(await file.text()).toContain('Acme,2026-08-20,1250')
    expect(calls).toContainEqual({ url: '/api/integrations/quickbooks/sync', method: 'POST' })
  })

  it('explains when QuickBooks has to be connected again', async () => {
    stubServer({ available: true, connected: true, companyName: 'Sandbox Co' }, { status: 409, body: { message: 'QuickBooks needs to be connected again.', code: 'quickbooks_reconnect' } })
    render(<QuickBooksImport onFile={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Import from QuickBooks' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('connected again')
  })
})

describe('QuickBooks in Settings', () => {
  it('disconnects through the server', async () => {
    const calls = stubServer({ available: true, environment: 'sandbox', connected: true, companyName: 'Sandbox Co', connectedAt: Date.UTC(2026, 9, 16) })
    render(<QuickBooksSettings />)
    expect(await screen.findByTestId('connected-accounts')).toHaveTextContent('Connected to Sandbox Co')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect QuickBooks' }))
    await waitFor(() => expect(calls).toContainEqual({ url: '/api/integrations/quickbooks/disconnect', method: 'POST' }))
  })
})
