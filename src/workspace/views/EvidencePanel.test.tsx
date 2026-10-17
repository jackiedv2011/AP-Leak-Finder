import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { parseCsv } from '@/lib/csv'
import { mergeImport } from '@/ledger/store'
import { toLedgerImport } from '../../../server/quickbooks.ts'
import { autofillKey } from '@/recovery/quickbooksEvidence'
import type { RecoveryEvidence } from '@/recovery/eligibility'
import { EvidencePanel } from './EvidencePanel'

const payment = (Id: string, TxnDate: string) => ({ Id, TxnDate, TotalAmt: 1250, PayType: 'Check', VendorRef: { value: '56', name: 'Acme Supply' }, Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] })
const { csv, facts } = toLedgerImport({
  company: { CompanyName: 'Sandbox Co' },
  entities: { Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250 }], BillPayment: [payment('201', '2026-08-20'), payment('202', '2026-08-23')], VendorCredit: [], Deposit: [], Purchase: [] },
}, Date.UTC(2026, 9, 16, 15))
const env = mergeImport(null, { sourceLabel: 'quickbooks-sandbox-co.csv', mode: 'upload', parsed: parseCsv(csv), quickbooks: facts })
const finding = env.result.findings.find((f) => f.type === 'exact_duplicate')!

describe('Evidence review for a QuickBooks finding', () => {
  it('opens pre-filled, marks what came from QuickBooks, and leaves settlement to the reviewer', () => {
    render(<EvidencePanel finding={finding} findings={env.result.findings} imports={env.imports} onSave={() => {}} />)
    expect(screen.getByTestId('quickbooks-autofill-note')).toHaveTextContent('settlement still needs your confirmation')
    expect(screen.getByDisplayValue('qbo:Bill:101')).toBeInTheDocument()
    expect(screen.getByDisplayValue('qbo:BillPayment:202')).toBeInTheDocument()
    // Four obligation fields, three per payment, and the refund and credit searches.
    expect(screen.getAllByTestId('from-quickbooks')).toHaveLength(4 + 3 * 2 + 2)
    for (const box of screen.getAllByRole('checkbox', { name: /Settled or cleared/ })) expect(box).not.toBeChecked()
  })

  it('drops the mark from a field the reviewer edits, and saves who confirmed the rest', () => {
    const onSave = vi.fn<(evidence: RecoveryEvidence) => void>()
    render(<EvidencePanel finding={finding} findings={env.result.findings} imports={env.imports} onSave={onSave} />)
    const field = screen.getByDisplayValue('qbo:BillPayment:202').closest('label')!
    expect(within(field).getByTestId('from-quickbooks')).toBeInTheDocument()
    fireEvent.change(within(field).getByRole('textbox'), { target: { value: 'Check 1043' } })
    expect(within(field).queryByTestId('from-quickbooks')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: 'Person confirming these facts' }), { target: { value: 'Jagan' } })
    fireEvent.click(screen.getByRole('button', { name: /Save evidence/ }))
    const saved = onSave.mock.calls[0][0]
    const edited = finding.relatedRecords[1].id
    expect(saved.autofilled?.[autofillKey.paymentId(edited)]).toBeUndefined()
    expect(saved.autofilled?.[autofillKey.obligationId]?.source).toBe('quickbooks')
    expect(saved.obligation.confirmedBy).toBe('Jagan')
    expect(saved.payments.every((p) => !p.settled)).toBe(true)
  })
})
