import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { ReclaimLogo, ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import { MagneticLink } from '@/components/landing/MagneticLink'
import { SideRays } from '@/components/landing/SideRays'
import { getSampleLedger } from '@/data/sampleLedger'
import { formatDate } from '@/lib/format'
import './landing.css'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const sample = getSampleLedger()
const canonicalRecords = sample.records
  .filter((record) => record.invoiceNumber === 'INV-3305')
  .sort(
  (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()
  )

if (canonicalRecords.length !== 2) throw new Error('Canonical sample records INV-3305 are missing.')

const ledgerRecords = sample.records.filter((record) =>
  ['INV-3303', 'INV-3305', 'INV-3308'].includes(record.invoiceNumber ?? '')
)

const intakeSteps = [
  {
    id: 'source',
    title: 'Choose your ledger',
    body: 'Start with the export you already use. Source rows stay in view.',
  },
  {
    id: 'fields',
    title: 'Map the fields',
    body: 'See which payment fields Reclaim recognizes—and which still need confirmation.',
  },
  {
    id: 'scope',
    title: 'Set the review',
    body: 'Confirm the scope and required fields before any check is run.',
  },
] as const

const fieldMap = [
  ['Vendor', 'vendor', 'Recognized'],
  ['Payment date', 'payment_date', 'Recognized'],
  ['Amount paid', 'amount_paid', 'Recognized'],
  ['Invoice reference', 'invoice_number', 'Recognized'],
  ['Currency basis', 'Not present in this example', 'Needs confirmation'],
] as const

const mottoThought = 'A payment only tells part of the story. The rest lives in the records around it.'
const mottoPrinciple = 'See the payment. Keep the reason.'
const mottoWords = mottoThought.split(' ')
const mottoWordOffsets = mottoWords.reduce<number[]>((offsets, _word, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + mottoWords[index - 1].length + 1)
  return offsets
}, [])

const navigationItems = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#data-boundary', label: 'Your control' },
] as const

function LandingNav() {
  const [condensed, setCondensed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTarget, setActiveTarget] = useState('')

  useEffect(() => {
    let animationFrame: number | null = null

    const updateNavigation = () => {
      animationFrame = null
      const nextCondensed = window.scrollY > Math.max(72, window.innerHeight * 0.1)

      setCondensed((current) => {
        if (current !== nextCondensed) setMenuOpen(false)
        return nextCondensed
      })
    }

    const scheduleUpdate = () => {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(updateNavigation)
    }

    updateNavigation()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    const targets = navigationItems
      .map((item) => document.querySelector<HTMLElement>(item.href))
      .filter((target): target is HTMLElement => target !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (visible) setActiveTarget(`#${visible.target.id}`)
      },
      { rootMargin: '-24% 0px -62% 0px', threshold: [0.05, 0.2, 0.45] }
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <header className="reclaim-nav-shell" data-condensed={condensed}>
      <nav className="reclaim-nav" data-condensed={condensed} data-menu-open={menuOpen} aria-label="Main navigation">
        <a className="reclaim-nav-brand" href="/" aria-label="Reclaim home">
          <ReclaimMark size={30} interactive />
          <span className="reclaim-nav-wordmark"><ReclaimWordmark interactive /></span>
        </a>

        <div className="reclaim-nav-links">
          {navigationItems.map((item) => (
            <a data-motion="pressable" data-active={activeTarget === item.href} href={item.href} key={item.href}>{item.label}</a>
          ))}
        </div>

        <MagneticLink className="reclaim-nav-action" href="/audit?entry=upload" pendingLabel="Opening…">Start a review</MagneticLink>

        <button
          className="reclaim-menu-button"
          data-motion="pressable"
          data-motion-ray="true"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="reclaim-mobile-menu"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span>{menuOpen ? 'Close' : 'Menu'}</span>
          <span className="reclaim-menu-glyph" aria-hidden="true"><i /><i /></span>
        </button>

        <div className="reclaim-mobile-menu" id="reclaim-mobile-menu" data-open={menuOpen} aria-hidden={!menuOpen}>
          {navigationItems.map((item) => (
            <a data-motion="pressable" data-motion-arrow="true" href={item.href} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} key={item.href}><span>{item.label}</span><span className="reclaim-menu-link-icon motion-arrow" aria-hidden="true">↗</span></a>
          ))}
          <a data-motion="pressable" data-motion-arrow="true" href="/audit?entry=upload" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>Start a review</span><span className="reclaim-menu-link-icon motion-arrow" aria-hidden="true">↗</span></a>
        </div>
      </nav>
    </header>
  )
}

function HeroAudit() {
  return (
    <article className="hero-audit hero-review-preview" data-motion-ray="true" aria-label="Payment review candidate with its source records in view">
      <header className="hero-audit-header">
        <div><span className="hero-audit-pulse" aria-hidden="true" /> Payment review</div>
        <span>80 payment records in scope</span>
      </header>

      <div className="hero-audit-body">
        <div className="hero-audit-ledger" role="table" aria-label="Source records for invoice INV-3305">
          <div className="hero-audit-columns" role="row">
            <span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Paid</span><span role="columnheader">Amount</span>
          </div>
          {canonicalRecords.map((record, index) => (
            <div className="hero-audit-row" data-match={index === canonicalRecords.length - 1} role="row" key={record.rowIndex}>
              <strong role="cell">{record.vendor}</strong>
              <span role="cell">{record.invoiceNumber}</span>
              <time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
              <strong role="cell">{currency.format(record.amountPaid)}</strong>
            </div>
          ))}
          <div className="hero-audit-matchline"><i aria-hidden="true" /><span>Vendor, invoice, and amount align.</span></div>
        </div>

        <aside className="hero-audit-finding">
          <span className="hero-audit-status">Review candidate</span>
          <strong>Possible duplicate payment</strong>
          <p>Vendor, invoice, and amount align.</p>
          <div className="hero-audit-readiness"><span>Amount to review</span><b>{currency.format(canonicalRecords[0].amountPaid)}</b></div>
          <small>A person confirms the outcome.</small>
        </aside>
      </div>
    </article>
  )
}

function Hero({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  return (
    <section ref={heroRef} className="reclaim-hero" aria-labelledby="hero-title">
      <SideRays
        className="reclaim-hero-rays"
        speed={0.45}
        intensity={1.42}
        spread={1.45}
        origin="bottom-right"
        tilt={-15}
        saturation={0.82}
        blend={0.46}
        falloff={1.35}
        opacity={0.76}
      />
      <div className="reclaim-hero-inner">
        <div className="reclaim-hero-copy reclaim-hero-copy-new">
          <h1 id="hero-title">Find the payments worth a second look.</h1>
          <p>
            Your ledger already has the clues. Reclaim connects the rows around a payment so you can review the full reason—not just a flag.
          </p>
          <div className="reclaim-actions">
            <MagneticLink className="reclaim-button reclaim-button-primary" href="#how-it-works">See the review flow</MagneticLink>
            <a className="reclaim-text-action" data-motion="pressable" data-motion-arrow="true" href="/audit?entry=upload">Start a review</a>
          </div>
        </div>
        <HeroAudit />
      </div>
    </section>
  )
}

function MottoInterlude() {
  const sectionRef = useRef<HTMLElement>(null)
  const characterRefs = useRef<Array<HTMLSpanElement | null>>([])
  const handwrittenRef = useRef<HTMLParagraphElement>(null)
  const principleRef = useRef<HTMLDivElement>(null)
  const principleScriptRef = useRef<HTMLSpanElement>(null)
  const principleSansRef = useRef<HTMLSpanElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const raysRef = useRef<HTMLDivElement>(null)
  const signoffRef = useRef<HTMLParagraphElement>(null)
  const revealedCharacters = useRef(-1)
  const reduceMotion = useReducedMotion()
  const [stage, setStage] = useState(reduceMotion ? 5 : 0)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    if (reduceMotion) return

    const range = (start: number, end: number) => Math.min(1, Math.max(0, (progress - start) / (end - start)))

    const revealProgress = Math.min(1, Math.max(0, (progress - 0.02) / 0.54))
    const nextCharacterCount = Math.round(revealProgress * mottoThought.length)

    if (nextCharacterCount !== revealedCharacters.current) {
      revealedCharacters.current = nextCharacterCount
      characterRefs.current.forEach((character, index) => {
        if (character) character.dataset.written = String(index < nextCharacterCount)
      })
    }

    const thoughtExit = range(0.68, 0.8)
    const principleArrival = range(0.68, 0.8)
    const identityArrival = range(0.8, 0.92)
    const materialHandoff = range(0.8, 0.88)
    const signoffArrival = range(0.9, 0.95)

    if (handwrittenRef.current) {
      handwrittenRef.current.style.clipPath = `inset(0 0 ${thoughtExit * 100}% 0)`
      handwrittenRef.current.style.transform = `translate3d(-50%, ${-50 - thoughtExit * 34}%, 0) scale(${1 - thoughtExit * 0.14})`
    }
    if (principleRef.current) {
      const y = 72 - principleArrival * 102 - identityArrival * 6
      const scale = 1.07 - principleArrival * 0.07 - identityArrival * 0.28
      principleRef.current.style.transform = `translate3d(-50%, ${y}%, 0) scale(${scale})`
    }
    if (principleScriptRef.current) {
      const introductionMask = 100 - principleArrival * 100
      principleScriptRef.current.style.clipPath = materialHandoff > 0
        ? `inset(0 0 ${materialHandoff * 100}% 0)`
        : `inset(0 ${introductionMask}% 0 0)`
      principleScriptRef.current.style.transform = `translate3d(0, ${materialHandoff * -0.6}rem, 0) scale(${1 - materialHandoff * 0.04})`
    }
    if (principleSansRef.current) {
      principleSansRef.current.style.clipPath = `inset(0 0 0 ${(1 - materialHandoff) * 100}%)`
      principleSansRef.current.style.transform = `translate3d(0, ${(1 - materialHandoff)}rem, 0) scale(${0.94 + materialHandoff * 0.06})`
    }
    if (logoRef.current) {
      logoRef.current.style.clipPath = `inset(${(1 - identityArrival) * 100}% -10% -10% -10%)`
      logoRef.current.style.transform = `translate3d(-50%, ${(1 - identityArrival) * 2}rem, 0) scale(${0.94 + identityArrival * 0.06})`
    }
    if (raysRef.current) {
      raysRef.current.style.clipPath = `circle(${18 + identityArrival * 60}% at 64% 58%)`
      raysRef.current.style.filter = `brightness(${0.34 + identityArrival * 0.66}) saturate(${0.32 + identityArrival * 0.68})`
      raysRef.current.style.transform = `translate3d(${(1 - identityArrival) * 3}%, ${(1 - identityArrival) * 2}%, 0) scale(${0.96 + identityArrival * 0.04})`
    }
    if (signoffRef.current) signoffRef.current.style.opacity = `${signoffArrival}`

    const nextStage = progress < 0.12
      ? 0
      : progress < 0.58
        ? 1
        : progress < 0.68
          ? 2
          : progress < 0.8
            ? 3
            : progress < 0.9
              ? 4
              : 5

    setStage((current) => current === nextStage ? current : nextStage)
  })

  useEffect(() => {
    if (!reduceMotion) return
    characterRefs.current.forEach((character) => {
      if (character) character.dataset.written = 'true'
    })
    setStage(5)
  }, [reduceMotion])

  return (
    <section className="motto-interlude" data-stage={stage} data-reduced={Boolean(reduceMotion)} ref={sectionRef} aria-label="Reclaim's operating principle">
      <div className="motto-stage">
        <div className="motto-accessible">
          <p>{mottoThought}</p>
          <strong>{mottoPrinciple}</strong>
          <span>That’s Reclaim.</span>
        </div>

        <div className="motto-visual" aria-hidden="true">
          <div className="motto-rays" ref={raysRef}>
            {(stage >= 4 || reduceMotion) && (
              <SideRays
                speed={0.34}
                intensity={1.2}
                spread={1.3}
                origin="bottom-right"
                tilt={-15}
                saturation={0.78}
                blend={0.52}
                falloff={1.5}
                opacity={0.76}
              />
            )}
          </div>
          <p className="motto-handwritten" ref={handwrittenRef}>
            {mottoWords.map((word, wordIndex) => (
              <span
                className="motto-word"
                key={`${word}-${wordIndex}`}
              >
                {Array.from(word).map((character, characterIndex) => {
                  const index = mottoWordOffsets[wordIndex] + characterIndex

                  return (
                    <span
                      className="motto-letter"
                      data-written="false"
                      key={`${character}-${index}`}
                      ref={(node) => { characterRefs.current[index] = node }}
                    >
                      {character}
                    </span>
                  )
                })}
                {wordIndex < mottoWords.length - 1 && <span className="motto-space"> </span>}
              </span>
            ))}
          </p>

          <div className="motto-principle" aria-hidden="true" ref={principleRef}>
            <span className="motto-principle-script" ref={principleScriptRef}>{mottoPrinciple}</span>
            <span className="motto-principle-sans" ref={principleSansRef}>{mottoPrinciple}</span>
          </div>

          <div className="motto-logo-lockup" ref={logoRef}>
            <ReclaimLogo size={48} />
          </div>
          <p className="motto-signoff" ref={signoffRef}>That’s Reclaim.</p>
        </div>
      </div>
    </section>
  )
}

function ReviewIntake() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [activeStep, setActiveStep] = useState(reduceMotion ? 2 : 0)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    if (reduceMotion) return
    const nextStep = progress < 0.34 ? 0 : progress < 0.52 ? 1 : 2
    setActiveStep((current) => current === nextStep ? current : nextStep)
  })

  useEffect(() => {
    if (reduceMotion) setActiveStep(2)
  }, [reduceMotion])

  return (
    <section id="how-it-works" className="review-intake intake-continuum" data-stage={activeStep} data-reduced={Boolean(reduceMotion)} ref={sectionRef} aria-labelledby="intake-title">
      <div className="reclaim-section-heading">
        <h2 id="intake-title">See the review before you start.</h2>
        <p>Choose the ledger. Reclaim maps the payment fields it can use and makes every missing input clear before the review begins.</p>
      </div>

      <div className="intake-continuum-surface" aria-label="Source, structure, and review scope">
        <ol className="intake-continuum-index" aria-label="Review setup sequence">
          {intakeSteps.map((step, index) => (
            <li data-active={activeStep === index} key={step.id}>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>

        <article className="intake-continuum-bands" aria-label="The same ledger records become mapped fields and a visible review scope">
          <header className="intake-surface-bar">
            <span>Payment review setup</span><strong>INV-3305 · Sierra Coffee Supply</strong><small>CSV, TSV, or .xlsx export</small>
          </header>

          <div className="intake-source-rows" role="table" aria-label="Payment ledger source rows">
            <div className="intake-source-head" role="row">
              <span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Payment date</span><span role="columnheader">Amount paid</span>
            </div>
            {ledgerRecords.slice(0, 3).map((record) => (
              <div role="row" key={record.rowIndex} data-record={record.invoiceNumber === 'INV-3305'}>
                <span role="cell">{record.vendor}</span>
                <strong role="cell">{record.invoiceNumber}</strong>
                <time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
                <strong role="cell">{currency.format(record.amountPaid)}</strong>
              </div>
            ))}
          </div>

          <section className="intake-transform-fields" aria-label="Recognized payment fields">
            <header><span>Recognized payment fields</span><strong>The source record keeps its identity.</strong></header>
            <table>
              <thead><tr><th>Payment field</th><th>Source</th><th>State</th></tr></thead>
              <tbody>
                {fieldMap.map(([label, source, state]) => (
                  <tr key={label}><th scope="row">{label}</th><td>{source}</td><td data-state={state === 'Recognized' ? 'recognized' : 'needs'}>{state}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="intake-transform-scope" aria-label="Visible review scope">
            <header><span>Review scope</span><strong>Confirm what this file can support.</strong></header>
            <div className="intake-scope-lines">
              <div data-state="ready"><span>Available from this file</span><strong>Vendor, invoice, payment date, and paid amount</strong></div>
              <div data-state="needs"><span>Needs confirmation</span><strong>Currency basis, payment status, and source-event identity</strong></div>
              <div data-state="outside"><span>Review begins after</span><strong>Required scope and exclusions are confirmed</strong></div>
            </div>
          </section>
          <footer className="intake-surface-footer"><span>Original source rows remain attached</span><b>{activeStep === 2 ? 'Scope visible' : activeStep === 1 ? 'Fields mapped' : 'Ledger chosen'}</b></footer>
        </article>
      </div>
    </section>
  )
}

function RawLedger() {
  const reduceMotion = useReducedMotion()
  const [sequence, setSequence] = useState(reduceMotion ? 5 : 0)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const timers: number[] = []

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (reduceMotion) {
            setSequence(5)
          } else {
            setSequence(1)
            timers.push(window.setTimeout(() => setSequence(2), 220))
            timers.push(window.setTimeout(() => setSequence(3), 460))
            timers.push(window.setTimeout(() => setSequence(4), 1_180))
            timers.push(window.setTimeout(() => setSequence(5), 1_500))
          }
          observer.disconnect()
        }
      },
      { rootMargin: '-22% 0px -30% 0px', threshold: 0.2 }
    )

    observer.observe(section)
    return () => {
      observer.disconnect()
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [reduceMotion])

  return (
    <section ref={sectionRef} className="raw-ledger" data-sequence={sequence} data-reduced={Boolean(reduceMotion)} aria-labelledby="ledger-title">
      <div className="ledger-intro">
        <div>
          <h2 id="ledger-title">A duplicate can look ordinary.</h2>
          <p>Fifteen days apart, these payments are easy to miss until the ledger is read as one connected record.</p>
        </div>
        <div className="ledger-gap-proof" aria-label="The matching payments are 15 days apart">
          <strong>15</strong>
          <span>days apart</span>
        </div>
      </div>

      <div className="ledger-table" role="table" aria-label="Sample ledger records around invoice INV-3305">
        <div className="ledger-row ledger-row-head" role="row">
          <span role="columnheader">Vendor</span>
          <span role="columnheader">Invoice</span>
          <span role="columnheader">Payment date</span>
          <span role="columnheader">Amount paid</span>
        </div>
        {ledgerRecords.map((record, index) => {
          const matched = record.invoiceNumber === 'INV-3305'
          return (
            <div key={record.rowIndex}>
              {index === 2 ? (
                <div className="ledger-gap" data-drawn={sequence >= 3} data-rule={sequence >= 4} aria-hidden="true">
                  <span>15 days</span><i /><span>same invoice · same amount</span>
                </div>
              ) : null}
              <div className="ledger-row" data-match={matched} data-focus={matched && sequence >= (index === 1 ? 1 : 2)} role="row">
                <span role="cell">{record.vendor}</span>
                <strong role="cell">{record.invoiceNumber}</strong>
                <time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
                <strong role="cell">{currency.format(record.amountPaid)}</strong>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ledger-discovery" data-settled={sequence >= 5}>
        <span>Matched on vendor, invoice, and amount.</span>
        <strong>Source rows stay attached.</strong>
      </div>
    </section>
  )
}

const storySteps = [
  {
    title: 'Connect the records.',
    body: 'Keep the source payments and the rule that linked them in one case.',
  },
  {
    title: 'Review the context.',
    body: 'Ask what the records mean with the evidence still in view.',
  },
  {
    title: 'Keep the decision.',
    body: 'Save the outcome and the reviewer’s reason for the next time it matters.',
  },
]

function StoryQuestion({ active, onContinue }: { active: boolean; onContinue: () => void }) {
  return (
    <article className="story-question-card" aria-hidden={!active}>
      <span>Human review</span>
      <h3>Do these records describe the same obligation?</h3>
      <dl>
        <div><dt>Vendor</dt><dd>Sierra Coffee Supply</dd></div>
        <div><dt>Invoice</dt><dd>INV-3305</dd></div>
        <div><dt>Amount to review</dt><dd>{currency.format(canonicalRecords[0].amountPaid)}</dd></div>
      </dl>
      <button className="reclaim-confirm-button" data-motion="pressable" data-motion-ray="true" type="button" onClick={onContinue} tabIndex={active ? 0 : -1}>
        Continue to decision
      </button>
    </article>
  )
}

function StoryDecision({ active }: { active: boolean }) {
  return (
    <article className="story-decision-sheet" aria-hidden={!active}>
      <header><span>Decision record</span><span>INV-3305</span></header>
      <div className="story-decision-body">
        <span>Decision options</span>
        <h3>Keep the reason with the case.</h3>
        <dl>
          <div><dt>Confirm for follow-up</dt><dd>Available</dd></div>
          <div><dt>Mark as expected</dt><dd>Available</dd></div>
          <div><dt>Needs more evidence</dt><dd>Available</dd></div>
        </dl>
        <p>No outcome is selected until a person chooses and saves a reason.</p>
      </div>
    </article>
  )
}

function EvidenceStory() {
  const reduceMotion = useReducedMotion()
  const [activeStage, setActiveStage] = useState(reduceMotion ? 2 : 0)
  const [compactStory, setCompactStory] = useState(false)
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([])
  const layoutRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const recordFragmentsRef = useRef<HTMLDivElement>(null)
  const recordFragmentRefs = useRef<Array<HTMLElement | null>>([])
  const ruleCardRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: layoutRef, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const layout = layoutRef.current
    if (!layout) return
    if (reduceMotion || window.innerWidth < 1024) {
      if (canvasRef.current) canvasRef.current.style.transform = 'none'
      recordFragmentRefs.current.forEach((record) => { if (record) record.style.transform = 'none' })
      if (ruleCardRef.current) ruleCardRef.current.style.removeProperty('transform')
      return
    }
    const wake = Math.min(1, progress / 0.11)
    if (canvasRef.current) {
      canvasRef.current.style.transitionProperty = 'border-color'
      canvasRef.current.style.transform = `translate3d(0, ${(1 - wake) * 44}px, 0) scale(${0.992 + wake * 0.008})`
    }
    recordFragmentRefs.current.forEach((record, index) => {
      if (!record) return
      if (wake >= 1) {
        record.style.transform = 'none'
        record.style.removeProperty('transition-property')
      } else {
        record.style.transitionProperty = 'border-color'
        record.style.transform = `translate3d(${(index === 0 ? -1 : 1) * (1 - wake) * 42}px, ${(1 - wake) * 28}px, 0) rotate(${(index === 0 ? -1 : 1) * (1 - wake) * 1.2}deg)`
      }
    })
    if (ruleCardRef.current) {
      if (wake >= 1) {
        ruleCardRef.current.style.transform = 'none'
        ruleCardRef.current.style.removeProperty('transition-property')
      } else {
        ruleCardRef.current.style.transitionProperty = 'border-color, background-color'
        ruleCardRef.current.style.transform = `translate3d(0, ${(1 - wake) * 38}px, 0) rotate(${(1 - wake) * -0.8}deg) scale(${0.96 + wake * 0.04})`
      }
    }
    const nextStage = Math.min(2, Math.floor(Math.max(0, progress - 0.08) / 0.3067))
    setActiveStage((current) => current === nextStage ? current : nextStage)
  })

  useEffect(() => {
    if (reduceMotion) setActiveStage(2)
  }, [reduceMotion])

  useEffect(() => {
    const syncCompactStory = () => setCompactStory(window.innerWidth < 1024)
    syncCompactStory()
    window.addEventListener('resize', syncCompactStory)
    return () => window.removeEventListener('resize', syncCompactStory)
  }, [])

  const goToStoryStage = (index: number) => {
    const layout = layoutRef.current
    if (!layout) return
    if (compactStory) {
      const selector = index === 0 ? '.story-record-fragments' : index === 1 ? '.story-question-card' : '.story-decision-sheet'
      layout.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'auto', block: 'center' })
      return
    }
    const absoluteTop = layout.getBoundingClientRect().top + window.scrollY
    const pinRange = Math.max(1, layout.offsetHeight - window.innerHeight)
    const targetProgress = [0.14, 0.46, 0.8][index]
    window.scrollTo({ top: absoluteTop + pinRange * targetProgress, behavior: 'auto' })
    setActiveStage(index)
  }

  return (
    <section id="evidence" className="evidence-story" aria-labelledby="evidence-title">
      <div className="story-intro">
        <h2 id="evidence-title">The evidence stays with the question.</h2>
        <p>When you save a case, it keeps the source rows, the rule that connected them, and the reason behind the decision.</p>
      </div>

      <div className="story-layout" ref={layoutRef}>
        <div className="story-steps">
          {storySteps.map((step, index) => (
            <button
              type="button"
              className="story-step"
              data-motion="pressable"
              data-motion-ray="true"
              data-stage={index}
              data-active={!compactStory && activeStage === index}
              key={step.title}
              ref={(node) => { stepRefs.current[index] = node }}
              onClick={() => goToStoryStage(index)}
              aria-pressed={compactStory ? undefined : activeStage === index}
            >
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </button>
          ))}
        </div>

        <div className="story-canvas story-continuity-canvas" ref={canvasRef} data-stage={activeStage} data-reduced={Boolean(reduceMotion)}>
          <div className="story-canvas-bar">
            <ReclaimMark size={27} />
            <span>INV-3305</span>
            <span className="story-status-window" aria-hidden="true">
              <span className="story-status-reel"><b>Evidence connected</b><b>Human review</b><b>Decision options</b></span>
            </span>
            <span className="story-status-compact" aria-hidden="true">Complete review sequence</span>
            <span className="reclaim-visually-hidden" aria-live="polite">{compactStory ? 'Complete review sequence' : activeStage === 2 ? 'Decision options' : activeStage === 1 ? 'Human review' : 'Evidence connected'}</span>
          </div>
          <div className="story-shared-workspace">
            <div className="story-record-fragments" ref={recordFragmentsRef} aria-label="Source payment records kept with case INV-3305">
              {canonicalRecords.map((record, index) => (
                <article
                  className="story-record-fragment"
                  ref={(node) => { recordFragmentRefs.current[index] = node }}
                  key={record.rowIndex}
                  data-related={index === 1}
                  style={{ transform: `translate3d(${index === 0 ? -42 : 42}px, 28px, 0) rotate(${index === 0 ? -1.2 : 1.2}deg)` }}
                >
                  <span>{index === 0 ? 'Source payment 01' : 'Source payment 02'}</span><strong>{record.invoiceNumber}</strong><p>Sierra Coffee Supply</p><time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time><b>{currency.format(record.amountPaid)}</b>
                </article>
              ))}
            </div>
            <article className="story-rule-card" ref={ruleCardRef} style={{ transform: 'translate3d(0, 38px, 0) rotate(-0.8deg) scale(0.96)' }}>
              <span>Rule that connected them</span><strong>Same vendor · same invoice · same amount</strong><p>Two payment records point to the same obligation.</p>
            </article>
            <StoryQuestion active={Boolean(reduceMotion) || compactStory || activeStage === 1} onContinue={() => goToStoryStage(2)} />
            <StoryDecision active={Boolean(reduceMotion) || compactStory || activeStage === 2} />
          </div>
          <p className="story-human-guardrail">Reclaim presents the evidence. A person decides the outcome.</p>
        </div>
        <div className="story-scroll-spacer" aria-hidden="true" />
      </div>

      <aside className="local-privacy" aria-label="Review boundary">
        <strong>The boundary is explicit.</strong>
        <span>Reclaim reviews the file you choose. It does not write to your accounting system or contact vendors.</span>
      </aside>
    </section>
  )
}

const patternRows = [
  ['Sierra Coffee Supply', 'INV-3303', 'Feb 14', 'Paid $4,850'],
  ['Sierra Coffee Supply', 'INV-3305', 'Feb 28', 'Paid $6,800'],
  ['Sierra Coffee Supply', 'INV-3305', 'Mar 15', 'Paid $6,800'],
  ['Sierra Coffee Supply', 'INV-3308', 'Mar 7', 'Paid $6,000'],
  ['Northline Logistics', 'BOL-441', 'Apr 2', 'Paid $2,940'],
  ['Northline Logistics', 'BOL-449', 'Apr 9', 'Paid $2,940'],
  ['Harbor Office Group', 'PO-771', 'Apr 12', 'Inv $7,800 · paid $7,320'],
] as const

const patternQuestions = [
  { name: 'Same invoice', rule: 'Same vendor · same invoice · same amount', output: 'Same invoice, same amount.', support: 'Two payment records point to the same obligation.', tone: 'green', rows: '02 + 03' },
  { name: 'Nearby equal', rule: 'Same vendor · same amount · nearby dates', output: 'Two equal payments, close together.', support: 'The invoice reference differs, so the case needs context.', tone: 'amber', rows: '05 + 06' },
  { name: 'Amount comparison', rule: 'Invoice amount compared with paid amount', output: 'A difference worth checking.', support: 'A difference can be valid. Keep the source values in view.', tone: 'blue', rows: '07' },
] as const

function PatternCoverage() {
  const reduceMotion = useReducedMotion()
  const [activePattern, setActivePattern] = useState(reduceMotion ? 2 : 0)
  const sectionRef = useRef<HTMLElement>(null)
  const productFieldRef = useRef<HTMLDivElement>(null)
  const patternLedgerRef = useRef<HTMLDivElement>(null)
  const patternRelationsRef = useRef<HTMLDivElement>(null)
  const patternCandidatesRef = useRef<HTMLDivElement>(null)
  const relationLineRefs = useRef<Array<HTMLElement | null>>([])
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const section = sectionRef.current
    if (!section) return
    if (reduceMotion || window.innerWidth < 1024) {
      if (productFieldRef.current) productFieldRef.current.style.transform = 'none'
      if (patternLedgerRef.current) patternLedgerRef.current.style.transform = 'none'
      if (patternRelationsRef.current) patternRelationsRef.current.style.transform = 'none'
      if (patternCandidatesRef.current) patternCandidatesRef.current.style.transform = 'none'
      relationLineRefs.current.forEach((line) => { if (line) line.style.transform = 'scaleX(1)' })
      return
    }
    const wake = Math.min(1, progress / 0.1)
    const staged = Math.min(0.999, Math.max(0, (progress - 0.1) / 0.9))
    const nextPattern = Math.min(2, Math.floor(staged * 3))
    const localProgress = (staged * 3) - nextPattern
    if (productFieldRef.current) productFieldRef.current.style.transform = `translate3d(0, ${(1 - wake) * 56}px, 0) scale(${0.992 + wake * 0.008})`
    if (patternLedgerRef.current) patternLedgerRef.current.style.transform = `translate3d(${(1 - wake) * 1.2}rem, 0, 0) scale(${1.035 - wake * 0.035})`
    if (patternRelationsRef.current) patternRelationsRef.current.style.transform = `translate3d(${(1 - wake) * -28}px, ${(1 - wake) * 18}px, 0) rotate(${(1 - wake) * -0.8}deg) scale(${0.965 + wake * 0.035})`
    if (patternCandidatesRef.current) patternCandidatesRef.current.style.transform = `translate3d(${(1 - wake) * -34}px, ${(1 - wake) * 28}px, 0) scale(${0.96 + wake * 0.04})`
    relationLineRefs.current.forEach((line, index) => {
      if (!line) return
      const lineScale = index < nextPattern ? 1 : index === nextPattern ? Math.min(1, localProgress / 0.68) : 0.08
      line.style.transform = `scaleX(${lineScale})`
    })
    setActivePattern((current) => current === nextPattern ? current : nextPattern)
  })

  useEffect(() => {
    if (reduceMotion) setActivePattern(2)
  }, [reduceMotion])

  return (
    <section
      ref={sectionRef}
      id="patterns"
      className="pattern-field"
      data-stage={activePattern}
      data-reduced={Boolean(reduceMotion)}
      aria-labelledby="patterns-title"
    >
      <div className="pattern-sticky-stage">
        <div className="pattern-intro">
          <span>Pattern field</span>
          <h2 id="patterns-title">One ledger can raise more than one question.</h2>
          <p>Reclaim reads the relationships between payments, then keeps the evidence in view for a person to review.</p>
        </div>
        <div className="pattern-product-field" ref={productFieldRef} aria-label="Three review questions formed from one payment ledger">
          <div className="pattern-field-bar"><span>Payment ledger</span><span>7 source records</span><span>Visible evidence</span></div>
          <div className="pattern-ledger" ref={patternLedgerRef} role="table" aria-label="Source payment ledger">
            <div className="pattern-ledger-head" role="row"><span role="columnheader">Vendor</span><span role="columnheader">Invoice</span><span role="columnheader">Paid</span><span role="columnheader">Invoice / paid</span></div>
            {patternRows.map((row, index) => (
              <div className="pattern-ledger-row" data-row={index + 1} role="row" key={`${row[1]}-${row[2]}`}>
                {row.map((cell, cellIndex) => <span role="cell" key={cellIndex}>{cell}</span>)}
              </div>
            ))}
          </div>
          <div className="pattern-relations" ref={patternRelationsRef} aria-label="Visible relationship rules">
            {patternQuestions.map((pattern, index) => (
              <article className="pattern-relation" data-active={activePattern === index} data-complete={activePattern > index} data-tone={pattern.tone} key={pattern.name}>
                <span>Question 0{index + 1}</span><b>{pattern.rows}</b><i aria-hidden="true" ref={(node) => { relationLineRefs.current[index] = node }} /><strong>{pattern.rule}</strong>
              </article>
            ))}
          </div>
          <div className="pattern-candidates" ref={patternCandidatesRef} aria-label="Review candidates">
            <span className="pattern-candidates-label">Review candidates</span>
            {patternQuestions.map((pattern, index) => (
              <article className="pattern-candidate" data-active={activePattern === index} data-complete={activePattern > index} data-tone={pattern.tone} key={pattern.output}>
                <span>{pattern.name}</span><strong>{pattern.output}</strong><p>{pattern.support}</p>
              </article>
            ))}
          </div>
          <p className="pattern-limit">What Reclaim can review depends on the fields in the ledger you choose.</p>
        </div>
        <div className="pattern-mobile-sequence" aria-label="Three payment review questions">
          {patternQuestions.map((pattern, index) => (
            <article className="pattern-mobile-question" data-tone={pattern.tone} key={pattern.name}>
              <header><span>Question 0{index + 1}</span><strong>{pattern.name}</strong></header>
              <div className="pattern-mobile-sources">
                {index === 0 && <><span>Sierra Coffee Supply · INV-3305 · Feb 28 · $6,800</span><span>Sierra Coffee Supply · INV-3305 · Mar 15 · $6,800</span></>}
                {index === 1 && <><span>Northline Logistics · BOL-441 · Apr 2 · $2,940</span><span>Northline Logistics · BOL-449 · Apr 9 · $2,940</span></>}
                {index === 2 && <><span>Harbor Office Group · PO-771</span><span>Invoice $7,800 · Paid $7,320</span></>}
              </div>
              <div className="pattern-mobile-rule"><span>Visible rule</span><strong>{pattern.rule}</strong></div>
              <div className="pattern-mobile-candidate"><span>Review candidate</span><strong>{pattern.output}</strong><p>{pattern.support}</p></div>
            </article>
          ))}
          <p>What Reclaim can review depends on the fields in the ledger you choose.</p>
        </div>
      </div>
    </section>
  )
}

function DecisionTrail() {
  const sectionRef = useRef<HTMLElement>(null)
  const progressLineRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [trailStage, setTrailStage] = useState(reduceMotion ? 3 : 0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 85%', 'end 35%'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const settled = reduceMotion ? 1 : progress
    if (progressLineRef.current) progressLineRef.current.style.transform = `scaleY(${Math.min(1, settled / 0.75)})`
    const nextStage = reduceMotion ? 3 : Math.min(3, Math.floor(progress * 4))
    setTrailStage((current) => current === nextStage ? current : nextStage)
  })

  return (
    <section ref={sectionRef} id="decisions" className="decision-trail" data-stage={trailStage} data-reduced={Boolean(reduceMotion)} aria-labelledby="decisions-title">
      <div className="reclaim-section-heading">
        <h2 id="decisions-title">A flag starts a review. It does not finish one.</h2>
        <p>Keep the decision, its reason, and the source records together so the same question is not rebuilt later.</p>
      </div>

      <div className="decision-table" role="table" aria-label="Decision history for invoice INV-3305">
        <i className="decision-progress-line" ref={progressLineRef} aria-hidden="true" />
        <div className="decision-row decision-row-head" role="row">
          <span role="columnheader">Event</span><span role="columnheader">Case</span><span role="columnheader">What remains</span><span role="columnheader">State</span>
        </div>
        <div className="decision-row" data-event="1" data-active={trailStage >= 1} role="row">
          <strong role="cell">Case created</strong><span role="cell">INV-3305</span><span role="cell">Rule and source rows</span><b role="cell">Reviewing</b>
        </div>
        <div className="decision-row" data-event="2" data-active={trailStage >= 2} role="row">
          <strong role="cell">Evidence reviewed</strong><span role="cell">INV-3305</span><span role="cell">Context and open questions</span><b role="cell">Human review</b>
        </div>
        <div className="decision-row" data-event="3" data-current="true" data-active={trailStage >= 3} role="row">
          <strong role="cell">Decision saved</strong><span role="cell">INV-3305</span><span role="cell">Outcome and reviewer reason</span><b role="cell">In history</b>
        </div>
      </div>
      <div className="decision-options" data-settled={trailStage >= 3}>
        <span>Available outcomes</span>
        <strong>Confirm for follow-up</strong><strong>Mark as expected</strong><strong>Needs more evidence</strong>
      </div>
    </section>
  )
}

function ControlCorridor() {
  const sectionRef = useRef<HTMLElement>(null)
  const corridorPathRef = useRef<HTMLElement>(null)
  const corridorRecordRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [corridorStage, setCorridorStage] = useState(reduceMotion ? 2 : 0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 88%', 'end 18%'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const settled = reduceMotion ? 1 : Math.max(0, Math.min(1, progress))
    if (corridorPathRef.current) corridorPathRef.current.style.transform = `rotate(-10deg) scaleY(${settled})`
    if (corridorRecordRef.current) corridorRecordRef.current.style.transform = `translate3d(${settled * 8.5}rem, ${settled * 24.5}rem, 2rem) scale(0.98)`
    const nextStage = reduceMotion ? 2 : Math.min(2, Math.floor(settled * 3))
    setCorridorStage((current) => current === nextStage ? current : nextStage)
  })

  return (
    <section ref={sectionRef} id="data-boundary" className="control-corridor" data-stage={corridorStage} data-reduced={Boolean(reduceMotion)} aria-labelledby="boundary-title">
      <div className="reclaim-section-heading">
        <h2 id="boundary-title">You decide where the review goes.</h2>
        <p>Reclaim reads the ledger you choose, helps you review it, and leaves the decision with you.</p>
      </div>

      <div className="corridor-scene" aria-label="The chosen ledger moves through a limited review corridor">
        <i className="corridor-path" ref={corridorPathRef} aria-hidden="true" />
        <div className="corridor-planes">
          <article className="corridor-plane" data-plane="0" data-active={corridorStage === 0}>
            <span>01 · Source</span><strong>Your source ledger</strong><p>The rows and fields you choose to review.</p>
            <i className="corridor-mobile-record" aria-hidden="true">INV-3305 · $6,800</i>
          </article>
          <article className="corridor-plane" data-plane="1" data-active={corridorStage === 1}>
            <span>02 · Workspace</span><strong>Review in Reclaim</strong><p>Patterns, evidence, and a place to decide.</p>
            <i className="corridor-mobile-record" aria-hidden="true">Evidence · Human review</i>
          </article>
          <article className="corridor-plane" data-plane="2" data-active={corridorStage === 2}>
            <span>03 · Saved work</span><strong>Your saved review record</strong><p>The case, outcome, and reason you choose to keep.</p>
            <i className="corridor-mobile-record" aria-hidden="true">Decision · Reason kept</i>
          </article>
        </div>
        <article className="corridor-record" ref={corridorRecordRef} aria-label="Payment record INV-3305 moving through the review">
          <span>INV-3305</span><strong>$6,800</strong><b>{corridorStage === 2 ? 'Reason kept' : corridorStage === 1 ? 'Evidence attached' : 'Source record'}</b>
        </article>
        <aside className="corridor-uncrossed" aria-label="Actions outside Reclaim's review boundary">
          <span>Uncrossed lanes</span>
          <strong>No accounting-system writeback</strong>
          <strong>No vendor outreach</strong>
          <strong>No decision made on your behalf</strong>
        </aside>
      </div>
      <p className="corridor-local-note">When you choose local retention, your project stays in this browser on this device. Reclaim makes no network request with your ledger.</p>
    </section>
  )
}

function DossierAssembles() {
  const sectionRef = useRef<HTMLElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const registerRef = useRef<HTMLElement>(null)
  const evidenceIndexRef = useRef<HTMLElement>(null)
  const bindingRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [dossierStage, setDossierStage] = useState(reduceMotion ? 3 : 0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 90%', 'end 16%'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const settled = reduceMotion ? 1 : Math.max(0, Math.min(1, progress))
    if (summaryRef.current) summaryRef.current.style.transform = `translate3d(0, ${(1 - settled) * 1.4}rem, 0) rotate(-0.35deg)`
    if (registerRef.current) registerRef.current.style.transform = `translate3d(${(1 - settled) * -5.5}rem, ${(1 - settled) * 6.5}rem, 0) rotate(-1.2deg)`
    if (evidenceIndexRef.current) evidenceIndexRef.current.style.transform = `translate3d(${(1 - settled) * 5.8}rem, ${(1 - settled) * 10.5}rem, 0) rotate(1.25deg)`
    if (bindingRef.current) bindingRef.current.style.transform = `scaleY(${settled})`
    const nextStage = reduceMotion ? 3 : Math.min(3, Math.floor(settled * 4))
    setDossierStage((current) => current === nextStage ? current : nextStage)
  })

  return (
    <section ref={sectionRef} id="output" className="dossier-section" data-stage={dossierStage} data-reduced={Boolean(reduceMotion)} aria-labelledby="output-title">
      <div className="reclaim-section-heading">
        <h2 id="output-title">The review should not disappear when the meeting ends.</h2>
        <p>Save the scope, findings, evidence, and decisions in one record you can use.</p>
      </div>

      <div className="dossier-workspace" aria-label="Review summary, findings register, and evidence index assembling into a saved review record">
        <div className="dossier-bar"><ReclaimMark size={27} /><span>Review record</span><span>Built from saved work</span></div>
        <article className="dossier-piece dossier-summary" ref={summaryRef}>
          <span>01 · Review summary</span><h3>What the review covered.</h3>
          <dl><div><dt>Source scope</dt><dd>Included</dd></div><div><dt>Review state</dt><dd>Included</dd></div><div><dt>Supporting evidence</dt><dd>Linked</dd></div></dl>
        </article>
        <article className="dossier-piece dossier-register" ref={registerRef}>
          <span>02 · Findings register</span><h3>The cases and their current review state.</h3>
          <p><b>INV-3305</b><em>Human decision saved</em></p><p><b>BOL-441 / BOL-449</b><em>Needs context</em></p>
        </article>
        <article className="dossier-piece dossier-evidence-index" ref={evidenceIndexRef}>
          <span>03 · Evidence index</span><h3>The records behind each case.</h3>
          <p><b>2</b><em>source payments</em></p><p><b>3</b><em>matched fields</em></p>
        </article>
        <i className="dossier-binding" ref={bindingRef} aria-hidden="true" />
        <div className="dossier-final-label" aria-live="polite">
          <span>Saved review record</span><strong>{dossierStage >= 3 ? 'Bound and ready to keep' : 'Assembling saved work'}</strong>
        </div>
      </div>
    </section>
  )
}

function RecurringReview() {
  const sectionRef = useRef<HTMLElement>(null)
  const connectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [recurringStage, setRecurringStage] = useState(reduceMotion ? 3 : 0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 88%', 'end 30%'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const settled = reduceMotion ? 1 : Math.max(0, Math.min(1, progress))
    if (connectionRef.current) connectionRef.current.style.transform = `scaleY(${settled})`
    const nextStage = reduceMotion ? 3 : Math.min(3, Math.floor(settled * 4))
    setRecurringStage((current) => current === nextStage ? current : nextStage)
  })

  return (
    <section ref={sectionRef} id="recurring" className="recurring-review" data-stage={recurringStage} data-reduced={Boolean(reduceMotion)} aria-labelledby="recurring-title">
      <div className="ledger-intro">
        <div>
          <h2 id="recurring-title">The next review remembers the last one.</h2>
          <p>For compatible reviews in the same project, prior decisions stay beside current evidence so familiar cases do not start from zero.</p>
        </div>
        <div className="ledger-gap-proof"><strong>3</strong><span>states in view</span></div>
      </div>
      <div className="ledger-table recurring-table" role="table" aria-label="Recurring review comparison">
        <i className="recurring-connection" ref={connectionRef} aria-hidden="true" />
        <div className="ledger-row ledger-row-head" role="row"><span role="columnheader">Comparison</span><span role="columnheader">Prior context</span><span role="columnheader">Current evidence</span><span role="columnheader">State</span></div>
        <div className="ledger-row" data-active={recurringStage >= 1} role="row"><strong role="cell">New case</strong><span role="cell">None</span><span role="cell">New source rows</span><strong role="cell">Review</strong></div>
        <div className="ledger-row" data-match="true" data-active={recurringStage >= 2} role="row"><strong role="cell">Decision retained</strong><span role="cell">Reason available</span><span role="cell">Familiar pattern</span><strong role="cell">Context kept</strong></div>
        <div className="ledger-row" data-active={recurringStage >= 3} role="row"><strong role="cell">Resolved later</strong><span role="cell">Case history</span><span role="cell">Later evidence</span><strong role="cell">Changed</strong></div>
      </div>
      <div className="ledger-discovery recurring-discovery"><span>Compared with the prior review.</span><strong>History remains available.</strong></div>
    </section>
  )
}

function Closing() {
  const sectionRef = useRef<HTMLElement>(null)
  const closingInnerRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 92%', 'end 35%'] })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const settled = reduceMotion ? 1 : Math.max(0, Math.min(1, progress))
    if (closingInnerRef.current) closingInnerRef.current.style.transform = `translate3d(0, ${(1 - settled) * 1.4}rem, 0) scale(${0.96 + settled * 0.04})`
  })

  return (
    <section ref={sectionRef} className="reclaim-closing" data-reduced={Boolean(reduceMotion)} aria-labelledby="closing-title">
      <div className="reclaim-closing-inner" ref={closingInnerRef}>
        <ReclaimMark size={76} interactive />
        <h2 id="closing-title">Start with the ledger on your desk.</h2>
        <p>See what Reclaim can review before you begin—and keep the reason once you decide.</p>
        <div className="reclaim-actions">
          <MagneticLink className="reclaim-button reclaim-button-primary" href="/audit?entry=upload" pendingLabel="Opening workspace…">Start a review</MagneticLink>
          <a className="reclaim-text-action" data-motion="pressable" data-motion-arrow="true" href="/audit?entry=sample">Open a guided example</a>
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  const heroRef = useRef<HTMLElement>(null)

  return (
    <div className="reclaim-page">
      <a className="reclaim-skip-link" href="#main-content">Skip to main content</a>
      <LandingNav />
      <main id="main-content">
        <Hero heroRef={heroRef} />
        <MottoInterlude />
        <ReviewIntake />
        <RawLedger />
        <PatternCoverage />
        <EvidenceStory />
        <DecisionTrail />
        <ControlCorridor />
        <DossierAssembles />
        <RecurringReview />
        <Closing />
      </main>
      <footer className="reclaim-footer">
        <a href="/" aria-label="Reclaim home"><ReclaimLogo size={28} /></a>
        <p>Payment review that keeps the reason.</p>
        <a data-motion="pressable" data-motion-arrow="true" href="/audit?entry=upload">Start a review</a>
      </footer>
    </div>
  )
}
