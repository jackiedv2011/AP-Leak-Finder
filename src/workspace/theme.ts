import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Appearance. Three choices, two outcomes: `system` follows the OS and is the
 * default, `light` and `dark` pin it.
 *
 * The resolution happens here rather than in a CSS media query so that the
 * system default and an explicit choice travel the same path — a media query
 * would apply underneath any override and the settings screen would spend its
 * life fighting it. What lands on `<html data-theme>` is always the resolved
 * theme, never the preference.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'reclaim.theme.v1'
const QUERY = '(prefers-color-scheme: light)'

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function loadThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isChoice(raw) ? raw : 'system'
  } catch {
    // Private mode and blocked site data both throw here. Following the system
    // is the right answer when we can't remember a choice.
    return 'system'
  }
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia(QUERY).matches ? 'light' : 'dark'
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice
}

/** Must match --theme-fade in workspace.css. */
const FADE_MS = 320
let fadeTimer: number | undefined

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * `animate` eases the palette across instead of snapping it. It is off for the
 * first application — a page that faded in from the opposite theme on load
 * would be the same eye-strain with extra steps — and on for every change
 * after, including the OS flipping underneath a `system` choice.
 */
export function applyTheme(theme: ResolvedTheme, options: { animate?: boolean } = {}): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (root.dataset.theme === theme) return

  if (options.animate && !prefersReducedMotion()) {
    root.dataset.themeTransition = ''
    // Flush the transition declaration before the colours change, so the
    // browser has something to interpolate from rather than resolving both in
    // one pass and painting the end state.
    void root.offsetWidth
    window.clearTimeout(fadeTimer)
    fadeTimer = window.setTimeout(() => {
      delete root.dataset.themeTransition
    }, FADE_MS + 60)
  }

  root.dataset.theme = theme
}

/**
 * Keeps `<html data-theme>` in step with the choice, and — only while the
 * choice is `system` — with the OS flipping underneath us.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(loadThemeChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(loadThemeChoice()))

  // The first pass only confirms what index.html already painted, so it must
  // not fade; everything after is a real change the eye should be eased into.
  const settled = useRef(false)

  useEffect(() => {
    const next = resolveTheme(choice)
    setResolved(next)
    applyTheme(next, { animate: settled.current })
    settled.current = true
    if (choice !== 'system') return
    const mq = window.matchMedia(QUERY)
    const onChange = () => {
      const live = systemTheme()
      setResolved(live)
      applyTheme(live, { animate: true })
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  const choose = useCallback((next: ThemeChoice) => {
    setChoice(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Remembering is a convenience; the choice still applies for this session.
    }
  }, [])

  return { choice, resolved, choose }
}
