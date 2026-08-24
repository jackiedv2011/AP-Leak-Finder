import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { mergeImport, setCaseState } from '@/ledger/store'
import { confirmCase, markExpected, markNeedsInfo } from '@/ledger/caseState'
import { findCaseView, findingsQueue, overviewSummary, recoveryQueue } from '@/ledger/views'

const HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category'

function buildSampleEnv() {
  const csv = [
    HEADER,
    // exact duplicate -> recoverable
    'Acme,INV-1,2025-01-01,2025-01-10,100,100,,,',
    'Acme,INV-1,2025-01-01,2025-01-20,100,100,,,',
    // bank account change -> review
    'Beta,INV-2,2025-01-01,2025-01-05,50,50,,1111,',
    'Beta,INV-3,2025-01-02,2025-01-15,50,50,,2222,',
    // missed discount -> opportunity
    'Gamma,INV-4,2025-01-01,2025-02-15,100,100,2/10 net 30,,',
  ].join('\n')
  return mergeImport(null, { sourceLabel: 'sample.csv', mode: 'sample', parsed: parseCsv(csv) })
}

describe('views', () => {
  it('overview reflects real undecided totals and groups everything as three lenses over the same data', () => {
    const env = buildSampleEnv()
    const overview = overviewSummary(env)
    expect(overview.readyToVerifyCount + overview.needsContextCount + overview.worthNotingCount).toBe(
      overview.totalFindingCount
    )
    expect(overview.worthInvestigatingTotal).toBeGreaterThan(0)
    expect(overview.nextRecommendedCase).not.toBeNull()
    expect(overview.nextRecommendedCase!.finding.class).toBe('recoverable')
    expect(overview.statusMix.reduce((sum, item) => sum + item.count, 0)).toBe(overview.totalFindingCount)
    expect(overview.statusMix.reduce((sum, item) => sum + item.dollarImpact, 0)).toBe(overview.worthInvestigatingTotal)
    expect(overview.exposureByType[0]?.dollarImpact).toBeGreaterThan(0)
  })

  it('findings queue groups undecided cases by readiness, sorted by dollar impact', () => {
    const env = buildSampleEnv()
    const queue = findingsQueue(env)
    const readyToVerify = queue.find((g) => g.group === 'ready_to_verify')!
    expect(readyToVerify.cases.every((c) => c.finding.class === 'recoverable')).toBe(true)

    const needsContext = queue.find((g) => g.group === 'needs_context')!
    expect(needsContext.cases.some((c) => c.finding.type === 'bank_account_change')).toBe(true)

    const worthNoting = queue.find((g) => g.group === 'worth_noting')!
    expect(worthNoting.cases.some((c) => c.finding.type === 'missed_discount')).toBe(true)
  })

  it('confirming a case moves it out of Findings and into the confirmed Recovery lane', () => {
    let env = buildSampleEnv()
    const recoverable = env.result.findings.find((f) => f.class === 'recoverable')!
    env = setCaseState(env, recoverable.id, confirmCase('vendor confirmed'))

    const stillInFindings = findingsQueue(env).flatMap((g) => g.cases).some((c) => c.finding.id === recoverable.id)
    expect(stillInFindings).toBe(false)

    const recovery = recoveryQueue(env)
    const prepareGroup = recovery.find((g) => g.stage === 'confirmed')!
    expect(prepareGroup.cases.some((c) => c.finding.id === recoverable.id)).toBe(true)
    expect(overviewSummary(env).recoveryActiveValue).toBe(recoverable.dollarImpact)
  })

  it('marking a case expected does not falsely place it in a recovery outcome lane', () => {
    let env = buildSampleEnv()
    const opportunity = env.result.findings.find((f) => f.class === 'opportunity')!
    env = setCaseState(env, opportunity.id, markExpected('one-time exception'))

    expect(recoveryQueue(env).flatMap((group) => group.cases).some((c) => c.finding.id === opportunity.id)).toBe(false)
  })

  it('needs-information keeps the case out of Recovery and inside Findings under "needs context"', () => {
    let env = buildSampleEnv()
    const review = env.result.findings.find((f) => f.class === 'review')!
    env = setCaseState(env, review.id, markNeedsInfo('waiting on vendor statement'))

    const inRecovery = recoveryQueue(env).flatMap((g) => g.cases).some((c) => c.finding.id === review.id)
    expect(inRecovery).toBe(false)

    const needsContext = findingsQueue(env).find((g) => g.group === 'needs_context')!
    expect(needsContext.cases.some((c) => c.finding.id === review.id)).toBe(true)
  })

  it('findCaseView resolves a single case with its live state and new-since flag', () => {
    const env = buildSampleEnv()
    const finding = env.result.findings[0]
    const view = findCaseView(env, finding.id)
    expect(view).not.toBeNull()
    expect(view!.isNew).toBe(true)
    expect(findCaseView(env, 'not-a-real-id')).toBeNull()
  })
})
