// @vitest-environment jsdom-server
/**
 * Front end + real server: accepting changed Terms, and deleting an account
 * from Settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext'
import { TERMS_VERSION } from '@/legal/terms'
import { TermsUpdateGate } from '@/legal/TermsUpdateGate'
import { AccountData } from '@/workspace/views/AccountData'
import { projectSync } from '@/ledger/projectSync'
import { setStorageScope } from '@/lib/storageScope'
import { startLiveServer, type LiveServer } from '@/test/liveServer'

let live: LiveServer
const person = { firstName: 'Alice', lastName: 'Ng', email: 'alice@example.com', company: 'Ng Co', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true }

async function register(termsVersion: string) {
  live.newBrowser()
  await live.api('/api/auth/signup', { method: 'POST', json: { ...person, termsVersion } })
  const [mail] = await live.inbox(person.email)
  await live.api('/api/auth/verify-email', { method: 'POST', json: { token: live.tokenFrom(mail.link) } })
  await live.api('/api/account/onboarding-seen', { method: 'POST' })
}

let auth: ReturnType<typeof useAuth> | null = null
function Probe() {
  auth = useAuth()
  return <span data-testid="who">{auth.status}:{auth.user?.email ?? 'nobody'}</span>
}

beforeEach(async () => {
  window.localStorage.clear()
  setStorageScope(null)
  projectSync.reset()
  window.history.pushState({}, '', '/audit')
  live = await startLiveServer()
})
afterEach(async () => {
  await live.close()
})

describe('changed Terms', () => {
  it('asks an account on an older version to accept the current one, and records it', async () => {
    await register('2025-01-old')
    render(
      <AuthProvider>
        <Probe />
        <TermsUpdateGate />
      </AuthProvider>
    )
    await screen.findByText(`ready:${person.email}`)
    const dialog = await screen.findByTestId('terms-update')
    expect(dialog).toHaveTextContent('You last accepted version 2025-01-old')

    const accept = screen.getByRole('button', { name: /accept and continue/i })
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree/i }))
    fireEvent.click(accept)
    await waitFor(() => expect(screen.queryByTestId('terms-update')).not.toBeInTheDocument())
    expect((await live.api('/api/auth/me')).body.user.termsVersion).toBe(TERMS_VERSION)
  })

  it('stays out of the way of a current account and of the pages being agreed to', async () => {
    await register(TERMS_VERSION)
    render(
      <AuthProvider>
        <Probe />
        <TermsUpdateGate />
      </AuthProvider>
    )
    await screen.findByText(`ready:${person.email}`)
    expect(screen.queryByTestId('terms-update')).not.toBeInTheDocument()
  })

  it('lets someone read the Terms before accepting', async () => {
    await register('2025-01-old')
    window.history.pushState({}, '', '/terms')
    render(
      <AuthProvider>
        <Probe />
        <TermsUpdateGate />
      </AuthProvider>
    )
    await screen.findByText(`ready:${person.email}`)
    expect(screen.queryByTestId('terms-update')).not.toBeInTheDocument()
  })
})

describe('Settings → Delete my account', () => {
  it('needs the account email typed, then deletes the account and this browser’s cache of it', async () => {
    await register(TERMS_VERSION)
    const onDeleted = vi.fn()
    render(
      <AuthProvider>
        <Probe />
        <AccountData onDeleted={onDeleted} />
      </AuthProvider>
    )
    await screen.findByText(`ready:${person.email}`)
    const userId = auth!.user!.id
    window.localStorage.setItem(`reclaim.u.${userId}.projects`, '[]')

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const confirm = await screen.findByRole('button', { name: 'Delete my account' })
    const field = screen.getByLabelText(/to confirm/i)
    fireEvent.change(field, { target: { value: 'someone@else.com' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(field, { target: { value: 'Alice@Example.com' } })
    await act(async () => {
      fireEvent.click(confirm)
    })

    await screen.findByText('ready:nobody')
    expect(onDeleted).toHaveBeenCalled()
    expect(window.localStorage.getItem(`reclaim.u.${userId}.projects`)).toBeNull()
    live.newBrowser()
    const login = await live.api('/api/auth/login', { method: 'POST', json: { email: person.email, password: person.password } })
    expect(login.status).toBe(401)
  })

  it('is not offered to a guest', async () => {
    render(
      <AuthProvider>
        <Probe />
        <AccountData />
      </AuthProvider>
    )
    await screen.findByText('ready:nobody')
    act(() => auth!.continueAsGuest())
    expect(screen.queryByTestId('account-data')).not.toBeInTheDocument()
  })
})
