import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import App from '@/App'
import { continueAsGuest, logOut } from '@/lib/auth/localAuthService'
import { redirectTo } from '@/pages/authRedirect'

vi.mock('@/pages/authRedirect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pages/authRedirect')>()),
  redirectTo: vi.fn(),
}))

function setLocation(path: string) {
  window.history.pushState({}, '', path)
}

describe('App routes', () => {
  afterEach(() => {
    cleanup()
    logOut()
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.mocked(redirectTo).mockClear()
  })

  it('sends a visitor with no session from the workspace to log in, remembering where they were going', async () => {
    setLocation('/audit?entry=sample')
    render(<App />)

    await screen.findByText(/loading reclaim/i)
    // the gate waits for the server to say there is no session before redirecting
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('/login?next=%2Faudit%3Fentry%3Dsample'))
  })

  it('opens the scanner upload screen from /scanner for a logged-in session', async () => {
    continueAsGuest()
    setLocation('/scanner')

    render(<App />)

    expect(await screen.findByLabelText(/upload a csv ledger/i, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('serves the log-in form to a visitor with no session', async () => {
    setLocation('/login')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
  })

  it('serves the sign-up form with every required field and the terms agreement', async () => {
    setLocation('/signup')
    render(<App />)

    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument()
    for (const label of ['First name', 'Last name', 'Work email', 'Company name', 'Password', 'Confirm password']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    const agreement = screen.getByRole('checkbox', { name: /terms of service/i })
    expect(agreement).not.toBeChecked()
    const label = agreement.closest('label') as HTMLElement
    expect(within(label).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(within(label).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('publishes the draft legal pages', async () => {
    setLocation('/privacy')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/draft for internal review/i)).toBeInTheDocument()

    cleanup()
    setLocation('/terms')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Terms of Service' })).toBeInTheDocument()
  })
})
