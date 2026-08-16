import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { ReclaimLogo, ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import { MagneticLink } from '@/components/landing/MagneticLink'
import { SideRays } from '@/components/landing/SideRays'
import { getSampleLedger } from '@/data/sampleLedger'
import { ACTIVE_PROJECT_KEY, readProjectIndex } from '@/ledger/projectIndex'
import { formatDate } from '@/lib/format'
import './landing.css'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
})

const sample = getSampleLedger()
const canonicalRecords = sample.records
  .filter((record) => record.invoiceNumber === 'INV-3305')
  .sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
const ledgerRecords = sample.records.filter((record) =>
  ['INV-3303', 'INV-3305', 'INV-3308'].includes(record.invoiceNumber ?? '')
)

if (canonicalRecords.length !== 2) throw new Error('Canonical sample records INV-3305 are missing.')

const mottoThought = 'A payment only tells part of the story. The rest lives in the records around it.'
const mottoPrinciple = 'See the payment. Keep the reason.'
const skipMottoEvent = 'reclaim:skip-motto'
const mottoWords = mottoThought.split(' ')
const mottoWordOffsets = mottoWords.reduce<number[]>((offsets, _word, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + mottoWords[index - 1].length + 1)
  return offsets
}, [])

interface LandingAction {
  label: string
  href: string
  context: string | null
}

function getLandingAction(): LandingAction {
  const projects = readProjectIndex()
  if (projects.length === 0) return { label: 'Review your ledger', href: '/audit?entry=upload', context: null }

  const activeId = window.localStorage.getItem(ACTIVE_PROJECT_KEY)
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
    window.setTimeout(() => document.querySelector<HTMLElement>(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
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
      <motion.nav className="reclaim-nav reclaim-product-nav" data-condensed={condensed} data-menu-open={menuOpen} aria-label="Main navigation">
        <motion.a className="reclaim-nav-brand" href="/" aria-label="Reclaim home" layout="position">
          <motion.span className="reclaim-nav-mark" layout="position"><ReclaimMark size={28} interactive /></motion.span>
          <AnimatePresence initial={false}>
            {!condensed && <motion.span className="reclaim-nav-wordmark" initial={{ opacity: 0, transform: 'translate3d(0, 0, 0)', filter: 'blur(2px)' }} animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)', filter: 'blur(0px)' }} exit={{ opacity: 0, transform: 'translate3d(0, 0, 0)', filter: 'blur(2px)' }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}><ReclaimWordmark interactive /></motion.span>}
          </AnimatePresence>
        </motion.a>
        <div className="reclaim-nav-links">
          {navigationItems.map((item) => <a data-motion="pressable" data-active={activeTarget === item.href} href={item.href} onClick={(event) => navigateToSection(event, item.href)} key={item.href}>{item.label}</a>)}
        </div>
        <MagneticLink className="reclaim-nav-action" href={action.href} pendingLabel="Opening…">
          <span className="reclaim-nav-action-copy">{action.label}{action.context && <small>{action.context}</small>}</span>
        </MagneticLink>
        <button className="reclaim-menu-button" data-motion="pressable" type="button" aria-expanded={menuOpen} aria-controls="reclaim-mobile-menu" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen((open) => !open)}>
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
  return (
    <article className="hero-audit hero-review-preview" aria-label="Example payment recovery case with its source records">
      <header className="hero-audit-header"><div>Recovery case</div><span>Example from a payment export</span></header>
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
          <strong>Possible duplicate payment</strong><p>Two source payments point to the same obligation.</p>
          <div className="hero-audit-readiness"><span>Amount to confirm</span><b>{currency.format(canonicalRecords[0].amountPaid)}</b></div><small>A person confirms the case before outreach.</small>
        </aside>
      </div>
    </article>
  )
}

function Hero({ action }: { action: LandingAction }) {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.32 })
  const copyTransform = useTransform(smoothProgress, (progress) => reduceMotion ? 'none' : `translate3d(0, ${-progress * 14}px, 0) skewY(${-progress * 0.18}deg)`)
  const auditTransform = useTransform(smoothProgress, (progress) => reduceMotion ? 'none' : `translate3d(0, ${-progress * 26}px, 0) rotate(${progress * 0.3}deg) skewY(${progress * 0.14}deg)`)
  const assuranceTransform = useTransform(smoothProgress, (progress) => reduceMotion ? 'none' : `translate3d(0, ${-progress * 9}px, 0)`)
  const heroOpacity = useTransform(smoothProgress, [0, 0.72, 1], [1, 0.98, 0.82])

  return (
    <section className="reclaim-hero" ref={sectionRef} aria-labelledby="hero-title">
      <div className="reclaim-hero-inner">
        <motion.div className="reclaim-hero-copy reclaim-hero-copy-new" style={{ transform: copyTransform, opacity: reduceMotion ? 1 : heroOpacity }}>
          <div className="reclaim-hero-heading"><span className="reclaim-eyebrow">Payment recovery for small businesses</span><h1 id="hero-title">Find the payments worth a second look.</h1></div>
          <div className="reclaim-hero-pitch"><p>Upload a QuickBooks, Xero, or accounting CSV. Reclaim connects suspicious payments to evidence and helps you pursue confirmed recoveries.</p>
            <div className="reclaim-actions"><MagneticLink className="reclaim-button reclaim-button-primary" href={action.href} pendingLabel="Opening workspace…">{action.label}</MagneticLink><a className="reclaim-text-action" data-motion="pressable" href="/audit?entry=sample">Explore a sample case</a></div>
          </div>
        </motion.div>
        <motion.div className="hero-audit-kinetic" style={{ transform: auditTransform, opacity: reduceMotion ? 1 : heroOpacity }}><HeroAudit /></motion.div>
        <motion.div className="reclaim-hero-assurance" style={{ transform: assuranceTransform, opacity: reduceMotion ? 1 : heroOpacity }} aria-label="Product assurances"><span>CSV in</span><span>Evidence attached</span><span>Ledger stays local</span><span>No recovery, no fee</span></motion.div>
      </div>
    </section>
  )
}

function MottoInterlude() {
  const sectionRef = useRef<HTMLElement>(null)
  const characterRefs = useRef<Array<HTMLSpanElement | null>>([])
  const revealedCharacters = useRef(-1)
  const reduceMotion = useReducedMotion()
  const queuedCharacters = useRef(-1)
  const characterFrame = useRef<number | null>(null)
  const stageRef = useRef(reduceMotion ? 5 : 0)
  const autoStartedRef = useRef(false)
  const bypassedGateRef = useRef(false)
  const [stage, setStage] = useState(reduceMotion ? 5 : 0)
  const [autoStarted, setAutoStarted] = useState(false)
  const [readyToContinue, setReadyToContinue] = useState(Boolean(reduceMotion))
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    if (reduceMotion || autoStartedRef.current || window.innerWidth < 1024) return
    const revealProgress = Math.min(1, Math.max(0, (progress - 0.04) / 0.49))
    const nextCharacterCount = Math.round(revealProgress * mottoThought.length)
    if (nextCharacterCount !== revealedCharacters.current) {
      queuedCharacters.current = nextCharacterCount
      if (characterFrame.current === null) {
        characterFrame.current = window.requestAnimationFrame(() => {
          const previous = Math.max(0, revealedCharacters.current)
          const next = queuedCharacters.current
          const firstChanged = Math.min(previous, next)
          const lastChanged = Math.max(previous, next)
          for (let index = firstChanged; index < lastChanged; index += 1) {
            const character = characterRefs.current[index]
            if (character) character.dataset.written = String(index < next)
          }
          revealedCharacters.current = next
          characterFrame.current = null
        })
      }
    }
    const nextStage = progress < 0.08 ? 0 : 1
    if (nextStage !== stageRef.current) {
      stageRef.current = nextStage
      setStage(nextStage)
    }
    if (progress >= 0.53) {
      autoStartedRef.current = true
      setAutoStarted(true)
    }
  })

  useEffect(() => {
    if (reduceMotion) {
      characterRefs.current.forEach((character) => { if (character) character.dataset.written = 'true' })
      stageRef.current = 5
      setStage(5)
      setReadyToContinue(true)
      return
    }
    if (!autoStarted || readyToContinue) return
    characterRefs.current.forEach((character) => { if (character) character.dataset.written = 'true' })
    setReadyToContinue(false)
    stageRef.current = 2
    setStage(2)
    const timers = [
      window.setTimeout(() => { stageRef.current = 3; setStage(3) }, 320),
      window.setTimeout(() => { stageRef.current = 4; setStage(4) }, 1320),
      window.setTimeout(() => { stageRef.current = 5; setStage(5) }, 2320),
      window.setTimeout(() => setReadyToContinue(true), 3000),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [autoStarted, readyToContinue, reduceMotion])

  useEffect(() => {
    if (reduceMotion || window.innerWidth >= 1024 || !sectionRef.current) return
    let started = false
    let timer: number | null = null
    const revealOnArrival = () => {
      if (started) return
      started = true
      stageRef.current = 1
      setStage(1)
      let index = 0
      const writeNext = () => {
        const character = characterRefs.current[index]
        if (character) character.dataset.written = 'true'
        index += 1
        if (index < mottoThought.length) {
          timer = window.setTimeout(writeNext, 22)
          return
        }
        revealedCharacters.current = mottoThought.length
        timer = window.setTimeout(() => { stageRef.current = 3; setStage(3) }, 180)
        window.setTimeout(() => { stageRef.current = 4; setStage(4) }, 620)
        window.setTimeout(() => { stageRef.current = 5; setStage(5); setReadyToContinue(true) }, 940)
      }
      writeNext()
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect()
        revealOnArrival()
      }
    }, { threshold: 0.28 })
    observer.observe(sectionRef.current)
    return () => {
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [reduceMotion])

  useEffect(() => {
    const bypassForNavigation = () => {
      bypassedGateRef.current = true
      autoStartedRef.current = true
      characterRefs.current.forEach((character) => { if (character) character.dataset.written = 'true' })
      stageRef.current = 5
      setStage(5)
      setReadyToContinue(true)
      setAutoStarted(true)
    }
    window.addEventListener(skipMottoEvent, bypassForNavigation)
    return () => window.removeEventListener(skipMottoEvent, bypassForNavigation)
  }, [])

  useEffect(() => () => { if (characterFrame.current !== null) window.cancelAnimationFrame(characterFrame.current) }, [])

  useEffect(() => {
    if (!autoStarted || readyToContinue || reduceMotion || window.innerWidth < 1024) return
    const root = document.documentElement
    const lockedScrollY = window.scrollY
    const previousScrollBehavior = root.style.scrollBehavior

    root.dataset.reclaimScrollGate = 'true'
    root.style.scrollBehavior = 'auto'

    const blockedKeys = new Set([' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'])
    const blockScroll = (event: Event) => event.preventDefault()
    const holdPosition = () => {
      if (Math.abs(window.scrollY - lockedScrollY) < 1) return
      if (!bypassedGateRef.current) window.scrollTo(0, lockedScrollY)
    }
    const finishEarly = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stageRef.current = 5
        setStage(5)
        setReadyToContinue(true)
        return
      }
      if (blockedKeys.has(event.key)) event.preventDefault()
    }
    window.addEventListener('wheel', blockScroll, { passive: false })
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('keydown', finishEarly)
    window.addEventListener('scroll', holdPosition, { passive: true })

    return () => {
      window.removeEventListener('wheel', blockScroll)
      window.removeEventListener('touchmove', blockScroll)
      window.removeEventListener('keydown', finishEarly)
      window.removeEventListener('scroll', holdPosition)
      delete root.dataset.reclaimScrollGate
      if (!bypassedGateRef.current) window.scrollTo(0, lockedScrollY)
      root.style.scrollBehavior = previousScrollBehavior
    }
  }, [autoStarted, readyToContinue, reduceMotion])

  return (
    <section className="motto-interlude" data-stage={stage} data-autoplay={autoStarted} data-complete={stage >= 5} data-ready={readyToContinue} data-reduced={Boolean(reduceMotion)} ref={sectionRef} aria-label="Reclaim's operating principle">
      <div className="motto-stage"><div className="motto-accessible"><p>{mottoThought}</p><strong>{mottoPrinciple}</strong><span>That is Reclaim.</span><span aria-live="polite">{readyToContinue ? 'Animation complete. Scroll down to continue.' : ''}</span></div>
        <div className="motto-visual" aria-hidden="true">
          <div className="motto-rays">{!reduceMotion && <SideRays speed={stage >= 3 ? 0.34 : 0} intensity={2.08} spread={1.3} origin="bottom-right" tilt={-15} saturation={0.84} blend={0.52} falloff={1.5} opacity={0.92} />}</div>
          <p className="motto-handwritten">{mottoWords.map((word, wordIndex) => <span className="motto-word" key={`${word}-${wordIndex}`}>{Array.from(word).map((character, characterIndex) => { const index = mottoWordOffsets[wordIndex] + characterIndex; return <span className="motto-letter" data-written="false" key={`${character}-${index}`} ref={(node) => { characterRefs.current[index] = node }}>{character}</span> })}{wordIndex < mottoWords.length - 1 && <span className="motto-space"> </span>}</span>)}</p>
          <div className="motto-principle"><span className="motto-principle-script">{mottoPrinciple}</span><span className="motto-principle-sans">{mottoPrinciple}</span></div>
          <div className="motto-logo-lockup"><ReclaimMark size={48} className="motto-logo-mark" /><ReclaimWordmark className="motto-logo-wordmark" /></div><p className="motto-signoff">That is Reclaim.</p><p className="motto-scroll-cue"><span>Scroll down</span><i aria-hidden="true" /></p>
        </div>
      </div>
    </section>
  )
}

function KineticFrame({ children, direction }: { children: ReactNode; direction: -1 | 1 }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState(false)
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start 94%', 'end 6%'] })
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 115, damping: 27, mass: 0.34 })
  const planeTransform = useTransform(smoothProgress, (progress) => {
    if (reduceMotion) return 'none'
    const narrow = window.innerWidth < 768
    const entry = Math.max(0, 1 - progress / 0.27)
    const exit = Math.max(0, (progress - 0.78) / 0.22)
    const y = (narrow ? 11 : 20) * entry - (narrow ? 3 : 6) * exit
    const skew = direction * (narrow ? -0.5 : -1.05) * entry + direction * (narrow ? 0.06 : 0.16) * exit
    const rotation = direction * (narrow ? -0.1 : -0.24) * entry + direction * (narrow ? 0.02 : 0.04) * exit
    return `translate3d(0, ${y}px, 0) skewY(${skew}deg) rotate(${rotation}deg)`
  })
  const planeOpacity = useTransform(smoothProgress, [0, 0.11, 0.88, 1], [0.82, 1, 1, 0.95])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || reduceMotion) return
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: '12% 0px', threshold: 0.04 })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [reduceMotion])

  return <div className="kinetic-frame" data-active={active} data-direction={direction > 0 ? 'right' : 'left'} ref={frameRef}>
    <motion.div className="kinetic-plane" style={{ transform: planeTransform, opacity: reduceMotion ? 1 : planeOpacity }}>{children}</motion.div>
  </div>
}

function useSectionWake<T extends HTMLElement>(threshold = 0.18) {
  const sectionRef = useRef<T>(null)
  const reduceMotion = useReducedMotion()
  const [awake, setAwake] = useState(Boolean(reduceMotion))

  useEffect(() => {
    const section = sectionRef.current
    if (!section || reduceMotion || awake) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setAwake(true)
      observer.disconnect()
    }, { rootMargin: '-8% 0px -14% 0px', threshold })
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
    if (!section || reduceMotion || sequence > 0) return
    const timers: number[] = []
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || sequence > 0) return
      observer.disconnect()
      ;[1, 2, 3, 4, 5].forEach((next, index) => timers.push(window.setTimeout(() => setSequence(next), index * 220)))
    }, { rootMargin: '-22% 0px -30% 0px', threshold: 0.2 })
    observer.observe(section)
    return () => { observer.disconnect(); timers.forEach((timer) => window.clearTimeout(timer)) }
  }, [reduceMotion, sequence])

  return (
    <section ref={sectionRef} className="raw-ledger" data-sequence={sequence} data-reduced={Boolean(reduceMotion)} aria-labelledby="ledger-title">
      <div className="ledger-intro"><div><h2 id="ledger-title">A duplicate can look ordinary.</h2><p>Fifteen days apart, these payments are easy to miss until the ledger is read as one connected record.</p></div><div className="ledger-gap-proof" aria-label="The matching payments are 15 days apart"><strong>15</strong><span>days apart</span></div></div>
      <div className="ledger-table" role="table" aria-label="Sample ledger records around invoice INV-3305"><div className="ledger-row ledger-row-head" role="row"><span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Payment date</span><span role="columnheader">Amount paid</span></div>
        {ledgerRecords.map((record, index) => { const matched = record.invoiceNumber === 'INV-3305'; return <div key={record.rowIndex}>{index === 2 && <div className="ledger-gap" data-drawn={sequence >= 3} data-rule={sequence >= 4} aria-hidden="true"><span>15 days</span><i /><span>same invoice · same amount</span></div>}<div className="ledger-row" data-match={matched} data-focus={matched && sequence >= (index === 1 ? 1 : 2)} role="row"><span role="cell">{record.vendor}</span><strong role="cell">{record.invoiceNumber}</strong><time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><strong role="cell">{currency.format(record.amountPaid)}</strong></div></div> })}
      </div>
      <div className="ledger-discovery" data-settled={sequence >= 5}><span>Matched on vendor, invoice, and amount.</span><strong>Source rows stay attached.</strong></div>
    </section>
  )
}

function RecoveryValue() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>()
  const values = [
    ['01', 'Find what is worth attention.', 'Deterministic checks connect payments that share meaningful fields, without pretending every match is a mistake.'],
    ['02', 'Understand why it matters.', 'Each case keeps the exact rows, matched fields, amount, and open questions together for human review.'],
    ['03', 'Move confirmed money forward.', 'Turn a confirmed case into an editable, evidence-backed recovery request with a clear next action.'],
  ]
  return <section id="value" className="commercial-value wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="value-title"><div className="commercial-heading"><h2 id="value-title">A finding only matters if you can act on it.</h2><p>Reclaim is the recovery layer after accounting. It does not replace your books or make the decision for you.</p></div><div className="commercial-value-grid">{values.map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
}

function AccountingFit() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.24)
  return <section className="accounting-fit wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="accounting-title"><div className="accounting-fit-copy"><h2 id="accounting-title">Keep QuickBooks or Xero. Add a recovery layer.</h2><p>Export the payment ledger you already use, review it locally, and take the evidence back into the workflow your business trusts. No direct connection is required.</p></div><div className="accounting-fit-flow" aria-label="Accounting export flows into Reclaim recovery review"><div className="accounting-sources"><span>QuickBooks</span><span>Xero</span><span>Other CSV</span></div><i aria-hidden="true" /><article><ReclaimMark size={32} /><div><strong>Reclaim</strong><span>Review and recovery</span></div></article></div></section>
}

function RecoveryProof() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.14)
  return <section id="recovery" className="recovery-proof wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="recovery-title"><div className="commercial-heading"><span className="reclaim-eyebrow">One case, end to end</span><h2 id="recovery-title">From two suspicious payments to one recovery-ready case.</h2><p>This example shows what Reclaim preserves so a business can pursue the money without rebuilding the evidence from scratch.</p></div><div className="recovery-case">
    <header><div><span>Example case</span><strong>INV-3305 · Sierra Coffee Supply</strong></div><b>{currency.format(canonicalRecords[0].amountPaid)}</b></header>
    <div className="recovery-case-body"><div className="recovery-evidence"><span className="recovery-case-label">Evidence attached</span>{canonicalRecords.map((record) => <div key={record.rowIndex}><time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><strong>{record.invoiceNumber}</strong><b>{currency.format(record.amountPaid)}</b></div>)}<p>Same vendor, invoice, and amount. Paid 15 days apart.</p></div><div className="recovery-request"><span className="recovery-case-label">Editable request</span><p>We are reviewing two payments associated with invoice INV-3305. Please confirm whether both payments were applied and advise on a refund, credit, or offset for any duplicate amount.</p><small>Professional, specific, and based only on the records in the case.</small></div></div>
    <ol className="recovery-lifecycle" aria-label="Recovery lifecycle"><li data-active="true"><span>Potential</span></li><li data-active="true"><span>Confirmed</span></li><li><span>Requested</span></li><li><span>Recovered</span></li></ol><footer>Illustrative sample data, not a customer recovery claim.</footer>
  </div></section>
}

function SecurityBoundary() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.2)
  return <section id="security" className="security-boundary wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="security-title"><div className="security-statement"><h2 id="security-title">Your ledger stays on this device, in this browser. It is never uploaded to our servers.</h2><p>Review data is retained locally so you can leave and continue later. You can delete any project and its saved ledger from the workspace.</p></div><div className="security-controls"><article><span>01</span><strong>Processed locally</strong><p>Ledger parsing and review happen in your browser.</p></article><article><span>02</span><strong>No silent writeback</strong><p>Reclaim does not change your accounting system or contact a vendor for you.</p></article><article><span>03</span><strong>Delete on demand</strong><p>A visible delete control removes the selected local project.</p></article></div></section>
}

function OutcomePricing() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.24)
  return <section id="pricing" className="outcome-pricing wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="pricing-title"><div className="pricing-promise"><span className="reclaim-eyebrow">Outcome-aligned pricing</span><h2 id="pricing-title">If the money does not come back, you do not pay.</h2><p>A recovery fee is agreed before outreach and becomes due only after a verified refund, credit, or offset. A finding by itself is never the bill.</p></div><div className="pricing-ledger" aria-label="How recovery pricing works"><div><span>Potential case</span><strong>{currency.format(canonicalRecords[0].amountPaid)}</strong><small>No fee</small></div><div><span>Confirmed and requested</span><strong>Evidence sent</strong><small>No fee yet</small></div><div data-recovered="true"><span>Verified recovery</span><strong>Money returned</strong><small>Agreed fee becomes due</small></div><footer><span>Not recovered</span><strong>$0 fee</strong></footer></div></section>
}

function AboutReclaim() {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.2)
  return <section id="about" className="about-reclaim wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="about-title"><div><h2 id="about-title">Accounting software records what happened. Reclaim helps you ask whether money can come back.</h2><p>Small businesses should not need an enterprise audit team to follow a suspicious payment. Reclaim keeps the evidence understandable, the decision human, and the recovery work practical.</p></div></section>
}

function Closing({ action }: { action: LandingAction }) {
  const { sectionRef, awake } = useSectionWake<HTMLElement>(0.28)
  return <section className="reclaim-closing wake-section" data-awake={awake} ref={sectionRef} aria-labelledby="closing-title"><div className="reclaim-closing-inner"><ReclaimMark size={64} interactive /><h2 id="closing-title"><span>Start with the ledger</span><span>you already have.</span></h2><p>Upload a CSV for a private local review, or open the sample case first.</p><div className="reclaim-actions"><MagneticLink className="reclaim-button reclaim-button-primary" href={action.href} pendingLabel="Opening workspace…">{action.label}</MagneticLink><a className="reclaim-text-action" data-motion="pressable" href="/audit?entry=sample">Explore the sample case</a></div></div></section>
}

export function LandingPage() {
  const [action] = useState(getLandingAction)
  return <div className="reclaim-page reclaim-commercial-page"><a className="reclaim-skip-link" href="#main-content">Skip to main content</a><LandingNav action={action} /><main id="main-content"><Hero action={action} /><MottoInterlude /><KineticFrame direction={-1}><RawLedger /></KineticFrame><KineticFrame direction={1}><RecoveryValue /></KineticFrame><KineticFrame direction={-1}><AccountingFit /></KineticFrame><KineticFrame direction={1}><RecoveryProof /></KineticFrame><KineticFrame direction={-1}><SecurityBoundary /></KineticFrame><KineticFrame direction={1}><OutcomePricing /></KineticFrame><KineticFrame direction={-1}><AboutReclaim /></KineticFrame><KineticFrame direction={1}><Closing action={action} /></KineticFrame></main><footer className="reclaim-footer"><a href="/" aria-label="Reclaim home"><ReclaimLogo size={28} /></a><p>Find it. Understand it. Reclaim it.</p><a data-motion="pressable" href={action.href}>{action.label}</a></footer></div>
}
