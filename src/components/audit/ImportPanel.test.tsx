import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ImportPanel } from '@/components/audit/ImportPanel'

function mount() {
  const onImport = vi.fn()
  render(<ImportPanel allowSample={false} error={null} onImport={onImport} intro="Upload" confirmLabel="Run the audit" />)
  const input = screen.getByLabelText(/upload a csv ledger/i)
  return { onImport, upload: (file: File) => fireEvent.change(input, { target: { files: [file] } }) }
}

describe('upload guard rails', () => {
  it('an .xlsx file gets told to export as CSV, not "no columns recognized"', async () => {
    const { upload, onImport } = mount()
    upload(new File(['PK\u0003\u0004binary'], 'ledger.xlsx'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/save as .* csv/i)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('a binary file renamed to .csv is recognized as not a CSV', async () => {
    const { upload } = mount()
    upload(new File(['PK\u0003\u0004\u0000\u0000[Content_Types].xml'], 'ledger.csv'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn’t a csv/i)
  })

  it('an empty CSV explains what is missing', async () => {
    const { upload } = mount()
    upload(new File([''], 'empty.csv'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/vendor, payment_date, amount_paid/)
  })

  it('a file over the size limit is refused before it is read', async () => {
    const { upload } = mount()
    const big = new File(['x'], 'huge.csv')
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 })
    const text = vi.spyOn(big, 'text')
    upload(big)
    expect(await screen.findByRole('alert')).toHaveTextContent(/60\.0 MB/)
    expect(text).not.toHaveBeenCalled()
  })

  it('a CSV with some bad rows shows how many will be skipped before anything is saved', async () => {
    const { upload, onImport } = mount()
    upload(new File(['vendor,payment_date,amount_paid\nAcme,2025-01-01,100\nBad,notadate,5\nEuro,2025-01-02,"1.234,56"\n'], 'mixed.csv'))
    expect(await screen.findByText(/1 valid record parsed/)).toBeInTheDocument()
    expect(screen.getByText(/2 rows need attention and will be skipped/)).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
  })
})
