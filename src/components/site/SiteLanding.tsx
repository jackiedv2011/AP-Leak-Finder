import { useRef, type ImgHTMLAttributes } from 'react'
import { SITE_CHECKS } from '@/components/site/siteData'
import { useLandingAction, type LandingAction } from '@/components/site/useLandingAction'
import { useLandingMotionController } from '@/components/site/useLandingMotionController'
import reclaimRMark from '@/assets/brand/reclaim-r-mark-v1.png'
import reclaimWordmark from '@/assets/brand/reclaim-wordmark-v1.png'
import './site.css'

type LandingImageAsset = { src: string; srcSet: string; width: number; height: number }

const optimizedImages = import.meta.glob<string>(
  '../../assets/landing/optimized/*.webp',
  { eager: true, import: 'default', query: '?url' },
)

function optimizedAsset(name: string, width: number, height: number): LandingImageAsset {
  const prefix = `../../assets/landing/optimized/${name}`
  const oneX = optimizedImages[`${prefix}-1x.webp`]
  const twoX = optimizedImages[`${prefix}-2x.webp`]
  if (!oneX || !twoX) throw new Error(`Missing optimized landing asset: ${name}`)
  return { src: twoX, srcSet: `${oneX} 1x, ${twoX} 2x`, width, height }
}

const paperSurface = optimizedAsset('paper-surface-v2', 1672, 941)
const feltSurface = optimizedAsset('felt-surface-v2', 1672, 941)
const macbookCorner = optimizedAsset('laptop-corner-v1', 1020, 680)
const paperStack = optimizedAsset('layered-paper-stack-v2', 1360, 907)
const paymentSheet = optimizedAsset('blank-payment-sheet-v2', 1360, 907)
const mapLeft = optimizedAsset('map-sheet-left-v2', 1224, 1285)
const mapRight = optimizedAsset('map-sheet-right-v2', 1180, 1333)
const agedLetterPaper = optimizedAsset('reclaim-aged-paper-user', 1040, 1558)
const receiptStrip = optimizedAsset('credit-memo-strip-v2', 470, 705)
const tornNote = optimizedAsset('torn-note-v2', 496, 331)
const blueTape = optimizedAsset('blue-tape-v2', 700, 389)
const yellowTape = optimizedAsset('yellow-tape-v2', 400, 176)
const coffeeCup = optimizedAsset('coffee-cup-v2', 660, 635)
const binderClip = optimizedAsset('binder-clip-v2', 380, 269)
const paperclip = optimizedAsset('paperclip-v2', 186, 191)
const greenToken = optimizedAsset('green-token-v2', 179, 164)
const stickyNote = optimizedAsset('sticky-note-v2', 520, 520)
const officeTimer = optimizedAsset('office-timer-v2', 580, 387)
const cafePhoto = optimizedAsset('cafe-photo-v2', 440, 357)
const cuttingMat = optimizedAsset('cutting-mat-v2', 1672, 941)

const LANDING_IMAGE_DIMENSIONS = new Map<string, { width: number; height: number }>([
  [reclaimRMark, { width: 1254, height: 1254 }],
  [reclaimWordmark, { width: 2172, height: 724 }],
])

type LandingImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | LandingImageAsset
  critical?: boolean
}

function LandingImage({ src, critical = false, loading, decoding, fetchPriority, srcSet, ...props }: LandingImageProps) {
  const asset = typeof src === 'string' ? null : src
  const actualSrc = asset?.src ?? src
  const dimensions = asset ?? LANDING_IMAGE_DIMENSIONS.get(actualSrc as string)
  return (
    <img
      {...props}
      src={actualSrc as string}
      srcSet={srcSet ?? asset?.srcSet}
      width={dimensions?.width}
      height={dimensions?.height}
      loading={loading ?? (critical ? 'eager' : 'lazy')}
      decoding={decoding ?? 'async'}
      fetchPriority={fetchPriority ?? (critical ? 'high' : 'auto')}
    />
  )
}

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 10h13M12 6l4 4-4 4" /></svg>
}

function Action({ action, quiet = false }: { action: LandingAction; quiet?: boolean }) {
  return <a className={quiet ? 'fresh-action fresh-action--quiet' : 'fresh-action'} href={action.href}>{action.label}<Arrow /></a>
}

function Brand({ inverse = false, markOnly = false, boxed = false, critical = false }: { inverse?: boolean; markOnly?: boolean; boxed?: boolean; critical?: boolean }) {
  return <a className="fresh-brand" data-inverse={inverse || undefined} data-mark-only={markOnly || undefined} data-boxed={boxed || undefined} href="/" aria-label="Reclaim home"><span><LandingImage critical={critical} src={reclaimRMark} alt="" /></span>{!markOnly && <strong><LandingImage critical={critical} src={reclaimWordmark} alt="" /></strong>}</a>
}

function Nav({ action }: { action: LandingAction }) {
  return (
    <header className="fresh-nav-shell">
      <nav className="fresh-nav" data-motion-nav aria-label="Main navigation">
        <Brand critical />
        <div className="fresh-nav__links">
          <a href="#checks">What it checks</a><a href="#process">How it works</a><a href="#privacy">Privacy</a><a href="#pricing">Pricing</a>
        </div>
        <div className="fresh-nav__action">{action.context && <small className="site-nav-context">{action.context}</small>}<Action action={action} /></div>
      </nav>
    </header>
  )
}

function CheckDot() {
  return (
    <span className="fresh-check-dot" aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="m4 8.2 2.45 2.45L12.1 5" />
      </svg>
    </span>
  )
}

const HANDWRITTEN_PRINCIPLE = ['Every answer should', 'lead back to a source.']

const FOOTER_MENUS = [
  { title: 'Explore', items: ['What it checks', 'How it works', 'The source trail', 'Pricing'] },
  { title: 'Trust', items: ['Privacy', 'Local review', 'Your evidence', 'Security'] },
  { title: 'Company', items: ['About Reclaim', 'Journal', 'Contact', 'Careers'] },
  { title: 'Elsewhere', items: ['LinkedIn', 'Instagram', 'X / Twitter', 'Email'] },
]

function HandwrittenPrinciple() {
  return (
    <p className="fresh-letter-handwriting" aria-label={HANDWRITTEN_PRINCIPLE.join(' ')}>
      {HANDWRITTEN_PRINCIPLE.map((line) => (
        <span className="fresh-letter-handwriting__line" key={line}>
          <span className="fresh-letter-handwriting__ink">{line}</span>
        </span>
      ))}
    </p>
  )
}

function LedgerUI() {
  return (
    <article className="fresh-ledger" aria-label="Sample payment review">
      <header><small>PAYMENT EXPORT</small><strong>sample_payments.csv</strong><span>80 ROWS</span></header>
      <div className="fresh-ledger__head"><span>VENDOR</span><span>INVOICE</span><span>PAID</span><span>AMOUNT</span></div>
      <div className="fresh-ledger__row"><span>Sierra Coffee</span><span>INV-3303</span><span>Feb 14</span><b>$4,850</b></div>
      <div className="fresh-ledger__row is-highlighted"><span>Sierra Coffee</span><span>INV-3305</span><span>Feb 28</span><b>$6,800</b></div>
      <div className="fresh-ledger__row"><span>Golden Bean</span><span>INV-9016</span><span>Mar 25</span><b>$8,200</b></div>
      <div className="fresh-ledger__finding"><span><i>Likely recoverable</i><strong>Exact duplicate payment</strong></span><b>$6,800</b></div>
    </article>
  )
}

function Hero({ action }: { action: LandingAction }) {
  return (
    <section className="fresh-hero" data-motion-scene data-motion-priority="hero" data-motion-state="entering">
      <LandingImage critical data-parallax="36" className="fresh-object hero-binder hero-motion__binder" src={binderClip} alt="" /><LandingImage critical data-parallax="-22" className="fresh-object hero-macbook hero-motion__macbook" src={macbookCorner} alt="" />
      <LandingImage critical data-parallax="28" className="fresh-object hero-paperclip hero-motion__paperclip" src={paperclip} alt="" /><LandingImage critical data-parallax="-18" className="fresh-object hero-token hero-motion__token" src={greenToken} alt="" />
      <LandingImage critical data-parallax="24" className="fresh-object hero-note-paper hero-motion__note" src={tornNote} alt="" /><span data-parallax="24" className="hero-note-copy hero-motion__note-copy">follow the<br />source rows</span>
      <div className="fresh-hero__copy">
        <span className="fresh-eyebrow fresh-hero__eyebrow hero-motion__eyebrow">PAYMENT RECOVERY FOR SMALL BUSINESSES</span>
        <h1 aria-label="Find the payments worth a second look."><span className="hero-motion__line"><span>Find the payments</span></span><span className="hero-motion__line"><span>worth a second look.</span></span></h1>
        <p className="hero-motion__body">Reclaim reads the payment export you already have, connects the records that belong together, and leaves you with evidence a person can review.</p>
        <div className="fresh-hero__actions hero-motion__actions"><Action action={action} /><a href="/audit?entry=sample">See the sample case <Arrow /></a></div>
        <div className="fresh-trust hero-motion__trust"><span><CheckDot /><span className="fresh-trust__label"><b>Seven checks</b><small>on every file</small></span></span><span><CheckDot /><span className="fresh-trust__label"><b>Runs in your browser</b><small>nothing uploaded</small></span></span><span><CheckDot /><span className="fresh-trust__label"><b>Every flag</b><small>shows its rule</small></span></span></div>
      </div>
      <div className="fresh-hero__ledger hero-motion__ledger"><LandingImage critical data-parallax="-12" src={paperStack} alt="" /><LedgerUI /></div>
      <span className="fresh-hero__boundary" data-hero-boundary aria-hidden="true" />
    </section>
  )
}

function PaymentUI({ row, date, depth }: { row: string; date: string; depth: number }) {
  return (
    <article className="fresh-payment-card" data-parallax={depth}>
      <LandingImage src={paymentSheet} alt="" />
      <div className="fresh-payment-card__ui">
        <header><strong>Sierra Coffee Supply</strong><small>ROW {row}</small></header>
        <div className="fresh-payment-card__amount"><b>INV-3305</b><strong>$6,800</strong></div>
        <footer><span>Paid {date}</span><span>••4211</span></footer>
      </div>
    </article>
  )
}

function ProductTableau({ action }: { action: LandingAction }) {
  return (
    <section className="fresh-product" id="checks" data-motion-scene>
      <LandingImage data-parallax="10" className="fresh-surface" src={paperSurface} alt="" />
      <LandingImage data-parallax="30" className="fresh-object product-coffee product-motion__coffee" src={coffeeCup} alt="" /><LandingImage data-parallax="-24" className="fresh-object product-binder product-motion__binder" src={binderClip} alt="" />
      <LandingImage data-parallax="22" className="fresh-object product-paperclip product-motion__paperclip" src={paperclip} alt="" /><LandingImage data-parallax="-16" className="fresh-object product-token product-motion__token" src={greenToken} alt="" />
      <LandingImage data-motion-reveal="data-detail-revealed" data-parallax="28" className="fresh-object product-sticky product-motion__sticky" src={stickyNote} alt="" /><span data-parallax="28" className="product-sticky-copy product-motion__sticky-copy">same invoice.<br />different day.</span>
      <div data-motion-reveal="data-copy-revealed" className="fresh-product__copy">
        <span className="fresh-eyebrow product-motion__eyebrow">READ THE RELATIONSHIP, NOT JUST THE ROW</span>
        <h2><span className="product-motion__line"><span>We help you find the payment</span></span><span className="product-motion__line"><span>that deserves another look.</span></span></h2>
        <p className="product-motion__body">Seven deterministic checks connect records across the export and keep every source row attached.</p><span className="product-motion__action"><Action action={action} quiet /></span>
      </div>
      <div data-motion-reveal="data-tableau-revealed" className="fresh-product__stage">
        <div className="payment-position payment-position--left product-motion__payment-left"><PaymentUI row="3" date="Feb 28, 2025" depth={-14} /></div>
        <div className="payment-position payment-position--right product-motion__payment-right"><PaymentUI row="4" date="Mar 15, 2025" depth={14} /></div>
        <div className="fresh-connector product-motion__connector"><span>SAME VENDOR · INVOICE · AMOUNT</span></div>
        <article className="fresh-receipt product-motion__receipt"><small>SIERRA COFFEE SUPPLY</small><strong>Payment receipt</strong><span>Bank transfer</span><b>$6,800.00</b></article>
        <article className="fresh-hand-note product-motion__hand-note"><small>DELIVERY NOTE</small><p>Order received.<br />Matched to INV-3305.</p><em>— J. Rivera</em></article>
        <blockquote className="product-motion__quote">“It shows us the relationship between the records, then lets our team make the call.”<small>Illustrative workflow</small></blockquote>
      </div>
      <div className="fresh-sr" aria-label="All seven checks">{SITE_CHECKS.map((check) => <span key={check.type}>{check.name}</span>)}</div>
    </section>
  )
}

function Pricing({ action }: { action: LandingAction }) {
  return (
    <section className="fresh-pricing" id="pricing" data-motion-scene>
      <LandingImage data-motion-reveal="data-detail-revealed" data-parallax="26" className="fresh-object pricing-paperclip pricing-motion__paperclip" src={paperclip} alt="" />
      <LandingImage data-parallax="-22" className="fresh-object pricing-tape pricing-motion__tape" src={yellowTape} alt="" /><LandingImage data-parallax="18" className="fresh-object pricing-timer pricing-motion__timer" src={officeTimer} alt="" />
      <div data-motion-reveal="data-copy-revealed" className="fresh-pricing__copy">
        <span className="fresh-eyebrow pricing-motion__eyebrow">SIMPLE, OUTCOME-ALIGNED PRICING</span><h2 aria-label="If the money does not come back, you do not pay"><span className="pricing-motion__line"><span>If the money does not</span></span><span className="pricing-motion__line"><span>come back, you do not pay</span></span></h2>
        <p className="pricing-motion__body">A fee is agreed before outreach and becomes due only after a verified refund, credit, or offset.</p>
        <article data-motion-reveal="data-ticket-revealed" className="fresh-price-ticket pricing-motion__ticket"><small className="pricing-motion__ticket-label">RECOVERY REVIEW</small><div className="pricing-motion__ticket-amount"><strong>$0</strong><span>to review</span></div><p className="pricing-motion__ticket-condition">$0 fee if no money returns</p><span className="pricing-motion__ticket-action"><Action action={action} quiet /></span></article>
      </div>
    </section>
  )
}

function MapRecord({ vendor, date }: { vendor: string; date: string }) {
  return <article className="fresh-map-record"><small>{vendor}</small><strong>INV-3305</strong><span>$6,800 · {date}</span></article>
}

function HandUnderline() {
  return (
    <svg className="fresh-hand-underline__stroke" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 8 C36 6.5 66 9.5 96 8 S154 6.4 184 8.3 S244 9.8 297 7.1" />
      <path d="M13 12 C68 10.9 106 12.8 150 11.8 S232 12.4 286 10.7" />
    </svg>
  )
}

function RelationshipMap() {
  return (
    <section className="fresh-map" id="process" data-motion-scene>
      <div data-motion-reveal="data-copy-revealed" className="fresh-map__copy"><span className="fresh-eyebrow map-motion__eyebrow">THE SOURCE STAYS ATTACHED</span><h2><span className="map-motion__line"><span>QuickBooks, Xero, bank exports …</span></span><span className="map-motion__line"><span>we read them all and <span className="fresh-hand-underline">keep the source.<HandUnderline /></span></span></span></h2><div className="fresh-source-strip">{['QuickBooks', 'Xero', 'CSV export', 'Bank statement', 'Manual register'].map(source => <span className="map-motion__source" key={source}>{source}</span>)}</div></div>
      <div data-motion-reveal="data-map-revealed" className="fresh-map__stage">
        <LandingImage data-parallax="-20" className="fresh-object map-sheet-left map-motion__sheet-left" src={mapLeft} alt="" /><LandingImage data-parallax="18" className="fresh-object map-sheet-right map-motion__sheet-right" src={mapRight} alt="" />
        <div data-parallax="-20" className="map-record-left map-motion__record-left"><MapRecord vendor="Sierra Coffee Supply" date="Feb 28" /></div><div data-parallax="18" className="map-record-right map-motion__record-right"><MapRecord vendor="Sierra Coffee Supply" date="Mar 15" /></div>
        <svg className="fresh-route map-motion__route" viewBox="0 0 1000 430" aria-hidden="true"><path className="map-route-base" d="M310 215 C430 80 565 360 702 205" /><path className="map-route-highlight" pathLength="1" d="M310 215 C430 80 565 360 702 205" /></svg>
        <LandingImage data-parallax="30" className="fresh-object map-photo map-motion__photo" src={cafePhoto} alt="" /><LandingImage data-parallax="-18" className="fresh-object map-paperclip map-motion__paperclip" src={paperclip} alt="" /><LandingImage data-parallax="24" className="fresh-object map-tape map-motion__tape" src={blueTape} alt="" />
        <span data-parallax="24" className="map-caption map-motion__caption">same supplier · same reference</span>
      </div>
    </section>
  )
}

const processCards = [
  { n: '01', title: 'Bring the export', body: 'Drop the CSV you already run into the browser.', type: 'upload' },
  { n: '02', title: 'Connect the records', body: 'Reclaim reads relationships across rows and files.', type: 'connect' },
  { n: '03', title: 'See the rule', body: 'Every amount keeps the conditions that surfaced it.', type: 'rule' },
  { n: '04', title: 'Prepare the case', body: 'Review the evidence and decide what gets sent.', type: 'case' },
]

function CardVisual({ type }: { type: string }) {
  if (type === 'upload') return <div className="fresh-mini-upload feature-motion__visual feature-motion__upload"><span>+</span><b>payments_may.csv</b><small>80 rows recognised</small></div>
  if (type === 'connect') return <div className="fresh-mini-connect feature-motion__visual feature-motion__connect"><span>INV-3305</span><i /><span>$6,800</span></div>
  if (type === 'rule') return <div className="fresh-mini-rule feature-motion__visual feature-motion__rule"><span>✓ Same vendor</span><span>✓ Same invoice</span><span>✓ Same amount</span></div>
  return <div className="fresh-mini-case feature-motion__visual feature-motion__case"><strong>Recovery draft</strong><span>Re: Duplicate payment</span><p>Confirm the attached records.</p></div>
}

function Features() {
  return (
    <section className="fresh-features" id="privacy" data-motion-scene>
      <LandingImage data-parallax="24" className="fresh-object feature-tape-left feature-motion__tape-left" src={blueTape} alt="" /><LandingImage data-parallax="-24" className="fresh-object feature-tape-right feature-motion__tape-right" src={yellowTape} alt="" />
      <LandingImage data-parallax="-18" className="fresh-object feature-paperclip feature-motion__paperclip" src={paperclip} alt="" /><LandingImage data-parallax="30" className="fresh-object feature-binder-left feature-motion__binder-left" src={binderClip} alt="" /><LandingImage data-parallax="-28" className="fresh-object feature-binder-right feature-motion__binder-right" src={binderClip} alt="" />
      <div data-motion-reveal="data-copy-revealed" className="fresh-features__copy"><h2><span className="feature-motion__line"><span>What makes a payment</span></span><span className="feature-motion__line"><span>worth a second look?</span></span></h2><p className="feature-motion__body">Four clear steps. No black box.</p></div>
      <div data-motion-reveal="data-grid-revealed" className="fresh-feature-grid">{processCards.map((card) => <article className="fresh-feature-card feature-motion__card" key={card.n}><small>{card.n}</small><h3>{card.title}</h3><p>{card.body}</p><CardVisual type={card.type} /></article>)}</div>
      <div className="fresh-features__action feature-motion__action"><a className="fresh-action" href="#process">See how it works <Arrow /></a></div>
      <div className="fresh-process-notes">{['Your ledger stays on this device.', 'Nothing is uploaded.', 'Every flag keeps its evidence.', 'You decide what happens next.'].map(note => <span className="feature-motion__note" key={note}>{note}</span>)}</div>
    </section>
  )
}

function DarkLetter() {
  return (
    <section className="fresh-letter-scene" data-motion-scene>
      <LandingImage data-parallax="10" className="fresh-surface" src={feltSurface} alt="" /><LandingImage data-parallax="-22" className="fresh-object letter-receipt letter-motion__receipt" src={receiptStrip} alt="" /><LandingImage data-motion-reveal="data-paper-revealed" data-parallax="16" className="fresh-object letter-paper letter-motion__paper" src={agedLetterPaper} alt="" />
      <LandingImage data-motion-reveal="data-sticky-revealed" data-parallax="28" className="fresh-object letter-sticky letter-motion__sticky" src={stickyNote} alt="" /><LandingImage data-parallax="-18" className="fresh-object letter-token letter-motion__token" src={greenToken} alt="" />
      <article data-motion-reveal="data-copy-revealed" className="fresh-letter-copy"><small className="letter-motion__eyebrow">WHY RECLAIM</small><h2><span className="letter-motion__line"><span>Keep the evidence close.</span></span><span className="letter-motion__line"><span><em>Keep the decision yours.</em></span></span></h2><p className="letter-motion__body">We built Reclaim for the person who still takes a second look. Follow the records, understand what changed, and decide what to do next.</p><p className="fresh-letter-copy__signoff letter-motion__signoff"><em>No black box. No made-up certainty.</em></p></article>
      <HandwrittenPrinciple />
      <span data-motion-reveal="data-handwriting-revealed" className="fresh-letter-handwriting__trigger" aria-hidden="true" />
      <span data-parallax="28" className="letter-sticky-copy letter-motion__sticky-copy">keep the<br />source close</span><div data-motion-reveal="data-proof-revealed" className="fresh-recovery-toast letter-motion__toast"><CheckDot /><span><strong>Evidence stays attached</strong>Review the full trail locally</span></div>
      <div data-motion-reveal="data-meta-revealed" className="fresh-letter-meta letter-motion__meta"><p>Find it. Understand it. Reclaim it.</p><small>Your ledger stays in your browser. Nothing is uploaded or written back. No customer outcome is implied.</small></div>
    </section>
  )
}

function SiteFooter({ action }: { action: LandingAction }) {
  return (
    <footer className="fresh-site-footer" data-motion-scene data-motion-reveal="data-revealed">
      <LandingImage className="fresh-site-footer__surface" src={cuttingMat} alt="" />
      <LandingImage data-parallax="-18" className="fresh-object footer-piece footer-receipt" src={receiptStrip} alt="" />
      <LandingImage data-parallax="22" className="fresh-object footer-piece footer-photo" src={cafePhoto} alt="" />
      <LandingImage data-parallax="-26" className="fresh-object footer-piece footer-tape" src={blueTape} alt="" />
      <div className="fresh-site-footer__content">
        <div className="fresh-site-footer__cta">
          <Brand inverse markOnly />
          <h2>Start with the ledger<br />you already have.</h2>
          <p>A private review of the export already on your desk.</p>
          <Action action={action} />
        </div>
        <div className="fresh-site-footer__divider" aria-hidden="true" />
        <div className="fresh-site-footer__menus" aria-label="Footer navigation">
          {FOOTER_MENUS.map((group) => (
          <section className="fresh-site-footer__menu" key={group.title}>
              <h3>{group.title}</h3>
              {group.items.map((item) => <span key={item}>{item}</span>)}
            </section>
          ))}
        </div>
        <div className="fresh-site-footer__meta"><span>© 2026 Reclaim</span><span>Private review, on your terms.</span></div>
      </div>
    </footer>
  )
}

export function SiteLanding() {
  const action = useLandingAction()
  const rootRef = useRef<HTMLElement>(null)
  useLandingMotionController(rootRef)
  return <main ref={rootRef} className="fresh-page"><div className="fresh-page__content"><Nav action={action} /><Hero action={action} /><ProductTableau action={action} /><Pricing action={action} /><RelationshipMap /><Features /><DarkLetter /></div><SiteFooter action={action} /></main>
}
