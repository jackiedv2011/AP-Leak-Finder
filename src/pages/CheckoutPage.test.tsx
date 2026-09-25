import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { CheckoutPage } from '@/pages/CheckoutPage'

function mountAt(search: string) {
  window.history.pushState({}, '', `/checkout${search}`)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Not logged in.' }), { status: 401, headers: { 'Content-Type': 'application/json' } })))
  return render(
    <AuthProvider>
      <CheckoutPage />
    </AuthProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('checkout', () => {
  it('summarises Growth honestly: $19.99 due today, 15% only on money recovered, test mode stated', async () => {
    mountAt('?plan=growth')
    expect(await screen.findByRole('heading', { name: 'Start Reclaim Growth' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary', { name: 'Order summary' })
    expect(summary).toHaveTextContent('Due today$19.99')
    expect(summary).toHaveTextContent('15% of money recovered')
    expect(summary).toHaveTextContent('never on findings, promises or unused credits')
    expect(screen.getByTestId('checkout-test-mode')).toHaveTextContent('no card will be charged')
  })

  it('Flat has no success fee', async () => {
    mountAt('?plan=flat')
    const summary = await screen.findByRole('complementary', { name: 'Order summary' })
    expect(summary).toHaveTextContent('Due today$100.00')
    expect(summary).toHaveTextContent('Success feeNone')
  })

  it('someone without an account is asked to create one and comes back to this checkout', async () => {
    mountAt('?plan=growth')
    const create = await screen.findByRole('link', { name: 'Create an account' })
    expect(create).toHaveAttribute('href', `/signup?next=${encodeURIComponent('/checkout?plan=growth')}`)
    expect(screen.queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument()
  })

  it('a link without a paid plan goes back to Plans', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', { ...window.location, search: '?plan=free', replace })
    render(
      <AuthProvider>
        <CheckoutPage />
      </AuthProvider>
    )
    expect(replace).toHaveBeenCalledWith('/audit?mode=plans')
  })
})
