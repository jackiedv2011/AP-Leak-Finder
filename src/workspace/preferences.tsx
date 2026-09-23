import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useTheme, type ThemeChoice } from './theme'

/**
 * How one person likes the workspace to look. Everything here is a viewing
 * preference: it changes what is shown and how, never the audit itself, so it
 * lives in this browser rather than on the account.
 */
export type Density = 'comfortable' | 'compact'
export type Accent = 'green' | 'blue' | 'pink' | 'orange' | 'purple' | 'mono'
export type OverviewSectionId = 'totals' | 'next' | 'pipeline' | 'types' | 'vendors' | 'activity'

export interface OverviewSection {
  id: OverviewSectionId
  visible: boolean
}

export interface Preferences {
  density: Density
  accent: Accent
  /** Whole dollars on headline figures reads faster; cents stay in tables and on cases. */
  cents: boolean
  sidebarCollapsed: boolean
  sections: OverviewSection[]
}

export const ACCENTS: Array<{ id: Accent; label: string }> = [
  { id: 'green', label: 'Reclaim green' },
  { id: 'blue', label: 'Blue' },
  { id: 'pink', label: 'Pink' },
  { id: 'orange', label: 'Orange' },
  { id: 'purple', label: 'Purple' },
  { id: 'mono', label: 'Monochrome' },
]

export const SECTION_LABEL: Record<OverviewSectionId, { title: string; detail: string }> = {
  totals: { title: 'Totals', detail: 'Ready to claim, awaiting a decision, in recovery, recovered' },
  next: { title: 'Up next', detail: 'The findings worth your time first, largest first' },
  pipeline: { title: 'Recovery progress', detail: 'Where confirmed money has got to' },
  types: { title: 'By finding type', detail: 'Which checks caught the money' },
  vendors: { title: 'Top vendors', detail: 'Vendors with the most money in play' },
  activity: { title: 'Recent activity', detail: 'Decisions, requests and money back' },
}

export const DEFAULT_PREFERENCES: Preferences = {
  density: 'comfortable',
  accent: 'green',
  cents: false,
  sidebarCollapsed: false,
  sections: [
    { id: 'totals', visible: true },
    { id: 'next', visible: true },
    { id: 'pipeline', visible: true },
    { id: 'types', visible: true },
    { id: 'vendors', visible: true },
    { id: 'activity', visible: true },
  ],
}

const STORAGE_KEY = 'reclaim.preferences.v1'
const DENSITIES: Density[] = ['comfortable', 'compact']

/** Read defensively: an older or hand-edited value must never break the workspace. */
function normalize(raw: unknown): Preferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Preferences>
  const known = new Set(DEFAULT_PREFERENCES.sections.map((s) => s.id))
  const stored = Array.isArray(value.sections)
    ? value.sections.filter((s): s is OverviewSection => !!s && known.has(s.id) && typeof s.visible === 'boolean')
    : []
  const seen = new Set(stored.map((s) => s.id))
  return {
    density: DENSITIES.includes(value.density as Density) ? (value.density as Density) : DEFAULT_PREFERENCES.density,
    accent: ACCENTS.some((a) => a.id === value.accent) ? (value.accent as Accent) : DEFAULT_PREFERENCES.accent,
    cents: typeof value.cents === 'boolean' ? value.cents : DEFAULT_PREFERENCES.cents,
    sidebarCollapsed: typeof value.sidebarCollapsed === 'boolean' ? value.sidebarCollapsed : false,
    // Sections added in a later release join the end, visible, rather than vanishing.
    sections: [...stored, ...DEFAULT_PREFERENCES.sections.filter((s) => !seen.has(s.id))],
  }
}

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return normalize(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_PREFERENCES
  }
}

interface PreferencesValue {
  prefs: Preferences
  update: (patch: Partial<Preferences>) => void
  reset: () => void
  theme: ThemeChoice
  setTheme: (choice: ThemeChoice) => void
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences)
  const { choice, choose } = useTheme()

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // Remembering is a convenience; the preference still applies for this visit.
    }
  }, [prefs])

  // On <html> so dialogs, which portal out of the workspace, pick them up too.
  // Layout effect: set before the first paint, so the workspace never flashes unstyled.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.surface = 'workspace'
    root.dataset.accent = prefs.accent
    root.dataset.density = prefs.density
    return () => {
      delete root.dataset.surface
      delete root.dataset.accent
      delete root.dataset.density
    }
  }, [prefs.accent, prefs.density])

  const update = useCallback((patch: Partial<Preferences>) => setPrefs((current) => ({ ...current, ...patch })), [])
  const reset = useCallback(() => {
    setPrefs(DEFAULT_PREFERENCES)
    choose('system')
  }, [choose])

  const value = useMemo(() => ({ prefs, update, reset, theme: choice, setTheme: choose }), [prefs, update, reset, choice, choose])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

const fallback: PreferencesValue = {
  prefs: DEFAULT_PREFERENCES,
  update: () => {},
  reset: () => {},
  theme: 'system',
  setTheme: () => {},
}

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext) ?? fallback
}

/** Headline money: whole dollars unless the viewer asked for cents. */
export function useHeadlineMoney(): (value: number) => string {
  const { prefs } = usePreferences()
  return useCallback(
    (value: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: prefs.cents ? 2 : 0,
        maximumFractionDigits: prefs.cents ? 2 : 0,
      }).format(value),
    [prefs.cents]
  )
}
