import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { confirmCase } from '@/ledger/caseState'
import { approveRecovery, reconcileRecovery, recordVendorUpdate, startRecoveryRequest, verifyRecovery } from '@/recovery/model'
import type { Finding } from '@/types'
import { RecoveryAccountingPanel, RecoveryProgressPanel } from './RecoveryJourney'
import { InternalReviewPanel } from './RecoveryPanels'

const finding: Finding = {
  id: 'f1', type: 'exact_duplicate', class: 'recoverable', severity: 'high', vendor: 'Acme',
  dollarImpact: 1000, title: 'Duplicate payment', explanation: 'Same invoice paid twice', relatedRecords: [],
}

it('closes an internal investigation with a note and no unsupported recovery claim', () => {
  const onClose = vi.fn()
  render(<InternalReviewPanel onClose={onClose} />)
  expect(screen.queryByRole('button', { name: 'Money came back' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close internal review' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/note/i)
  fireEvent.change(screen.getByLabelText('Investigation outcome'), { target: { value: 'Bank details confirmed internally' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close internal review' }))
  expect(onClose).toHaveBeenCalledWith('Bank details confirmed internally')
})

it('holds a legacy recovered case without an amount outside accounting closeout', () => {
  const legacy = { ...confirmCase(null), recoveryStage: 'recovered' as const, requestedAmount: 1000, recoveredAmount: null }
  render(<RecoveryAccountingPanel finding={finding} state={legacy} onReconcile={vi.fn()} />)
  expect(screen.getByText(/no recorded return amount/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mark reconciled' })).not.toBeInTheDocument()
})

it('keeps an issued credit pending and requires application proof before recording recovery', () => {
  let state = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false }), 1000)
  state = recordVendorUpdate(state, { status: 'credit_issued', note: 'CM-14 issued', at: Date.now() })
  const onVerify = vi.fn()
  render(<RecoveryProgressPanel finding={finding} state={state} onVendorUpdate={vi.fn()} onFollowUp={vi.fn()} onVerify={onVerify} onClose={vi.fn()} />)
  expect(screen.getByText(/credit memo is pending/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Came back as'), { target: { value: 'credit' } })
  fireEvent.change(screen.getByLabelText('Settlement reference'), { target: { value: 'CM-14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record settled value' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/bill/i)
  expect(onVerify).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Bill where applied'), { target: { value: 'BILL-7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record settled value' }))
  expect(onVerify).toHaveBeenCalledWith(finding.id, expect.objectContaining({ method: 'credit', appliedToBill: 'BILL-7', amount: 1000 }))
})

it('explains duplicate settlement references before saving', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false }), 1000)
  const partial = verifyRecovery(requested, { amount: 300, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: Date.now() })
  const onVerify = vi.fn()
  render(<RecoveryProgressPanel finding={finding} state={partial} onVendorUpdate={vi.fn()} onFollowUp={vi.fn()} onVerify={onVerify} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Settlement reference'), { target: { value: 'ach-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record settled value' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/already recorded/i)
  expect(onVerify).not.toHaveBeenCalled()
})

it('tells the customer when a partial return is still awaiting final closeout', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false }), 1000)
  const partial = verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: Date.now() })
  render(<RecoveryAccountingPanel finding={finding} state={partial} onReconcile={vi.fn()} />)
  expect(screen.getByText(/\$600\.00 has been recorded as returned/)).toHaveTextContent('$400.00 remains open')
})

it('shows method-specific accounting checks after cash and applied-credit returns', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false }), 1000)
  const partial = verifyRecovery(requested, { amount: 600, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: Date.now() })
  const settled = verifyRecovery(partial, { amount: 400, method: 'credit', source: 'accounting', reference: 'CM-2', appliedToBill: 'BILL-2', settledAt: Date.now() })
  render(<RecoveryAccountingPanel finding={finding} state={settled} onReconcile={vi.fn()} />)
  expect(screen.getByText(/match each cash refund/i)).toBeInTheDocument()
  expect(screen.getByText(/confirm each credit or offset reduced/i)).toBeInTheDocument()
})

it('lets a reconciled case correct its accounting note without reopening settlement proof', () => {
  const requested = startRecoveryRequest(approveRecovery(confirmCase(null), { knownBeforeReclaim: false }), 1000)
  const settled = verifyRecovery(requested, { amount: 1000, method: 'refund', source: 'bank', reference: 'ACH-1', settledAt: Date.now() })
  const reconciled = reconcileRecovery(settled, { note: 'Original entry', rootCause: 'Payment retry' })
  const onReconcile = vi.fn()
  render(<RecoveryAccountingPanel finding={finding} state={reconciled} onReconcile={onReconcile} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit reconciliation' }))
  fireEvent.change(screen.getByLabelText('Accounting entry or reconciliation note'), { target: { value: 'Corrected entry' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save reconciliation' }))
  expect(onReconcile).toHaveBeenCalledWith(finding.id, 'Corrected entry', 'Payment retry')
})
