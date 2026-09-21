import { describe, expect, it } from 'vitest'
import { buildAuditSearch, parseAuditRoute } from '@/audit/useAuditRoute'

describe('parseAuditRoute', () => {
  it('parses a bare /audit entry as the Dashboard', () => {
    expect(parseAuditRoute('')).toEqual({ projectId: null, mode: 'dashboard', caseId: null, draft: false, entry: null })
  })

  it('parses every workspace destination', () => {
    for (const mode of ['dashboard', 'audits', 'findings', 'recoveries', 'reports', 'settings']) {
      expect(parseAuditRoute(`?mode=${mode}`).mode).toBe(mode)
    }
  })

  it('falls back to the Dashboard for an unrecognized mode value', () => {
    expect(parseAuditRoute('?mode=something-else').mode).toBe('dashboard')
  })

  // Older bookmarks carry the previous section names; each lands on the
  // section that replaced it rather than an empty screen.
  it('maps retired mode names onto their replacements', () => {
    expect(parseAuditRoute('?mode=overview').mode).toBe('dashboard')
    expect(parseAuditRoute('?mode=opportunities').mode).toBe('findings')
    expect(parseAuditRoute('?mode=vendors').mode).toBe('reports')
    expect(parseAuditRoute('?mode=data').mode).toBe('audits')
    expect(parseAuditRoute('?mode=recovery').mode).toBe('recoveries')
  })

  it('parses a case + draft URL', () => {
    expect(parseAuditRoute('?mode=findings&case=exact_duplicate-1-2&draft=1')).toEqual({
      projectId: null,
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
    expect(parseAuditRoute('?entry=upload&mode=recoveries&case=old')).toEqual({
      projectId: null,
      mode: 'dashboard',
      caseId: null,
      draft: false,
      entry: 'upload',
    })
  })
})

describe('buildAuditSearch', () => {
  it('round-trips through parseAuditRoute', () => {
    const state = { projectId: 'project-1', mode: 'findings' as const, caseId: 'abc', draft: true, entry: null }
    expect(parseAuditRoute(buildAuditSearch(state))).toEqual(state)
  })

  it('produces an empty string for the default Dashboard state', () => {
    expect(buildAuditSearch({ projectId: null, mode: 'dashboard', caseId: null, draft: false, entry: null })).toBe('')
  })

  it('builds a clean entry URL without workspace state', () => {
    expect(buildAuditSearch({ projectId: null, mode: 'recoveries', caseId: 'old', draft: true, entry: 'sample' })).toBe('?entry=sample')
  })

  it('keeps the selected local project in workspace and entry URLs', () => {
    expect(buildAuditSearch({ projectId: 'project-1', mode: 'dashboard', caseId: null, draft: false, entry: 'upload' }))
      .toBe('?project=project-1&entry=upload')
  })
})
