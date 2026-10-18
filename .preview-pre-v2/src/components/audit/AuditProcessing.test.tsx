import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { AuditProcessing } from '@/components/audit/AuditProcessing'
import type { DataReadiness } from '@/audit/dataReadiness'
import type { Entitlement } from '@/billing/entitlement'
import type { ScanReceiptSummary } from '@/ledger/views'

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

const receipt: ScanReceiptSummary = {
  sourceLabel: 'real-ledger.csv',
  mode: 'upload',
  importedAt: Date.UTC(2025, 1, 17),
  recordCount: 10,
  vendorCount: 5,
  dateRangeLabel: 'Jan 17, 2025 – Feb 17, 2025',
  skippedCount: 0,
  availableCheckCount: 7,
  totalCheckCount: 7,
  limitations: [],
  findingIds: ['finding-1', 'finding-2', 'finding-3', 'finding-4', 'finding-5'],
  totalFindingCount: 5,
  recoverableCount: 2,
  recoverableTotal: 400,
  reviewCount: 2,
  reviewTotal: 200,
  opportunityCount: 1,
  opportunityTotal: 50,
}

const freeEntitlement: Entitlement = {
  plan: 'free',
  previewIds: ['finding-1', 'finding-2', 'finding-3'],
}

const proEntitlement: Entitlement = { plan: 'pro', previewIds: [] }

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

  it('shows what was scanned and explains free-plan access before opening Overview', () => {
    render(
      <AuditProcessing
        phase="complete"
        sourceLabel="real-ledger.csv"
        mode="upload"
        readiness={readiness}
        receipt={receipt}
        entitlement={freeEntitlement}
        onContinue={vi.fn()}
      />
    )

    expect(screen.getByText(/ledger scan finished/i)).toBeInTheDocument()
    expect(screen.queryByText('Reading the ledger')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what was scanned/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what the checks found/i })).toBeInTheDocument()
    expect(screen.getByText('Jan 17, 2025 – Feb 17, 2025')).toBeInTheDocument()
    expect(screen.getByText(/free plan access/i)).toBeInTheDocument()
    expect(screen.getByText(/all 7 available checks completed/i)).toBeInTheDocument()
    expect(screen.getByText(/3 findings are included in your free plan/i)).toBeInTheDocument()
    expect(screen.getByText(/2 additional findings require an upgrade/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open overview/i })).toBeInTheDocument()
  })

  it('shows paid users that every finding from the scan is unlocked', () => {
    render(
      <AuditProcessing
        phase="complete"
        sourceLabel="real-ledger.csv"
        mode="upload"
        readiness={readiness}
        receipt={receipt}
        entitlement={proEntitlement}
        onContinue={vi.fn()}
      />
    )

    expect(screen.getByText(/all 5 findings from this scan are unlocked/i)).toBeInTheDocument()
    expect(screen.queryByText(/require an upgrade/i)).not.toBeInTheDocument()
  })

  it('keeps the processing and receipt transition still under reduced motion', () => {
    const css = readFileSync('src/components/audit/audit-shell.css', 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.audit-processing-shell[\s\S]*animation: none/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.audit-last-scan summary > svg[\s\S]*transition: none/)
  })
})
