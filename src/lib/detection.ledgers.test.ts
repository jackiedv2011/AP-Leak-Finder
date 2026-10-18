/**
 * The checks on realistic small-business ledgers, not just the planted sample.
 * Three seeded synthetic years (a café, a contractor, a dental clinic) go
 * through the same import path as an upload. Every planted error must be
 * caught, and the false alarms per check are pinned at what the engine
 * produces today, so a rule change that adds noise or loses a catch fails
 * here. The counts are discussed in docs/detector-and-evidence-gaps.md.
 */
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { mergeImport } from '@/ledger/store'
import { recurringSeriesOf } from '@/lib/detection'
import type { FindingType } from '@/types'
import { cafeLedger, clinicLedger, contractorLedger, scoreFindings, type SyntheticLedger } from '@/test/fixtures/syntheticLedgers'

function run(ledger: SyntheticLedger) {
  const env = mergeImport(null, { sourceLabel: `${ledger.name}.csv`, mode: 'upload', parsed: parseCsv(ledger.csv) })
  const rowOf = new Map(env.records.map((r) => [r.id, r.source!.rowNumber - 2]))
  return { env, score: scoreFindings(ledger, env.result.findings, (id) => rowOf.get(id)!) }
}

const falseAlarms = (score: ReturnType<typeof run>['score']) =>
  Object.fromEntries(Object.entries(score).filter(([, s]) => s.falseAlarms.length).map(([type, s]) => [type, s.falseAlarms.length])) as Partial<Record<FindingType, number>>

const CASES: Array<{ make: () => SyntheticLedger; falseAlarms: Partial<Record<FindingType, number>> }> = [
  // Four pairs of separate dairy invoices that happen to share an amount to the cent.
  { make: cafeLedger, falseAlarms: { near_duplicate: 4 } },
  // Roofing instalments exported without the invoice total: equal instalments read as a repeat payment.
  { make: contractorLedger, falseAlarms: { exact_duplicate: 9 } },
  { make: clinicLedger, falseAlarms: {} },
]

describe('realistic ledgers — every planted error caught, false alarms pinned', () => {
  for (const { make, falseAlarms: expected } of CASES) {
    const ledger = make()
    it(`${ledger.name}: ${ledger.rowCount} payments over 12 months`, () => {
      expect(ledger.rowCount).toBeGreaterThanOrEqual(1000)
      expect(ledger.rowCount).toBeLessThanOrEqual(3000)
      const { score } = run(ledger)
      const missed = Object.values(score).flatMap((s) => s.misses.map((m) => `${m.kind}: ${m.note}`))
      expect(missed).toEqual([])
      expect(falseAlarms(score)).toEqual(expected)
    })
  }

  it('lists standing orders and subscriptions as recurring, never irregular card purchases', () => {
    const cafe = run(cafeLedger()).env.result
    const contractor = run(contractorLedger()).env.result
    const cafeSeries = recurringSeriesOf(cafe).map((s) => s.vendor)
    expect(cafeSeries).toContain('Sunrise Bakery')
    expect(cafeSeries).toContain('Harbor Street Properties')
    expect(cafeSeries).not.toContain('Shell')
    expect(recurringSeriesOf(contractor).map((s) => s.vendor)).not.toContain('Chevron')
  })
})
