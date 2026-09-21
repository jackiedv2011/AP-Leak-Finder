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

  it('reads accounting-style parentheses as a negative', () => {
    expect(parseCurrency('(150.00)')).toBe(-150)
    expect(parseCurrency('($1,250.50)')).toBe(-1250.5)
    expect(parseCurrency('-42')).toBe(-42)
  })
})

describe('parseDate', () => {
  it('accepts valid ISO dates', () => {
    expect(parseDate('2025-02-28')?.getDate()).toBe(28)
  })

  it('rejects impossible dates and trailing characters', () => {
    expect(parseDate('2025-02-31')).toBeNull()
    expect(parseDate('2025-02-28 extra')).toBeNull()
    expect(parseDate('02/31/2025')).toBeNull()
  })

  it('accepts US month-first and slash-separated ISO dates, and an ISO timestamp', () => {
    expect(parseDate('03/15/2025')?.toDateString()).toBe(new Date(2025, 2, 15).toDateString())
    expect(parseDate('3/5/2025')?.toDateString()).toBe(new Date(2025, 2, 5).toDateString())
    expect(parseDate('2025/03/20')?.toDateString()).toBe(new Date(2025, 2, 20).toDateString())
    expect(parseDate('2025-03-20T00:00:00Z')?.toDateString()).toBe(new Date(2025, 2, 20).toDateString())
  })

  it('reads a slash date with a four-digit year as month-first, never day-first', () => {
    // 04/03/2025 is April 3rd, not March 4th — ambiguous inputs follow the US export convention.
    expect(parseDate('04/03/2025')?.getMonth()).toBe(3)
    expect(parseDate('13/03/2025')).toBeNull()
  })
})
