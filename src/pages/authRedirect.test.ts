import { describe, expect, it } from 'vitest'
import { safeNextPath } from './authRedirect'

describe('where a log-in may send someone next', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/audit?entry=upload')).toBe('/audit?entry=upload')
    expect(safeNextPath('/checkout?plan=growth#pay')).toBe('/checkout?plan=growth#pay')
  })

  it.each(['//evil.example', '/\\evil.example', '/\\/evil.example', 'https://evil.example', 'javascript:alert(1)', '/\tevil', ' /audit', ''])('refuses %j', (next) => {
    expect(safeNextPath(next)).toBeNull()
  })
})
