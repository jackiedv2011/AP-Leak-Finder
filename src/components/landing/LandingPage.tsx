import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { ReclaimLogo, ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import { MagneticLink } from '@/components/landing/MagneticLink'
import { DitherBackground } from '@/components/landing/DitherBackground'
import { landingSamplePresentation } from '@/data/landingSamplePresentation'
import { ACTIVE_PROJECT_KEY, readProjectIndex } from '@/ledger/projectIndex'
import { formatDate } from '@/lib/format'
import heroPlasterPlate from '@/assets/landing/scenes/reclaim-hero-plaster-plate-v2.png'
import pricingDocument from '@/assets/landing/scenes/reclaim-pricing-document-v1.png'
import pricingCard from '@/assets/landing/scenes/reclaim-pricing-card-v1.png'
import './landing.css'
import './landing-light.css'
import './landing-reference.css'
import './landing-motion.css'
import './landing-system.css'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
})

const canonicalRecords = landingSamplePresentation.records
  .filter((record) => record.invoiceNumber === 'INV-3305')
  .sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
const ledgerRecords = landingSamplePresentation.records.filter((record) =>
  ['INV-3303', 'INV-3305', 'INV-3308'].includes(record.invoiceNumber ?? '')
)

if (canonicalRecords.length !== 2) throw new Error('Canonical sample records INV-3305 are missing.')

const mottoThought = 'A payment only tells part of the story. The rest lives in the records around it.'
const mottoPrinciple = 'See the payment. Keep the reason.'
const skipMottoEvent = 'reclaim:skip-motto'
const mottoLines = [
  'A payment only tells',
  'part of the story.',
  'The rest lives in the',
  'records around it.',
]

/**
 * A word-safe writing treatment. Each word has its own reveal surface, so the
 * animation reads as writing without clipping a glyph or breaking a word at a
 * responsive line wrap.
 */
function AutoWrittenLine({ text, active, startAt = 0, className, italic = false }: { text: string; active: boolean; startAt?: number; className: string; italic?: boolean }) {
  const words = text.split(' ')
  const content = words.map((word, index) => (
    <span className="auto-written-word" style={{ transitionDelay: active ? `${startAt + index * 58}ms` : '0ms' }} key={`${word}-${index}`}>
      <span>{word}</span>{index < words.length - 1 ? ' ' : ''}
    </span>
  ))

  return <span className={className} data-writing={active} data-written={active}>{italic ? <em>{content}</em> : content}</span>
}

function AnimatedNumber({ value, awake, format = (number: number) => number.toLocaleString('en-US') }: { value: number; awake: boolean; format?: (number: number) => string }) {
  const reduceMotion = useReducedMotion()
  const [displayValue, setDisplayValue] = useState(reduceMotion || awake ? value : 0)
  const hasAnimated = useRef(Boolean(reduceMotion || awake))

  useEffect(() => {
    if (!awake || hasAnimated.current) return
    if (reduceMotion) {
      setDisplayValue(value)
      hasAnimated.current = true
      return
    }

    const duration = 920
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 4)
      setDisplayValue(Math.round(value * eased))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
      else hasAnimated.current = true
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [awake, reduceMotion, value])

  return <>{format(displayValue)}</>
}

function DeferredSceneImage({
  src,
  className,
  anchorClassName = 'ref-scene-image-anchor',
  width = 1672,
  height = 941,
}: {
  src: string
  className: string
  anchorClassName?: string
  width?: number
  height?: number
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || shouldLoad) return
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setShouldLoad(true)
      observer.disconnect()
    }, { rootMargin: '600px 0px', threshold: 0.01 })
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [shouldLoad])

  return <span className={anchorClassName} ref={anchorRef} aria-hidden="true">
    {shouldLoad && <img className={className} src={src} alt="" width={width} height={height} decoding="async" />}
  </span>
}

interface LandingAction {
  label: string
  href: string
  context: string | null
}

function getLandingAction(): LandingAction {
  const projects = readProjectIndex()
  if (projects.length === 0) return { label: 'Review your ledger', href: '/audit?entry=upload', context: null }

  const activeId = window.localStorage.getItem(ACTIVE_PROJECT_KEY())
  const project = projects.find((item) => item.id === activeId) ?? projects[0]
  const projectParam = encodeURIComponent(project.id)

  if (project.recoveryActiveCount > 0) {
    return { label: 'Resume recovery', href: `/audit?project=${projectParam}&mode=recovery`, context: currency.format(project.recoveryActiveValue) }
  }
  if (project.openCaseCount > 0) {
    return { label: 'Continue review', href: `/audit?project=${projectParam}&mode=findings`, context: `${project.openCaseCount} open` }
  }
  return { label: 'Start a new review', href: '/audit?entry=upload', context: null }
}

const navigationItems = [
  { href: '#value', label: 'What it does' },
  { href: '#recovery', label: 'Recovery' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#about', label: 'About' },
] as const

function LandingNav({ action }: { action: LandingAction }) {
  // The landing navigation morph is intentional wayfinding, so it remains
  // available even when the operating system has reduced motion enabled.
  const reduceMotion = false
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTarget, setActiveTarget] = useState('')
  const [condensed, setCondensed] = useState(false)
  const condensedRef = useRef(false)
  const { scrollY } = useScroll()

  const navigateToSection = (event: ReactMouseEvent<HTMLAnchorElement>, href: string, closeMenu = false) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (closeMenu) setMenuOpen(false)
    window.dispatchEvent(new Event(skipMottoEvent))
    window.history.pushState(null, '', href)
    window.setTimeout(() => document.querySelector<HTMLElement>(href)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }), 0)
  }

  const syncCondensed = (value: number) => {
    const next = value > Math.max(72, window.innerHeight * 0.1)
    if (next === condensedRef.current) return
    condensedRef.current = next
    setCondensed(next)
  }

  useEffect(() => {
    syncCondensed(scrollY.get())
  }, [scrollY])

  useMotionValueEvent(scrollY, 'change', syncCondensed)

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      window.requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  useEffect(() => {
    const targets = navigationItems
      .map((item) => document.querySelector<HTMLElement>(item.href))
      .filter((target): target is HTMLElement => target !== null)
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActiveTarget(`#${visible.target.id}`)
    }, { rootMargin: '-20% 0px -68% 0px', threshold: [0.05, 0.25] })

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <header className="reclaim-nav-shell">
      <motion.nav className="reclaim-nav reclaim-product-nav" data-condensed={condensed} data-menu-open={menuOpen} data-on-dark="false" aria-label="Main navigation">
        <motion.a className="reclaim-nav-brand" href="/" aria-label="Reclaim home">
          <motion.span className="reclaim-nav-mark"><ReclaimMark size={28} interactive tone="ink" /></motion.span>
          <AnimatePresence initial={false}>
            {!condensed && <motion.span className="reclaim-nav-wordmark" initial={reduceMotion ? false : { clipPath: 'inset(0 100% 0 0)', transform: 'translate3d(-0.35rem, 0, 0) scale(0.98)' }} animate={{ clipPath: 'inset(0 0% 0 0)', transform: 'translate3d(0, 0, 0) scale(1)' }} exit={reduceMotion ? { display: 'none' } : { clipPath: 'inset(0 100% 0 0)', transform: 'translate3d(-0.35rem, 0, 0) scale(0.98)' }} transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.23, 1, 0.32, 1] }}><ReclaimWordmark interactive /></motion.span>}
          </AnimatePresence>
        </motion.a>
        <div className="reclaim-nav-links">
          {navigationItems.map((item) => <a data-motion="pressable" data-active={activeTarget === item.href} aria-current={activeTarget === item.href ? 'location' : undefined} href={item.href} onClick={(event) => navigateToSection(event, item.href)} key={item.href}>{item.label}</a>)}
        </div>
        <MagneticLink forceMotion className="reclaim-nav-action" href={action.href} pendingLabel="Opening…">
          <span className="reclaim-nav-action-copy">{action.label}{action.context && <small>{action.context}</small>}</span>
        </MagneticLink>
        <button ref={menuButtonRef} className="reclaim-menu-button" data-motion="pressable" type="button" aria-expanded={menuOpen} aria-controls="reclaim-mobile-menu" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen((open) => !open)}>
          <span>{menuOpen ? 'Close' : 'Menu'}</span><span className="reclaim-menu-glyph" aria-hidden="true"><i /><i /></span>
        </button>
        <div className="reclaim-mobile-menu" id="reclaim-mobile-menu" data-open={menuOpen} aria-hidden={!menuOpen}>
          {navigationItems.map((item) => <a href={item.href} tabIndex={menuOpen ? 0 : -1} onClick={(event) => navigateToSection(event, item.href, true)} key={item.href}><span>{item.label}</span><span aria-hidden="true">↗</span></a>)}
          <a href={action.href} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>{action.label}</span><span aria-hidden="true">↗</span></a>
        </div>
      </motion.nav>
    </header>
  )
}

function HeroAudit() {
  const auditRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [isActive, setIsActive] = useState(Boolean(reduceMotion))

  useEffect(() => {
    const audit = auditRef.current
    if (!audit || reduceMotion) {
      setIsActive(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setIsActive(true)
      observer.disconnect()
    }, { threshold: 0.24 })

    observer.observe(audit)
    return () => observer.disconnect()
  }, [reduceMotion])

  return (
    <article ref={auditRef} className="hero-audit hero-review-preview" data-audit-active={isActive} aria-label="Recommended payment case with its source records">
      <header className="hero-audit-header"><div>Recommended case</div><span>Ready to verify</span></header>
      <div className="hero-audit-body">
        <div className="hero-audit-ledger" role="table" aria-label="Source records for invoice INV-3305">
          <div className="hero-audit-columns" role="row"><span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Paid</span><span role="columnheader">Amount</span></div>
          {canonicalRecords.map((record, index) => (
            <div className="hero-audit-row" data-match={index === canonicalRecords.length - 1} role="row" key={record.rowIndex}>
              <strong role="cell">{record.vendor}</strong><span role="cell">{record.invoiceNumber}</span><time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><strong role="cell">{currency.format(record.amountPaid)}</strong>
            </div>
          ))}
          <div className="hero-audit-matchline"><i aria-hidden="true" /><span>Vendor, invoice, and amount align.</span></div>
        </div>
        <aside className="hero-audit-finding">
          <strong>Exact duplicate payment</strong><p>2 source payments share the same vendor, invoice, and amount.</p>
          <div className="hero-audit-readiness"><span>Potential recovery</span><b>{currency.format(canonicalRecords[0].amountPaid)}</b></div><small>Review evidence before making a decision.</small>
        </aside>
      </div>
    </article>
  )
}

function PaperField({ variant = 'hero' }: { variant?: 'hero' | 'motto' }) {
  return (
    <div className={`reclaim-paper-field reclaim-paper-field-${variant}`} aria-hidden="true">
      <span className="paper-shadow" />
      <span className="paper-sheet paper-sheet-back"><i /><i /><i /><i /></span>
      <span className="paper-sheet paper-sheet-mid"><b>INV</b><i /><i /><i /></span>
      <span className="paper-sheet paper-sheet-front"><b>PAID</b><i /><i /><i /><i /></span>
      <span className="paper-clip" />
      <span className="paper-tab">REVIEW</span>
    </div>
  )
}

function Hero({ action }: { action: LandingAction }) {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.32 })
  const copyTransform = useTransform(smoothProgress, (progress) => reduceMotion ? 'none' : `translate3d(0, ${-progress * 14}px, 0) skewY(${-progress * 0.18}deg)`)
  const auditTransform = useTransform(smoothProgress, (progress) => reduceMotion ? 'none' : `translate3d(0, ${-progress * 26}px, 0) rotate(${progress * 0.3}deg) skewY(${progress * 0.14}deg)`)

  return (
    <section className="reclaim-hero" ref={sectionRef} aria-labelledby="hero-title">
      <div className="reclaim-hero-atmosphere" aria-hidden="true">
        <img className="reclaim-hero-plate" src={heroPlasterPlate} alt="" width="1536" height="1024" fetchPriority="high" />
        <span className="reclaim-hero-atmosphere-scrim" />
      </div>
      <div className="reclaim-hero-inner">
        <motion.div className="reclaim-hero-copy reclaim-hero-copy-new" style={{ transform: copyTransform }}>
          <div className="reclaim-hero-heading"><span className="reclaim-eyebrow">Payment recovery for small businesses</span><h1 id="hero-title"><span>Find the payments</span>{' '}<span>worth a <em>second look.</em></span></h1></div>
          <div className="reclaim-hero-pitch"><p>Reclaim reads the payment records you already have, connects the ones that belong together, and leaves you with evidence a person can review.</p>
            <div className="reclaim-actions"><MagneticLink className="reclaim-button reclaim-button-primary" href={action.href} pendingLabel="Opening workspace…">{action.label}</MagneticLink><a className="reclaim-text-action" data-motion="pressable" href="#value">See how it works</a></div>
          </div>
        </motion.div>
        <motion.div className="hero-audit-kinetic" style={{ transform: auditTransform }}><HeroAudit /></motion.div>
      </div>
    </section>
  )
}

function MottoInterlude() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [stage, setStage] = useState(reduceMotion ? 5 : 0)
  const [readyToContinue, setReadyToContinue] = useState(Boolean(reduceMotion))

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const timers: number[] = []
    const complete = () => { setStage(5); setReadyToContinue(true) }
    if (reduceMotion) {
      complete()
      return
    }
    let started = false
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started) return
      started = true
      observer.disconnect()
      setStage(1)
      const writingDuration = 2_450
      timers.push(window.setTimeout(() => {
        setStage(5)
        setReadyToContinue(true)
      }, writingDuration + 180))
    }, { rootMargin: '-12% 0px -20% 0px', threshold: 0.2 })
    observer.observe(section)
    return () => { observer.disconnect(); timers.forEach((timer) => window.clearTimeout(timer)) }
  }, [reduceMotion])

  useEffect(() => {
    const completeForNavigation = () => { setStage(5); setReadyToContinue(true) }
    window.addEventListener(skipMottoEvent, completeForNavigation)
    return () => window.removeEventListener(skipMottoEvent, completeForNavigation)
  }, [])

  return (
    <section className="motto-interlude" data-stage={stage} data-autoplay={stage > 0} data-complete={stage >= 5} data-ready={readyToContinue} data-reduced={Boolean(reduceMotion)} ref={sectionRef} aria-label="Reclaim's operating principle">
      <div className="motto-stage">
        <div className="motto-accessible"><p>{mottoThought}</p><strong>{mottoPrinciple}</strong><span>That’s Reclaim.</span><span aria-live="polite">{readyToContinue ? 'Statement complete.' : ''}</span></div>
        <div className="motto-visual" aria-hidden="true">
          <PaperField variant="motto" />
          <p className="motto-handwritten">{mottoLines.map((line, index) => <AutoWrittenLine className="motto-ink-line" text={line} active={stage > 0} startAt={index * 380} key={line} />)}</p>
          <div className="motto-principle"><span className="motto-principle-sans">{mottoPrinciple}</span></div>
          <div className="motto-logo-lockup"><ReclaimMark size={42} className="motto-logo-mark" tone="ink" /><ReclaimWordmark className="motto-logo-wordmark" /></div>
          <p className="motto-signoff">That’s Reclaim.</p>
        </div>
      </div>
    </section>
  )
}

function useSectionWake<T extends HTMLElement>(threshold = 0.18) {
  const sectionRef = useRef<T>(null)
  const reduceMotion = useReducedMotion()
  const [awake, setAwake] = useState(Boolean(reduceMotion))

  useEffect(() => {
    const section = sectionRef.current
    if (reduceMotion) {
      setAwake(true)
      return
    }
    if (!section || awake) return
    if (typeof IntersectionObserver === 'undefined') {
      setAwake(true)
      return
    }
    const compactViewport = window.matchMedia('(max-width: 767px)').matches
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setAwake(true)
      observer.disconnect()
    }, {
      rootMargin: compactViewport ? '-4% 0px -6% 0px' : '-8% 0px -14% 0px',
      threshold: compactViewport ? Math.min(threshold, 0.06) : threshold,
    })
    observer.observe(section)
    return () => observer.disconnect()
  }, [awake, reduceMotion, threshold])

  return { sectionRef, awake }
}

function RawLedger() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [sequence, setSequence] = useState(reduceMotion ? 5 : 0)

  useEffect(() => {
    const section = sectionRef.current
    if (!section || reduceMotion) return
    const timers: number[] = []
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      ;[1, 2, 3, 4, 5].forEach((next, index) => timers.push(window.setTimeout(() => setSequence(next), index * 220)))
    }, { rootMargin: '-22% 0px -30% 0px', threshold: 0.2 })
    observer.observe(section)
    return () => { observer.disconnect(); timers.forEach((timer) => window.clearTimeout(timer)) }
  }, [reduceMotion])

  return (
    <section ref={sectionRef} className="raw-ledger ref-scene ref-ledger" data-sequence={sequence} data-reduced={Boolean(reduceMotion)} aria-labelledby="ledger-title">
      <header className="ref-ledger-heading">
        <div><span className="reclaim-eyebrow">Read the relationship, not just the row</span><h2 id="ledger-title">A duplicate can <em>look ordinary.</em></h2></div>
        <p>Fifteen days apart, 2 payments can look unrelated—until the vendor, invoice, and amount line up.</p>
      </header>
      <div className="ref-ledger-composition">
        <div className="ledger-contained-panel">
          <div className="ledger-table ledger-contained-table" role="table" aria-label="Sample source ledger records around invoice INV-3305"><div className="ledger-row ledger-row-head" role="row"><span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Payment date</span><span role="columnheader">Amount paid</span></div>
          {ledgerRecords.map((record, index) => { const matched = record.invoiceNumber === 'INV-3305'; return <div key={record.rowIndex}>{index === 2 && <div className="ledger-gap" data-drawn={sequence >= 3} data-rule={sequence >= 4} aria-hidden="true"><span>15 days</span><i /><span>same invoice · same amount</span></div>}<div className="ledger-row" data-match={matched} data-focus={matched && sequence >= (index === 1 ? 1 : 2)} role="row"><span role="cell">{record.vendor}</span><strong role="cell">{record.invoiceNumber}</strong><time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><strong role="cell">{currency.format(record.amountPaid)}</strong></div></div> })}
          </div>
        </div>
        <aside className="ref-ledger-note" data-settled={sequence >= 5}>
          <span>Ready to verify</span><strong>Exact duplicate payment</strong><p>Vendor, invoice, and amount match across both source rows.</p><div><b>15</b><small>days apart</small></div>
        </aside>
      </div>
    </section>
  )
}

function RecoveryValue() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>()
  const comparisonRows = [
    ['Vendor', canonicalRecords[0].vendor, canonicalRecords[1].vendor, 'Exact match'],
    ['Invoice', canonicalRecords[0].invoiceNumber ?? '—', canonicalRecords[1].invoiceNumber ?? '—', 'Exact match'],
    ['Amount', currency.format(canonicalRecords[0].amountPaid), currency.format(canonicalRecords[1].amountPaid), 'Exact match'],
    ['Paid', formatDate(canonicalRecords[0].paymentDate), formatDate(canonicalRecords[1].paymentDate), '15 days apart'],
  ]
  return <section id="value" className="commercial-value evidence-chapter chapter-ivory wake-section ref-scene ref-evidence" data-awake={awake} ref={sectionRef} aria-labelledby="value-title">
    <div className="commercial-heading"><span className="reclaim-eyebrow">Evidence, not a black box</span><h2 id="value-title">A finding only matters if you can <em>act on it.</em></h2><p>Reclaim keeps the payment, the matching fields, and the reason for review together—so you can decide what happens next.</p></div>
    <div className="ref-evidence-comparison" role="table" aria-label="Evidence comparison for sample invoice INV-3305">
      <div className="ref-evidence-head" role="row"><span role="columnheader">Field</span><span role="columnheader">Payment A</span><span role="columnheader">Payment B</span><span role="columnheader">Why it matters</span></div>
      {comparisonRows.map(([field, first, second, result]) => <div className="ref-evidence-row" role="row" key={field}><strong role="cell">{field}</strong><span role="cell">{first}</span><span role="cell">{second}</span><b role="cell">{result}</b></div>)}
    </div>
    <aside className="ref-evidence-review"><span>Ready to verify</span><strong>Exact duplicate payment</strong><dl><div><dt>Vendor</dt><dd>Sierra Coffee Supply</dd></div><div><dt>Invoice</dt><dd>INV-3305</dd></div><div><dt>Potential recovery</dt><dd>{currency.format(canonicalRecords[0].amountPaid)}</dd></div></dl><p>Review the source rows and make the decision yourself.</p></aside>
  </section>
}

function AccountingFit() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.24)
  return <section className="accounting-fit accounting-bento-chapter wake-section ref-scene ref-workflow" data-awake={awake} ref={sectionRef} aria-labelledby="accounting-title">
    <div className="accounting-fit-copy"><span className="reclaim-eyebrow">Fits the workflow you have</span><h2 id="accounting-title">Keep QuickBooks or Xero. Add a <em>recovery layer.</em></h2><p>Export the payment ledger you already use. Reclaim checks the file locally, shows what it recognized, and carries the source evidence into review.</p></div>
    <div className="ref-workflow-flow" aria-label="Accounting export becomes a Reclaim review">
      <div className="ref-workflow-sources"><span>QuickBooks</span><span>Xero</span><span>Other CSV</span></div>
      <article className="ref-import-sheet"><header><div><span>Payment export</span><strong>sample_payments.csv</strong></div><b>Ready to add</b></header><dl><div><dt>Valid records</dt><dd>{landingSamplePresentation.recordCount}</dd></div><div><dt>Vendors</dt><dd>12</dd></div><div><dt>Date range</dt><dd>Feb–Mar 2025</dd></div><div><dt>Skipped rows</dt><dd>0</dd></div></dl><footer>The file stays in this browser.</footer></article>
      <div className="ref-workflow-extracts" aria-label="Evidence extracted from the import"><span>INV-3305</span><span>Sierra Coffee Supply</span><span>{currency.format(canonicalRecords[0].amountPaid)}</span></div>
      <article className="ref-workspace-panel"><header><ReclaimMark size={28} tone="ink" /><div><strong>Standing ledger</strong><span>sample_payments.csv</span></div></header><nav aria-label="Product workspace areas"><span>Overview</span><span data-active="true">Findings</span><span>Recovery</span></nav><div><small>Recommended next case</small><strong>Exact duplicate payment</strong><p>2 matching source payments · INV-3305</p><b>Ready to verify</b></div></article>
    </div>
  </section>
}

function PortfolioProof() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.2)

  return (
    <section className="portfolio-proof wake-section ref-scene ref-results" data-awake={awake} ref={sectionRef} aria-labelledby="portfolio-proof-title">
      <div className="portfolio-proof-meta">
        <span className="reclaim-eyebrow">Across the complete sample review</span>
        <p>Every amount remains tied to the source rows that explain it.</p>
      </div>
      <div className="portfolio-proof-result">
        <span>Likely recoverable in this sample</span>
        <strong><AnimatedNumber awake={awake} value={landingSamplePresentation.recoverableTotal} format={(number) => currency.format(number)} /></strong>
        <h2 id="portfolio-proof-title">potentially recoverable</h2>
      </div>
      <div className="portfolio-proof-count">
        <span>Payments reviewed</span>
        <strong><AnimatedNumber awake={awake} value={landingSamplePresentation.recordCount} /></strong>
        <small>Complete sample export</small>
      </div>
      <div className="ref-results-slips" aria-label="Amounts included in the sample recovery total"><article><span>Likely recoverable</span><strong>$5,260</strong><small>Summit Supply Co. · Inv. 1839</small></article><article><span>Likely recoverable</span><strong>$6,424</strong><small>Northbridge Services · Inv. 2041</small></article></div>
      <div className="ref-results-table" role="table" aria-label="Sample overview rows connected to the recovery total"><div role="row"><span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Signal</span><span role="columnheader">Amount</span></div><div role="row"><strong role="cell">Summit Supply Co.</strong><span role="cell">Inv. 1839</span><b role="cell">Likely recoverable</b><strong role="cell">$5,260</strong></div><div role="row"><strong role="cell">Northbridge Services</strong><span role="cell">Inv. 2041</span><b role="cell">Likely recoverable</b><strong role="cell">$6,424</strong></div><div role="row"><span role="cell">Bluefield Design</span><span role="cell">Inv. 1782</span><span role="cell">Worth noting</span><span role="cell">$1,250</span></div></div>
      <small className="portfolio-proof-note">Illustrative sample results, not a customer recovery claim.</small>
    </section>
  )
}

function RecoveryProof() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.14)
  return <section id="recovery" className="recovery-proof recovery-case-study chapter-ivory wake-section ref-scene ref-recovery" data-awake={awake} ref={sectionRef} aria-labelledby="recovery-title">
    <div className="commercial-heading"><span className="reclaim-eyebrow">One case, end to end</span><h2 id="recovery-title">From 2 suspicious payments to 1 <em>recovery-ready case.</em></h2><p>Reclaim keeps the comparison, decision, and editable request inside one case file—without rebuilding the evidence from scratch.</p></div>
    <article className="ref-case-file" aria-label="Recovery-ready sample case for invoice INV-3305"><header><div><span>Recovery case</span><strong>INV-3305 · Sierra Coffee Supply</strong></div><b>{currency.format(canonicalRecords[0].amountPaid)}</b></header><div className="ref-case-facts"><div><span>Source records</span><strong>2 payments</strong></div><div><span>Timing</span><strong>15 days apart</strong></div><div><span>Evidence</span><strong>Source rows attached</strong></div><div><span>Decision</span><strong>Confirmed by you</strong></div></div><div className="ref-case-request"><span>Editable recovery draft</span><p>We are reviewing 2 payments associated with invoice INV-3305. Please confirm whether both payments were applied and advise on a refund, credit, or offset for any duplicate amount.</p><small>Vendor, invoice, amount, and payment dates remain linked to the draft.</small></div><ol className="ref-case-lifecycle" aria-label="Recovery case lifecycle"><li data-active="true">Ready to verify</li><li data-active="true">Confirmed</li><li data-active="true">Ready to prepare</li><li>Ready to contact</li><li>Awaiting response</li><li>Resolved</li></ol><footer>Illustrative sample data, not a customer recovery claim.</footer></article>
  </section>
}

function SecurityBoundary() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.2)
  return <section id="security" className="security-boundary security-editorial chapter-ivory wake-section ref-scene ref-security" data-awake={awake} ref={sectionRef} aria-labelledby="security-title">
    <div className="security-statement"><span className="reclaim-eyebrow">A clear boundary</span><h2 id="security-title">Your ledger stays on <em>this device.</em></h2><p>Reclaim reviews the file you choose in your browser. Your accounting data is not uploaded to our servers.</p></div>
    <ul className="ref-security-points"><li><span aria-hidden="true">✓</span><div><strong>Processed locally</strong><p>Parsing and review happen in your browser.</p></div></li><li><span aria-hidden="true">✓</span><div><strong>No silent writeback</strong><p>Your accounting system is never changed for you.</p></div></li><li><span aria-hidden="true">✓</span><div><strong>Delete on demand</strong><p>Remove a saved local project from the workspace.</p></div></li></ul>
    <div className="ref-browser-boundary" aria-label="Browser-local ledger illustration"><header><i /><i /><i /><span>Local Reclaim workspace</span></header><div><article><span>Standing ledger</span><strong>sample_payments.csv</strong><div className="ref-browser-ledger"><div><span>Date</span><span>Vendor</span><span>Amount</span></div>{canonicalRecords.map((record) => <div key={record.rowIndex}><time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><b>{record.vendor}</b><strong>{currency.format(record.amountPaid)}</strong></div>)}</div><footer>Stored on this device</footer></article></div></div>
  </section>
}

function OutcomePricing() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.24)
  const states = [
    ['01', 'Potential case', 'You share the details. We review at no cost.'],
    ['02', 'Confirmed', 'You approve the case and agree the fee.'],
    ['03', 'Outreach', 'The evidence-backed request moves forward.'],
    ['04', 'Verified recovery', 'You receive a refund, credit, or offset.'],
  ]
  return <section id="pricing" className="outcome-pricing pricing-payoff wake-section ref-scene ref-pricing" data-awake={awake} ref={sectionRef} aria-labelledby="pricing-title">
    <div className="ref-pricing-objects" aria-hidden="true">
      <DeferredSceneImage className="ref-pricing-object ref-pricing-object--document" anchorClassName="ref-pricing-object-anchor ref-pricing-object-anchor--document" src={pricingDocument} width={1254} height={1254} />
      <DeferredSceneImage className="ref-pricing-object ref-pricing-object--card" anchorClassName="ref-pricing-object-anchor ref-pricing-object-anchor--card" src={pricingCard} width={1536} height={1024} />
    </div>
    <div className="pricing-promise"><span className="reclaim-eyebrow">Outcome-aligned pricing</span><h2 id="pricing-title">If the money does not come back, <em>you do not pay.</em></h2><p>A fee is agreed before outreach and becomes due only after a verified refund, credit, or offset.</p></div>
    <ol className="ref-pricing-timeline" aria-label="How outcome-aligned pricing works">{states.map(([number, title, body], index) => <li key={number} data-last={index === states.length - 1}><span>{number}</span><i aria-hidden="true" /><strong>{title}</strong><p>{body}</p>{index === states.length - 1 && <b>$0 fee if no money returns</b>}</li>)}</ol>
  </section>
}

function AboutReclaim() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.2)
  return <section id="about" className="about-reclaim chapter-ivory wake-section ref-scene ref-about" data-awake={awake} ref={sectionRef} aria-labelledby="about-title"><span className="about-index">Reclaim · 2026</span><div className="about-statement"><h2 id="about-title"><AutoWrittenLine className="about-ink-line" text="Accounting software records what happened." active={awake} startAt={80} /><AutoWrittenLine className="about-ink-line" text="Reclaim helps you ask whether" active={awake} startAt={620} /><AutoWrittenLine className="about-ink-line" text="money can come back." active={awake} startAt={1_140} italic /></h2></div><div className="about-support"><p>Small businesses should not need an enterprise audit team to follow a suspicious payment. Reclaim keeps the evidence understandable, the decision human, and the recovery work practical.</p><p className="ref-about-principle"><span>Find it.</span> <span>Understand it.</span> <strong>Reclaim it.</strong></p></div><div className="ref-about-records" aria-hidden="true"><span /><span /><span /></div></section>
}

function QuestionsAndAnswers() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.16)
  const [openQuestion, setOpenQuestion] = useState(0)
  const questions = [
    ['Does Reclaim replace QuickBooks or Xero?', 'No. Reclaim adds a focused recovery layer after accounting. You export the ledger you already use, review possible cases, and take confirmed evidence back into your existing workflow.'],
    ['Does Reclaim decide that a payment is wrong?', 'No. Reclaim points to records worth a second look and explains why they match. A person reviews the evidence and confirms the next step.'],
    ['Where does my ledger data go?', 'Your ledger stays on this device, in this browser. It is processed locally, is never uploaded to our servers, and can be deleted from your workspace.'],
    ['When would I pay a recovery fee?', 'Only after a verified refund, credit, or offset. The recovery terms are agreed before outreach; a possible finding or an unanswered request does not create a fee.'],
  ]

  return (
    <section id="faq" className="reclaim-faq chapter-ivory wake-section ref-scene ref-faq" data-awake={awake} ref={sectionRef} aria-labelledby="faq-title">
      <div className="reclaim-faq-intro"><span className="reclaim-eyebrow">Questions, answered plainly</span><h2 id="faq-title">Before you open the ledger.</h2><p>Your data stays local, every finding keeps its evidence, and you remain the decision-maker.</p></div>
      <div className="reclaim-faq-list">
        {questions.map(([question, answer], index) => {
          const open = openQuestion === index
          const answerId = `faq-answer-${index}`
          return <article data-open={open} key={question}><h3><button type="button" aria-expanded={open} aria-controls={answerId} onClick={() => setOpenQuestion((current) => current === index ? -1 : index)}><span>{question}</span><i aria-hidden="true" /></button></h3><div id={answerId} className="reclaim-faq-answer" data-open={open} aria-hidden={!open}><div><p>{answer}</p></div></div></article>
        })}
      </div>
    </section>
  )
}

function ClosingFooter({ action }: { action: LandingAction }) {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.28)
  const footerMenus = [
    { label: 'Product', items: ['Review your ledger', 'Recovery workspace', 'Security', 'Pricing'] },
    { label: 'Resources', items: ['How it works', 'Sample case', 'Guides', 'FAQ'] },
    { label: 'Company', items: ['About Reclaim', 'Contact', 'Privacy', 'Terms'] },
  ]

  return (
    <footer className="reclaim-footer wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="closing-title">
      <div className="reclaim-footer-atmosphere" aria-hidden="true">
        <DitherBackground className="reclaim-footer-dither" showWord={false} />
        <span className="reclaim-footer-scrim" />
      </div>
      <div className="reclaim-footer-shell">
        <div className="reclaim-footer-cta">
          <ReclaimMark size={54} interactive />
          <h2 id="closing-title"><span>Start with the ledger</span>{' '}<span>you <em>already have.</em></span></h2>
          <p>Upload a CSV for a private local review, or open the sample case first.</p>
          <div className="reclaim-actions">
            <MagneticLink className="reclaim-button reclaim-button-primary" href={action.href} pendingLabel="Opening workspace…">{action.label}</MagneticLink>
            <a className="reclaim-text-action" data-motion="pressable" href="/audit?entry=sample">Explore the sample case</a>
          </div>
        </div>
        <div className="reclaim-footer-menu" aria-label="Reclaim footer navigation">
          <div className="reclaim-footer-brand">
            <a href="/" aria-label="Reclaim home"><ReclaimLogo size={28} /></a>
            <p>Find it. Understand it. Reclaim it.</p>
            <small>© 2026 Reclaim</small>
          </div>
          {footerMenus.map((menu) => (
            <section key={menu.label} className="reclaim-footer-menu-column" aria-label={menu.label}>
              <h3>{menu.label}</h3>
              <ul>
                {menu.items.map((item) => <li key={item}><span>{item}</span></li>)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  const [action] = useState(getLandingAction)
  return <div className="reclaim-page reclaim-commercial-page"><a className="reclaim-skip-link" href="#main-content">Skip to main content</a><LandingNav action={action} /><main id="main-content" className="reclaim-main-v2 reclaim-reference-v3" tabIndex={-1}><Hero action={action} /><MottoInterlude /><RawLedger /><RecoveryValue /><AccountingFit /><PortfolioProof /><RecoveryProof /><SecurityBoundary /><OutcomePricing /><AboutReclaim /><QuestionsAndAnswers /></main><ClosingFooter action={action} /></div>
}
