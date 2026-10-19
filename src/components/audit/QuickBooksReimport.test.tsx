import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { parseCsv } from '@/lib/csv'
import { ImportPanel, type QuickBooksImportContext } from '@/components/audit/ImportPanel'
import { lastQuickBooksPull, mergeQuickBooksSync, planQuickBooksSync } from '@/ledger/quickbooksSync'
import { toLedgerImport, type QuickBooksPull } from '../../../server/quickbooks.ts'

const REALM = '9341458505092846'
const T0 = Date.UTC(2026, 9, 1, 12)
const payment = (Id: string, TxnDate: string, amount: number) => ({ Id, TxnDate, TotalAmt: amount, PayType: 'Check', VendorRef: { value: '56', name: 'Acme Supply' }, Line: [{ Amount: amount, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] })
const ledger = (payments: object[]): QuickBooksPull => ({ company: { CompanyName: 'Sandbox Co' }, entities: { Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250 }], BillPayment: payments, VendorCredit: [], Deposit: [], Purchase: [] } })

afterEach(() => vi.unstubAllGlobals())

describe('Import from QuickBooks into an audit that already has the company', () => {
  it('asks only for changes since the last pull, and says what the import will do before it runs', async () => {
    const firstPull = toLedgerImport(ledger([payment('201', '2026-08-20', 1250), payment('202', '2026-08-23', 1250)]), T0, { realmId: REALM, mode: 'full', since: null, touched: [], removed: [] })
    const env = mergeQuickBooksSync(null, { sourceLabel: 'q.csv', mode: 'upload', parsed: parseCsv(firstPull.csv), quickbooks: firstPull.facts }).env
    const changes = toLedgerImport(ledger([payment('202', '2026-08-23', 1200), payment('203', '2026-09-02', 90)]), T0 + 3600_000, { realmId: REALM, mode: 'changes', since: T0, touched: ['BillPayment:202', 'BillPayment:203'], removed: [] })

    const requests: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      const body = url.endsWith('/sync') ? { companyName: 'Sandbox Co', ...changes } : { available: true, environment: 'sandbox', connected: true, companyName: 'Sandbox Co' }
      return new Response(JSON.stringify(body), { status: 200 })
    }))
    const context: QuickBooksImportContext = {
      sinceFor: (name) => lastQuickBooksPull(env, name),
      preview: (parsed, facts) => ({ summary: planQuickBooksSync(env, parsed, facts).summary, targetName: 'Sandbox Co audit', targetId: 'project_1' }),
    }
    const onImport = vi.fn()
    render(<ImportPanel allowSample={false} error={null} onImport={onImport} intro="Upload" confirmLabel="Run the audit" quickbooks={context} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Import from QuickBooks' }))
    const preview = await screen.findByTestId('quickbooks-sync-preview')
    expect(requests.find((r) => r.url.endsWith('/sync'))?.body).toEqual({ since: T0 })
    expect(preview).toHaveTextContent('From QuickBooks: 1 new payment, 1 changed, 1 already in this audit.')
    expect(preview).toHaveTextContent('Updates “Sandbox Co audit”')

    fireEvent.click(screen.getByRole('button', { name: 'Update the audit' }))
    expect(onImport.mock.calls[0][0].quickbooks.sync).toMatchObject({ mode: 'changes', realmId: REALM })
  })
})
