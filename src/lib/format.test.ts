import { describe, expect, it } from 'vitest'
import { parseCurrency, parseDate } from '@/lib/format'

describe('parseCurrency', () => {
  it('accepts complete currency values', () => {
    expect(parseCurrency('$1,240.50')).toBe(1240.5)
  })

  it('rejects partial or malformed values', () => {
    expect(parseCurrency('100abc')).toBeNull()
    expect(parseCurrency('$1,2x0')).toBeNull()
  })
})

describe('parseDate', () => {
  it('accepts valid ISO dates', () => {
    expect(parseDate('2025-02-28')?.getDate()).toBe(28)
  })

  it('rejects impossible dates and trailing characters', () => {
    expect(parseDate('2025-02-31')).toBeNull()
    expect(parseDate('2025-02-28 extra')).toBeNull()
  })
})
