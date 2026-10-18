import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { MagneticLink } from '@/components/landing/MagneticLink'

describe('MagneticLink', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('keeps keyboard navigation immediate instead of inserting a pressed-state delay', () => {
    render(
      <MagneticLink href="#sample-audit" pendingLabel="Opening sample audit…">
        Run sample audit
      </MagneticLink>
    )

    const link = screen.getByRole('link', { name: 'Run sample audit' })
    const event = createEvent.click(link, { button: 0, detail: 0 })
    fireEvent(link, event)

    expect(event.defaultPrevented).toBe(false)
    expect(link).toHaveTextContent('Run sample audit')
    expect(link).not.toHaveAttribute('aria-disabled')
  })

  it('shows brief pointer feedback before following a full-page navigation', () => {
    vi.useFakeTimers()
    render(
      <MagneticLink href="#sample-audit" pendingLabel="Opening sample audit…">
        Run sample audit
      </MagneticLink>
    )

    const link = screen.getByRole('link', { name: 'Run sample audit' })
    fireEvent.click(link, { button: 0, detail: 1 })

    expect(link).toHaveTextContent('Opening sample audit…')
    expect(link).toHaveAttribute('aria-disabled', 'true')
  })
})
