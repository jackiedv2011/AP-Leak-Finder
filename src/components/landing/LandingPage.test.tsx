import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

const motionPreference = vi.hoisted(() => ({ reduce: false }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => motionPreference.reduce }
})

afterEach(() => {
  motionPreference.reduce = false
  window.localStorage.clear()
})

describe('LandingPage', () => {
  it('makes a real ledger review primary and keeps the sample easy to reach', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Find the payments worth a second look.' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Review your ledger' })[0]).toHaveAttribute('href', '/audit?entry=upload')
    expect(screen.getByRole('link', { name: 'Explore a sample case' })).toHaveAttribute('href', '/audit?entry=sample')
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security')
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '#pricing')
  })

  it('tells the value, accounting fit, privacy, recovery, and pricing story without fake proof', () => {
    render(<LandingPage />)

    expect(screen.getByText('A payment only tells part of the story. The rest lives in the records around it.')).toBeInTheDocument()
    expect(screen.getAllByText('See the payment. Keep the reason.').length).toBeGreaterThan(0)
    expect([...document.querySelectorAll('.motto-word')].map((word) => word.textContent?.trim())).toEqual([
      'A', 'payment', 'only', 'tells', 'part', 'of', 'the', 'story.', 'The', 'rest', 'lives', 'in', 'the', 'records', 'around', 'it.',
    ])
    expect(screen.getByRole('heading', { level: 2, name: 'A duplicate can look ordinary.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'A finding only matters if you can act on it.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Keep QuickBooks or Xero. Add a recovery layer.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Your ledger stays on this device, in this browser. It is never uploaded to our servers.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'If the money does not come back, you do not pay.' })).toBeInTheDocument()
    expect(screen.getByText('Illustrative sample data, not a customer recovery claim.')).toBeInTheDocument()
    expect(screen.getByText('No silent writeback')).toBeInTheDocument()
    expect(screen.getByText('Delete on demand')).toBeInTheDocument()
    expect(screen.getByText('$0 fee')).toBeInTheDocument()
    expect(screen.queryByText(/trusted by/i)).not.toBeInTheDocument()
  })

  it('turns the header action into the most relevant saved-work destination', () => {
    window.localStorage.setItem('reclaim.projects.active.v1', 'project_1')
    window.localStorage.setItem('reclaim.projects.index.v1', JSON.stringify([{
      id: 'project_1', name: 'March review', sourceLabel: 'march.csv', mode: 'upload', createdAt: 1, updatedAt: 2,
      recordCount: 80, openCaseCount: 2, recoveryValue: 6800, recoveryActiveCount: 1, recoveryActiveValue: 6800,
    }]))

    render(<LandingPage />)

    const actions = screen.getAllByRole('link', { name: /Resume recovery/ })
    expect(actions[0]).toHaveAttribute('href', '/audit?project=project_1&mode=recovery')
    expect(actions[0]).toHaveTextContent('$6,800')
  })

  it('shows the complete principle and ledger story when reduced motion is requested', () => {
    motionPreference.reduce = true
    render(<LandingPage />)

    expect(document.querySelector('.motto-interlude')).toHaveAttribute('data-reduced', 'true')
    expect(document.querySelector('.motto-interlude')).toHaveAttribute('data-stage', '5')
    expect(document.querySelector('.motto-interlude')).toHaveAttribute('data-ready', 'true')
    expect(document.querySelector('.raw-ledger')).toHaveAttribute('data-sequence', '5')
    expect(document.querySelectorAll('.motto-letter[data-written="true"]')).toHaveLength(mottoCharacterCount())
  })
})

function mottoCharacterCount() {
  return 'A payment only tells part of the story. The rest lives in the records around it.'.replaceAll(' ', '').length
}
