import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useMotionValueEvent, useScroll } from 'motion/react'
import { ReclaimLogo, ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import { MagneticLink } from '@/components/landing/MagneticLink'
import { SideRays } from '@/components/landing/SideRays'
import { getSampleLedger } from '@/data/sampleLedger'
import { detectFindings } from '@/lib/detection'
import { formatDate } from '@/lib/format'
import type { Finding, FindingClass } from '@/types'
import './landing.css'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const sample = getSampleLedger()
const sampleResult = detectFindings(sample.records)
const matchedCanonicalFinding = sampleResult.findings.find(
  (finding) =>
    finding.type === 'exact_duplicate' &&
    finding.class === 'recoverable' &&
    finding.relatedRecords.some((record) => record.invoiceNumber === 'INV-3305')
)

if (!matchedCanonicalFinding) throw new Error('Canonical sample finding INV-3305 is missing.')

const canonicalFinding: Finding = matchedCanonicalFinding

const canonicalRecords = [...canonicalFinding.relatedRecords].sort(
  (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()
)

const ledgerRecords = sample.records.filter((record) =>
  ['INV-3303', 'INV-3305', 'INV-3308'].includes(record.invoiceNumber ?? '')
)

const outcomeData: Array<{
  className: FindingClass
  label: string
  description: string
  total: number
  count: number
}> = [
  {
    className: 'recoverable',
    label: 'Likely recoverable',
    description: 'Evidence supports a recovery review.',
    total: sampleResult.recoverableTotal,
    count: sampleResult.findings.filter((finding) => finding.class === 'recoverable').length,
  },
  {
    className: 'review',
    label: 'Needs review',
    description: 'A person should verify the context.',
    total: sampleResult.reviewTotal,
    count: sampleResult.findings.filter((finding) => finding.class === 'review').length,
  },
  {
    className: 'opportunity',
    label: 'Future savings',
    description: 'A process change could prevent loss.',
    total: sampleResult.opportunityTotal,
    count: sampleResult.findings.filter((finding) => finding.class === 'opportunity').length,
  },
]

function LandingNav() {
  const [condensed, setCondensed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  return (
    <header className="reclaim-nav-shell" data-condensed={condensed}>
      <nav className="reclaim-nav" data-condensed={condensed} data-menu-open={menuOpen} aria-label="Main navigation">
        <a className="reclaim-nav-brand" href="/" aria-label="Reclaim home">
          <ReclaimMark size={30} interactive />
          <span className="reclaim-nav-wordmark"><ReclaimWordmark interactive /></span>
        </a>

        <div className="reclaim-nav-links">
          <a href="#evidence">Evidence</a>
          <a href="#analysis">Analysis</a>
          <a href="/audit?upload=1">Use your ledger</a>
        </div>

        <MagneticLink className="reclaim-nav-action" href="/audit?sample=1" pendingLabel="Opening…">Run sample audit</MagneticLink>

        <button
          className="reclaim-menu-button"
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
          <a href="#evidence" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>Evidence</span><span className="reclaim-menu-link-icon" aria-hidden="true">↗</span></a>
          <a href="#analysis" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>Analysis</span><span className="reclaim-menu-link-icon" aria-hidden="true">↗</span></a>
          <a href="/audit?upload=1" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>Use your ledger</span><span className="reclaim-menu-link-icon" aria-hidden="true">↗</span></a>
          <a href="/audit?sample=1" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>Run sample audit</span><span className="reclaim-menu-link-icon" aria-hidden="true">↗</span></a>
        </div>
      </nav>
    </header>
  )
}

function HeroAudit() {
  return (
    <article className="hero-audit" aria-label="Animated sample audit showing a duplicate payment finding">
      <header className="hero-audit-header">
        <div><span className="hero-audit-pulse" aria-hidden="true" /> Sample audit</div>
        <span>{sample.records.length} records scanned</span>
      </header>

      <div className="hero-audit-body">
        <div className="hero-audit-ledger" aria-label="Matched payment records">
          <div className="hero-audit-columns" aria-hidden="true">
            <span>Vendor</span><span>Invoice</span><span>Paid</span><span>Amount</span>
          </div>
          {canonicalRecords.map((record, index) => (
            <div className="hero-audit-row" data-match={index === 1} key={record.rowIndex}>
              <strong>{record.vendor}</strong>
              <span>{record.invoiceNumber}</span>
              <time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
              <strong>{currency.format(record.amountPaid)}</strong>
            </div>
          ))}
          <div className="hero-audit-matchline" aria-hidden="true"><i /><span>3 matching fields</span></div>
        </div>

        <aside className="hero-audit-finding">
          <span className="hero-audit-status">Recovery ready</span>
          <strong>Exact duplicate payment</strong>
          <p>Vendor, invoice, and amount match.</p>
          <div className="hero-audit-total"><span>Potential recovery</span><b>{currency.format(canonicalFinding.dollarImpact)}</b></div>
          <small>Human confirmation required</small>
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
          <h1 id="hero-title">
            <span>Find payments that{' '}</span>
            <span>never should have left.</span>
          </h1>
          <p>
            Reclaim finds suspicious vendor payments, shows the exact records behind each flag, and keeps every decision human.
          </p>
          <div className="reclaim-actions">
            <MagneticLink className="reclaim-button reclaim-button-primary" href="/audit?sample=1" pendingLabel="Opening sample audit…">Run sample audit</MagneticLink>
            <a className="reclaim-text-action" href="/audit?upload=1">Use your ledger</a>
          </div>
        </div>
        <HeroAudit />
      </div>
    </section>
  )
}

function RawLedger() {
  const [discovered, setDiscovered] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDiscovered(true)
          observer.disconnect()
        }
      },
      { rootMargin: '-22% 0px -30% 0px', threshold: 0.2 }
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} className="raw-ledger" data-discovered={discovered} aria-labelledby="ledger-title">
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
                <div className="ledger-gap" aria-hidden="true">
                  <span>15 days</span><i /><span>same invoice · same amount</span>
                </div>
              ) : null}
              <div className="ledger-row" data-match={matched} role="row">
                <span role="cell">{record.vendor}</span>
                <strong role="cell">{record.invoiceNumber}</strong>
                <time role="cell" dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
                <strong role="cell">{currency.format(record.amountPaid)}</strong>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ledger-discovery">
        <span>Matched on vendor, invoice, and amount.</span>
        <a href="/audit?sample=1">Recovery-ready: {currency.format(canonicalFinding.dollarImpact)}</a>
      </div>
    </section>
  )
}

const storySteps = [
  {
    title: 'Connect the records.',
    body: 'Reclaim keeps the original payment and the possible duplicate attached to the same finding.',
  },
  {
    title: 'Confirm the evidence.',
    body: 'The rule is visible, the source rows stay linked, and a person decides whether the flag is valid.',
  },
  {
    title: 'Prepare the recovery.',
    body: 'A recovery request starts with the exact invoice, payment dates, amount, and evidence already included.',
  },
]

function EvidenceRecords() {
  return (
    <div className="story-evidence-records">
      {canonicalRecords.map((record, index) => (
        <div key={record.rowIndex} data-duplicate={index === 1}>
          <span>{index === 0 ? 'Original payment' : 'Possible duplicate'}</span>
          <strong>{record.invoiceNumber}</strong>
          <time dateTime={record.paymentDate.toISOString()}>{formatDate(record.paymentDate)}</time>
          <strong>{currency.format(record.amountPaid)}</strong>
        </div>
      ))}
      <div className="story-match-rule">
        <span>Matched on</span>
        <strong>Vendor</strong>
        <strong>Invoice</strong>
        <strong>Amount</strong>
      </div>
    </div>
  )
}

function ReviewState({ active, onConfirm }: { active: boolean; onConfirm: () => void }) {
  return (
    <div className="story-review-state">
      <div className="story-review-heading">
        <span>Review finding</span>
        <strong>Do these records describe the same obligation?</strong>
      </div>
      <dl>
        <div><dt>Vendor</dt><dd>Sierra Coffee Supply</dd></div>
        <div><dt>Invoice</dt><dd>INV-3305</dd></div>
        <div><dt>Extra payment</dt><dd>{currency.format(canonicalFinding.dollarImpact)}</dd></div>
      </dl>
      <button className="reclaim-confirm-button" type="button" onClick={onConfirm} tabIndex={active ? 0 : -1}>Confirm and prepare request</button>
      <small>Reclaim never sends a request without your review.</small>
    </div>
  )
}

function RecoveryDocument() {
  return (
    <article className="recovery-document">
      <header>
        <span>Recovery request</span>
        <span>Draft</span>
      </header>
      <div>
        <p>Sierra Coffee Supply</p>
        <h3>Duplicate payment for invoice INV-3305</h3>
        <p>
          Our records show two payments of {currency.format(canonicalFinding.dollarImpact)} for the same invoice. Please confirm the available recovery method.
        </p>
        <dl>
          <div><dt>Original payment</dt><dd>{formatDate(canonicalRecords[0].paymentDate)}</dd></div>
          <div><dt>Duplicate payment</dt><dd>{formatDate(canonicalRecords[1].paymentDate)}</dd></div>
          <div><dt>Amount requested</dt><dd>{currency.format(canonicalFinding.dollarImpact)}</dd></div>
        </dl>
      </div>
    </article>
  )
}

function EvidenceStory() {
  const [activeStage, setActiveStage] = useState(0)
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([])
  const layoutRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()

  const syncActiveStageByNearestStep = () => {
    const viewportAnchor = window.innerHeight * 0.5
    const closestStep = stepRefs.current
      .filter((step): step is HTMLButtonElement => step !== null)
      .map((step) => {
        const bounds = step.getBoundingClientRect()
        return {
          stage: Number(step.dataset.stage),
          distance: Math.abs(bounds.top + bounds.height / 2 - viewportAnchor),
        }
      })
      .sort((a, b) => a.distance - b.distance)[0]

    if (closestStep) {
      setActiveStage((currentStage) => currentStage === closestStep.stage ? currentStage : closestStep.stage)
    }
  }

  const syncActiveStage = () => {
    const layoutEl = layoutRef.current
    const canvasEl = canvasRef.current
    if (!layoutEl || !canvasEl) return

    // The canvas pins via `position: sticky`. Below the tablet breakpoint it
    // becomes `position: relative` (with `top: auto`, which resolves to "0px"
    // rather than a usable offset), so fall back to the simple nearest-step
    // heuristic there instead of a pin range that no longer exists.
    const canvasStyle = getComputedStyle(canvasEl)
    if (canvasStyle.position !== 'sticky') {
      syncActiveStageByNearestStep()
      return
    }
    const stickyTop = Number.parseFloat(canvasStyle.top)

    // Drive the active stage from how far scroll has progressed through the
    // canvas's actual pinned range (settle point -> unstick point), not from
    // an arbitrary "closest to viewport center" comparison. That guarantees
    // stage 0 holds until the canvas has genuinely settled into its sticky
    // position, and the three stages then split the real pin distance evenly
    // in both scroll directions.
    const layoutRect = layoutEl.getBoundingClientRect()
    const pinRange = layoutRect.height - canvasEl.offsetHeight
    const progress = pinRange > 0
      ? Math.min(1, Math.max(0, (stickyTop - layoutRect.top) / pinRange))
      : 0

    const stageIndex = Math.min(storySteps.length - 1, Math.floor(progress * storySteps.length))
    setActiveStage((currentStage) => currentStage === stageIndex ? currentStage : stageIndex)
  }

  useMotionValueEvent(scrollY, 'change', syncActiveStage)

  useEffect(() => {
    const frame = requestAnimationFrame(syncActiveStage)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <section id="evidence" className="evidence-story" aria-labelledby="evidence-title">
      <div className="story-intro">
        <h2 id="evidence-title">The evidence stays attached.</h2>
        <p>One finding moves from raw records to a recovery-ready action without losing its paper trail.</p>
      </div>

      <div className="story-layout" ref={layoutRef}>
        <div className="story-steps">
          {storySteps.map((step, index) => (
            <button
              type="button"
              className="story-step"
              data-stage={index}
              data-active={activeStage === index}
              key={step.title}
              ref={(node) => { stepRefs.current[index] = node }}
              onClick={() => {
                setActiveStage(index)
                stepRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              aria-pressed={activeStage === index}
            >
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </button>
          ))}
        </div>

        <div className="story-canvas" data-stage={activeStage} ref={canvasRef}>
          <div className="story-canvas-bar">
            <ReclaimMark size={27} />
            <span>INV-3305</span>
            <span>{activeStage === 2 ? 'Request ready' : 'Human review'}</span>
          </div>
          <div className="story-layer story-layer-evidence" data-active={activeStage === 0} aria-hidden={activeStage !== 0}>
            <EvidenceRecords />
          </div>
          <div className="story-layer story-layer-review" data-active={activeStage === 1} aria-hidden={activeStage !== 1}>
            <ReviewState active={activeStage === 1} onConfirm={() => setActiveStage(2)} />
          </div>
          <div className="story-layer story-layer-document" data-active={activeStage === 2} aria-hidden={activeStage !== 2}>
            <RecoveryDocument />
          </div>
        </div>
        <div className="story-scroll-spacer" aria-hidden="true" />
      </div>

      <aside className="local-privacy" aria-label="Local data privacy">
        <strong>Your ledger stays on your device.</strong>
        <span>This prototype analyzes the CSV in your browser and does not upload it.</span>
      </aside>
    </section>
  )
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

function CountUpValue({ value, active }: { value: number; active: boolean }) {
  const [displayed, setDisplayed] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!active || hasAnimated.current) return
    hasAnimated.current = true

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayed(value)
      return
    }

    const duration = 700
    const start = performance.now()
    let frame: number

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setDisplayed(Math.round(value * easeOutCubic(progress)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, value])

  return <>{currency.format(displayed)}</>
}

function DetectionBreadth() {
  const [revealed, setRevealed] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { rootMargin: '-15% 0px -25% 0px', threshold: 0.2 }
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="analysis"
      className="detection-breadth"
      data-revealed={revealed}
      aria-labelledby="analysis-title"
    >
      <div className="analysis-copy">
        <h2 id="analysis-title">Not every flag means money is recoverable.</h2>
        <p>Every figure below traces back to the evidence you just reviewed, split into what&apos;s recoverable, what needs a person, and what prevents the next leak.</p>
      </div>

      <div className="outcome-lanes" aria-label="Dollar impact by outcome in the sample ledger">
        {outcomeData.map((item) => (
          <article className="outcome-lane" data-class={item.className} key={item.className}>
            {item.className === 'opportunity' ? (
              <p className="outcome-lane-sentence">
                <strong className="outcome-lane-sentence-label">{item.label}</strong>
                {' — '}
                <strong className="outcome-lane-sentence-value"><CountUpValue value={item.total} active={revealed} /></strong>
                {` across ${item.count} ${item.count === 1 ? 'finding' : 'findings'}. `}
                {item.description}
              </p>
            ) : (
              <>
                <h3>{item.label}</h3>
                <div className="outcome-lane-value">
                  <strong><CountUpValue value={item.total} active={revealed} /></strong>
                  <span>{item.count} {item.count === 1 ? 'finding' : 'findings'}</span>
                </div>
                <p>{item.description}</p>
              </>
            )}
          </article>
        ))}
      </div>
      <p className="analysis-source">Real output from the included {sample.records.length}-record sample ledger.</p>
    </section>
  )
}

function Closing() {
  return (
    <section className="reclaim-closing" aria-labelledby="closing-title">
      <ReclaimMark size={76} interactive />
      <h2 id="closing-title">Start with the ledger you already have.</h2>
      <p>See the full path from upload to evidence, review, and recovery request.</p>
      <div className="reclaim-actions">
        <MagneticLink className="reclaim-button reclaim-button-primary" href="/audit?sample=1" pendingLabel="Opening sample audit…">Run sample audit</MagneticLink>
        <a className="reclaim-text-action" href="/audit?upload=1">Use your ledger</a>
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
        <RawLedger />
        <EvidenceStory />
        <DetectionBreadth />
        <Closing />
      </main>
      <footer className="reclaim-footer">
        <a href="/" aria-label="Reclaim home"><ReclaimLogo size={28} /></a>
        <p>Explainable payment review. Local by default.</p>
        <a href="/audit?upload=1">Open audit workspace</a>
      </footer>
    </div>
  )
}
