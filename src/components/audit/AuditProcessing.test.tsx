import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { AuditProcessing } from '@/components/audit/AuditProcessing'
import type { DataReadiness } from '@/audit/dataReadiness'

const readiness: DataReadiness = {
  recordCount: 3,
  vendorCount: 2,
  skippedCount: 1,
  missingInvoiceRefCount: 0,
  dateRangeLabel: null,
  availableCheckCount: 7,
  totalCheckCount: 7,
  weakerChecks: [],
}

describe('AuditProcessing', () => {
  it('shows only the genuinely active synchronous phase and no fabricated percentage', () => {
    render(<AuditProcessing phase="running" sourceLabel="real-ledger.csv" mode="upload" readiness={readiness} onContinue={vi.fn()} />)
    expect(screen.getByText('real-ledger.csv')).toBeInTheDocument()
    expect(screen.getByText('Current phase')).toBeInTheDocument()
    expect(screen.getByText('Running payment checks').closest('li')).toHaveAttribute('data-state', 'active')
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('provides an accessible failure state without claiming results were created', () => {
    render(<AuditProcessing phase="failed" sourceLabel="broken.csv" mode="upload" readiness={readiness} error="Processing failed safely." onContinue={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Processing failed safely.')
    expect(screen.getByRole('button', { name: /choose another file/i })).toBeInTheDocument()
    expect(screen.queryByText('Scan receipt')).not.toBeInTheDocument()
  })
  it('keeps the processing and receipt transition still under reduced motion', () => {
    const css = readFileSync('src/components/audit/audit-shell.css', 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.audit-processing-shell[\s\S]*animation: none/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.audit-last-scan summary > svg[\s\S]*transition: none/)
  })
})
