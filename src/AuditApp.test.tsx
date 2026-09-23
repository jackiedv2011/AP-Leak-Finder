import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AuditApp } from '@/AuditApp'
import { getSampleLedger, sampleLedgerCsv } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { formatCurrency } from '@/lib/format'
import { assessRecordReadiness } from '@/audit/dataReadiness'
import { clearEnvironment, mergeImport, setCaseState } from '@/ledger/store'
import { confirmCase, markRecoveryRequested } from '@/ledger/caseState'
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

function navLabels(): string[] {
  const nav = screen.getByRole('navigation', { name: /workspace/i })
  return within(nav)
    .getAllByRole('button')
    .map((button) => button.querySelector('span')?.textContent ?? '')
}

/** One of the dashboard's stat tiles, by its label. */
function stat(label: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.wk-ladder > div')).find(
    (node) => node.querySelector('.wk-label')?.textContent === label
  )
  if (!found) throw new Error(`No stat tile labelled "${label}"`)
  return found
}

function statValue(label: string): string {
  return stat(label).querySelector('.wk-figure')?.textContent ?? ''
}

/** One stage of the recovery pipeline strip, by its label. */
function stageValue(label: string): string {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.wk-pipeline > div')).find(
    (node) => node.querySelector('.wk-label')?.textContent === label
  )
  if (!found) throw new Error(`No pipeline stage labelled "${label}"`)
  return found.querySelector('.wk-pipeline-figure')?.textContent ?? ''
}

function tableRows(table: HTMLElement | Document = document): HTMLElement[] {
  return Array.from(table.querySelectorAll<HTMLElement>('.wk-table tbody tr'))
}

function lastTable(): HTMLElement {
  const tables = document.querySelectorAll<HTMLElement>('.wk-table')
  return tables[tables.length - 1]
}


/** Make a decision through the review dialog. */
async function decide(option: 'This is real' | 'I need more detail' | 'Not an issue') {
  fireEvent.click(await screen.findByRole('button', { name: 'Review this finding' }))
  const dialog = await screen.findByTestId('decision-dialog')
  fireEvent.click(within(dialog).getByLabelText(new RegExp(`^${option}`)))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save decision' }))
  await waitFor(() => expect(screen.queryByTestId('decision-dialog')).not.toBeInTheDocument())
}

async function approveAndSend() {
  const panel = await screen.findByTestId('recovery-request')
  fireEvent.click(within(panel).getByLabelText('No, Reclaim surfaced it'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Approve recovery request' }))
  await waitFor(() => expect(within(panel).getByRole('button', { name: 'Mark request sent' })).toBeEnabled())
  fireEvent.click(within(panel).getByRole('button', { name: 'Mark request sent' }))
  return screen.findByTestId('recovery-progress')
}

async function recordSettled(amount?: number, method: 'refund' | 'credit' = 'refund') {
  const panel = await screen.findByTestId('recovery-progress')
  if (amount !== undefined) fireEvent.change(within(panel).getByLabelText('Amount settled'), { target: { value: String(amount) } })
  fireEvent.change(within(panel).getByLabelText('Came back as'), { target: { value: method } })
  fireEvent.change(within(panel).getByLabelText('Settlement reference'), { target: { value: method === 'credit' ? 'CM-42' : 'ACH-42' } })
  if (method === 'credit') fireEvent.change(within(panel).getByLabelText('Bill where applied'), { target: { value: 'BILL-7' } })
  fireEvent.click(within(panel).getByRole('button', { name: 'Record settled value' }))
  await waitFor(() => amount === undefined
    ? expect(screen.getAllByText('Returned, reconcile').length).toBeGreaterThan(0)
    : expect(fact('Received')).toBe(formatCurrency(amount)))
}

const DASHBOARD_READY = () => expect(screen.getByRole('heading', { name: 'Priority findings' })).toBeInTheDocument()

/** Read one figure out of a `<dl>` fact block (Audits / Reports / Settings). */
function fact(label: string): string {
  const term = Array.from(document.querySelectorAll('dt')).find((node) => node.textContent === label)
  return term?.nextElementSibling?.textContent ?? ''
}

/** The sample CTA — a real threshold, so the workspace only appears after it. */
async function runSampleFromLaunch() {
  setLocation('/audit?entry=sample')
  render(<AuditApp />)
  fireEvent.click(screen.getByRole('button', { name: /run the sample/i }))
  await waitFor(DASHBOARD_READY)
}

/** The other entry: a real CSV through the import dialog, which persists a project. */
async function importLedgerFromLaunch() {
  setLocation('/audit')
  render(<AuditApp />)
  fireEvent.click(screen.getByRole('button', { name: /upload a ledger/i }))
  const input = await screen.findByLabelText(/upload a csv ledger/i)
  fireEvent.change(input, {
    target: { files: [new File([sampleLedgerCsv], 'ledger.csv', { type: 'text/csv' })] },
  })
  await screen.findByText('ledger.csv')
  fireEvent.click(screen.getByRole('button', { name: /run the audit/i }))
  await waitFor(DASHBOARD_READY)
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

  it('?entry=sample builds the ledger on its CTA and lands on the Dashboard with the engine’s real totals', async () => {
    setLocation('/audit?entry=sample')
    render(<AuditApp />)

    // The entry route is a threshold, not a redirect: nothing runs until asked.
    expect(workspace()).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /run the sample/i }))
    await waitFor(DASHBOARD_READY)

    const findings = sampleFindings()
    expect(findings.length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard')
    expect(statValue('Ready to review')).toBe(formatCurrency(sumImpact(findings.filter((finding) => finding.class === 'recoverable'))))
    expect(statValue('Action needed')).toBe(String(findings.length))
    expect(screen.getByRole('heading', { name: 'Recovery pipeline' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Open .* finding/ }).length).toBeGreaterThan(0)
  })

  it('offers exactly the six sections, in order', async () => {
    await runSampleFromLaunch()
    expect(navLabels()).toEqual(['Dashboard', 'Audits', 'Findings', 'Recoveries', 'Reports', 'Settings'])
  })

  // Found money and returned money are different numbers. The stages are
  // reported side by side and adding them would double-count the same
  // dollars, so their sum must never appear on the screen as a figure.
  it('reports potential, verified, in-recovery and recovered separately and never as one summed total', async () => {
    await runSampleFromLaunch()

    const findings = sampleFindings()
    const potential = sumImpact(findings)
    const verified = sumImpact(findings.filter((finding) => finding.class === 'recoverable'))
    expect(verified).toBeGreaterThan(0)

    expect(statValue('Ready to review')).toBe(formatCurrency(verified))
    expect(stageValue('Record-supported')).toBe(formatCurrency(verified))
    expect(stageValue('In recovery')).toBe(formatCurrency(0))
    expect(stageValue('Recovered')).toBe(formatCurrency(0))
    expect(statValue('Recovered')).toBe(formatCurrency(0))
    expect(screen.queryByText(formatCurrency(potential + verified))).not.toBeInTheDocument()

    // $0.00 recovered is not an achievement, so it must not wear the accent
    // that belongs to money which actually came back.
    expect(stat('Recovered')).not.toHaveAttribute('data-accent')
  })

  it('"Start an audit" opens the import dialog for a new audit, not a merge into the open one', async () => {
    await runSampleFromLaunch()
    fireEvent.click(screen.getByRole('button', { name: /^start an audit$/i }))
    expect(await screen.findByRole('dialog', { name: 'Start an audit' })).toBeInTheDocument()
  })

  it('opening a case from the Dashboard table routes to ?case= and shows its records as evidence', async () => {
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
    await waitFor(DASHBOARD_READY)

    const [topRow] = tableRows()
    const vendor = topRow.querySelector('.wk-table-vendor')?.textContent ?? ''
    fireEvent.click(topRow)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    await decide('This is real')
    await waitFor(() => expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0))

    cleanup()
    render(<AuditApp />)

    await waitFor(() => expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(vendor)

    goToMode('Recoveries')
    expect(screen.getByRole('heading', { name: 'All recovery cases' })).toBeInTheDocument()
    expect(screen.getAllByText(vendor).length).toBeGreaterThan(0)
  })

  it('walks a case through the whole recovery ladder and moves the money onto the Recovered rung', async () => {
    await runSampleFromLaunch()

    const [topRow] = tableRows()
    const value = topRow.querySelector('.wk-table-money')?.textContent ?? ''
    fireEvent.click(topRow)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    await decide('This is real')
    await approveAndSend()
    await recordSettled()

    goToMode('Dashboard')
    expect(statValue('Recovered')).toBe(value)
    expect(stat('Recovered')).toHaveAttribute('data-accent')
    // A settled case has left the "in recovery" stage rather than counting twice.
    expect(stageValue('In recovery')).toBe(formatCurrency(0))
    expect(stageValue('Recovered')).toBe(value)
  })

  it('a recovered case leaves open flagged value and Verified, so returned money is not still shown as open', async () => {
    await runSampleFromLaunch()
    const verifiedBefore = stageValue('Record-supported')

    const [topRow] = tableRows()
    const value = topRow.querySelector('.wk-table-money')?.textContent ?? ''
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('This is real')
    await approveAndSend()
    await recordSettled()

    goToMode('Dashboard')
    expect(stageValue('Record-supported')).toBe(formatCurrency(sumImpact(sampleFindings().filter((f) => f.class === 'recoverable')) - impact))
    expect(verifiedBefore).not.toBe(stageValue('Record-supported'))
    expect(statValue('Recovered')).toBe(value)
  })

  it('dismissing a finding removes it from open flagged value and from "Where the money went"', async () => {
    await runSampleFromLaunch()
    const [topRow] = tableRows()
    const value = topRow.querySelector('.wk-table-money')?.textContent ?? ''
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('Not an issue')
    await waitFor(() => expect(screen.getAllByText('Expected').length).toBeGreaterThan(0))

    goToMode('Dashboard')
    expect(statValue('Ready to review')).toBe(formatCurrency(sumImpact(sampleFindings().filter((f) => f.class === 'recoverable')) - impact))
    const causes = Array.from(document.querySelectorAll('.wk-card-flat li .wk-num')).map((n) => n.textContent)
    const dupTotal = sumImpact(sampleFindings().filter((f) => f.type === 'exact_duplicate')) - impact
    expect(causes).toContain(formatCurrency(dupTotal))
  })

  it('a decision can be changed until a request is sent, and an outcome can be reopened after', async () => {
    await runSampleFromLaunch()
    const [topRow] = tableRows()
    fireEvent.click(topRow)

    // wrong click: dismissed → change decision → confirm instead
    await decide('Not an issue')
    fireEvent.click(await screen.findByRole('button', { name: 'Change decision' }))
    expect(await screen.findByRole('button', { name: 'Review this finding' })).toBeInTheDocument()
    await decide('This is real')
    await approveAndSend()
    // once sent, the decision is locked
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Change decision' })).not.toBeInTheDocument())

    // wrong outcome: closed without recovery → reopen → money came back
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Vendor disputed the claim' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close case' }))
    await waitFor(() => expect(screen.getAllByText('Closed, no money back').length).toBeGreaterThan(0))
    goToMode('Dashboard')
    expect(statValue('Recovered')).toBe(formatCurrency(0))
    goToMode('Recoveries')
    fireEvent.click(screen.getByRole('button', { name: /Open .* recovery case/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen case' }))
    await recordSettled()
    goToMode('Dashboard')
    expect(statValue('Recovered')).not.toBe(formatCurrency(0))
    // nav badges are workloads: one fewer finding waiting, nothing left in flight
    expect(stageValue('In recovery')).toBe(formatCurrency(0))
  })

  it('records a partial recovery: dashboard, reports, recoveries and the case summary all show what actually came back', async () => {
    await runSampleFromLaunch()
    const [topRow] = tableRows()
    const value = topRow.querySelector('.wk-table-money')?.textContent ?? ''
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('This is real')

    // the request panel drafts a letter from the case and lets us pick the method
    const panel = await screen.findByTestId('recovery-request')
    const subject = () => (within(panel).getByLabelText('Subject') as HTMLInputElement).value
    const message = () => (within(panel).getByLabelText('Message') as HTMLTextAreaElement).value
    expect(subject()).toContain('Request for refund')
    fireEvent.change(within(panel).getByLabelText('Ask for'), { target: { value: 'credit' } })
    await waitFor(() => expect(subject()).toContain('Request for credit'))
    expect(message()).toContain(formatCurrency(impact))
    await approveAndSend()

    // record 40% of it as received, by credit, with a reference
    const outcome = await screen.findByTestId('recovery-progress')
    const partial = Math.round(impact * 0.4 * 100) / 100
    expect(within(outcome).getByLabelText('Came back as')).toHaveValue('credit')
    await recordSettled(partial, 'credit')

    expect(fact('Original opportunity')).toBe(value)
    expect(fact('Requested')).toBe(value)
    expect(fact('Received')).toBe(formatCurrency(partial))
    expect(fact('Still outstanding')).toBe(formatCurrency(impact - partial))
    expect(fact('Method')).toBe('Account credit')
    const history = screen.getByTestId('case-history')
    expect(history).toHaveTextContent('Confirmed as real')
    expect(history).toHaveTextContent('Recovery request sent')
    expect(history).toHaveTextContent(`Money received recorded · ${formatCurrency(partial)} · Account credit`)
    expect(history).toHaveTextContent('CM-42')
    expect(history).toHaveTextContent('Guest session')

    goToMode('Dashboard')
    expect(statValue('Recovered')).toBe(formatCurrency(partial))
    expect(statValue('Ready to review')).toBe(formatCurrency(sumImpact(sampleFindings().filter((f) => f.class === 'recoverable')) - impact))
    expect(stageValue('In recovery')).toBe(formatCurrency(impact - partial))
    goToMode('Reports')
    expect(fact('Recovered')).toBe(formatCurrency(partial))
    goToMode('Recoveries')
    expect(screen.getByText('Returned value').parentElement).toHaveTextContent(formatCurrency(partial))
    expect(lastTable().querySelector('.wk-table-money')).toHaveTextContent(formatCurrency(impact - partial))
    expect(lastTable().querySelector('.wk-table-money')).toHaveTextContent('Outstanding')
  })

  it('requires an explicit prior-knowledge disclosure before approving vendor outreach', async () => {
    await runSampleFromLaunch()
    fireEvent.click(tableRows()[0])
    await decide('This is real')
    const panel = await screen.findByTestId('recovery-request')
    expect(within(panel).getByRole('button', { name: 'Approve recovery request' })).toBeDisabled()
    fireEvent.click(within(panel).getByLabelText('Yes, we already knew'))
    expect(within(panel).getByRole('button', { name: 'Approve recovery request' })).toBeDisabled()
    fireEvent.change(within(panel).getByLabelText('How did your team know?'), { target: { value: 'AP flagged it in August' } })
    expect(within(panel).getByRole('button', { name: 'Approve recovery request' })).toBeEnabled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve recovery request' }))
    expect(within(panel).getByRole('button', { name: 'Approved for outreach' })).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText('How did your team know?'), { target: { value: 'AP flagged it before the CSV import' } })
    expect(within(panel).getByRole('button', { name: 'Mark request sent' })).toBeDisabled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve recovery request' }))
    expect(within(panel).getByRole('button', { name: 'Mark request sent' })).toBeEnabled()
  })

  it('reopens a closed remainder without removing its settled return from the dashboard', async () => {
    await runSampleFromLaunch()
    const [topRow] = tableRows()
    const value = topRow.querySelector('.wk-table-money')?.textContent ?? ''
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('This is real')
    await approveAndSend()
    await recordSettled(20)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Vendor declined the rest' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close case' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen remaining balance' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reopen remaining balance' }))
    expect(fact('Received')).toBe(formatCurrency(20))
    expect(fact('Still outstanding')).toBe(formatCurrency(impact - 20))
    expect(screen.getByTestId('case-history')).toHaveTextContent('Remaining balance reopened')
    goToMode('Dashboard')
    expect(statValue('Recovered')).toBe(formatCurrency(20))
    expect(stageValue('In recovery')).toBe(formatCurrency(impact - 20))
  })

  it('rejects an invalid recovered amount and records nothing', async () => {
    await runSampleFromLaunch()
    fireEvent.click(tableRows()[0])
    await decide('This is real')
    const outcome = await approveAndSend()
    const amount = within(outcome).getByLabelText('Amount settled')
    for (const bad of ['', '-1', 'abc', '999999999']) {
      fireEvent.change(amount, { target: { value: bad } })
      fireEvent.click(within(outcome).getByRole('button', { name: 'Record settled value' }))
      expect(within(outcome).getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByTestId('case-history')).not.toHaveTextContent('Money received recorded')
    }
    expect(fact('Received')).toBe('—')
    goToMode('Dashboard')
    expect(statValue('Recovered')).toBe(formatCurrency(0))
  })

  it('a partial recovery survives a full reload and re-login', async () => {
    seedPersistedLedger()
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(DASHBOARD_READY)
    fireEvent.click(tableRows()[0])
    await decide('This is real')
    await approveAndSend()
    await recordSettled(12.34)
    await waitFor(() => expect(fact('Received')).toBe(formatCurrency(12.34)))

    cleanup()
    render(<AuditApp />)
    await waitFor(() => expect(fact('Received')).toBe(formatCurrency(12.34)))
    expect(screen.getByTestId('case-history')).toHaveTextContent('Money received recorded')
    goToMode('Dashboard')
    expect(statValue('Recovered')).toBe(formatCurrency(12.34))
  })

  it('accepts a settlement on an older saved request that has no requested-amount field', async () => {
    const environment = mergeImport(null, { sourceLabel: 'ledger.csv', mode: 'upload', parsed: getSampleLedger() })
    const finding = environment.result.findings.find((row) => row.vendor === 'CloudPOS Software' && row.class === 'recoverable')!
    const legacy = setCaseState(environment, finding.id, markRecoveryRequested(confirmCase(null)))
    createProject({ name: 'Legacy ledger', sourceLabel: 'ledger.csv', mode: 'upload', environment: legacy })
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(DASHBOARD_READY)
    goToMode('Recoveries')
    fireEvent.click(screen.getByRole('button', { name: /Open CloudPOS Software recovery case/ }))
    await recordSettled()
    expect(fact('Received')).toBe(formatCurrency(finding.dollarImpact))
  })

  it('copies and downloads the recovery request without sending anything', async () => {
    await runSampleFromLaunch()
    fireEvent.click(tableRows()[0])
    await decide('This is real')
    const panel = await screen.findByTestId('recovery-request')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    fireEvent.click(within(panel).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('Subject: ')
    expect(writeText.mock.calls[0][0]).toContain('Best regards')

    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(within(panel).getByRole('button', { name: 'Download' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
    // nothing was "sent": still ready to send, nothing in recovery
    expect(fact('Status')).toBe('Awaiting approval')
    expect(screen.getByTestId('case-history')).not.toHaveTextContent('Recovery request sent')
  })

  it('an edited letter is kept on the case, and "Draft with AI" degrades gracefully when the server has no key', async () => {
    seedPersistedLedger()
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(DASHBOARD_READY)
    fireEvent.click(tableRows()[0])
    await decide('This is real')
    const panel = await screen.findByTestId('recovery-request')
    fireEvent.change(within(panel).getByLabelText('Message'), { target: { value: 'Hand-written request.' } })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Draft with AI' }))
    await waitFor(() => expect(within(panel).getByRole('status')).toHaveTextContent('not configured'))
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/draft', expect.objectContaining({ method: 'POST' }))
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(Object.keys(sent).sort()).toEqual(
      ['amountFlagged', 'amountRequested', 'evidenceStrength', 'explanation', 'findingTitle', 'findingType', 'method', 'recoveryStage', 'rows', 'sender', 'userContext', 'vendor'].sort()
    )
    expect(sent.rows.every((row: Record<string, unknown>) => !('bankAccountLast4' in row))).toBe(true)
    fetchMock.mockRestore()
    expect(within(panel).getByLabelText('Message')).toHaveValue('Hand-written request.')
    await approveAndSend()
    cleanup()
    render(<AuditApp />)
    await waitFor(() => expect(fact('Status')).toBe('Waiting on vendor'))
  })

  it('dismissing through the dialog keeps the structured reason and the note', async () => {
    seedPersistedLedger()
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(DASHBOARD_READY)
    fireEvent.click(tableRows()[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Review this finding' }))
    const dialog = await screen.findByTestId('decision-dialog')
    fireEvent.click(within(dialog).getByLabelText(/^Not an issue/))
    fireEvent.change(within(dialog).getByLabelText('Why is it expected?'), { target: { value: 'known_vendor_exception' } })
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Agreed split with vendor' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save decision' }))
    await waitFor(() => expect(screen.getAllByText('Expected').length).toBeGreaterThan(0))
    const stored = JSON.parse(window.localStorage.getItem(Object.keys(window.localStorage).find((k) => k.startsWith('reclaim.project.v1.'))!)!)
    const state = Object.values(stored.environment.caseStates)[0] as { decision: string; dismissalTag: string; reason: string; history: Array<{ note: string }> }
    expect(state).toMatchObject({ decision: 'expected', dismissalTag: 'known_vendor_exception', reason: 'Agreed split with vendor' })
    expect(state.history[0].note).toBe('Agreed split with vendor')
  })

  it('renders each of the six workspace sections without crashing', async () => {
    await runSampleFromLaunch()

    const modes: Array<[RouteMode, string]> = [
      ['dashboard', 'Dashboard'],
      ['audits', 'Audits'],
      ['findings', 'Findings'],
      ['recoveries', 'Recoveries'],
      ['reports', 'Reports'],
      ['settings', 'Settings'],
    ]

    for (const [mode, label] of modes) {
      goToMode(label)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(label)
      expect(new URLSearchParams(window.location.search).get('mode')).toBe(mode === 'dashboard' ? null : mode)
    }
  })

  it('reloading with no query string restores the ledger from persistence instead of showing Launch again', async () => {
    await importLedgerFromLaunch()
    cleanup()

    setLocation('/audit')
    render(<AuditApp />)

    await waitFor(DASHBOARD_READY)
    expect(screen.queryByRole('button', { name: /run the sample/i })).not.toBeInTheDocument()
  })

  it('a persisted audit is listed on the Audits page as the open one', async () => {
    await importLedgerFromLaunch()
    goToMode('Audits')

    const [row] = tableRows()
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(row.querySelector('.wk-table-vendor')?.textContent).toContain('ledger')
    expect(within(row).getByText('Open')).toBeInTheDocument()
    expect(fact('Payment records')).toBe(String(getSampleLedger().records.length))
  })

  it('drops a stale case id from the URL instead of dead-ending on it', async () => {
    seedPersistedLedger()
    setLocation('/audit?case=not-a-real-id')
    render(<AuditApp />)

    await waitFor(() => expect(window.location.search).not.toContain('case='))
    DASHBOARD_READY()
  })

  it('rapid repeated clicks on "Run the sample" do not duplicate or corrupt the ledger', async () => {
    setLocation('/audit')
    render(<AuditApp />)

    const cta = screen.getByRole('button', { name: /run the sample/i })
    fireEvent.click(cta)
    fireEvent.click(cta)
    fireEvent.click(cta)

    await waitFor(DASHBOARD_READY)

    const findings = sampleFindings()
    expect(statValue('Ready to review')).toBe(formatCurrency(sumImpact(findings.filter((finding) => finding.class === 'recoverable'))))
    expect(screen.getByRole('navigation', { name: /workspace/i }).querySelectorAll('.wk-nav-count')[1]).toHaveTextContent(String(findings.length))

    // One import, not three: the record count is the sample's, not a multiple.
    goToMode('Audits')
    expect(fact('Payment records')).toBe(String(getSampleLedger().records.length))
    // The sample is a demo session and must not leave a project behind.
    expect(window.localStorage.getItem('reclaim.projects.index.v1')).toBeNull()
  })

  // A vendor that came through clean is a result too. Hiding it would flatter
  // the findings and make this screen disagree with its own vendor count.
  it('the Reports page lists every vendor in the ledger, clean ones included', async () => {
    await runSampleFromLaunch()

    const vendorsInLedger = new Set(getSampleLedger().records.map((record) => record.vendor)).size

    goToMode('Reports')
    const rows = tableRows(lastTable())
    expect(rows).toHaveLength(vendorsInLedger)
    expect(fact('Vendors')).toBe(String(vendorsInLedger))

    const cleanRows = rows.filter((row) => row.querySelectorAll('td')[1]?.textContent === '—')
    expect(cleanRows.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Nothing flagged')).toHaveLength(cleanRows.length)
    expect(screen.getByText(`${cleanRows.length} of ${rows.length} came back clean`)).toBeInTheDocument()
  })

  // Coverage is a claim about what the loaded columns can actually support, so
  // it is stated as "N of 7" rather than implying a full audit ran regardless.
  it('the Audits page reports how many of the seven checks the loaded columns support', async () => {
    await runSampleFromLaunch()
    goToMode('Audits')

    const parsed = getSampleLedger()
    const readiness = assessRecordReadiness(parsed.records, parsed.skippedCount, parsed.detectedColumns)
    expect(readiness.totalCheckCount).toBe(7)
    expect(screen.getByText(`${readiness.availableCheckCount} of 7 checks`)).toBeInTheDocument()
    expect(fact('Payment records')).toBe(String(parsed.records.length))
    expect(fact('Vendors')).toBe(String(new Set(parsed.records.map((record) => record.vendor)).size))
  })
})
