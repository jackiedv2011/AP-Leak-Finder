import { useEffect, useRef, useState } from 'react'

/**
 * One background card: a screenshot of Reclaim itself. All cards sit on one
 * ring around the centre of the viewport and the ring turns clockwise, so a
 * card on the right travels down, across the bottom, up the left and over the
 * top. Cards stay upright the whole way round.
 */
interface DriftCard {
  src: string
  width: number
  /**
   * Scatters the card in from (negative) or out from (positive) the ring, as a
   * fraction of the ring's radius, so the set reads as a loose band rather
   * than a neat circle.
   */
  offset: number
  /** Degrees added to the card's evenly spaced slot, so spacing feels uneven. */
  jitter: number
  /** Drawn on screens narrower than 700px as well. */
  mobile?: boolean
}

const CARDS: DriftCard[] = [
  { src: '/art/dashboard-tiles.png', width: 400, offset: 0, jitter: 0, mobile: true },
  { src: '/art/findings-table.png', width: 340, offset: -0.22, jitter: 5 },
  { src: '/art/pipeline.png', width: 380, offset: 0.08, jitter: -4, mobile: true },
  { src: '/art/finding-detail.png', width: 340, offset: -0.1, jitter: 6 },
  { src: '/art/recent-findings.png', width: 320, offset: 0.1, jitter: -2 },
  { src: '/art/recovery-pipeline.png', width: 360, offset: -0.24, jitter: 3, mobile: true },
  { src: '/art/where-money-went.png', width: 300, offset: 0.02, jitter: -6 },
  { src: '/art/evidence-table.png', width: 360, offset: 0.08, jitter: 4 },
  { src: '/art/next-step.png', width: 360, offset: -0.16, jitter: -3 },
  { src: '/art/finding-confirmed.png', width: 320, offset: 0.1, jitter: 5, mobile: true },
  { src: '/art/audits-list.png', width: 340, offset: -0.06, jitter: -5 },
  { src: '/art/by-check.png', width: 280, offset: -0.22, jitter: 2 },
  { src: '/art/recovery-table.png', width: 340, offset: 0.06, jitter: -4 },
  { src: '/art/report-facts.png', width: 300, offset: -0.12, jitter: 6 },
]

/** Seconds for the ring to make one full turn. */
const REVOLUTION_S = 36
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const MOBILE = '(max-width: 700px)'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION).matches === true)
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION)
    if (!query) return
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Slowly turning ring of product screenshots behind the auth and launch screens. Purely decorative. */
export function ScreenshotDrift() {
  const reduced = usePrefersReducedMotion()
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const cards = Array.from(layer.querySelectorAll<HTMLElement>('.wk-drift-card'))
    let frame = 0
    const start = performance.now()

    const place = (now: number) => {
      const mobile = window.matchMedia?.(MOBILE).matches === true
      const visible = cards.filter((card) => !mobile || card.dataset.mobile === 'true')
      const w = window.innerWidth
      const h = window.innerHeight
      // The ring hugs the edges of the viewport: its centre is the screen centre
      // and its radii reach the edges, so the cards circle the content in the middle.
      const rx = w / 2 - (mobile ? 40 : 120)
      const ry = h / 2 - (mobile ? 60 : 90)
      const turn = reduced ? 0 : ((now - start) / 1000 / REVOLUTION_S) * Math.PI * 2
      visible.forEach((card, i) => {
        // Screen y grows downward, so an increasing angle runs clockwise on screen.
        const jitter = (Number(card.dataset.jitter ?? 0) * Math.PI) / 180
        const angle = turn + (i / visible.length) * Math.PI * 2 + jitter
        const spread = 1 + Number(card.dataset.offset ?? 0)
        const x = w / 2 + rx * spread * Math.cos(angle) - card.offsetWidth / 2
        const y = h / 2 + ry * spread * Math.sin(angle) - card.offsetHeight / 2
        card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      })
      if (!reduced) frame = requestAnimationFrame(place)
    }

    frame = requestAnimationFrame(place)
    const onResize = () => place(performance.now())
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [reduced])

  return (
    <div ref={layerRef} className="wk-drift" aria-hidden="true" data-static={reduced ? 'true' : undefined}>
      {CARDS.map((card, i) => (
        <div
          key={card.src}
          className="wk-drift-card"
          data-mobile={card.mobile ? 'true' : undefined}
          data-offset={card.offset}
          data-jitter={card.jitter}
          style={{ '--w': `${card.width}px`, '--i': i } as React.CSSProperties}
        >
          <img src={card.src} alt="" draggable={false} decoding="async" />
        </div>
      ))}
    </div>
  )
}
