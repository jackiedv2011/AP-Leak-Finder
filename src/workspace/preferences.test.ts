import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, loadPreferences } from './preferences'

const ids = () => loadPreferences().sections.map((section) => section.id)

describe('loadPreferences', () => {
  afterEach(() => window.localStorage.clear())

  it('gives a first-time viewer the default order', () => {
    expect(ids()).toEqual(DEFAULT_PREFERENCES.sections.map((section) => section.id))
  })

  it('slots a section added in a later release next to its default neighbour, keeping the viewer order', () => {
    // Saved before "tasks" existed, with activity moved to the top.
    const saved = ['activity', 'totals', 'next', 'pipeline', 'types', 'vendors'].map((id) => ({ id, visible: true }))
    window.localStorage.setItem('reclaim.preferences.v1', JSON.stringify({ sections: saved }))
    expect(ids()).toEqual(['activity', 'totals', 'tasks', 'next', 'pipeline', 'types', 'vendors'])
  })

  it('ignores unknown or malformed values instead of breaking the workspace', () => {
    window.localStorage.setItem('reclaim.preferences.v1', JSON.stringify({ accent: 'neon', density: 7, sections: [{ id: 'nope', visible: true }, null] }))
    const prefs = loadPreferences()
    expect(prefs.accent).toBe('green')
    expect(prefs.density).toBe('comfortable')
    expect(prefs.sections.map((section) => section.id)).toEqual(DEFAULT_PREFERENCES.sections.map((section) => section.id))
  })
})
