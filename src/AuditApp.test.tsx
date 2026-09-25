import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AuditApp } from '@/AuditApp'
import { getSampleLedger, sampleLedgerCsv } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { formatCurrency } from '@/lib/format'
import { isClaim } from '@/lib/claims'
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

/**
 * "Potential recovery" counts only money a vendor could owe back. Written out
 * here rather than imported, so the test states the rule independently: a
 * missed discount is a process fix, and a bank-account change or a shared
 * invoice number is a payment to verify — none of them is a claim.
 */
const NOT_CLAIMS = ['missed_discount', 'bank_account_change', 'shared_invoice_number']
function sumClaims(findings: Finding[]): number {
  return sumImpact(findings.filter((f) => !NOT_CLAIMS.includes(f.type)))
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

/** A headline total (Overview or Recoveries), by its label. */
const TOTAL_KEY: Record<string, string> = { Verified: 'ready', 'In recovery': 'inRecovery', Recovered: 'recovered' }
function stage(label: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-total="${TOTAL_KEY[label]}"]`)
  if (!found) throw new Error(`No total labelled "${label}"`)
  return found
}

/** Headline figures round to whole dollars on screen, so compare the exact amount they carry. */
function stageValue(label: string): string {
  return formatCurrency(Number(stage(label).dataset.amount))
}

function overviewRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('.wk-ov')
  if (!root) throw new Error('Not on the Overview')
  return root
}

function potentialValue(): string {
  return formatCurrency(Number(overviewRoot().dataset.potential))
}

function findingsFact(): { findings: string; audits: string } {
  const nav = screen.getByRole('navigation', { name: /workspace/i })
  const audits = within(nav).getByRole('button', { name: /^Audits/ }).querySelector('.wk-nav-count')?.textContent ?? ''
  return { findings: overviewRoot().dataset.openFindings ?? '', audits }
}

/** The Overview's "Up next" queue: the rows this plan can open. */
function dashboardRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.wk-queue-row:not([data-locked])'))
}

function rowVendor(row: HTMLElement): string {
  return row.querySelector('.wk-queue-main strong')?.textContent ?? ''
}

function rowMoney(row: HTMLElement): string {
  return formatCurrency(Number(row.dataset.amount))
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
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${option}`) }))
  const dialog = await screen.findByTestId('decision-dialog')
  fireEvent.click(within(dialog).getByLabelText(new RegExp(`^${option}`)))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save decision' }))
  await waitFor(() => expect(screen.queryByTestId('decision-dialog')).not.toBeInTheDocument())
}

/** Approve the prepared request (Reclaim surfaced it) and record that it was sent. */
async function approveAndSend() {
  const panel = await screen.findByTestId('recovery-request')
  fireEvent.click(within(panel).getByLabelText('No, Reclaim surfaced it'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Approve recovery request' }))
  await waitFor(() => expect(within(panel).getByRole('button', { name: 'Mark request sent' })).toBeEnabled())
  fireEvent.click(within(panel).getByRole('button', { name: 'Mark request sent' }))
  return screen.findByTestId('recovery-progress')
}

/** Record money back on the open request: the whole remaining amount unless one is given. */
async function recordSettled(amount?: number, method: 'refund' | 'credit' = 'refund') {
  const panel = await screen.findByTestId('recovery-progress')
  fireEvent.click(within(panel).getByRole('tab', { name: 'Record money back' }))
  if (amount !== undefined) fireEvent.change(within(panel).getByLabelText('Amount settled'), { target: { value: String(amount) } })
  fireEvent.change(within(panel).getByLabelText('Came back as'), { target: { value: method } })
  fireEvent.change(within(panel).getByLabelText('Settlement reference'), { target: { value: method === 'credit' ? 'CM-42' : 'ACH-42' } })
  if (method === 'credit') fireEvent.change(within(panel).getByLabelText('Bill where applied'), { target: { value: 'BILL-7' } })
  fireEvent.click(within(panel).getByRole('button', { name: 'Record settled value' }))
  await waitFor(() => amount === undefined
    ? expect(screen.getAllByText('Returned, reconcile').length).toBeGreaterThan(0)
    : expect(fact('Received')).toBe(formatCurrency(amount)))
}

/** Close the open request with a reason. */
async function closeRequest(reason: string) {
  const panel = await screen.findByTestId('recovery-progress')
  fireEvent.click(within(panel).getByRole('tab', { name: 'Close' }))
  fireEvent.change(within(panel).getByLabelText('Reason'), { target: { value: reason } })
  fireEvent.click(within(panel).getByRole('button', { name: 'Close case' }))
}

const DASHBOARD_READY = () => expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument()

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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Overview')
    expect(potentialValue()).toBe(formatCurrency(sumImpact(findings.filter(isClaim))))
    expect(findingsFact().findings).toBe(String(findings.length))
    expect(findingsFact().audits).toBe('1')
  })

  it('offers exactly the seven sections, in order', async () => {
    await runSampleFromLaunch()
    expect(navLabels()).toEqual(['Overview', 'Findings', 'Recoveries', 'Reports', 'Audits', 'Plans', 'Settings'])
  })

  // Found money and returned money are different numbers. The stages are
  // reported side by side and adding them would double-count the same
  // dollars, so their sum must never appear on the screen as a figure.
  it('reports potential, verified, in-recovery and recovered separately and never as one summed total', async () => {
    await runSampleFromLaunch()

    const findings = sampleFindings()
    const potential = sumClaims(findings)
    const verified = sumImpact(findings.filter((finding) => finding.class === 'recoverable'))
    expect(verified).toBeGreaterThan(0)

    expect(potentialValue()).toBe(formatCurrency(potential))
    expect(stageValue('Verified')).toBe(formatCurrency(verified))
    expect(stageValue('In recovery')).toBe(formatCurrency(0))
    expect(stageValue('Recovered')).toBe(formatCurrency(0))
    expect(stageValue('Recovered')).toBe(formatCurrency(0))
    expect(screen.queryByText(formatCurrency(potential + verified))).not.toBeInTheDocument()

    // $0.00 recovered is not an achievement, so it must not wear the accent
    // that belongs to money which actually came back.
    expect(stage('Recovered')).not.toHaveAttribute('data-accent')
  })

  it('"Start an audit" opens the import dialog for a new audit, not a merge into the open one', async () => {
    await runSampleFromLaunch()
    fireEvent.click(screen.getByRole('button', { name: /^start an audit$/i }))
    expect(await screen.findByRole('dialog', { name: 'Start an audit' })).toBeInTheDocument()
  })

  it('opening a case from the Dashboard table routes to ?case= and shows its records as evidence', async () => {
    await runSampleFromLaunch()

    const [topRow] = dashboardRows()
    const vendor = rowVendor(topRow)
    const money = rowMoney(topRow)
    const recordCount = sampleFindings().find((f) => f.vendor === vendor && formatCurrency(f.dollarImpact) === money)?.relatedRecords.length ?? 0
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
    fireEvent.click(dashboardRows()[0])
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

    const [topRow] = dashboardRows()
    const vendor = rowVendor(topRow)
    fireEvent.click(topRow)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    await decide('This is real')
    await waitFor(() => expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0))

    cleanup()
    render(<AuditApp />)

    await waitFor(() => expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(vendor)

    goToMode('Recoveries')
    expect(screen.getByRole('heading', { name: 'Prepared' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: `Open ${vendor} recovery case` }).length).toBeGreaterThan(0)
  })

  it('walks a case through the whole recovery ladder and moves the money onto the Recovered rung', async () => {
    await runSampleFromLaunch()

    const [topRow] = dashboardRows()
    const value = rowMoney(topRow)
    fireEvent.click(topRow)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument())

    await decide('This is real')
    await approveAndSend()
    await recordSettled()

    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(value)
    expect(stage('Recovered')).toHaveAttribute('data-accent')
    // A settled case has left the "in recovery" stage rather than counting twice.
    expect(stageValue('In recovery')).toBe(formatCurrency(0))
  })

  it('a recovered case leaves open flagged value and Verified, so returned money is not still shown as open', async () => {
    await runSampleFromLaunch()
    const potentialBefore = potentialValue()
    const verifiedBefore = stageValue('Verified')

    const [topRow] = dashboardRows()
    const value = rowMoney(topRow)
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('This is real')
    await approveAndSend()
    await recordSettled()

    goToMode('Overview')
    expect(potentialBefore).toBe(formatCurrency(sumImpact(sampleFindings().filter(isClaim))))
    expect(potentialValue()).toBe(formatCurrency(sumImpact(sampleFindings().filter(isClaim)) - impact))
    expect(stageValue('Verified')).toBe(formatCurrency(sumImpact(sampleFindings().filter((f) => f.class === 'recoverable')) - impact))
    expect(verifiedBefore).not.toBe(stageValue('Verified'))
    expect(stageValue('Recovered')).toBe(value)
  })

  it('dismissing a finding removes it from Potential recovery and from "Where the money went"', async () => {
    await runSampleFromLaunch()
    const [topRow] = dashboardRows()
    const value = rowMoney(topRow)
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('Not an issue')
    await waitFor(() => expect(screen.getAllByText('Expected').length).toBeGreaterThan(0))

    goToMode('Overview')
    expect(potentialValue()).toBe(formatCurrency(sumImpact(sampleFindings().filter(isClaim)) - impact))
    expect(findingsFact().findings).toBe(String(sampleFindings().length - 1))
    const causes = Array.from(document.querySelectorAll<HTMLElement>('.wk-bars-row[data-amount]')).map((n) => Number(n.dataset.amount))
    const dupTotal = sumImpact(sampleFindings().filter((f) => f.type === 'exact_duplicate')) - impact
    expect(causes).toContainEqual(dupTotal)
  })

  it('a decision can be changed until a request is sent, and an outcome can be reopened after', async () => {
    await runSampleFromLaunch()
    const [topRow] = dashboardRows()
    const vendor = rowVendor(topRow)
    fireEvent.click(topRow)

    // wrong click: dismissed → change decision → confirm instead
    await decide('Not an issue')
    fireEvent.click(await screen.findByRole('button', { name: 'Change decision' }))
    expect(await screen.findByRole('group', { name: 'Review this finding' })).toBeInTheDocument()
    await decide('This is real')
    await approveAndSend()
    // once sent, the decision is locked
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Change decision' })).not.toBeInTheDocument())

    // wrong outcome: closed without recovery → reopen → money came back
    await closeRequest('Vendor disputed the claim')
    await waitFor(() => expect(screen.getAllByText('Closed, no money back').length).toBeGreaterThan(0))
    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(formatCurrency(0))
    goToMode('Recoveries')
    fireEvent.click(screen.getAllByRole('button', { name: `Open ${vendor} recovery case` })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen case' }))
    await recordSettled()
    goToMode('Overview')
    expect(stageValue('Recovered')).not.toBe(formatCurrency(0))
    expect(stageValue('In recovery')).toBe(formatCurrency(0))
  })

  it('records a partial recovery: dashboard, reports, recoveries and the case summary all show what actually came back', async () => {
    await runSampleFromLaunch()
    const [topRow] = dashboardRows()
    const value = rowMoney(topRow)
    const impact = sampleFindings().find((f) => formatCurrency(f.dollarImpact) === value)!.dollarImpact
    fireEvent.click(topRow)
    await decide('This is real')

    // the request panel drafts a letter from the case and lets us pick the method
    const panel = await screen.findByTestId('recovery-request')
    const subject = () => (within(panel).getByLabelText('Subject') as HTMLInputElement).value
    const message = () => (within(panel).getByLabelText('Message') as HTMLTextAreaElement).value
    // The letter follows the method picked, whatever Reclaim suggested first.
    fireEvent.change(within(panel).getByLabelText('Ask for'), { target: { value: 'refund' } })
    await waitFor(() => expect(subject()).toContain('Request for refund'))
    fireEvent.change(within(panel).getByLabelText('Ask for'), { target: { value: 'credit' } })
    await waitFor(() => expect(subject()).toContain('Request for credit'))
    expect(message()).toContain(formatCurrency(impact))
    const progress = await approveAndSend()
    fireEvent.click(within(progress).getByRole('tab', { name: 'Record money back' }))
    expect(within(progress).getByLabelText('Came back as')).toHaveValue('credit')

    // record 40% of it as an applied credit, with a reference
    const partial = Math.round(impact * 0.4 * 100) / 100
    await recordSettled(partial, 'credit')

    expect(fact('Records support')).toBe(value)
    expect(fact('Requested')).toBe(value)
    expect(fact('Received')).toBe(formatCurrency(partial))
    expect(fact('Still outstanding')).toBe(formatCurrency(impact - partial))
    expect(fact('Method')).toBe('Account credit')
    const history = screen.getByTestId('case-history')
    expect(history).toHaveTextContent('Confirmed as real')
    expect(history).toHaveTextContent('Customer approved recovery outreach')
    expect(history).toHaveTextContent('Recovery request sent')
    expect(history).toHaveTextContent(`Money received recorded · ${formatCurrency(partial)} · Account credit`)
    expect(history).toHaveTextContent('CM-42')
    expect(history).toHaveTextContent('Guest session')

    // Part came back; the rest is still out with the vendor. Neither is counted twice.
    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(formatCurrency(partial))
    expect(stageValue('In recovery')).toBe(formatCurrency(impact - partial))
    expect(potentialValue()).toBe(formatCurrency(sumImpact(sampleFindings().filter(isClaim)) - partial))
    const returns = screen.getByRole('heading', { name: 'Latest money back' }).parentElement!
    expect(within(returns).getAllByRole('button')).toHaveLength(1)
    expect(returns).toHaveTextContent('part of the claim')
    goToMode('Reports')
    expect(fact('Recovered')).toBe(formatCurrency(partial))
    goToMode('Recoveries')
    expect(stageValue('Recovered')).toBe(formatCurrency(partial))
    const lane = document.querySelector('[data-stage="requested"] .wk-ticket-money')
    expect(lane).toHaveTextContent(formatCurrency(impact - partial))
    expect(lane).toHaveAttribute('data-label', 'outstanding')
  })

  it('rejects an invalid recovered amount and records nothing', async () => {
    await runSampleFromLaunch()
    fireEvent.click(dashboardRows()[0])
    await decide('This is real')
    const progress = await approveAndSend()
    fireEvent.click(within(progress).getByRole('tab', { name: 'Record money back' }))
    fireEvent.change(within(progress).getByLabelText('Settlement reference'), { target: { value: 'ACH-1' } })
    const amount = within(progress).getByLabelText('Amount settled')
    for (const bad of ['', '-1', 'abc', '999999999']) {
      fireEvent.change(amount, { target: { value: bad } })
      fireEvent.click(within(progress).getByRole('button', { name: 'Record settled value' }))
      expect(within(progress).getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByTestId('case-history')).not.toHaveTextContent('Money received recorded')
    }
    // Nothing arrived, so the case shows no Received row at all rather than a dash.
    expect(fact('Received')).toBe('')
    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(formatCurrency(0))
  })

  it('a partial recovery survives a full reload and re-login', async () => {
    seedPersistedLedger()
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(DASHBOARD_READY)
    fireEvent.click(dashboardRows()[0])
    await decide('This is real')
    await approveAndSend()
    await recordSettled(12.34)

    cleanup()
    render(<AuditApp />)
    await waitFor(() => expect(fact('Received')).toBe(formatCurrency(12.34)))
    expect(screen.getByTestId('case-history')).toHaveTextContent('Money received recorded')
    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(formatCurrency(12.34))
  })

  it('requires an explicit prior-knowledge disclosure before approving vendor outreach', async () => {
    await runSampleFromLaunch()
    fireEvent.click(dashboardRows()[0])
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

  it('approves and sends in one step, and the history still shows the approval before the send', async () => {
    await runSampleFromLaunch()
    fireEvent.click(dashboardRows()[0])
    await decide('This is real')
    const panel = await screen.findByTestId('recovery-request')
    expect(within(panel).getByRole('button', { name: 'Approve and mark sent' })).toBeDisabled()
    fireEvent.click(within(panel).getByLabelText('No, Reclaim surfaced it'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve and mark sent' }))
    await screen.findByTestId('recovery-progress')
    const text = screen.getByTestId('case-history').textContent ?? ''
    expect(text.indexOf('Customer approved recovery outreach')).toBeGreaterThan(-1)
    expect(text.indexOf('Customer approved recovery outreach')).toBeLessThan(text.indexOf('Recovery request sent'))
    expect(fact('Status')).toBe('Waiting on vendor')
  })

  it('reopens a closed remainder without removing its settled return from the dashboard', async () => {
    await runSampleFromLaunch()
    const [topRow] = dashboardRows()
    const impact = Number(topRow.dataset.amount)
    fireEvent.click(topRow)
    await decide('This is real')
    await approveAndSend()
    await recordSettled(20)
    await closeRequest('Vendor declined the rest')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen remaining balance' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reopen remaining balance' }))
    expect(fact('Received')).toBe(formatCurrency(20))
    expect(fact('Still outstanding')).toBe(formatCurrency(impact - 20))
    expect(screen.getByTestId('case-history')).toHaveTextContent('Remaining balance reopened')
    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(formatCurrency(20))
    expect(stageValue('In recovery')).toBe(formatCurrency(impact - 20))
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Open CloudPOS Software recovery case' })[0])
    await recordSettled()
    expect(fact('Received')).toBe(formatCurrency(finding.dollarImpact))
  })

  it('copies and downloads the recovery request without sending anything', async () => {
    await runSampleFromLaunch()
    fireEvent.click(dashboardRows()[0])
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
    // nothing was "sent": still awaiting approval, nothing in recovery
    expect(fact('Status')).toBe('Awaiting approval')
    expect(screen.getByTestId('case-history')).not.toHaveTextContent('Recovery request sent')
  })

  it('an edited letter is kept on the case, and "Draft with AI" degrades gracefully when the server has no key', async () => {
    seedPersistedLedger()
    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(DASHBOARD_READY)
    fireEvent.click(dashboardRows()[0])
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
    fireEvent.click(dashboardRows()[0])
    fireEvent.click(await screen.findByRole('button', { name: /^This is real/ }))
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

  it('F opens Find from anywhere in the workspace, but not while typing in a field', async () => {
    await runSampleFromLaunch()
    fireEvent.keyDown(window, { key: 'f' })
    const find = await screen.findByRole('dialog', { name: 'Find in workspace' })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(find).not.toBeInTheDocument())

    goToMode('Findings')
    const search = screen.getByLabelText('Search findings')
    fireEvent.keyDown(search, { key: 'f' })
    expect(screen.queryByRole('dialog', { name: 'Find in workspace' })).not.toBeInTheDocument()
  })

  it('Customize changes theme, accent, density and Overview sections, and remembers them', async () => {
    await runSampleFromLaunch()
    fireEvent.click(screen.getAllByRole('button', { name: 'Customize' })[0])
    const sheet = await screen.findByRole('dialog', { name: 'Customize' })

    fireEvent.click(within(sheet).getByRole('button', { name: /^Dark/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Purple' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Compact' }))
    fireEvent.click(within(sheet).getByLabelText(/^Up next/))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Move Recent activity up' }))

    const root = document.documentElement
    await waitFor(() => expect(root.dataset.theme).toBe('dark'))
    expect(root.dataset.accent).toBe('purple')
    expect(root.dataset.density).toBe('compact')
    expect(screen.queryByRole('heading', { name: 'Up next' })).not.toBeInTheDocument()

    const saved = JSON.parse(window.localStorage.getItem('reclaim.preferences.v1')!)
    expect(saved).toMatchObject({ accent: 'purple', density: 'compact' })
    expect(saved.sections.find((section: { id: string }) => section.id === 'next').visible).toBe(false)
    expect(saved.sections.map((section: { id: string }) => section.id).indexOf('activity')).toBe(5)
    expect(window.localStorage.getItem('reclaim.theme.v1')).toBe('dark')
  })

  it('renders each of the six workspace sections without crashing', async () => {
    await runSampleFromLaunch()

    const modes: Array<[RouteMode, string]> = [
      ['dashboard', 'Overview'],
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
    expect(potentialValue()).toBe(formatCurrency(sumImpact(findings.filter(isClaim))))
    expect(findingsFact().findings).toBe(String(findings.length))

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

describe('appearance', () => {
  it('Settings offers Light / System / Dark, applies the choice to the page, and remembers it', async () => {
    await runSampleFromLaunch()
    goToMode('Settings')
    const group = await screen.findByRole('radiogroup', { name: 'Appearance' })
    fireEvent.click(within(group).getByLabelText('Light'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    expect(window.localStorage.getItem('reclaim.theme.v1')).toBe('light')
    fireEvent.click(within(group).getByLabelText('Dark'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(window.localStorage.getItem('reclaim.theme.v1')).toBe('dark')
  })
})

describe('non-claim findings in the recovery flow', () => {
  it('a bank-account change can be confirmed and closed, but never recorded as money coming back', async () => {
    await runSampleFromLaunch()
    goToMode('Findings')
    const row = [...document.querySelectorAll('.wk-finding-row')].find((r) => r.textContent?.includes('Vendor bank-account change'))!
    fireEvent.click(row)
    await decide('This is real')
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as filed' }))
    expect(await screen.findByRole('button', { name: 'Close internal review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Money came back' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close internal review' }))
    goToMode('Overview')
    expect(stageValue('Recovered')).toBe(formatCurrency(0))
  })
})
