import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SiteLanding } from './SiteLanding'
import { SITE_CHECKS } from './siteData'

afterEach(() => {
  window.localStorage.clear()
})

describe('SiteLanding', () => {
  it('leads with the product claim and both entry points', () => {
    render(<SiteLanding />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Find the payments worth a second look.' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Review your ledger' })[0]).toHaveAttribute(
      'href',
      '/audit?entry=upload'
    )
    expect(screen.getAllByRole('link', { name: /sample case/i })[0]).toHaveAttribute(
      'href',
      '/audit?entry=sample'
    )
  })

  it('names every one of the seven checks the rules engine implements', () => {
    render(<SiteLanding />)

    expect(SITE_CHECKS).toHaveLength(7)
    for (const check of SITE_CHECKS) {
      expect(screen.getAllByText(check.name).length).toBeGreaterThan(0)
    }
  })

  it('keeps the privacy, pricing, and sample-data claims the product can support', () => {
    render(<SiteLanding />)

    expect(screen.getByText('Your ledger stays on this device.')).toBeInTheDocument()
    expect(screen.getByText('Nothing is uploaded.')).toBeInTheDocument()
    expect(screen.getByText('Every flag keeps its evidence.')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'If the money does not come back, you do not pay',
      })
    ).toBeInTheDocument()
    expect(screen.getByText('$0 fee if no money returns')).toBeInTheDocument()
    // The landing page must not invent customer outcomes.
    expect(screen.getByText(/no customer outcome is implied/i)).toBeInTheDocument()
    expect(screen.queryByText(/recovery complete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/trusted by/i)).not.toBeInTheDocument()
  })

  it('turns the header action into the most relevant saved-work destination', () => {
    window.localStorage.setItem('reclaim.projects.active.v1', 'project_1')
    window.localStorage.setItem(
      'reclaim.projects.index.v1',
      JSON.stringify([
        {
          id: 'project_1',
          name: 'March review',
          sourceLabel: 'march.csv',
          mode: 'upload',
          createdAt: 1,
          updatedAt: 2,
          recordCount: 80,
          openCaseCount: 2,
          recoveryValue: 6800,
          recoveryActiveCount: 1,
          recoveryActiveValue: 6800,
        },
      ])
    )

    render(<SiteLanding />)

    const actions = screen.getAllByRole('link', { name: 'Resume recovery' })
    expect(actions[0]).toHaveAttribute('href', '/audit?project=project_1&mode=recovery')
    // The value still in recovery rides alongside the header action.
    expect(document.querySelector('.site-nav-context')).toHaveTextContent('$6,800')
  })
})
