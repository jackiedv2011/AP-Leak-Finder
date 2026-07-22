import { describe, expect, it } from 'vitest'
import { buildAuditSearch, parseAuditRoute } from '@/audit/useAuditRoute'

describe('parseAuditRoute', () => {
  it('parses a bare /audit entry as Overview', () => {
    expect(parseAuditRoute('')).toEqual({ mode: 'overview', caseId: null, draft: false, entry: null })
  })

  it('parses a Findings mode URL', () => {
    expect(parseAuditRoute('?mode=findings')).toEqual({ mode: 'findings', caseId: null, draft: false, entry: null })
  })

  it('parses a Recovery mode URL', () => {
    expect(parseAuditRoute('?mode=recovery')).toEqual({ mode: 'recovery', caseId: null, draft: false, entry: null })
  })

  it('falls back to Overview for an unrecognized mode value', () => {
    expect(parseAuditRoute('?mode=something-else').mode).toBe('overview')
  })

  it('parses a case + draft URL', () => {
    expect(parseAuditRoute('?mode=findings&case=exact_duplicate-1-2&draft=1')).toEqual({
      mode: 'findings',
      caseId: 'exact_duplicate-1-2',
      draft: true,
      entry: null,
    })
  })

  it('ignores draft=1 without a case id', () => {
    expect(parseAuditRoute('?mode=findings&draft=1').draft).toBe(false)
  })

  it('gives the deliberate entry routes precedence over a stale workspace route', () => {
    expect(parseAuditRoute('?entry=upload&mode=recovery&case=old')).toEqual({
      mode: 'overview',
      caseId: null,
      draft: false,
      entry: 'upload',
    })
  })
})

describe('buildAuditSearch', () => {
  it('round-trips through parseAuditRoute', () => {
    const state = { mode: 'findings' as const, caseId: 'abc', draft: true, entry: null }
    expect(parseAuditRoute(buildAuditSearch(state))).toEqual(state)
  })

  it('produces an empty string for the default Overview state', () => {
    expect(buildAuditSearch({ mode: 'overview', caseId: null, draft: false, entry: null })).toBe('')
  })

  it('builds a clean entry URL without workspace state', () => {
    expect(buildAuditSearch({ mode: 'recovery', caseId: 'old', draft: true, entry: 'sample' })).toBe('?entry=sample')
  })
})
