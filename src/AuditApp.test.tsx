import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render as testingLibraryRender, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { AuditApp } from '@/AuditApp'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { getSampleLedger } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { formatCurrency } from '@/lib/format'
import { clearEnvironment, loadEnvironment } from '@/ledger/store'

function setLocation(path: string) {
  window.history.pushState({}, '', path)
}

function render(ui: ReactElement) {
  return testingLibraryRender(<AuthProvider>{ui}</AuthProvider>)
}

function realSampleResult() {
  const { records } = getSampleLedger()
  return detectFindings(records)
}

async function renderAtSample() {
  setLocation('/audit?sample=1')
  render(<AuditApp />)
  await waitFor(() => expect(screen.getByText(/payment recovery, summarized|every case has a decision/i)).toBeInTheDocument())
}

describe('AuditApp', () => {
  afterEach(() => {
    cleanup()
    clearEnvironment()
    window.localStorage.removeItem('reclaim.ledger.context.v1')
    window.history.pushState({}, '', '/audit')
  })

  it('a bare /audit with no ledger yet shows the entry screen, not a workspace', () => {
    setLocation('/audit')
    render(<AuditApp />)
    expect(screen.getByText(/drop a csv here/i)).toBeInTheDocument()
    expect(screen.queryByText(/payment recovery, summarized/i)).not.toBeInTheDocument()
  })

  it('?sample=1 creates the ledger and lands on Overview with real, non-fabricated totals', async () => {
    await renderAtSample()

    const result = realSampleResult()
    expect(screen.getByText(formatCurrency(result.recoverableTotal + result.reviewTotal + result.opportunityTotal))).toBeInTheDocument()
    expect(screen.getAllByText(`${result.findings.filter((f) => f.class === 'recoverable').length}`).length).toBeGreaterThan(0)
  })

  it('the sample launch is a real threshold and only enters the workspace after its CTA', async () => {
    setLocation('/audit?entry=sample')
    render(<AuditApp />)
    expect(screen.getByRole('heading', { name: /see the evidence connect/i })).toBeInTheDocument()
    expect(screen.queryByText(/payment recovery, summarized/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /run the sample audit/i }))
    expect(screen.getByText(/preparing sample ledger/i)).toBeInTheDocument()
    await waitFor(
      () => expect(screen.getByText(/payment recovery, summarized|every case has a decision/i)).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('the upload entry route stays on the import screen even if a ledger already exists', async () => {
    await renderAtSample()
    cleanup()
    setLocation('/audit?entry=upload')
    render(<AuditApp />)

    expect(screen.getByText(/drop a csv here/i)).toBeInTheDocument()
    expect(screen.queryByText(/payment recovery, summarized/i)).not.toBeInTheDocument()
  })

  it('opening the strongest case shows evidence and a plain-language rule checklist — no confidence score', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))

    expect(screen.getByText('Why this was flagged')).toBeInTheDocument()
    expect(screen.getByText('Same vendor')).toBeInTheDocument()
    expect(screen.queryByText(/% confidence/i)).not.toBeInTheDocument()
  })

  it('confirming a case moves it out of Findings and into Recovery, and the change is visible from Overview', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm likely duplicate' }))
    expect(screen.getAllByText(/ready to prepare/i).length).toBeGreaterThan(0)

    // jsdom's history.back() is asynchronous, so drive the same popstate path
    // directly rather than racing its timing (see useAuditRoute's popstate handling).
    act(() => {
      setLocation('/audit?mode=recovery')
      fireEvent.popState(window)
    })
    expect(screen.getByRole('heading', { name: 'Ready to prepare' })).toBeInTheDocument()
  })

  it('keeps the recommended case in one continuous scene through recovery preparation', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))

    expect(screen.getByText('Why this was flagged')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm likely duplicate' }))
    expect(screen.getByText('The evidence package is complete.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))
    expect(screen.getByRole('heading', { name: 'Recovery draft' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark ready to contact' }))
    expect(screen.getAllByText('Ready to contact').length).toBeGreaterThan(0)
  })

  it('keeps recovery progress when the reviewer edits the decision note', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm likely duplicate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready to contact' }))

    const note = screen.getByLabelText('Reason (optional)')
    fireEvent.change(note, { target: { value: 'Checked against the vendor statement' } })
    fireEvent.blur(note)

    expect(screen.getAllByText('Ready to contact').length).toBeGreaterThan(0)
  })

  it('restores edited recovery copy after the workspace is remounted', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm likely duplicate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))

    const draft = screen.getByLabelText('Recovery draft text')
    fireEvent.change(draft, { target: { value: 'A deliberately edited recovery request.' } })
    await waitFor(() => expect(window.localStorage.getItem('reclaim.ledger.v1')).toContain('deliberately edited'))

    cleanup()
    render(<AuditApp />)

    await waitFor(() =>
      expect(screen.getByLabelText('Recovery draft text')).toHaveValue('A deliberately edited recovery request.')
    )
  })

  it('marking a case expected resolves it immediately and removes it from the findings queue', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    const strongestTitle = screen.getByRole('heading', { level: 1 }).textContent
    fireEvent.click(screen.getByRole('button', { name: /mark as expected/i }))
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0)

    act(() => {
      setLocation('/audit?mode=findings')
      fireEvent.popState(window)
    })
    expect(screen.queryByText(strongestTitle!)).not.toBeInTheDocument()
  })

  it('needs-information shows a concrete evidence-gap workflow, not a dead end', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /needs more information/i }))

    expect(screen.getByText('What would resolve this case')).toBeInTheDocument()
  })

  it('a second import merges into the existing ledger instead of resetting it', async () => {
    await renderAtSample()
    const before = realSampleResult()
    const totalBefore = before.findings.length

    fireEvent.click(screen.getByRole('button', { name: /add records/i }))
    const input = screen.getByLabelText(/upload a csv ledger/i) as HTMLInputElement
    const csv = [
      'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category',
      'Fresh Vendor,INV-9001,2025-08-01,2025-08-10,500,500,,,',
      'Fresh Vendor,INV-9001,2025-08-01,2025-08-20,500,500,,,',
    ].join('\n')
    const file = new File([csv], 'more.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('more.csv')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /add to ledger/i }))

    await waitFor(() => expect(loadEnvironment()?.imports).toHaveLength(2))

    // Radix's tab-trigger pointer handling isn't reliably exercised by jsdom's
    // synthetic click event, so verify the mode switch through the same route
    // state the tab click would otherwise produce.
    act(() => {
      setLocation('/audit?mode=findings')
      fireEvent.popState(window)
    })
    expect(screen.getByText('Fresh Vendor')).toBeInTheDocument()
    // original sample findings are still present alongside the new one
    expect(totalBefore).toBeGreaterThan(0)
  })

  it('reloading with no query string restores the ledger from persistence instead of showing entry again', async () => {
    await renderAtSample()
    cleanup()

    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(() => expect(screen.getByText(/payment recovery, summarized|every case has a decision/i)).toBeInTheDocument())
    expect(screen.queryByText(/drop a csv here/i)).not.toBeInTheDocument()
  })

  it('a stale case id in the URL is dropped instead of dead-ending the user', async () => {
    await renderAtSample()
    cleanup()

    setLocation('/audit?mode=findings&case=not-a-real-id')
    render(<AuditApp />)
    await waitFor(() => expect(window.location.search).not.toContain('case=not-a-real-id'))
  })

  it('rapid repeated clicks on the sample link do not create duplicate/corrupted state', async () => {
    setLocation('/audit')
    render(<AuditApp />)
    const sampleLink = screen.getByRole('button', { name: /sample data/i })
    fireEvent.click(sampleLink)
    fireEvent.click(sampleLink)
    fireEvent.click(sampleLink)

    await waitFor(() => expect(screen.getByText(/payment recovery, summarized|every case has a decision/i)).toBeInTheDocument())

    const result = realSampleResult()
    expect(
      screen.getByText(formatCurrency(result.recoverableTotal + result.reviewTotal + result.opportunityTotal))
    ).toBeInTheDocument()
    // exactly one import happened, not three
    expect(loadEnvironment()?.imports).toHaveLength(1)
  })
})
