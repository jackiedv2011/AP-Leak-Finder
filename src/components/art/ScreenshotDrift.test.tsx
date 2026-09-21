import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthLayout } from '@/pages/AuthLayout'

function mockMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

describe('ScreenshotDrift', () => {
  afterEach(() => {
    // @ts-expect-error jsdom has no matchMedia of its own
    delete window.matchMedia
  })

  it('renders an inert, hidden art layer behind the auth screens', () => {
    mockMatchMedia(false)
    const { container, getByRole } = render(
      <AuthLayout>
        <form aria-label="Log in" />
      </AuthLayout>,
    )
    const layer = container.querySelector('.wk-drift')
    expect(layer).not.toBeNull()
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).not.toHaveAttribute('data-static')
    expect(layer!.querySelectorAll('img').length).toBeGreaterThanOrEqual(5)
    for (const img of layer!.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '')
    expect(getByRole('form', { name: 'Log in' })).toBeInTheDocument()
  })

  it('freezes in place when the viewer prefers reduced motion', () => {
    mockMatchMedia(true)
    const { container } = render(<AuthLayout>x</AuthLayout>)
    expect(container.querySelector('.wk-drift')).toHaveAttribute('data-static', 'true')
  })

  it('renders without matchMedia at all', () => {
    const { container } = render(<AuthLayout>x</AuthLayout>)
    expect(container.querySelector('.wk-drift')).not.toBeNull()
  })
})
