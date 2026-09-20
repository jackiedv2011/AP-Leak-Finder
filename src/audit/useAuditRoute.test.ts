import { describe, expect, it } from 'vitest'
import { buildAuditSearch, parseAuditRoute } from '@/audit/useAuditRoute'

describe('parseAuditRoute', () => {
  it('parses a bare /audit entry as Overview', () => {
    expect(parseAuditRoute('')).toEqual({ projectId: null, mode: 'overview', caseId: null, draft: false, entry: null })
  })

  it('parses every workspace destination', () => {
    for (const mode of ['overview', 'opportunities', 'recoveries', 'vendors', 'reports', 'data', 'settings']) {
      expect(parseAuditRoute(`?mode=${mode}`).mode).toBe(mode)
    }
  })

  it('falls back to Overview for an unrecognized mode value', () => {
    expect(parseAuditRoute('?mode=something-else').mode).toBe('overview')
  })

  // The pre-V2 names are gone; a bookmark carrying one must land somewhere
  // sensible rather than render an empty screen.
  it('falls back to Overview for a retired mode name', () => {
    expect(parseAuditRoute('?mode=findings').mode).toBe('overview')
    expect(parseAuditRoute('?mode=recovery').mode).toBe('overview')
  })

  it('parses a case + draft URL', () => {
    expect(parseAuditRoute('?mode=opportunities&case=exact_duplicate-1-2&draft=1')).toEqual({
      projectId: null,
      mode: 'opportunities',
      caseId: 'exact_duplicate-1-2',
      draft: true,
      entry: null,
    })
  })

  it('ignores draft=1 without a case id', () => {
    expect(parseAuditRoute('?mode=opportunities&draft=1').draft).toBe(false)
  })

  it('gives the deliberate entry routes precedence over a stale workspace route', () => {
    expect(parseAuditRoute('?entry=upload&mode=recoveries&case=old')).toEqual({
      projectId: null,
      mode: 'overview',
      caseId: null,
      draft: false,
      entry: 'upload',
    })
  })
})

describe('buildAuditSearch', () => {
  it('round-trips through parseAuditRoute', () => {
    const state = { projectId: 'project-1', mode: 'opportunities' as const, caseId: 'abc', draft: true, entry: null }
    expect(parseAuditRoute(buildAuditSearch(state))).toEqual(state)
  })

  it('produces an empty string for the default Overview state', () => {
    expect(buildAuditSearch({ projectId: null, mode: 'overview', caseId: null, draft: false, entry: null })).toBe('')
  })

  it('builds a clean entry URL without workspace state', () => {
    expect(buildAuditSearch({ projectId: null, mode: 'recoveries', caseId: 'old', draft: true, entry: 'sample' })).toBe('?entry=sample')
  })

  it('keeps the selected local project in workspace and entry URLs', () => {
    expect(buildAuditSearch({ projectId: 'project-1', mode: 'overview', caseId: null, draft: false, entry: 'upload' }))
      .toBe('?project=project-1&entry=upload')
  })
})
