import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AuditApp } from '@/AuditApp'
import { getSampleLedger, sampleLedgerCsv } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { formatCurrency } from '@/lib/format'
import { assessRecordReadiness } from '@/audit/dataReadiness'
import { clearEnvironment, mergeImport } from '@/ledger/store'
import { createProject } from '@/ledger/projects'
import type { RouteMode } from '@/audit/useAuditRoute'
import type { Finding } from '@/types'

function setLocation(path: string) {
  window.history.pushState({}, '', path)
}

/**
 * The findings the detection engine really produces for the sample ledger.
 * Every dollar figure asserted below is derived from this — the product spec
 * forbids showing a number the records don't support, so a hardcoded currency
 * string in a test would be able to hide exactly the bug worth catching.
 */
function sampleFindings(): Finding[] {
  return detectFindings(getSampleLedger().records).findings
}

function sumImpact(findings: Finding[]): number {
  return findings.reduce((total, finding) => total + finding.dollarImpact, 0)
}

/** A ledger already persisted by a previous session, written through the real store. */
function seedPersistedLedger() {
  const environment = mergeImport(null, {
    sourceLabel: 'ledger.csv',
    mode: 'upload',
    parsed: getSampleLedger(),
  })
  return createProject({
    name: 'Ledger review',
    sourceLabel: 'ledger.csv',
    mode: 'upload',
    environment,
  })
}

function workspace() {
  return screen.queryByRole('navigation', { name: /workspace/i })
}

function goToMode(label: string) {
  const nav = screen.getByRole('navigation', { name: /workspace/i })
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${label}`) }))
}

function navCount(label: string): number {
  const nav = screen.getByRole('navigation', { name: /workspace/i })
  const item = within(nav).getByRole('button', { name: new RegExp(`^${label}`) })
  return Number(item.querySelector('.wk-nav-count')?.textContent ?? '0')
}

function rung(label: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.wk-ladder > div')).find(
    (node) => node.querySelector('.wk-label')?.textContent === label
  )
  if (!found) throw new Error(`No ladder rung labelled "${label}"`)
  return found
}

function rungValue(label: string): string {
  return rung(label).querySelector('.wk-figure')?.textContent ?? ''
}

function tableRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.wk-table tbody tr'))
}

/** Read one figure out of a `<dl>` fact block (Reports / Data / Settings). */
function fact(label: string): string {
  const term = Array.from(document.querySelectorAll('dt')).find((node) => node.textContent === label)
  return term?.nextElementSibling?.textContent ?? ''
}

/** The sample CTA — a real threshold, so the workspace only appears after it. */
async function runSampleFromLaunch() {
  setLocation('/audit?entry=sample')
  render(<AuditApp />)
  fireEvent.click(screen.getByRole('button', { name: /run the sample/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument())
}

/** The other entry: a real CSV through the import dialog, which persists a project. */
async function importLedgerFromLaunch() {
  setLocation('/audit')
  render(<AuditApp />)
  fireEvent.click(screen.getByRole('button', { name: /use your own file/i }))
  const input = await screen.findByLabelText(/upload a csv ledger/i)
  fireEvent.change(input, {
    target: { files: [new File([sampleLedgerCsv], 'ledger.csv', { type: 'text/csv' })] },
  })
  await screen.findByText('ledger.csv')
  fireEvent.click(screen.getByRole('button', { name: /add to ledger/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument())
}

describe('AuditApp', () => {
  afterEach(() => {
    cleanup()
    clearEnvironment()
    window.localStorage.clear()
    window.history.pushState({}, '', '/audit')
  })

  it('a bare /audit with no ledger shows the Launch screen, not a workspace', () => {
    setLocation('/audit')
    render(<AuditApp />)

    expect(screen.getByRole('button', { name: /run the sample/i })).toBeInTheDocument()
    expect(workspace()).not.toBeInTheDocument()
  })

  it('?entry=sample builds the ledger on its CTA and lands on Overview with the engine’s real totals', async () => {
    setLocation('/audit?entry=sample')
    render(<AuditApp />)

    // The entry route is a threshold, not a redirect: nothing runs until asked.
    expect(workspace()).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /run the sample/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument())

    const findings = sampleFindings()
    expect(findings.length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Overview')
    expect(rungValue('Potential')).toBe(formatCurrency(sumImpact(findings)))
    expect(screen.getByText(`${findings.length} cases`)).toBeInTheDocument()
  })

  // §3 — found money and returned money are different numbers. The four rungs
  // are reported side by side and adding them would double-count the same
  // dollars, so their sum must never appear on the screen as a figure.
  it('reports the four ladder rungs separately and never as one summed total', async () => {
    await runSampleFromLaunch()

    const findings = sampleFindings()
    const potential = sumImpact(findings)
    const verified = sumImpact(findings.filter((finding) => finding.class === 'recoverable'))
    expect(verified).toBeGreaterThan(0)

    expect(rungValue('Potential')).toBe(formatCurrency(potential))
    expect(rungValue('Verified')).toBe(formatCurrency(verified))
    expect(rungValue('In recovery')).toBe(formatCurrency(0))
    expect(rungValue('Recovered')).toBe(formatCurrency(0))
    expect(screen.queryByText(formatCurrency(potential + verified))).not.toBeInTheDocument()

    // $0.00 recovered is not an achievement, so it must not wear the accent
    // that belongs to money which actually came back.
    expect(rung('Recovered')).not.toHaveAttribute('data-terminal')
  })

  it('opening a case from the Overview table routes to ?case= and shows its records as evidence', async () => {
    await runSampleFromLaunch()

    const [topRow] = tableRows()
    const vendor = topRow.querySelector('.wk-table-vendor')?.textContent ?? ''
    const recordCount = Number(/^\d+/.exec(topRow.querySelector('.wk-table-sub')?.textContent ?? '')?.[0])
    expect(vendor).not.toBe('')
    expect(recordCount).toBeGreaterThan(0)

    fireEvent.click(topRow)

    await waitFor(() => expect(new URLSearchParams(window.location.search).get('case')).toBeTruthy())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(vendor)
    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument()
    // Every related record on the finding is shown, one evidence row each.
    expect(tableRows()).toHaveLength(recordCount)
  })

  // §12 — "94% confident" is fake precision a controller cannot act on. Strength
  // is one of three words, and nothing on a case may read as a confidence score.
  it('states evidence strength as a word and never as a confidence percentage', async () => {
    await runSampleFromLaunch()
    fireEvent.click(tableRows()[0])
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    const strength = document.querySelector('.wk-strength')
    expect(strength?.textContent).toMatch(/^(Strong|Moderate|Needs review)$/)

    const page = document.body.textContent ?? ''
    expect(page).not.toMatch(/\d\s*%/)
    expect(page).not.toMatch(/confiden/i)
  })

  it('a decision on a case survives a remount and is picked up by Recoveries', async () => {
    seedPersistedLedger()
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument())

    const [topRow] = tableRows()
    const vendor = topRow.querySelector('.wk-table-vendor')?.textContent ?? ''
    fireEvent.click(topRow)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'This is real' }))
    await waitFor(() => expect(screen.getByText('Confirmed')).toBeInTheDocument())

    cleanup()
    render(<AuditApp />)

    await waitFor(() => expect(screen.getByText('Confirmed')).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(vendor)

    goToMode('Recoveries')
    expect(screen.getByRole('heading', { name: 'Ready to send' })).toBeInTheDocument()
    expect(screen.getByText(vendor)).toBeInTheDocument()
  })

  it('walks a case through the whole recovery ladder and moves the money onto the Recovered rung', async () => {
    await runSampleFromLaunch()

    const [topRow] = tableRows()
    const value = topRow.querySelector('.wk-table-money')?.textContent ?? ''
    fireEvent.click(topRow)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'This is real' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mark request sent' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Money came back' }))
    await waitFor(() => expect(screen.getByText('Money back')).toBeInTheDocument())

    goToMode('Overview')
    expect(rungValue('Recovered')).toBe(value)
    expect(rung('Recovered')).toHaveAttribute('data-terminal')
    // A settled case has left the "in recovery" rung rather than counting twice.
    expect(rungValue('In recovery')).toBe(formatCurrency(0))
  })

  it('renders each of the seven workspace modes without crashing', async () => {
    await runSampleFromLaunch()

    const modes: Array<[RouteMode, string]> = [
      ['overview', 'Overview'],
      ['opportunities', 'Opportunities'],
      ['recoveries', 'Recoveries'],
      ['vendors', 'Vendors'],
      ['reports', 'Reports'],
      ['data', 'Data'],
      ['settings', 'Settings'],
    ]

    for (const [mode, label] of modes) {
      goToMode(label)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(label)
      expect(new URLSearchParams(window.location.search).get('mode')).toBe(mode === 'overview' ? null : mode)
    }
  })

  it('reloading with no query string restores the ledger from persistence instead of showing Launch again', async () => {
    await importLedgerFromLaunch()
    cleanup()

    setLocation('/audit')
    render(<AuditApp />)

    await waitFor(() => expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /run the sample/i })).not.toBeInTheDocument()
  })

  it('drops a stale case id from the URL instead of dead-ending on it', async () => {
    seedPersistedLedger()
    setLocation('/audit?case=not-a-real-id')
    render(<AuditApp />)

    await waitFor(() => expect(window.location.search).not.toContain('case='))
    expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument()
  })

  it('rapid repeated clicks on "Run the sample" do not duplicate or corrupt the ledger', async () => {
    setLocation('/audit')
    render(<AuditApp />)

    const cta = screen.getByRole('button', { name: /run the sample/i })
    fireEvent.click(cta)
    fireEvent.click(cta)
    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByRole('heading', { name: /where the money stands/i })).toBeInTheDocument())

    const findings = sampleFindings()
    expect(rungValue('Potential')).toBe(formatCurrency(sumImpact(findings)))
    expect(screen.getByText(`${findings.length} cases`)).toBeInTheDocument()

    // One import, not three: the record count is the sample's, not a multiple.
    goToMode('Data')
    expect(fact('Payment records')).toBe(String(getSampleLedger().records.length))
    // The sample is a demo session and must not leave a project behind.
    expect(window.localStorage.getItem('reclaim.projects.index.v1')).toBeNull()
  })

  // A vendor that came through clean is a result too. Hiding it would flatter
  // the findings and make this screen disagree with the sidebar's own count.
  it('lists every vendor in the ledger, clean ones included, and agrees with the sidebar count', async () => {
    await runSampleFromLaunch()

    const vendorsInLedger = new Set(getSampleLedger().records.map((record) => record.vendor)).size
    const sidebarCount = navCount('Vendors')

    goToMode('Vendors')
    const rows = tableRows()
    expect(rows).toHaveLength(vendorsInLedger)
    expect(rows).toHaveLength(sidebarCount)

    const cleanRows = rows.filter((row) => row.querySelectorAll('td')[1]?.textContent === '—')
    expect(cleanRows.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Nothing flagged')).toHaveLength(cleanRows.length)
    expect(screen.getByText(`${cleanRows.length} of ${rows.length} came back clean`)).toBeInTheDocument()
  })

  // Coverage is a claim about what the loaded columns can actually support, so
  // it is stated as "N of 7" rather than implying a full audit ran regardless.
  it('the Data screen reports how many of the seven checks the loaded columns support', async () => {
    await runSampleFromLaunch()
    goToMode('Data')

    const parsed = getSampleLedger()
    const readiness = assessRecordReadiness(parsed.records, parsed.skippedCount, parsed.detectedColumns)
    expect(readiness.totalCheckCount).toBe(7)
    expect(screen.getByText(`${readiness.availableCheckCount} of 7 checks`)).toBeInTheDocument()
    expect(fact('Payment records')).toBe(String(parsed.records.length))
    expect(fact('Vendors')).toBe(String(new Set(parsed.records.map((record) => record.vendor)).size))
  })
})
