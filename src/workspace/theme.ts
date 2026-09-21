import { useCallback, useEffect, useState } from 'react'

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

export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

/**
 * Keeps `<html data-theme>` in step with the choice, and — only while the
 * choice is `system` — with the OS flipping underneath us.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(loadThemeChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(loadThemeChoice()))

  useEffect(() => {
    const next = resolveTheme(choice)
    setResolved(next)
    applyTheme(next)
    if (choice !== 'system') return
    const mq = window.matchMedia(QUERY)
    const onChange = () => {
      const live = systemTheme()
      setResolved(live)
      applyTheme(live)
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
