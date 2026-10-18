/**
 * Front end + real server, in one process: accounts, data isolation between
 * two people sharing a browser, log-out/log-in round trips, and the legacy
 * (pre-account) audit import.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AuditApp } from '@/AuditApp'
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext'
import { getSampleLedger, sampleLedgerCsv } from '@/data/sampleLedger'
import { mergeImport } from '@/ledger/store'
import { createProject, listLegacyProjects } from '@/ledger/projects'
import { projectSync } from '@/ledger/projectSync'
import { setStorageScope } from '@/lib/storageScope'
import { startLiveServer, type LiveServer } from '@/test/liveServer'
import type { AuthUser } from '@/lib/auth/types'
import { detectFindings } from '@/lib/detection'
import { formatCurrency } from '@/lib/format'

let live: LiveServer

const alice = { firstName: 'Alice', lastName: 'Ng', email: 'alice@example.com', company: 'Ng Co', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true, termsVersion: 't', keepTour: false }
const bob = { ...alice, firstName: 'Bob', lastName: 'Ray', email: 'bob@example.com', company: 'Ray LLC' }

/**
 * Exposes the auth context to the test so it can drive log-in/log-out without
 * page navigations, and mounts the workspace the way App's RequireAuth does:
 * only once there is a user, fresh per account.
 */
let auth: ReturnType<typeof useAuth> | null = null
function Gate() {
  auth = useAuth()
  return (
    <>
      <span data-testid="auth-status">{auth.status}:{auth.user?.email ?? 'nobody'}</span>
      {auth.status === 'ready' && auth.user ? <AuditApp key={auth.user.id} /> : null}
    </>
  )
}

function mountWorkspace() {
  window.history.pushState({}, '', '/audit')
  return render(
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

async function registerViaApi(input: typeof alice) {
  live.newBrowser()
  await live.api('/api/auth/signup', { method: 'POST', json: input })
  const [mail] = await live.inbox(input.email)
  await live.api('/api/auth/verify-email', { method: 'POST', json: { token: live.tokenFrom(mail.link) } })
  // These flows are not about onboarding; onboarding has its own tests below.
  if (!input.keepTour) await live.api('/api/account/onboarding-seen', { method: 'POST' })
  await live.api('/api/auth/logout', { method: 'POST' })
  live.newBrowser()
}

async function logIn(input: typeof alice) {
  await act(async () => {
    const result = await auth!.logIn({ email: input.email, password: input.password, rememberMe: true })
    expect(result.ok).toBe(true)
  })
  await screen.findByText(`ready:${input.email}`)
}

async function logOut() {
  await act(async () => {
    await auth!.logOut()
  })
  await screen.findByText('ready:nobody')
}

async function uploadSampleLedger() {
  fireEvent.click(await screen.findByRole('button', { name: /upload a ledger/i }))
  const input = await screen.findByLabelText(/upload a csv ledger/i)
  fireEvent.change(input, { target: { files: [new File([sampleLedgerCsv], 'ledger.csv', { type: 'text/csv' })] } })
  await screen.findByText('ledger.csv')
  fireEvent.click(screen.getByRole('button', { name: /run the audit/i }))
  await screen.findByRole('heading', { name: 'Up next' })
  await waitFor(() => expect(projectSync.pending).toBe(0))
}

const accountKeys = () => Object.keys(window.localStorage).filter((k) => k.startsWith('reclaim.u.'))

beforeEach(async () => {
  live = await startLiveServer()
  await registerViaApi(alice)
  await registerViaApi(bob)
})
afterEach(async () => {
  cleanup()
  setStorageScope(null)
  projectSync.reset()
  window.localStorage.clear()
  window.sessionStorage.clear()
  await live.close()
})

describe('accounts, data isolation and persistence', () => {
  it('an audit uploaded by Alice is stored on the server for Alice, cached only while she is logged in, and invisible to Bob', async () => {
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    await uploadSampleLedger()

    // server has it, under Alice
    const { body } = await live.api('/api/projects')
    expect(body.projects).toHaveLength(1)
    expect(body.projects[0].name).toBe('ledger')
    expect(accountKeys().some((k) => k.includes(auth!.user!.id))).toBe(true)

    // logging out clears Alice's cache from the browser but not the server
    const aliceId = auth!.user!.id
    await logOut()
    expect(accountKeys().filter((k) => k.includes(aliceId))).toHaveLength(0)
    expect((await live.api('/api/auth/me')).status).toBe(401)

    // Bob, same browser: nothing there
    await logIn(bob)
    expect((await live.api('/api/projects')).body.projects).toHaveLength(0)
    expect(await screen.findByRole('button', { name: /upload a ledger/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Up next' })).not.toBeInTheDocument()
    await logOut()

    // Alice again: her audit comes back from the server with its findings and is shown
    await logIn(alice)
    expect(await screen.findByRole('heading', { name: 'Up next' })).toBeInTheDocument()
    expect((await live.api('/api/projects')).body.projects[0].environment.result.findings.length).toBeGreaterThan(0)
  })

  it('a decision made by Alice survives log-out/log-in and is not visible to Bob', async () => {
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    await uploadSampleLedger()
    fireEvent.click(document.querySelectorAll('.wk-queue-row:not([data-locked])')[0])
    fireEvent.click(await screen.findByRole('button', { name: /^This is real/ }))
    const dialog = await screen.findByTestId('decision-dialog')
    // A ledger-only signal opens an internal review; only an evidenced candidate prepares an authorization.
    fireEvent.click(within(dialog).getByLabelText(/^(Prepare authorization|Open internal review)/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save decision' }))
    await waitFor(() => expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0))
    await waitFor(() => expect(projectSync.pending).toBe(0))
    const { body } = await live.api('/api/projects')
    const states = Object.values(body.projects[0].environment.caseStates) as Array<{ decision: string; history: unknown[] }>
    expect(states.some((s) => s.decision === 'confirmed')).toBe(true)
    expect(states.find((s) => s.decision === 'confirmed')!.history).toHaveLength(1)
    await logOut()
    await logIn(bob)
    expect((await live.api('/api/projects')).body.projects).toHaveLength(0)
  })
})

describe('legacy (pre-account) audits', () => {
  function seedLegacy(name: string) {
    setStorageScope(null)
    const environment = mergeImport(null, { sourceLabel: `${name}.csv`, mode: 'upload', parsed: getSampleLedger() })
    return createProject({ name, sourceLabel: `${name}.csv`, mode: 'upload', environment })
  }

  it('asks the first signed-in person, imports into their account with ids preserved, and never shows them to anyone else', async () => {
    const legacy = seedLegacy('March payments')
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    const dialog = await screen.findByTestId('legacy-import')
    expect(dialog).toHaveTextContent('March payments')
    fireEvent.click(screen.getByRole('button', { name: 'Add to my account' }))
    await waitFor(() => expect(screen.queryByTestId('legacy-import')).not.toBeInTheDocument())

    const { body } = await live.api('/api/projects')
    expect(body.projects.map((p: { id: string }) => p.id)).toEqual([legacy.id])
    expect(listLegacyProjects()).toHaveLength(0)
    expect(await screen.findByRole('heading', { name: 'Up next' })).toBeInTheDocument()

    await logOut()
    await logIn(bob)
    expect(screen.queryByTestId('legacy-import')).not.toBeInTheDocument()
    expect((await live.api('/api/projects')).body.projects).toHaveLength(0)
  })

  it('"Not now" leaves the data untouched and asks again next session; "Delete" removes it for good', async () => {
    seedLegacy('Old ledger')
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    await screen.findByTestId('legacy-import')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByTestId('legacy-import')).not.toBeInTheDocument())
    expect(listLegacyProjects()).toHaveLength(1)
    expect((await live.api('/api/projects')).body.projects).toHaveLength(0)

    // next session
    window.sessionStorage.clear()
    cleanup()
    mountWorkspace()
    await screen.findByText(`ready:${alice.email}`)
    await screen.findByTestId('legacy-import')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(screen.queryByTestId('legacy-import')).not.toBeInTheDocument())
    expect(listLegacyProjects()).toHaveLength(0)
    expect((await live.api('/api/projects')).body.projects).toHaveLength(0)
  })

  it('importing does not duplicate an audit the account already has', async () => {
    const legacy = seedLegacy('Twice')
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    // the server already holds this exact audit for Alice
    await live.api(`/api/projects/${legacy.id}`, { method: 'PUT', json: JSON.parse(JSON.stringify({ ...legacy, environment: JSON.parse(JSON.stringify(legacy.environment)) })) })
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my account' }))
    await waitFor(() => expect(screen.queryByTestId('legacy-import')).not.toBeInTheDocument())
    expect((await live.api('/api/projects')).body.projects).toHaveLength(1)
    expect(listLegacyProjects()).toHaveLength(0)
  })
})

describe('session bootstrap', () => {
  it('a valid session cookie restores the account and its audits before the workspace renders', async () => {
    await live.api('/api/auth/login', { method: 'POST', json: { email: alice.email, password: alice.password } })
    await live.api('/api/projects/p-seed', {
      method: 'PUT',
      json: { id: 'p-seed', name: 'Seeded', sourceLabel: 's.csv', mode: 'upload', createdAt: 1, updatedAt: 2, environment: JSON.parse(JSON.stringify(mergeImport(null, { sourceLabel: 's.csv', mode: 'upload', parsed: getSampleLedger() }))) },
    })
    mountWorkspace()
    await screen.findByText(`ready:${alice.email}`)
    expect(await screen.findByRole('heading', { name: 'Up next' })).toBeInTheDocument()
    const user = auth!.user as AuthUser
    expect(user.isGuest).toBe(false)
  })

  it('an expired session means logged out, with no stale cache', async () => {
    await live.api('/api/auth/login', { method: 'POST', json: { email: alice.email, password: alice.password } })
    live.app.db.prepare('UPDATE sessions SET expires_at = 0').run()
    mountWorkspace()
    await screen.findByText('ready:nobody')
    expect(accountKeys()).toHaveLength(0)
  })
})

describe('onboarding and plans', () => {
  const carol = { ...alice, firstName: 'Carol', lastName: 'Diaz', email: 'carol@example.com', keepTour: true }

  it('a new account goes through onboarding once; its answers are saved on the account and it hands over to the ledger choice', async () => {
    await registerViaApi(carol)
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(carol)
    const flow = await screen.findByTestId('onboarding')
    expect(flow).toHaveTextContent('Step 1 of 8')
    expect(flow).toHaveTextContent('Welcome, Carol')
    fireEvent.click(within(flow).getByRole('button', { name: /let’s go/i }))

    // goals: nothing picked yet means the button offers to skip; picking changes it
    expect(flow).toHaveTextContent('Step 2 of 8')
    expect(within(flow).getByRole('button', { name: /skip this/i })).toBeInTheDocument()
    fireEvent.click(within(flow).getByRole('checkbox', { name: /duplicate payments/i }))
    fireEvent.click(within(flow).getByRole('checkbox', { name: /unpaid invoices/i }))
    expect(flow).toHaveTextContent(/today’s checks read the payments you’ve made/i)
    // "not sure yet" stands alone
    fireEvent.click(within(flow).getByRole('checkbox', { name: /not sure yet/i }))
    expect(within(flow).getByRole('checkbox', { name: /duplicate payments/i })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(flow).getByRole('checkbox', { name: /unpaid invoices/i }))
    fireEvent.click(within(flow).getByRole('checkbox', { name: /duplicate payments/i }))
    expect(within(flow).getByRole('checkbox', { name: /not sure yet/i })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(flow).getByRole('button', { name: /^continue/i }))

    // business: the company from sign-up is already filled in
    expect(within(flow).getByLabelText('Business name')).toHaveValue(carol.company)
    fireEvent.change(within(flow).getByLabelText(/what kind of work/i), { target: { value: 'Paper distribution' } })
    fireEvent.click(within(flow).getByRole('radio', { name: 'I run finance' }))
    fireEvent.click(within(flow).getByRole('button', { name: /^continue/i }))

    // tools: only CSV works today, and the screen says so
    expect(within(flow).getByRole('checkbox', { name: /quickbooks online/i })).toHaveTextContent(/coming later/i)
    expect(within(flow).getByRole('checkbox', { name: /spreadsheets or csv/i })).toHaveTextContent(/works today/i)
    fireEvent.click(within(flow).getByRole('checkbox', { name: /quickbooks online/i }))
    fireEvent.click(within(flow).getByRole('button', { name: /^continue/i }))

    // how it works, then autonomy: the automatic option is marked as not built yet
    expect(flow).toHaveTextContent('Step 5 of 8')
    fireEvent.click(within(flow).getByRole('button', { name: /^continue/i }))
    fireEvent.click(within(flow).getByRole('radio', { name: /follow up on what i approve/i }))
    expect(flow).toHaveTextContent(/needs your email connected/i)
    fireEvent.click(within(flow).getByRole('radio', { name: /draft it for me/i }))
    fireEvent.click(within(flow).getByRole('button', { name: /^continue/i }))

    // data: an account's audits are saved to the account; AI only when asked
    expect(flow).toHaveTextContent('With your Reclaim account')
    expect(flow).toHaveTextContent(/only if you ask/i)
    fireEvent.click(within(flow).getByRole('button', { name: /^continue/i }))

    // purpose is optional; a suggestion fills it in
    fireEvent.click(within(flow).getByRole('button', { name: 'More breathing room' }))
    expect(within(flow).getByLabelText(/this money would mean/i)).toHaveValue('More breathing room.')
    fireEvent.click(within(flow).getByRole('button', { name: /continue to ledger setup/i }))

    await waitFor(() => expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument())
    await screen.findByRole('button', { name: /upload a ledger/i })
    const me = (await live.api('/api/auth/me')).body.user
    expect(me.onboardingSeenAt).toBeTypeOf('number')
    expect(me.onboardingProfile).toMatchObject({
      goals: ['unpaid', 'duplicates'],
      businessName: carol.company,
      work: 'Paper distribution',
      role: 'finance',
      tools: ['quickbooks'],
      autonomy: 'draft',
      purpose: 'More breathing room.',
    })

    // next session: straight to the ledger choice
    cleanup()
    mountWorkspace()
    await screen.findByText(`ready:${carol.email}`)
    await screen.findByRole('button', { name: /upload a ledger/i })
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  })

  it('skipping onboarding is remembered too, with whatever was answered', async () => {
    const dana = { ...carol, firstName: 'Dana', email: 'dana@example.com' }
    await registerViaApi(dana)
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(dana)
    const flow = await screen.findByTestId('onboarding')
    fireEvent.click(within(flow).getByRole('button', { name: /let’s go/i }))
    fireEvent.click(within(flow).getByRole('checkbox', { name: /credits or refunds/i }))
    fireEvent.click(within(flow).getByRole('button', { name: 'Skip setup' }))
    await waitFor(() => expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument())
    await screen.findByRole('button', { name: /upload a ledger/i })
    const me = (await live.api('/api/auth/me')).body.user
    expect(me.onboardingSeenAt).toBeTypeOf('number')
    expect(me.onboardingProfile.goals).toEqual(['credits'])
  })

  it('a Free account sees the three lowest-value findings in full and the rest locked; Pro sees everything', async () => {
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    await uploadSampleLedger()
    // Overview: the rows Free can open are the cheapest ones; bigger ones are marked Pro
    const rows = () => [...document.querySelectorAll<HTMLElement>('.wk-queue-row, .wk-grid-row')]
    const unlocked = () => rows().filter((r) => !r.hasAttribute('data-locked'))
    const lockedRows = () => rows().filter((r) => r.hasAttribute('data-locked'))
    const amounts = (list: HTMLElement[]) => list.map((r) => Number(r.dataset.amount ?? r.querySelector('.wk-cell-money')!.textContent!.replace(/[$,]/g, '')))
    expect(unlocked().length).toBeLessThanOrEqual(3)
    expect(lockedRows().length).toBeGreaterThan(0)
    const nav = screen.getByRole('navigation', { name: /workspace/i })
    fireEvent.click(within(nav).getByRole('button', { name: /^Findings/ }))
    await screen.findByRole('heading', { name: 'Findings', level: 1 })
    expect(unlocked()).toHaveLength(3)
    // The three shown are exactly the three cheapest findings the engine produced.
    const all = detectFindings(getSampleLedger().records).findings.toSorted((a, b) => a.dollarImpact - b.dollarImpact)
    expect(amounts(unlocked()).sort((a, b) => a - b)).toEqual(all.slice(0, 3).map((f) => f.dollarImpact))
    // Locked rows are not in the page at all: no vendor, no amount, no invoice — hiding them with CSS is not access control.
    const lockedText = lockedRows().map((n) => `${n.textContent} ${n.getAttribute('aria-label')} ${n.dataset.amount ?? ''}`).join(' ')
    for (const f of all.slice(3)) {
      if (!all.slice(0, 3).some((v) => v.vendor === f.vendor)) expect(lockedText).not.toContain(f.vendor)
      expect(lockedText).not.toContain(formatCurrency(f.dollarImpact))
      for (const r of f.relatedRecords) if (r.invoiceNumber) expect(lockedText).not.toContain(r.invoiceNumber)
    }
    fireEvent.click(within(nav).getByRole('button', { name: /^Audits/ }))
    expect(await screen.findByTestId('audit-usage')).toHaveTextContent('one audit per ledger')
    expect(screen.getByTestId('audits-explainer')).toHaveTextContent('What an audit is')
    // Settings shows the plan and the dev switch; flipping to Pro unlocks everything
    fireEvent.click(within(nav).getByRole('button', { name: /^Settings/ }))
    expect(await screen.findByTestId('plan-panel')).toHaveTextContent('Free')
    expect(screen.getByTestId('plan-panel')).toHaveTextContent('three smallest findings')
    fireEvent.click(screen.getByRole('button', { name: 'Dev: switch to Growth' }))
    await waitFor(() => expect(screen.getByTestId('plan-panel')).toHaveTextContent('Growth · $15 / month + 10% of what’s recovered'))
    fireEvent.click(within(nav).getByRole('button', { name: /^Findings/ }))
    await screen.findByRole('heading', { name: 'Findings', level: 1 })
    // The plan label and the entitlements that unlock findings arrive separately; wait for the unlock itself.
    await waitFor(() => expect(lockedRows()).toHaveLength(0))
    expect(unlocked().length).toBeGreaterThan(3)
  })

  it('on Free, uploading a ledger again is flagged before it runs, and paid plans lead to checkout', async () => {
    mountWorkspace()
    await screen.findByText('ready:nobody')
    await logIn(alice)
    await uploadSampleLedger()
    // the same file again, under a new name
    fireEvent.click(screen.getByRole('button', { name: /^Start an audit/ }))
    const input = await screen.findByLabelText(/upload a csv ledger/i)
    fireEvent.change(input, { target: { files: [new File([sampleLedgerCsv], 'ledger-final-v2.csv', { type: 'text/csv' })] } })
    await screen.findByText('ledger-final-v2.csv')
    fireEvent.click(screen.getByRole('button', { name: /run the audit/i }))
    expect(await screen.findByTestId('import-flag')).toHaveTextContent('already uploaded')
    expect((await live.api('/api/projects')).body.projects).toHaveLength(1)
    // the plans say what they cost, and choosing one is "coming soon"
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    const nav = screen.getByRole('navigation', { name: /workspace/i })
    fireEvent.click(within(nav).getByRole('button', { name: /^Settings/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'See Growth and Flat' }))
    const dialog = await screen.findByTestId('upgrade-dialog')
    expect(within(dialog).getByTestId('plan-growth')).toHaveTextContent('$15 / month + 10% of what’s recovered')
    expect(within(dialog).getByTestId('plan-flat')).toHaveTextContent('$50 / month, no success fee')
    // Choosing a paid plan goes to checkout; nothing changes on the account until billing is live.
    expect(within(dialog).getByRole('link', { name: 'Continue with Growth' })).toHaveAttribute('href', '/checkout?plan=growth')
    expect(within(dialog).getByRole('link', { name: 'Continue with Flat' })).toHaveAttribute('href', '/checkout?plan=flat')
    expect((await live.api('/api/auth/me')).body.user.plan).toBe('free')
  })

})
