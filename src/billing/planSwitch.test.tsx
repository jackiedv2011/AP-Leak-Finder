// @vitest-environment jsdom-server
/**
 * Plan changes, front end + real server + fake Stripe in one process: the
 * workspace unlocks the moment a subscription starts and locks again when a
 * cancelled period ends — without remounting or reloading — and checkout
 * starts, confirms, switches or refuses a plan the way a person would see it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuditApp } from '@/AuditApp'
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext'
import { sampleLedgerCsv } from '@/data/sampleLedger'
import { projectSync } from '@/ledger/projectSync'
import { setStorageScope } from '@/lib/storageScope'
import { startLiveServer, type LiveServer } from '@/test/liveServer'
import { FakeStripe } from '../../server/fakeStripe.ts'
import { subscribe } from '@/billing/api'
import { CheckoutPage } from '@/pages/CheckoutPage'

// Stripe.js runs in Stripe's iframe and can't load in jsdom. This stand-in
// turns the "card" into the payment method id the test chooses, exactly where
// Stripe.js would hand one back.
const card = vi.hoisted(() => ({ paymentMethodId: 'pm_card_visa', onAuthenticate: (_secret: string) => {} }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  CardElement: ({ onChange }: { onChange: (e: { complete: boolean }) => void }) => (
    <button type="button" onClick={() => onChange({ complete: true })}>
      Fill test card
    </button>
  ),
  useElements: () => ({ getElement: () => ({}) }),
  useStripe: () => ({
    createPaymentMethod: async () => ({ paymentMethod: { id: card.paymentMethodId, card: { brand: 'visa', last4: '4242' } } }),
    confirmCardPayment: async (secret: string) => {
      card.onAuthenticate(secret)
      return {}
    },
  }),
}))
vi.mock('@/billing/stripe', () => ({ getStripe: () => Promise.resolve(null), STRIPE_IS_TEST_MODE: true, STRIPE_IS_DEMO: true }))

let live: LiveServer
let stripe: FakeStripe
let auth: ReturnType<typeof useAuth> | null = null
const pat = { firstName: 'Pat', lastName: 'Lee', email: 'pat@example.com', company: 'Lee Co', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true, termsVersion: 't' }

function Gate({ children }: { children: (user: string) => ReactNode }) {
  auth = useAuth()
  return (
    <>
      <span data-testid="auth-status">
        {auth.status}:{auth.user?.email ?? 'nobody'}
      </span>
      {auth.status === 'ready' && auth.user ? children(auth.user.id) : null}
    </>
  )
}

async function signedInAt(path: string, page: (id: string) => ReactNode) {
  window.history.pushState({}, '', path)
  render(
    <AuthProvider>
      <Gate>{page}</Gate>
    </AuthProvider>
  )
  await screen.findByText(`ready:${pat.email}`)
}

const rows = () => [...document.querySelectorAll<HTMLElement>('.wk-queue-row, .wk-grid-row')]
const lockedRows = () => rows().filter((r) => r.hasAttribute('data-locked'))
const nav = () => screen.getByRole('navigation', { name: /workspace/i })
async function openFindings() {
  fireEvent.click(within(nav()).getByRole('button', { name: /^Findings/ }))
  await screen.findByRole('heading', { name: 'Findings', level: 1 })
}
const serverPlan = async () => (await live.api('/api/auth/me')).body.user.plan

beforeEach(async () => {
  stripe = new FakeStripe()
  live = await startLiveServer({ stripe })
  // A signed-in session with the tour already seen; email verification is a separate flow.
  await live.api('/api/auth/signup', { method: 'POST', json: pat })
  const [mail] = await live.inbox(pat.email)
  await live.api('/api/auth/verify-email', { method: 'POST', json: { token: live.tokenFrom(mail.link) } })
  await live.api('/api/account/onboarding-seen', { method: 'POST' })
  card.paymentMethodId = 'pm_card_visa'
  card.onAuthenticate = () => {}
})

afterEach(async () => {
  cleanup()
  setStorageScope(null)
  projectSync.reset()
  window.localStorage.clear()
  window.sessionStorage.clear()
  await live.close()
})

describe('the workspace follows the plan', () => {
  it('a Free account unlocks after upgrading and locks again when the cancelled period ends, without a reload', async () => {
    await signedInAt('/audit', (id) => <AuditApp key={id} />)
    fireEvent.click(await screen.findByRole('button', { name: /upload a ledger/i }))
    fireEvent.change(await screen.findByLabelText(/upload a csv ledger/i), { target: { files: [new File([sampleLedgerCsv], 'ledger.csv', { type: 'text/csv' })] } })
    await screen.findByText('ledger.csv')
    fireEvent.click(screen.getByRole('button', { name: /run the audit/i }))
    await screen.findByRole('heading', { name: 'Up next' })
    await openFindings()
    expect(lockedRows().length).toBeGreaterThan(0)
    const workspace = document.querySelector('.wk')

    // What checkout does once Stripe.js has a payment method: subscribe, then re-read the account.
    await act(async () => {
      expect((await subscribe('growth', 'pm_card_visa')).ok).toBe(true)
      await auth!.refreshAccount()
    })
    await waitFor(() => expect(lockedRows()).toHaveLength(0))
    expect(document.querySelector('.wk')).toBe(workspace)

    // Settings: plan, next bill date, and cancel.
    fireEvent.click(within(nav()).getByRole('button', { name: /^Settings/ }))
    const panel = await screen.findByTestId('plan-panel')
    expect(panel).toHaveTextContent('Growth · $15 / month')
    await waitFor(() => expect(screen.getByTestId('plan-renewal')).toHaveTextContent(/^Next bill: \w{3} \d{1,2}, \d{4}, plus any success fees\.$/))
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel plan' }))
    expect(screen.getByTestId('plan-confirm')).toHaveTextContent('You keep every paid feature until')
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel Growth' }))
    await waitFor(() => expect(screen.getByTestId('plan-renewal')).toHaveTextContent('Cancelled. Growth stays on until'))
    expect(within(panel).getByRole('button', { name: 'Keep Growth' })).toBeInTheDocument()

    // Still paid until the period ends.
    await openFindings()
    expect(lockedRows()).toHaveLength(0)

    // The period ends at Stripe; the webhook moves the account to Free; the tab notices on focus.
    await act(async () => {
      stripe.endPeriod()
      await live.deliverStripeEvents()
    })
    expect(await serverPlan()).toBe('free')
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(lockedRows().length).toBeGreaterThan(0))
    fireEvent.click(within(nav()).getByRole('button', { name: /^Settings/ }))
    expect(await screen.findByTestId('plan-panel')).toHaveTextContent('Free')
    expect(document.querySelector('.wk')).toBe(workspace)
  })

  it('Change plan in Settings switches Growth to Flat at once; a failed payment keeps Growth with a plain message', async () => {
    await live.api('/api/billing/subscribe', { method: 'POST', json: { plan: 'growth', paymentMethodId: 'pm_card_visa' } })
    await signedInAt('/audit', (id) => <AuditApp key={id} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Run the sample' }))
    await screen.findByRole('heading', { name: 'Up next' })
    fireEvent.click(within(nav()).getByRole('button', { name: /^Settings/ }))
    const panel = await screen.findByTestId('plan-panel')
    await within(panel).findByRole('button', { name: 'Change plan' })

    stripe.customers.forEach((c) => (c.defaultPaymentMethod = 'pm_card_chargeDeclined'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Change plan' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Switch to Flat' }))
    expect(await screen.findByTestId('plan-error')).toHaveTextContent('didn’t go through, so your plan didn’t change. You’re still on Growth.')
    expect(panel).toHaveTextContent('Growth · $15 / month')

    stripe.customers.forEach((c) => (c.defaultPaymentMethod = 'pm_card_visa'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Change plan' }))
    expect(screen.getByTestId('plan-confirm')).toHaveTextContent('prorated difference')
    fireEvent.click(within(panel).getByRole('button', { name: 'Switch to Flat' }))
    await waitFor(() => expect(panel.querySelector('.wk-plan-pill')).toHaveTextContent('Flat'))
    expect(screen.queryByTestId('plan-confirm')).not.toBeInTheDocument()
    expect(screen.queryByTestId('success-fee')).not.toBeInTheDocument()
    expect(await serverPlan()).toBe('flat')
  })
})

describe('checkout', () => {
  async function pay() {
    fireEvent.change(screen.getByLabelText('Name on card'), { target: { value: 'Pat Lee' } })
    fireEvent.change(screen.getByLabelText('ZIP / postal code'), { target: { value: '94107' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fill test card' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /^Subscribe/ }))
  }

  it('a test card starts Growth and the account unlocks', async () => {
    await signedInAt('/checkout?plan=growth', () => <CheckoutPage />)
    expect(auth!.entitlements?.limits.findingsVisible).toBe(3)
    await pay()
    expect(await screen.findByTestId('checkout-done')).toHaveTextContent('You’re on Growth')
    expect(screen.getByTestId('checkout-done')).toHaveTextContent('VISA ending 4242')
    expect(auth!.user?.plan).toBe('growth')
    expect(auth!.entitlements?.limits).toMatchObject({ findingsVisible: null, aiDrafts: true, fullLetters: true, advancedReports: true })
  })

  it('a declined card says so plainly and leaves the account on Free', async () => {
    card.paymentMethodId = 'pm_card_chargeDeclined'
    await signedInAt('/checkout?plan=growth', () => <CheckoutPage />)
    await pay()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined, so nothing was charged. You’re still on Free.')
    expect(screen.queryByTestId('checkout-done')).not.toBeInTheDocument()
    expect(auth!.user?.plan).toBe('free')
    expect(await serverPlan()).toBe('free')
  })

  it('a card that needs 3-D Secure switches once the bank approves', async () => {
    card.paymentMethodId = 'pm_card_authenticationRequired'
    card.onAuthenticate = () => stripe.completeAuthentication([...stripe.subscriptions.keys()].at(-1)!)
    await signedInAt('/checkout?plan=flat', () => <CheckoutPage />)
    await pay()
    expect(await screen.findByTestId('checkout-done')).toHaveTextContent('You’re on Flat')
    expect(await serverPlan()).toBe('flat')
  })

  it('a paid account choosing the other plan switches without a card', async () => {
    await live.api('/api/billing/subscribe', { method: 'POST', json: { plan: 'flat', paymentMethodId: 'pm_card_visa' } })
    await signedInAt('/checkout?plan=growth', () => <CheckoutPage />)
    fireEvent.click(within(await screen.findByTestId('checkout-switch')).getByRole('button', { name: 'Switch to Growth' }))
    expect(await screen.findByTestId('checkout-done')).toHaveTextContent('You’re on Growth')
    expect(auth!.user?.plan).toBe('growth')
  })
})
