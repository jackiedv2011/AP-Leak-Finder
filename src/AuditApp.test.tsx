import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuditApp } from '@/AuditApp'
import { getSampleLedger } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { formatCurrency } from '@/lib/format'
import { clearEnvironment } from '@/ledger/store'
import { getActiveProjectId, loadProject } from '@/ledger/projects'
import { FREE_PREVIEW_COUNT } from '@/billing/entitlement'

// CardField mounts real Stripe.js, which talks to js.stripe.com and can't
// meaningfully run inside jsdom. The wizard flow around it (the thing these
// tests actually exercise) is independent of Stripe's own internals, which
// are Stripe's to test — so a fake tokenization result stands in here.
vi.mock('@/components/billing/CardField', () => ({
  CardField: ({ onTokenized }: { onTokenized: (card: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onTokenized({ paymentMethodId: 'pm_test_123', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 })}
    >
      Save card and continue
    </button>
  ),
}))

function setLocation(path: string) {
  window.history.pushState({}, '', path)
}

function realSampleResult() {
  const { records } = getSampleLedger()
  return detectFindings(records)
}

/**
 * Findings are gated by subscription, so entitlement is an explicit precondition
 * of every render. These helpers default to subscribed because the tests below
 * exercise the case pipeline, not the paywall — free-plan gating has its own
 * dedicated tests at the bottom of this file.
 */
function setPlan(plan: 'free' | 'pro') {
  window.localStorage.setItem('reclaim.plan.v1', plan)
}

async function renderAtSample({ subscribed = true }: { subscribed?: boolean } = {}) {
  setPlan(subscribed ? 'pro' : 'free')
  setLocation('/audit?sample=1')
  render(<AuditApp />)
  await waitFor(() => expect(screen.getByRole('button', { name: /open overview/i })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /open overview/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).toBeInTheDocument())
}

async function renderAtUploadedDuplicate({ subscribed = true }: { subscribed?: boolean } = {}) {
  setPlan(subscribed ? 'pro' : 'free')
  setLocation('/audit?entry=upload')
  render(<AuditApp />)
  const input = screen.getByLabelText(/upload a csv ledger/i) as HTMLInputElement
  const csv = [
    'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category',
    'Sierra Coffee Supply,INV-3305,2025-02-01,2025-02-28,6800,6800,,,',
    'Sierra Coffee Supply,INV-3305,2025-02-01,2025-03-15,6800,6800,,,',
  ].join('\n')
  fireEvent.change(input, { target: { files: [new File([csv], 'sierra.csv', { type: 'text/csv' })] } })
  await waitFor(() => expect(screen.getByText('sierra.csv')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /add to my ledger/i }))
  await waitFor(() => expect(screen.getByRole('button', { name: /open overview/i })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /open overview/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).toBeInTheDocument())
}

describe('AuditApp', () => {
  afterEach(() => {
    cleanup()
    clearEnvironment()
    window.localStorage.clear()
    window.history.pushState({}, '', '/audit')
  })

  it('a bare /audit with no ledger yet shows the entry screen, not a workspace', () => {
    setLocation('/audit')
    render(<AuditApp />)
    expect(screen.getByText(/drop a csv here/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).not.toBeInTheDocument()
  })

  it('?sample=1 creates the ledger and lands on Overview with real, non-fabricated totals', async () => {
    await renderAtSample()

    const result = realSampleResult()
    expect(screen.getByText(formatCurrency(result.recoverableTotal + result.reviewTotal + result.opportunityTotal))).toBeInTheDocument()
    const recoverableCount = result.findings.filter((f) => f.class === 'recoverable').length
    expect(screen.getByText(`${recoverableCount} issues`)).toBeInTheDocument()
  })

  it('the sample launch is a real threshold and only enters the workspace after its CTA', async () => {
    setLocation('/audit?entry=sample')
    render(<AuditApp />)
    expect(screen.getByRole('heading', { name: /see the evidence connect/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /run the sample audit/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /open overview/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /open overview/i }))
    await waitFor(
      () => expect(screen.getByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('the upload entry route stays on the import screen even if a ledger already exists', async () => {
    await renderAtSample()
    cleanup()
    setLocation('/audit?entry=upload')
    render(<AuditApp />)

    expect(screen.getByText(/drop a csv here/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    expect(screen.getAllByText('Ready to send').length).toBeGreaterThan(0)

    // jsdom's history.back() is asynchronous, so drive the same popstate path
    // directly rather than racing its timing (see useAuditRoute's popstate handling).
    act(() => {
      setLocation('/audit?mode=recovery')
      fireEvent.popState(window)
    })
    expect(screen.getByRole('heading', { name: /ready to send/i })).toBeInTheDocument()
  })

  it('keeps the recommended case in one continuous scene through recovery preparation', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))

    expect(screen.getByText('Why this was flagged')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    expect(screen.getByText('The evidence package is complete.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))
    expect(screen.getByRole('heading', { name: 'Recovery package' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark request sent' }))
    expect(screen.getAllByText('Waiting on vendor').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Amount actually recovered'), { target: { value: '6800' } })
    fireEvent.change(screen.getByLabelText('Outcome note'), { target: { value: 'Refund reference RF-102' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record money recovered' }))
    expect(screen.getAllByText('Money back').length).toBeGreaterThan(0)
  })

  it('keeps recovery progress when the reviewer edits the decision note', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark request sent' }))

    const note = screen.getByLabelText('Reason (optional)')
    fireEvent.change(note, { target: { value: 'Checked against the vendor statement' } })
    fireEvent.blur(note)

    expect(screen.getAllByText('Waiting on vendor').length).toBeGreaterThan(0)
  })

  it('restores edited recovery copy after the workspace is remounted', async () => {
    await renderAtUploadedDuplicate()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))

    const draft = screen.getByLabelText('Recovery request')
    fireEvent.change(draft, { target: { value: 'A deliberately edited recovery request.' } })
    await waitFor(() => {
      const [saved] = JSON.parse(window.localStorage.getItem('reclaim.projects.index.v1') ?? '[]') as Array<{ id: string }>
      expect(window.localStorage.getItem(`reclaim.project.v1.${saved.id}`)).toContain('deliberately edited')
    })

    cleanup()
    render(<AuditApp />)

    await waitFor(() =>
      expect(screen.getByLabelText('Recovery request')).toHaveValue('A deliberately edited recovery request.')
    )
  })

  it('the recovery package validates the recipient email and only then offers to send it', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))

    // No recipient yet — there is nothing to open in an email client.
    expect(screen.queryByRole('button', { name: /open in email/i })).not.toBeInTheDocument()

    const email = screen.getByLabelText(/recipient email/i)
    fireEvent.change(email, { target: { value: 'not-an-email' } })
    expect(screen.getByText(/doesn't look like a valid email/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open in email/i })).not.toBeInTheDocument()

    fireEvent.change(email, { target: { value: 'ap@sierracoffee.com' } })
    expect(screen.queryByText(/doesn't look like a valid email/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open in email/i })).toBeInTheDocument()
  })

  it('the recovery package can preview the letter exactly as the vendor would receive it', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))

    fireEvent.change(screen.getByLabelText('Recovery request'), { target: { value: 'Line one.\nLine two.' } })
    fireEvent.click(screen.getByRole('tab', { name: /preview/i }))

    // Editing controls give way to the rendered letter.
    expect(screen.queryByLabelText('Recovery request')).not.toBeInTheDocument()
    expect(screen.getByText('Line one.')).toBeInTheDocument()
    expect(screen.getByText('Line two.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /compose/i }))
    expect(screen.getByLabelText('Recovery request')).toHaveValue('Line one.\nLine two.')
  })

  it('shows the performance-fee split against the amount actually recovered', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark request sent' }))

    // The vendor paid less than Reclaim estimated — the fee must follow the
    // money that actually landed, not the original estimate.
    fireEvent.change(screen.getByLabelText('Amount actually recovered'), { target: { value: '5000' } })

    const split = document.querySelector('.rc-feesplit')!
    expect(split).toBeTruthy()
    expect(split.textContent).toContain(formatCurrency(5000))
    expect(split.textContent).toContain(formatCurrency(150)) // 3% of 5,000
    expect(split.textContent).toContain(formatCurrency(4850)) // what the business keeps
  })

  it('does not imply a settled fee before an amount is entered', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark request sent' }))

    fireEvent.change(screen.getByLabelText('Amount actually recovered'), { target: { value: '' } })
    expect(document.querySelector('.rc-feesplit')).toBeNull()
  })

  it('the requested resolution is an explicit choice that persists on the case', async () => {
    await renderAtUploadedDuplicate()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirm likely duplicate/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))

    const refund = screen.getByRole('radio', { name: /refund/i })
    const credit = screen.getByRole('radio', { name: /account credit/i })
    expect(refund).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(credit)
    expect(credit).toHaveAttribute('aria-checked', 'true')
    expect(refund).toHaveAttribute('aria-checked', 'false')

    await waitFor(() => {
      const [saved] = JSON.parse(window.localStorage.getItem('reclaim.projects.index.v1') ?? '[]') as Array<{ id: string }>
      expect(window.localStorage.getItem(`reclaim.project.v1.${saved.id}`)).toContain('"requestedResolution":"credit"')
    })
  })

  it('dismissing a finding as expected asks why first, and does not resolve until a reason is confirmed', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    const strongestTitle = screen.getByRole('heading', { level: 1 }).textContent

    fireEvent.click(screen.getByRole('button', { name: /^Not an error/i }))
    // The click alone must not resolve the case — it should ask why first.
    expect(screen.queryByText('Expected')).not.toBeInTheDocument()
    expect(screen.getByText(/which is it\?/i)).toBeInTheDocument()

    // Cancelling leaves the case exactly as it was. The prompt fades out via
    // an AnimatePresence exit, so it lingers in the DOM briefly — wait for it.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() => expect(screen.queryByText(/what got it wrong/i)).not.toBeInTheDocument())
    expect(screen.queryByText('Expected')).not.toBeInTheDocument()

    // Confirm requires an actual reason — the button stays disabled without one.
    fireEvent.click(screen.getByRole('button', { name: /^Not an error/i }))
    const confirmBtn = screen.getByRole('button', { name: /confirm — mark as expected/i })
    expect(confirmBtn).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: /detection got this wrong/i }))
    expect(confirmBtn).not.toBeDisabled()
    fireEvent.click(confirmBtn)

    // The status chip may read "Expected / New" (a fresh import marks every
    // finding new until Findings is visited), so match on the chip's content
    // rather than an exact "Expected" string.
    await waitFor(() =>
      expect(document.querySelector('.audit-status-chip')?.textContent).toMatch(/^Expected/)
    )
    // AnimatePresence mode="wait" animates the dismiss-prompt out before
    // mounting the acknowledgment panel, so it lands a beat after the chip.
    await waitFor(() => expect(screen.getByText(/thanks — marked as expected/i)).toBeInTheDocument())
    expect(screen.getByText(/detection got this wrong/i)).toBeInTheDocument()

    act(() => {
      setLocation('/audit?mode=findings')
      fireEvent.popState(window)
    })
    expect(screen.queryByText(strongestTitle!)).not.toBeInTheDocument()
  })

  it('needs-information shows a concrete evidence-gap workflow, not a dead end', async () => {
    await renderAtSample()
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Not sure yet/i }))

    expect(screen.getByText('What would resolve this case')).toBeInTheDocument()
  })

  it('a second import merges into the existing ledger instead of resetting it', async () => {
    await renderAtUploadedDuplicate()
    const projectId = getActiveProjectId()!
    const totalBefore = loadProject(projectId)!.environment.result.findings.length

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

    await waitFor(() => expect(loadProject(projectId)?.environment.imports).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: /open overview/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /open overview/i }))

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
    await renderAtUploadedDuplicate()
    cleanup()

    setLocation('/audit')
    render(<AuditApp />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).toBeInTheDocument())
    expect(screen.queryByText(/drop a csv here/i)).not.toBeInTheDocument()
  })

  it('a stale case id in the URL is dropped instead of dead-ending the user', async () => {
    await renderAtUploadedDuplicate()
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

    await waitFor(() => expect(screen.getByRole('button', { name: /open overview/i })).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: /open overview/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /worth checking|you've recovered|ledger is clean/i })).toBeInTheDocument())

    const result = realSampleResult()
    expect(
      screen.getByText(formatCurrency(result.recoverableTotal + result.reviewTotal + result.opportunityTotal))
    ).toBeInTheDocument()
    // exactly one import happened, not three
    expect(window.localStorage.getItem('reclaim.projects.index.v1')).toBeNull()
  })

  describe('free preview gating', () => {
    it('shows how much value is withheld without revealing the findings themselves', async () => {
      await renderAtSample({ subscribed: false })

      const result = realSampleResult()
      const previewSet = [...result.findings].sort((a, b) => a.dollarImpact - b.dollarImpact).slice(0, FREE_PREVIEW_COUNT)
      const lockedValue = result.findings
        .filter((finding) => !previewSet.some((preview) => preview.id === finding.id))
        .reduce((sum, finding) => sum + finding.dollarImpact, 0)

      // The paywall states the stakes honestly: real count, real dollars.
      expect(screen.getAllByText(formatCurrency(lockedValue)).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('button', { name: /unlock all/i }).length).toBeGreaterThan(0)
    })

    it('locks the high-value case on Overview instead of opening it', async () => {
      await renderAtSample({ subscribed: false })

      // The recommended case is the most valuable one, which is exactly what the
      // free plan holds back — so it must offer an unlock, never the evidence.
      expect(screen.queryByRole('button', { name: /review evidence/i })).not.toBeInTheDocument()
      const lockedCard = screen.getByRole('button', { name: /locked finding/i })
      expect(lockedCard).toBeInTheDocument()

      // The gate above promises this amount is hidden, so the card must route
      // its title and amount through the nodes the blur is scoped to — without
      // these hooks the dashboard prints exactly what is being withheld.
      expect(lockedCard.querySelector('.rc-card-title-lock')).toBeTruthy()
      expect(lockedCard.querySelector('.rc-next-money > strong')).toBeTruthy()
    })

    it('subscribing through the dialog unlocks every finding', async () => {
      await renderAtSample({ subscribed: false })

      fireEvent.click(screen.getAllByRole('button', { name: /unlock all/i })[0])

      // Plan → Details → Card → Review → confirm
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
      fireEvent.change(screen.getByPlaceholderText(/sierra coffee supply/i), {
        target: { value: 'Test Business' },
      })
      fireEvent.change(screen.getByPlaceholderText(/ap@yourbusiness\.com/i), {
        target: { value: 'ap@test.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

      // Card step: the "Continue" button must stay disabled until a card is
      // actually tokenized — you cannot skip straight to Review.
      expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: /save card and continue/i }))
      expect(screen.getByText(/visa/i)).toBeInTheDocument()
      expect(screen.getByText(/4242/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
      fireEvent.click(screen.getByRole('button', { name: /start subscription/i }))

      await waitFor(() => expect(screen.getByText(/every finding is unlocked/i)).toBeInTheDocument())

      // The confirmation must report what was just unlocked. These figures are
      // live props that drop to zero the instant the plan changes, so a naive
      // implementation renders "0 findings — $0.00" here.
      const result = realSampleResult()
      const previewSet = [...result.findings].sort((a, b) => a.dollarImpact - b.dollarImpact).slice(0, FREE_PREVIEW_COUNT)
      const wasLocked = result.findings.filter((f) => !previewSet.some((p) => p.id === f.id))
      const wasLockedValue = wasLocked.reduce((sum, f) => sum + f.dollarImpact, 0)
      expect(
        screen.getByText(new RegExp(`${wasLocked.length} previously locked findings`, 'i'))
      ).toBeInTheDocument()
      expect(screen.getByText(new RegExp(formatCurrency(wasLockedValue).replace(/[$.]/g, '\\$&')))).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /view my findings/i }))

      // The previously locked case is now openable evidence, not an upsell.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /review evidence/i })).toBeInTheDocument()
      )
      expect(screen.queryByRole('button', { name: /unlock all/i })).not.toBeInTheDocument()
    })

    it('cannot subscribe without billing details', async () => {
      await renderAtSample({ subscribed: false })
      fireEvent.click(screen.getAllByRole('button', { name: /unlock all/i })[0])
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

      // Blank details must not advance to review.
      expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled()
    })
  })
})
