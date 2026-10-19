import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { AuthUser } from '@/lib/auth/types'
import type { WorkspaceMode } from './WorkspaceShell'

const auth = { user: null as AuthUser | null, markTourSeen: vi.fn(async () => {}) }
vi.mock('@/lib/auth/AuthContext', () => ({ useOptionalAuth: () => auth }))
const { WorkspaceTour } = await import('./WorkspaceTour')

const user = (tourSeenAt: number | null): AuthUser => ({ id: 'u1', firstName: 'Ada', lastName: 'L', name: 'Ada L', email: 'ada@example.com', company: 'Co', createdAt: 0, isGuest: false, termsAcceptedAt: 0, termsVersion: 'v', tourSeenAt })

/**
 * The tour over a stand-in workspace: the sidebar buttons tagged the way WorkspaceShell tags them, an
 * Overview with one "Up next" row that opens a finding, a finding page with a decision panel, and a
 * Findings page with a search box. Everything else the tour looks for is missing, so it is passed over.
 */
function Harness() {
  const [mode, setMode] = useState<WorkspaceMode>('dashboard')
  const [caseOpen, setCaseOpen] = useState(false)
  const go = (next: WorkspaceMode) => { setMode(next); setCaseOpen(false) }
  return <>
    {(['dashboard', 'findings', 'recoveries', 'reports', 'audits', 'plans', 'settings'] as const).map((m) => <button key={m} type="button" data-tour={`nav-${m}`} onClick={() => go(m)}>{m}</button>)}
    <main id="workspace-main">
      {caseOpen ? (
        <section aria-labelledby="case-decision"><h2 id="case-decision">Your decision</h2></section>
      ) : mode === 'dashboard' ? (
        <section aria-labelledby="ov-next"><h2 id="ov-next">Up next</h2><button type="button" className="wk-queue-row" onClick={() => setCaseOpen(true)}>Review Acme</button></section>
      ) : mode === 'findings' ? (
        <label className="wk-search">Search findings</label>
      ) : <p>page {mode}</p>}
    </main>
    <WorkspaceTour mode={mode} caseOpen={caseOpen} onModeChange={go} onMobileNav={() => {}} autoStart />
  </>
}

const title = () => screen.getByRole('dialog').querySelector('h2')?.textContent
const settle = async (ms = 3000) => { for (let t = 0; t < ms; t += 100) await act(async () => { vi.advanceTimersByTime(100) }) }

describe('Dashboard tour', () => {
  const realRect = Element.prototype.getBoundingClientRect
  beforeEach(() => {
    vi.useFakeTimers()
    auth.markTourSeen.mockClear()
    // jsdom lays nothing out: give every element a box, so "on screen" means "in the document".
    Element.prototype.getBoundingClientRect = () => ({ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132, x: 100, y: 100, toJSON: () => ({}) })
    Element.prototype.scrollIntoView = () => {}
  })
  afterEach(() => { Element.prototype.getBoundingClientRect = realRect; vi.useRealTimers() })

  it('opens once for a new account, waits for real clicks, and walks into a finding', async () => {
    auth.user = user(null)
    render(<Harness />)
    await settle(800)
    expect(title()).toBe('Welcome to Reclaim')
    fireEvent.click(screen.getByRole('button', { name: 'Start the tour' }))
    await settle(500)
    expect(title()).toBe('Overview')
    fireEvent.click(screen.getByRole('button', { name: 'dashboard' }))
    await settle(6000)
    // Overview parts missing from the stand-in are passed over; Up next is there.
    expect(title()).toBe('Up next')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await settle(500)
    expect(title()).toBe('Open a finding')
    fireEvent.click(screen.getByRole('button', { name: 'Review Acme' }))
    await settle()
    expect(title()).toBe('Your decision')
  })

  it('Skip section jumps to the next part of the tour', async () => {
    auth.user = user(null)
    render(<Harness />)
    await settle(800)
    fireEvent.click(screen.getByRole('button', { name: 'Start the tour' }))
    await settle(500)
    expect(screen.getByRole('dialog')).toHaveTextContent('Overview · 1 of')
    fireEvent.click(screen.getByRole('button', { name: 'Skip section' }))
    await settle(500)
    expect(title()).toBe('Open a finding')
    fireEvent.click(screen.getByRole('button', { name: 'Skip section' }))
    await settle(500)
    expect(title()).toBe('Findings')
    fireEvent.click(screen.getByRole('button', { name: 'findings' }))
    await settle()
    expect(title()).toBe('Search')
  })

  it('Skip tour closes it and records it on the account', async () => {
    auth.user = user(null)
    render(<Harness />)
    await settle(800)
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(auth.markTourSeen).toHaveBeenCalledTimes(1)
  })

  it('never opens by itself for an account that has already seen it, but Settings can replay it', async () => {
    auth.user = user(Date.now())
    render(<Harness />)
    await settle(2000)
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { window.dispatchEvent(new Event('reclaim:tour')) })
    expect(title()).toBe('Welcome to Reclaim')
  })
})
