import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuditEntry } from '@/components/audit/AuditEntry'

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' })
}

const HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category'

describe('AuditEntry', () => {
  it('shows a confirm step with real parsed counts before the ledger is created', async () => {
    const onImport = vi.fn()
    render(<AuditEntry error={null} onRunSample={vi.fn()} onImport={onImport} />)

    const csv = [HEADER, 'Acme,INV-1,2025-01-01,2025-01-10,100,100,net 30,,Supplies', 'Beta,INV-2,2025-01-01,2025-01-12,50,50,net 30,,Supplies'].join(
      '\n'
    )
    const input = screen.getByLabelText(/upload a csv ledger/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('ledger.csv', csv)] } })

    await waitFor(() => expect(screen.getByText('ledger.csv')).toBeInTheDocument())
    expect(screen.getByText('2 valid records parsed')).toBeInTheDocument()
    expect(screen.getByText('2 vendors identified')).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /start the ledger/i }))
    expect(onImport).toHaveBeenCalledTimes(1)
    const input0 = onImport.mock.calls[0][0]
    expect(input0.sourceLabel).toBe('ledger.csv')
    expect(input0.mode).toBe('upload')
    expect(input0.parsed.records).toHaveLength(2)
  })

  it('reports a truthful, non-fabricated error for a file with no usable rows', async () => {
    render(<AuditEntry error={null} onRunSample={vi.fn()} onImport={vi.fn()} />)

    const csv = [HEADER, ',,,,,,,,'].join('\n')
    const input = screen.getByLabelText(/upload a csv ledger/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('empty.csv', csv)] } })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toMatch(/none of the rows had valid values/i)
  })

  it('surfaces partially-valid files honestly (rows needing attention) instead of silently dropping them', async () => {
    render(<AuditEntry error={null} onRunSample={vi.fn()} onImport={vi.fn()} />)

    const csv = [
      HEADER,
      'Acme,INV-1,2025-01-01,2025-01-10,100,100,net 30,,Supplies',
      'Broken,,,,,,,,', // missing required payment_date/amount_paid -> skipped
    ].join('\n')
    const input = screen.getByLabelText(/upload a csv ledger/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('partial.csv', csv)] } })

    await waitFor(() => expect(screen.getByText('partial.csv')).toBeInTheDocument())
    expect(screen.getByText('1 valid record parsed')).toBeInTheDocument()
    expect(screen.getByText(/1 row needs attention/i)).toBeInTheDocument()
  })

  it('lets the user choose a different file instead of proceeding', async () => {
    render(<AuditEntry error={null} onRunSample={vi.fn()} onImport={vi.fn()} />)

    const csv = [HEADER, 'Acme,INV-1,2025-01-01,2025-01-10,100,100,net 30,,Supplies'].join('\n')
    const input = screen.getByLabelText(/upload a csv ledger/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('ledger.csv', csv)] } })

    await waitFor(() => expect(screen.getByText('ledger.csv')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /choose a different file/i }))
    expect(screen.getByText(/drop a csv here/i)).toBeInTheDocument()
  })

  it('sample data is available as a secondary path, not a gate in front of upload', () => {
    const onRunSample = vi.fn()
    render(<AuditEntry error={null} onRunSample={onRunSample} onImport={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /sample data/i }))
    expect(onRunSample).toHaveBeenCalledTimes(1)
  })
})
