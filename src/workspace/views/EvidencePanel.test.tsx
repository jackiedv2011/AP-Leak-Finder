import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { parseCsv } from '@/lib/csv'
import { mergeImport } from '@/ledger/store'
import { toLedgerImport } from '../../../server/quickbooks.ts'
import { autofillKey } from '@/recovery/quickbooksEvidence'
import { EVIDENCE_CHECKS, evaluateEligibility, type RecoveryEvidence } from '@/recovery/eligibility'
import { EvidencePanel } from './EvidencePanel'
import { dollarsToCents } from './amounts'

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

describe('Evidence review in plain words', () => {
  it('asks every check the gate needs exactly once, plus settlement for each payment', () => {
    render(<EvidencePanel finding={finding} findings={env.result.findings} imports={env.imports} onSave={() => {}} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(EVIDENCE_CHECKS.length + finding.relatedRecords.length)
  })

  it('keeps internal terms out of the questions; rule and record IDs live under Details', () => {
    const { container } = render(<EvidencePanel finding={finding} findings={env.result.findings} imports={env.imports} onSave={() => {}} />)
    const form = container.querySelector('form')!
    for (const term of ['evidence gate', 'minor units', 'obligation', 'eligibility', finding.relatedRecords[0].id]) expect(form.textContent!.toLowerCase()).not.toContain(term.toLowerCase())
    expect(container.querySelector('details')!.textContent).toContain(finding.ruleId ?? finding.type)
  })

  it('takes the bill amount in dollars and saves it in cents', () => {
    const onSave = vi.fn<(evidence: RecoveryEvidence) => void>()
    render(<EvidencePanel finding={finding} findings={env.result.findings} imports={env.imports} onSave={onSave} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Bill amount, in dollars/ }), { target: { value: '$1,250.5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Person confirming these facts' }), { target: { value: 'Jagan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save evidence' }))
    expect(onSave.mock.calls[0][0].obligation.amountMinor).toBe(125050)
  })

  it('reaches "Ready to claim" only once every answer is in, under the unchanged gate', () => {
    const onSave = vi.fn<(evidence: RecoveryEvidence) => void>()
    render(<EvidencePanel finding={finding} findings={env.result.findings} imports={env.imports} onSave={onSave} />)
    for (const box of screen.getAllByRole('checkbox')) if (!(box as HTMLInputElement).checked) fireEvent.click(box)
    for (const input of screen.getAllByRole('textbox', { name: /Where you checked|How you know/ })) if (!(input as HTMLInputElement).value) fireEvent.change(input, { target: { value: 'Searched, none found' } })
    for (const input of screen.getAllByRole('textbox', { name: /Bank reference showing it cleared/ })) if (!(input as HTMLInputElement).value) fireEvent.change(input, { target: { value: 'Statement line' } })
    // Answers count once a named person saves them.
    expect(screen.queryByText(/Ready to claim/)).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Person confirming these facts' }), { target: { value: 'Jagan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save evidence' }))
    expect(evaluateEligibility(finding, onSave.mock.calls[0][0], env.result.findings).eligible).toBe(true)
    expect(screen.getAllByText(/Ready to claim/).length).toBeGreaterThan(0)
  })
})

describe('dollarsToCents', () => {
  it('reads what people type without floating-point drift', () => {
    expect(dollarsToCents('6800')).toBe(680000)
    expect(dollarsToCents('$6,800.5')).toBe(680050)
    expect(dollarsToCents('0.29')).toBe(29)
    expect(dollarsToCents('1.005')).toBe(0)
    expect(dollarsToCents('-5')).toBe(0)
    expect(dollarsToCents('abc')).toBe(0)
  })
})
