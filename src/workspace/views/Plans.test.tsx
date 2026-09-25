import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Plans } from '@/workspace/views/Plans'
import { Facts } from '@/workspace/views/Reports'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Plans', () => {
  it('shows the three tracks with their prices', () => {
    render(<Plans onStartAudit={() => {}} />)
    expect(screen.getByTestId('plans-free')).toHaveTextContent('$0')
    expect(screen.getByTestId('plans-growth')).toHaveTextContent('$19.99 / month + 15% of what’s recovered')
    expect(screen.getByTestId('plans-flat')).toHaveTextContent('$100 / month, no success fee')
    expect(screen.getByTestId('plans-growth')).toHaveTextContent('Automatic sending through your Gmail — coming soon')
  })

  it('Free confirms in place and leads straight to an upload', () => {
    const onStartAudit = vi.fn()
    render(<Plans onStartAudit={onStartAudit} />)
    fireEvent.click(within(screen.getByTestId('plans-free')).getByRole('button'))
    const dialog = screen.getByTestId('free-confirmed')
    expect(dialog).toHaveTextContent('You’re all set on Free')
    expect(dialog).toHaveTextContent('One audit per ledger')
    fireEvent.click(within(dialog).getByRole('button', { name: /Upload a ledger/ }))
    expect(onStartAudit).toHaveBeenCalled()
  })

  it('Growth and Flat continue to checkout (via sign-up for someone without an account)', () => {
    const location = { href: '' }
    vi.stubGlobal('location', location)
    render(<Plans onStartAudit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Continue with Growth/ }))
    expect(location.href).toBe(`/signup?next=${encodeURIComponent('/checkout?plan=growth')}`)
    fireEvent.click(screen.getByRole('button', { name: /Continue with Flat/ }))
    expect(location.href).toBe(`/signup?next=${encodeURIComponent('/checkout?plan=flat')}`)
  })
})

describe('account facts', () => {
  it('a long email wraps inside its own column and breaks after the @', () => {
    render(<Facts rows={[['Email', 'jackiedv2011@gmail.com'], ['Company', 'IA NEXUS']]} />)
    const email = screen.getByText((_, el) => el?.tagName === 'DD' && el.textContent === 'jackiedv2011@​gmail.com')
    expect(email).toHaveStyle({ overflowWrap: 'anywhere' })
    expect(email.parentElement).toHaveStyle({ minWidth: '0' })
  })
})
