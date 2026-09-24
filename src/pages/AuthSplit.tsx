import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import '@/pages/authSplit.css'

/** Safari plays WebM but drops its alpha, so it gets the loop baked over the page's white. */
const SAFARI = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent)
const HERO_SRC = SAFARI ? '/media/hero-white.mp4' : '/media/hero.webm'

/** The six kites of the Reclaim hexagon, as the marketing site's #hx-wheel symbol. */
const WHEEL = [
  'M-2.056,-4.6 L-5.751,-11 L5.751,-11 L2.056,-4.6 Z',
  'M2.956,-4.081 L6.651,-10.481 L12.402,-0.520 L5.012,-0.520 Z',
  'M5.012,0.520 L12.402,0.520 L6.651,10.481 L2.956,4.081 Z',
  'M2.056,4.6 L5.751,11 L-5.751,11 L-2.056,4.6 Z',
  'M-2.956,4.081 L-6.651,10.481 L-12.402,0.520 L-5.012,0.520 Z',
  'M-5.012,-0.520 L-12.402,-0.520 L-6.651,-10.481 L-2.956,-4.081 Z',
]

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Leave the way the marketing site does: fade the page out, then load the next one. */
export function leavePage(href: string) {
  document.querySelector('.rc-login')?.setAttribute('data-leaving', 'true')
  window.setTimeout(() => (window.location.href = href), calm() ? 0 : 200)
}

interface SplitFieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

export function SplitField({ id, label, error, hint, children }: SplitFieldProps) {
  return (
    <div className="rc-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="rc-field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="rc-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

interface AuthSplitProps {
  /** The big condensed heading, one entry per line. */
  title: string[]
  /** Heading lines this long need the smaller size to fit the panel. */
  titleSize?: 'long'
  lede: ReactNode
  /** The small line at the top of the panel, e.g. "New to Reclaim? Create an account". */
  alternate?: ReactNode
  children?: ReactNode
}

/**
 * The log-in and sign-up pages, set in the marketing site's system: the hero's
 * 3D loop on white (60%), and the black rounded section that follows the hero,
 * turned on its side (40%). It fades in like the site's pages, and fades out
 * before following any of its own links.
 */
export function AuthSplit({ title, titleSize, lede, alternate, children }: AuthSplitProps) {
  const reel = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // index.html sets this for the known account routes before first paint; pages that can't be
  // known ahead of routing (the 404) set it here, so the fade-in runs over the site's grey.
  useLayoutEffect(() => {
    document.documentElement.dataset.route = 'auth'
  }, [])

  // Coming back through the history cache should show the page, not the faded-out frame.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) root.current?.removeAttribute('data-leaving')
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  useEffect(() => {
    const video = reel.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!video || !reduce) return
    const sync = () => (reduce.matches ? video.pause() : void video.play?.()?.catch(() => {}))
    sync()
    reduce.addEventListener?.('change', sync)
    return () => reduce.removeEventListener?.('change', sync)
  }, [])

  function handleLinkClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (link.target && link.target !== '_self') return
    const url = new URL(link.href, window.location.href)
    if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return
    event.preventDefault()
    leavePage(url.href)
  }

  return (
    <div className="rc-login" ref={root} onClick={handleLinkClick}>
      <div className="rc-login-stage">
        <div className="rc-login-reel" aria-hidden="true">
          <video ref={reel} src={HERO_SRC} autoPlay loop muted playsInline preload="auto" />
        </div>
        <header className="rc-login-top">
          <a href="/" className="rc-logo" aria-label="Reclaim home">
            <svg viewBox="-13 -11.5 26 23" fill="currentColor" aria-hidden="true">
              {WHEEL.map((d) => (
                <path key={d} d={d} />
              ))}
              <g className="fill">
                {WHEEL.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            </svg>
            <span>Reclaim</span>
          </a>
        </header>
        <footer className="rc-login-legal">
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <span>Reclaim © 2026</span>
        </footer>
      </div>

      <main className="rc-login-panel">
        <p className="rc-login-alt">{alternate}</p>

        <div className="rc-login-head">
          <h1 className="rc-login-title" data-size={titleSize}>
            {title.map((line, i) => (
              <span key={line} className="rc-line-wrap">
                <span className="rc-line" style={{ animationDelay: `${0.25 + i * 0.1}s` }}>
                  {line}
                  {i < title.length - 1 ? ' ' : null}
                </span>
              </span>
            ))}
          </h1>
          <p className="rc-login-lede">{lede}</p>
        </div>

        <div className="rc-login-body">
          {children}
          <footer className="rc-login-foot">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <span>Reclaim © 2026</span>
          </footer>
        </div>
      </main>
    </div>
  )
}
