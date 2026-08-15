import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

const motionPreference = vi.hoisted(() => ({ reduce: false }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => motionPreference.reduce }
})

vi.mock('./SideRays', () => ({
  SideRays: () => <div aria-hidden="true" />,
}))

afterEach(() => {
  motionPreference.reduce = false
})

describe('LandingPage', () => {
  it('uses the real review as the primary path and keeps the example secondary', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Find the payments worth a second look.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the review flow' })).toHaveAttribute('href', '#how-it-works')
    expect(screen.getAllByRole('link', { name: 'Start a review' })[0]).toHaveAttribute('href', '/audit?entry=upload')
    expect(screen.getByRole('link', { name: 'Open a guided example' })).toHaveAttribute('href', '/audit?entry=sample')
    expect(screen.queryByText('Sample audit')).not.toBeInTheDocument()
    expect(screen.queryByText('Recovery ready')).not.toBeInTheDocument()
    expect(screen.queryByText('Potential recovery')).not.toBeInTheDocument()
    expect(screen.getByText('A person confirms the outcome.')).toBeInTheDocument()
  })

  it('keeps the approved story, claim limits, and retained reason in one ordered page', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    expect(screen.getByText('A payment only tells part of the story. The rest lives in the records around it.')).toBeInTheDocument()
    expect(screen.getAllByText('See the payment. Keep the reason.').length).toBeGreaterThan(0)
    expect([...document.querySelectorAll('.motto-word')].map((word) => word.textContent?.trim())).toEqual([
      'A', 'payment', 'only', 'tells', 'part', 'of', 'the', 'story.', 'The', 'rest', 'lives', 'in', 'the', 'records', 'around', 'it.',
    ])
    expect(screen.getByText('Currency basis, payment status, and source-event identity')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'One ledger can raise more than one question.' })).toBeInTheDocument()
    expect(screen.getAllByText('A difference worth checking.').length).toBeGreaterThan(0)

    const evidence = screen.getByRole('region', { name: 'The evidence stays with the question.' })
    await user.click(within(evidence).getByRole('button', { name: /Review the context\./ }))
    await user.click(within(evidence).getByRole('button', { name: 'Continue to decision' }))
    expect(within(evidence).getByText('Keep the reason with the case.')).toBeInTheDocument()
    expect(within(evidence).getByText('Reclaim presents the evidence. A person decides the outcome.')).toBeInTheDocument()

    expect(screen.getByText('No accounting-system writeback')).toBeInTheDocument()
    expect(screen.getByText('No vendor outreach')).toBeInTheDocument()
    expect(screen.getByText('No decision made on your behalf')).toBeInTheDocument()
    expect(screen.getByText('For compatible reviews in the same project, prior decisions stay beside current evidence so familiar cases do not start from zero.')).toBeInTheDocument()
    expect(screen.getByText('Payment review that keeps the reason.')).toBeInTheDocument()
  })

  it('composes complete static chapters when reduced motion is requested', () => {
    motionPreference.reduce = true

    render(<LandingPage />)

    expect(document.querySelector('.motto-interlude')).toHaveAttribute('data-reduced', 'true')
    expect(document.querySelector('.story-canvas')).toHaveAttribute('data-reduced', 'true')
    expect(document.querySelector('.story-question-card')).toHaveAttribute('aria-hidden', 'false')
    expect(document.querySelector('.story-decision-sheet')).toHaveAttribute('aria-hidden', 'false')
    expect(document.querySelector('.raw-ledger')).toHaveAttribute('data-sequence', '5')
    expect(document.querySelector('.pattern-field')).toHaveAttribute('data-stage', '2')
    expect(document.querySelector('.decision-trail')).toHaveAttribute('data-stage', '3')
    expect(document.querySelector('.control-corridor')).toHaveAttribute('data-stage', '2')
    expect(document.querySelector('.dossier-section')).toHaveAttribute('data-stage', '3')
    expect(document.querySelector('.recurring-review')).toHaveAttribute('data-stage', '3')

  })
})
