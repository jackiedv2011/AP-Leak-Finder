import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { MousePointerClick } from 'lucide-react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import type { WorkspaceMode } from './WorkspaceShell'
import './tour.css'

/**
 * The dashboard tour: the first time an account reaches the Overview, a guided walk through the whole
 * workspace, one part at a time. It's split into sections (the Overview, one finding up close, then each
 * sidebar page, then the controls around the edges); any section can be skipped, or the whole tour.
 * Sidebar steps and the "open a finding" step wait for the person to click the real thing. Finishing or
 * skipping records it on the account, so it opens by itself once per person, on any device; Settings can
 * replay it ("reclaim:tour" event) without changing that record.
 */

/** A CSS selector, or a heading on the page (the tour spotlights the section it heads). */
type Target = string | { heading: string; up?: string }

type Section = 'overview' | 'finding' | 'findings' | 'recoveries' | 'reports' | 'audits' | 'plans' | 'settings' | 'edges'
/** `case` is a finding's own page, reached by clicking one: the tour never opens it by itself. */
type Page = WorkspaceMode | 'case'

type Step =
  | { kind: 'intro' | 'outro'; section: null; title: string; body: string }
  /** Waits for the sidebar button to be clicked. */
  | { kind: 'nav'; section: Section; mode: WorkspaceMode; label: string; title: string; body: string }
  /** Waits for `target` to be clicked; "Do it for me" clicks it. */
  | { kind: 'click'; section: Section; page: Page; target: string; action: string; title: string; body: string }
  /** Points at one thing on the page and explains it. */
  | { kind: 'spot'; section: Section; page: Page; target: Target; title: string; body: string }

const SECTION_LABEL: Record<Section, string> = {
  overview: 'Overview',
  finding: 'A finding up close',
  findings: 'Findings',
  recoveries: 'Recoveries',
  reports: 'Reports',
  audits: 'Audits',
  plans: 'Plans',
  settings: 'Settings',
  edges: 'Everything else',
}

const spot = (section: Section, page: Page) => (target: Target, title: string, body: string): Step => ({ kind: 'spot', section, page, target, title, body })
const ov = spot('overview', 'dashboard')
const fc = spot('finding', 'case')
const fl = spot('findings', 'findings')
const rc = spot('recoveries', 'recoveries')
const rp = spot('reports', 'reports')
const au = spot('audits', 'audits')
const pl = spot('plans', 'plans')
const st = spot('settings', 'settings')
const ed = spot('edges', 'dashboard')
const decide = (n: number) => `section[aria-labelledby="case-decision"] .wk-decide-btn:nth-of-type(${n})`

const STEPS: Step[] = [
  { kind: 'intro', section: null, title: 'Welcome to Reclaim', body: 'This tour shows you every part of Reclaim, one thing at a time, and you’ll open a real finding along the way. It comes in sections. Use Skip section to jump past any of them, or Skip tour to leave. It only opens by itself once.' },

  // ---------- Overview ----------
  { kind: 'nav', section: 'overview', mode: 'dashboard', label: 'Overview', title: 'Overview', body: 'Your home page: everything Reclaim found in the open audit, and what to do next.' },
  ov('.wk-ov > .wk-head .wk-head-copy', 'Which audit you’re looking at', 'The file you uploaded, how many payments and vendors were in it, and the dates they cover. The sentence underneath sums up where things stand.'),
  ov('.wk-ov .wk-head-actions .wk-btn', 'Your next step', 'This green button is always the single most useful thing to do right now: the next finding to review, or a recovery that’s waiting on you.'),
  ov('.wk-ov .wk-total[data-total="ready"]', 'Recovery candidates', 'Money you can ask vendors to give back. A duplicate payment lands here once you’ve confirmed its evidence. Click the box to see those findings.'),
  ov('.wk-ov .wk-total[data-total="review"]', 'Flagged for review', 'Possible mistakes that still need you to look at them. It isn’t money owed until you confirm it. Click the box to see the list.'),
  ov('.wk-ov .wk-total[data-total="inRecovery"]', 'In recovery', 'Money you’ve asked vendors for and are still waiting on. Click it to open Recoveries.'),
  ov('.wk-ov .wk-total[data-total="recovered"]', 'Recovered', 'Money that actually came back: a refund that landed or a credit that was used. Promises don’t count here.'),
  ov('section[aria-labelledby="ov-tasks"]', 'Recovery tasks', 'Cases where the next move is yours, like approving a request or logging a vendor’s reply, soonest due first. Click Open on one to go straight to it.'),
  ov('section[aria-labelledby="ov-pipeline"]', 'Recovery progress', 'Every claim by stage: To decide, Confirmed, Requested and Recovered. The bar fills in as money comes back.'),
  ov('section[aria-labelledby="ov-types"]', 'By finding type', 'Which checks caught the money: duplicate payments, overpayments, missed discounts and so on. Report opens the full breakdown.'),
  ov('section[aria-labelledby="ov-vendors"]', 'Top vendors', 'The vendors with the most money at stake.'),
  ov('section[aria-labelledby="ov-activity"]', 'Recent activity', 'Every decision, request and refund on this audit, newest first, so you can see what changed since last time.'),
  ov('section[aria-labelledby="ov-next"]', 'Up next', 'Findings waiting on your decision, most money first. Each row shows the vendor, the kind of mistake, the invoices involved and the amount.'),

  // ---------- One finding, opened for real ----------
  { kind: 'click', section: 'finding', page: 'dashboard', target: 'section[aria-labelledby="ov-next"] .wk-queue-row:not([data-locked])', action: 'Click Review on the top finding', title: 'Open a finding', body: 'Let’s look at one properly. Review opens the finding’s own page. Nothing changes until you make a decision, so it’s safe to look around.' },
  fc('.wk-head:has(> .wk-head-figure)', 'Who, what and how much', 'The vendor’s name, the invoices involved, and three tags: where the finding stands (for example Not reviewed), what kind of mistake it is, and how strong the evidence is. On the right is the amount at stake.'),
  fc('section[aria-labelledby="case-what"]', 'What happened', 'The mistake in plain words: which invoice, which payments and how much. A “Still open” note says what the records can’t prove on their own yet.'),
  fc('section[aria-labelledby="case-evidence"]', 'Evidence', 'The actual payment rows from your file. Values highlighted in green match across the rows, which is what made Reclaim flag them.'),
  fc('#evidence-review', 'Confirm the evidence', 'For a duplicate payment, four short questions: is it one bill, did both payments clear the bank, has anything already come back, and is it really a duplicate. The bill number and amount come filled in from your file. Answer the rest, check your name at the bottom and press Save evidence. Then it becomes money you can claim.'),
  fc('section[aria-labelledby="case-decision"]', 'Your decision', 'Every finding ends with your call. The line at the top says what the next step is for this one. Here are the three buttons.'),
  fc(decide(1), 'This is real', 'You agree the records show a mistake. For a duplicate payment it takes you to the evidence questions first; once those are saved, Reclaim prepares the request to the vendor. Nothing is ever sent without your approval.'),
  fc(decide(2), 'I need more detail', 'Not sure yet? This keeps the finding open while you check a purchase order or a bank statement, or ask the vendor. You can add a note about what you’re waiting on.'),
  fc(decide(3), 'Not an issue', 'The payment was expected, like a split payment or a known arrangement, or Reclaim got it wrong. You pick a reason and it leaves your open findings.'),
  fc('section[aria-labelledby="case-money"]', 'At a glance', 'The amount the records support and where this finding stands. Once you ask the vendor, it also shows what you requested and what has come back.'),
  fc('section[aria-labelledby="case-history-title"]', 'History', 'Everything that happened on this finding, with who did it and when.'),
  fc('.wk-crumbs', 'Getting back', 'Click Findings here, or Back at the top right, to return to the list.'),

  // ---------- Findings ----------
  { kind: 'nav', section: 'findings', mode: 'findings', label: 'Findings', title: 'Findings', body: 'Every possible mistake Reclaim found in this audit, in one list.' },
  fl('.wk-tabs[aria-label="Finding kind"]', 'Kinds of findings', 'All shows everything. Recovery candidates are money you can claim back. Flagged for review still needs a look. Security alerts are things like a vendor’s bank details changing. Future savings are discounts you missed. The number on each tab is how many there are.'),
  fl('.wk-search', 'Search', 'Type a vendor, an invoice number or a kind of mistake to narrow the list.'),
  fl('[data-tour="findings-filter"]', 'Filter by decision', 'Show only findings you haven’t reviewed, ones you confirmed, ones waiting on more detail, or ones you marked as expected.'),
  fl('[data-tour="findings-sort"]', 'Sort', 'Priority puts the most important first. You can also sort by amount, largest or smallest first, or by vendor name.'),
  fl('[data-tour="findings-export"]', 'Export CSV', 'Download the list as a spreadsheet, for example to send to your accountant.'),
  fl('.wk-grid-head', 'The columns', 'Vendor and records, the kind of finding, how strong the evidence is, your decision so far, and the amount at stake.'),
  fl('.wk-finding-row:not([data-locked])', 'A finding', 'Click any row to open it. It’s the same page you just looked at.'),

  // ---------- Recoveries ----------
  { kind: 'nav', section: 'recoveries', mode: 'recoveries', label: 'Recoveries', title: 'Recoveries', body: 'The findings you confirmed, from the request to the vendor until the money is back.' },
  rc('#workspace-main > .wk-empty', 'Nothing here yet', 'Recoveries fills up once you confirm a finding. Each confirmed finding becomes a case here, and you follow it from the request to the vendor until the money is back.'),
  rc({ heading: 'In recovery', up: '.wk-total' }, 'In recovery', 'The total you’ve asked vendors for that hasn’t come back yet.'),
  rc({ heading: 'Vendor agreed', up: '.wk-total' }, 'Vendor agreed', 'Money a vendor has said yes to but hasn’t returned yet.'),
  rc({ heading: 'Return pending', up: '.wk-total' }, 'Return pending', 'A refund or credit the vendor says is on its way. It only counts once you record that it arrived.'),
  rc({ heading: 'Recovered', up: '.wk-total' }, 'Recovered', 'Money you recorded as actually back in your account or used as a credit.'),
  rc('section[aria-labelledby="rec-needs"]', 'Needs your action', 'Cases waiting on you, soonest due first: approve a request, send it, follow up or record a reply. Click Open to jump in.'),
  rc('.wk-lane[data-stage="confirmed"]', 'Prepared', 'Confirmed findings with a request being prepared. Open one to approve the request and send it.'),
  rc('.wk-lane[data-stage="requested"]', 'With the vendor', 'Requests you’ve sent. Log the vendor’s replies there, and Reclaim reminds you when it’s time to follow up.'),
  rc('.wk-lane[data-stage="recovered"]', 'Money back', 'Money that came back. The last step is noting where it’s recorded in your books.'),
  rc('.wk-lane[data-stage="not_recovered"]', 'Closed', 'Cases closed without money back, with the reason you gave.'),

  // ---------- Reports ----------
  { kind: 'nav', section: 'reports', mode: 'reports', label: 'Reports', title: 'Reports', body: 'The summary of this audit.' },
  rp({ heading: 'This audit' }, 'This audit', 'The totals: what was flagged, what’s been confirmed and what came back. Flagged money isn’t money owed until you confirm it.'),
  rp({ heading: 'By check' }, 'By check', 'Each of Reclaim’s checks, how many findings it produced and how much money they add up to.'),
  rp({ heading: 'Every vendor checked' }, 'Every vendor checked', 'Every vendor in your file and what was found for each, so you know who to talk to first.'),

  // ---------- Audits ----------
  { kind: 'nav', section: 'audits', mode: 'audits', label: 'Audits', title: 'Audits', body: 'Every payments file you’ve checked.' },
  au({ heading: 'Your audits' }, 'Your audits', 'Each upload is its own audit, saved to your account, with how many payments it had and the money it found. Click one to switch to it.'),
  au('[data-testid="audits-explainer"]', 'What an audit is', 'A quick reminder of how it works: upload a CSV, review each finding, then send requests and record what came back.'),
  au({ heading: 'What the open audit was built from' }, 'What it was built from', 'The files that make up the audit you have open, and when each was added.'),
  au({ heading: 'Sources' }, 'Sources', 'Where the payments came from, like a CSV upload or a QuickBooks connection.'),

  // ---------- Plans ----------
  { kind: 'nav', section: 'plans', mode: 'plans', label: 'Plans', title: 'Plans', body: 'What each plan includes and costs.' },
  pl('[data-testid="plans-free"]', 'Free', 'Unlimited uploads and all eight checks on every file. The three smallest findings in each upload are shown in full.'),
  pl('[data-testid="plans-growth"]', 'Growth', 'A monthly price plus a share of only the money that actually comes back. Every finding in full, AI-drafted emails, follow-ups and the full case history.'),
  pl('[data-testid="plans-flat"]', 'Flat', 'Everything in Growth for one fixed monthly price with no success fee, so every recovered dollar stays with you.'),
  pl({ heading: 'Compare the tracks' }, 'Compare the plans', 'Every feature side by side, so you can see exactly what changes between plans.'),

  // ---------- Settings ----------
  { kind: 'nav', section: 'settings', mode: 'settings', label: 'Settings', title: 'Settings', body: 'Your account, your preferences and your data.' },
  st({ heading: 'Account' }, 'Account', 'Your name, company and email. Your name and company sign the letters Reclaim drafts, so make sure they’re right.'),
  st({ heading: 'Appearance and layout' }, 'Appearance and layout', 'Light or dark mode, how dense the pages are, and what the Overview shows.'),
  st({ heading: 'Appearance' }, 'Appearance', 'Light or dark mode, and how dense the pages are.'),
  st('[data-testid="connected-accounts"]', 'Connected accounts', 'Connect Gmail to send requests from your own address, or QuickBooks to pull payments in directly, when they’re available to you.'),
  st({ heading: 'Your setup' }, 'Your setup', 'Change your answers from your first visit, or take this tour again.'),
  st({ heading: 'Legal' }, 'Legal', 'The Terms of Service and Privacy Policy you agreed to.'),
  st({ heading: 'This audit\'s data' }, 'Your data', 'Download everything, or delete this audit. Deleting can’t be undone.'),

  // ---------- Around the edges ----------
  ed('[data-tour="find"]', 'Find', 'Press F, or click here, and type a page, a vendor or a finding to jump straight to it.'),
  ed('[data-tour="switcher"]', 'Switch audits', 'The audit you have open. Click its name to switch to another one.'),
  ed('[data-tour="theme"]', 'Light and dark mode', 'Switch the whole app between light and dark.'),
  ed('[data-tour="customize"]', 'Customize', 'Change colors, how dense the pages are, and which panels the Overview shows.'),
  ed('[data-tour="topbar-actions"] > :last-child', 'Start an audit', 'Upload another payments export (a newer one, or a different account) or try the sample. Each one becomes its own audit.'),
  ed('[data-tour="side-landing"]', 'Back to landing page', 'Leaves the app for Reclaim’s public site. Your work stays saved.'),
  ed('[data-tour="side-collapse"]', 'Collapse sidebar', 'Shrinks the sidebar to icons to give the page more room. Click it again to bring it back.'),
  ed('[data-tour="account"]', 'Your account', 'Who’s signed in. The arrow on the right logs you out.'),

  { kind: 'outro', section: null, title: 'You’re all set', body: 'Start with the green button on the Overview: it always points at the most useful next step. You can take this tour again any time from Settings, under Your setup.' },
]

const MOBILE = '(max-width: 900px)'
const PAD = 6
const GAP = 14
const CARD_W = 360

interface Box { top: number; left: number; width: number; height: number }

const SIDEBAR_TARGETS = ['find', 'side-', 'account']

function targetOf(step: Step): Target | null {
  if (step.kind === 'nav') return `[data-tour="nav-${step.mode}"]`
  if (step.kind === 'click' || step.kind === 'spot') return step.target
  return null
}

const pageOf = (step: Step): Page | null => (step.kind === 'spot' || step.kind === 'click' ? step.page : step.kind === 'outro' ? 'dashboard' : null)

/** The element a step points at, if it's on screen right now. */
function resolve(target: Target): HTMLElement | null {
  if (typeof target === 'string') {
    try {
      return document.querySelector<HTMLElement>(target)
    } catch {
      return null // a selector this browser can't read
    }
  }
  const root = document.getElementById('workspace-main') ?? document.body
  const heading = [...root.querySelectorAll<HTMLElement>('h1, h2, h3, .wk-label, legend')].find((el) => el.textContent?.trim() === target.heading)
  if (!heading) return null
  return heading.closest<HTMLElement>(target.up ?? 'section, .wk-section, .wk-panelcard, article, .wk-card') ?? heading
}

/** Beside the spotlight where there's room (right, below, left, above), else tucked into the bottom-right corner. */
function placeCard(box: Box | null, cardH: number): CSSProperties {
  const vw = window.innerWidth, vh = window.innerHeight, m = 16
  const w = Math.min(CARD_W, vw - m * 2)
  if (!box) return { left: (vw - w) / 2, top: Math.max(m, (vh - cardH) / 2), width: w }
  const clampTop = (t: number) => Math.min(Math.max(t, m), vh - cardH - m)
  const clampLeft = (l: number) => Math.min(Math.max(l, m), vw - w - m)
  if (box.left + box.width + GAP + w + m <= vw) return { left: box.left + box.width + GAP, top: clampTop(box.top), width: w }
  if (box.top + box.height + GAP + cardH + m <= vh) return { left: clampLeft(box.left + box.width - w), top: clampTop(box.top + box.height + GAP), width: w }
  if (box.left - GAP - w >= m) return { left: box.left - GAP - w, top: clampTop(box.top), width: w }
  if (box.top - GAP - cardH >= m && box.top <= vh) return { left: clampLeft(box.left), top: clampTop(box.top - GAP - cardH), width: w }
  return { left: clampLeft(vw - w - m * 2), top: clampTop(vh - cardH - m * 2), width: w }
}

export function WorkspaceTour({ mode, caseOpen = false, onModeChange, onMobileNav, autoStart = import.meta.env.MODE !== 'test' }: {
  mode: WorkspaceMode
  /** A finding's own page is open. */
  caseOpen?: boolean
  onModeChange: (mode: WorkspaceMode) => void
  /** Opens or closes the phone drawer, where the sidebar lives on narrow screens. */
  onMobileNav: (open: boolean) => void
  autoStart?: boolean
}) {
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [cardH, setCardH] = useState(240)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  /** The way the tour is moving, so a step with nothing to show is passed over in that direction. */
  const heading = useRef<1 | -1>(1)
  const startedFrom = useRef<WorkspaceMode>('dashboard')
  const step = STEPS[index]
  const page: Page = caseOpen ? 'case' : mode
  const measuredOn = useRef<Page | null>(null)
  const caseOpenNow = useRef(caseOpen)
  caseOpenNow.current = caseOpen

  // Once per account: the first time the Overview is on screen and the account hasn't seen the tour.
  useEffect(() => {
    if (!autoStart || open || !user || user.tourSeenAt || mode !== 'dashboard' || caseOpen) return
    const timer = window.setTimeout(() => { startedFrom.current = 'dashboard'; heading.current = 1; setIndex(0); setOpen(true) }, 700)
    return () => window.clearTimeout(timer)
  }, [autoStart, open, user, mode, caseOpen])

  // Settings → "Take the tour again".
  useEffect(() => {
    const replay = () => { startedFrom.current = mode; heading.current = 1; setIndex(0); setOpen(true) }
    window.addEventListener('reclaim:tour', replay)
    return () => window.removeEventListener('reclaim:tour', replay)
  }, [mode])

  const close = useCallback((to: WorkspaceMode | null) => {
    setOpen(false)
    onMobileNav(false)
    void auth?.markTourSeen()
    if (to) onModeChange(to)
  }, [auth, onMobileNav, onModeChange])

  const move = useCallback((by: 1 | -1) => { heading.current = by; setIndex((i) => Math.min(Math.max(i + by, 0), STEPS.length - 1)) }, [])
  const next = useCallback(() => move(1), [move])
  const back = useCallback(() => move(-1), [move])
  const skipSection = useCallback(() => {
    heading.current = 1
    setIndex((i) => {
      const after = STEPS.findIndex((s, j) => j > i && s.section !== STEPS[i].section)
      return after === -1 ? STEPS.length - 1 : after
    })
  }, [])

  // The page a step talks about is the page on screen. A finding's page is only reached by clicking one,
  // so without one open its steps are passed over, the way the tour is moving.
  useEffect(() => {
    if (!open) return
    const wants = pageOf(step)
    if (wants === 'case') {
      // Give a click that opens a finding a moment to land before deciding there isn't one.
      const timer = window.setTimeout(() => {
        if (caseOpenNow.current) return
        let j = index
        while (j > 0 && j < STEPS.length - 1 && pageOf(STEPS[j]) === 'case') j += heading.current
        setIndex(j)
      }, 450)
      return () => window.clearTimeout(timer)
    } else if (wants && wants !== page) onModeChange(wants)
    const target = targetOf(step)
    const inSidebar = step.kind === 'nav' || (typeof target === 'string' && SIDEBAR_TARGETS.some((t) => target.includes(`data-tour="${t}`)))
    onMobileNav(Boolean(inSidebar && window.matchMedia(MOBILE).matches))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index])

  // Measure the spotlight once the page has settled, scrolling it into view first, and keep it measured.
  useEffect(() => {
    if (!open) return
    const target = targetOf(step)
    if (!target) { setBox(null); return }
    const wants = pageOf(step)
    if (wants && wants !== page) return // the page is still changing; this runs again once it has
    let gone = false
    const measure = (scroll: boolean) => {
      const el = resolve(target)
      const r = el?.getBoundingClientRect()
      if (!el || !r || r.width === 0 || r.height === 0) {
        // Not on this screen (no recoveries yet, a phone hides the sidebar footer): go on, the way the tour is moving.
        if (!gone) { gone = true; move(heading.current) }
        return
      }
      if (scroll && (r.top < 64 || r.bottom > window.innerHeight - 16)) {
        // Instant, not smooth: the spotlight is measured right after, and a page set to smooth-scroll would still be moving.
        el.scrollIntoView({ block: r.height > window.innerHeight * 0.7 ? 'start' : 'center', behavior: 'instant' })
        window.setTimeout(() => measure(false), 80)
        return
      }
      const top = Math.max(r.top - PAD, 4), left = Math.max(r.left - PAD, 4)
      setBox({ top, left, width: Math.min(r.right + PAD, window.innerWidth - 4) - left, height: Math.min(r.bottom + PAD, window.innerHeight - 4) - top })
    }
    setBox(null)
    // A page that just opened gets a moment to render; on a page already showing, the next part is looked up at once.
    const settled = measuredOn.current === page
    measuredOn.current = page
    const first = window.setTimeout(() => measure(true), step.kind === 'nav' ? 140 : settled ? 40 : 320)
    const onMove = () => { if (!gone) measure(false) }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      gone = true
      window.clearTimeout(first)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, index, step, page, move])

  // Sidebar steps and the "open a finding" step move on when the person clicks the real thing.
  useEffect(() => {
    if (!open || (step.kind !== 'nav' && step.kind !== 'click')) return
    const selector = step.kind === 'nav' ? `[data-tour="nav-${step.mode}"]` : step.target
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest(selector)) window.setTimeout(next, 0)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [open, step, next])

  useLayoutEffect(() => {
    if (open && cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [open, index, box])

  useEffect(() => {
    if (open) (primaryRef.current ?? cardRef.current)?.focus({ preventScroll: true })
  }, [open, index])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && (step.kind === 'spot' || step.kind === 'intro')) { event.preventDefault(); next() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); back() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, step, next, back])

  if (!open) return null

  // Dimmed panels around the spotlight also catch clicks; only a step that waits on a click lets one through.
  const waitsOnClick = step.kind === 'nav' || step.kind === 'click'
  const blockers: CSSProperties[] = box
    ? [
        { top: 0, left: 0, right: 0, height: box.top },
        { top: box.top + box.height, left: 0, right: 0, bottom: 0 },
        { top: box.top, left: 0, width: box.left, height: box.height },
        { top: box.top, left: box.left + box.width, right: 0, height: box.height },
      ]
    : [{ inset: 0 }]
  const section = step.section
  const inSection = section ? STEPS.filter((s) => s.section === section) : []
  const sections = [...new Set(STEPS.map((s) => s.section).filter((s): s is Section => s !== null))]
  const sectionAt = section ? sections.indexOf(section) : step.kind === 'outro' ? sections.length : -1
  const doIt = () => {
    if (step.kind === 'nav') { onModeChange(step.mode); next() }
    else if (step.kind === 'click') resolve(step.target)?.click()
  }

  return (
    <div className="wk-tour" role="dialog" aria-modal="true" aria-labelledby="wk-tour-title" data-step={index}>
      {blockers.map((style, i) => <div key={i} className="wk-tour-block" style={style} />)}
      {box ? <div className="wk-tour-spot" data-kind={step.kind} data-blocking={!waitsOnClick || undefined} style={box} /> : null}

      {/* Until the spotlight is found the card waits, so a step with nothing to show is passed over unseen. */}
      {targetOf(step) && !box ? null : <div className="wk-tour-card" ref={cardRef} tabIndex={-1} style={placeCard(box, cardH)} data-kind={step.kind}>
        <div className="wk-tour-head">
          <span className="wk-tour-count">{section ? `${SECTION_LABEL[section]} · ${inSection.indexOf(step) + 1} of ${inSection.length}` : 'Tour'}</span>
          <span className="wk-tour-skips">
            {section ? <button type="button" className="wk-tour-skip" onClick={skipSection}>Skip section</button> : null}
            {step.kind !== 'outro' ? <button type="button" className="wk-tour-skip" onClick={() => close(startedFrom.current)}>Skip tour</button> : null}
          </span>
        </div>
        <h2 id="wk-tour-title">{step.title}</h2>
        <p>{step.body}</p>
        {step.kind === 'intro' ? <ol className="wk-tour-sections">{sections.map((s) => <li key={s}>{SECTION_LABEL[s]}</li>)}</ol> : null}
        {waitsOnClick ? (
          <p className="wk-tour-do">
            <MousePointerClick aria-hidden="true" />
            {step.kind === 'nav' ? <span>Click <strong>{step.label}</strong> in the sidebar to open it.</span> : <span>{step.action}, inside the green outline.</span>}
          </p>
        ) : null}
        <div className="wk-tour-progress" aria-label={section ? `Section ${sectionAt + 1} of ${sections.length}` : undefined}>
          {sections.map((s, i) => <i key={s} title={SECTION_LABEL[s]} data-done={i < sectionAt || undefined} data-on={i === sectionAt || undefined} />)}
        </div>
        <div className="wk-tour-actions">
          {index > 0 && step.kind !== 'outro' ? <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={back}>Back</button> : <span />}
          {step.kind === 'intro' ? <button ref={primaryRef} type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={next}>Start the tour</button> : null}
          {waitsOnClick ? <button type="button" className="wk-btn" data-variant="outline" data-size="sm" onClick={doIt}>Do it for me</button> : null}
          {step.kind === 'spot' ? <button ref={primaryRef} type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={next}>Next</button> : null}
          {step.kind === 'outro' ? <button ref={primaryRef} type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => close('dashboard')}>Go to my Overview</button> : null}
        </div>
      </div>}
    </div>
  )
}
