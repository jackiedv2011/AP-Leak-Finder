import { afterEach, describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import {
  acknowledgeNewFindings,
  clearEnvironment,
  deserializeEnvironment,
  loadEnvironment,
  mergeImport,
  saveEnvironment,
  serializeEnvironment,
  setCaseState,
  type LedgerEnvironment,
} from '@/ledger/store'
import { confirmCase } from '@/ledger/caseState'

const HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category'

function csvWithDuplicate(vendor: string, invoice: string) {
  return [
    HEADER,
    `${vendor},${invoice},2025-01-01,2025-01-10,100,100,,,`,
    `${vendor},${invoice},2025-01-01,2025-01-20,100,100,,,`,
  ].join('\n')
}

describe('ledger store', () => {
  afterEach(() => clearEnvironment())

  it('creates a new environment on first import and assigns globally unique record ids', () => {
    const parsed = parseCsv(csvWithDuplicate('Acme', 'INV-1'))
    const env = mergeImport(null, { sourceLabel: 'first.csv', mode: 'upload', parsed })
    expect(env.records).toHaveLength(2)
    expect(new Set(env.records.map((r) => r.id)).size).toBe(2)
    expect(env.imports).toHaveLength(1)
    expect(env.result.findings.length).toBeGreaterThan(0)
  })

  it('merging a second import does not reset the first — record ids stay unique across both', () => {
    const first = mergeImport(null, { sourceLabel: 'a.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Acme', 'INV-1')) })
    const second = mergeImport(first, { sourceLabel: 'b.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Beta', 'INV-2')) })

    expect(second.records).toHaveLength(4)
    expect(second.imports).toHaveLength(2)
    expect(new Set(second.records.map((r) => r.id)).size).toBe(4)
    // the original Acme records are still present, unchanged
    expect(second.records.filter((r) => r.vendor === 'Acme')).toHaveLength(2)
  })

  it('keeps a finding id stable across a merge that does not affect it, so a recorded decision stays attached', () => {
    const first = mergeImport(null, { sourceLabel: 'a.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Acme', 'INV-1')) })
    const acmeFinding = first.result.findings.find((f) => f.vendor === 'Acme')!
    const decided = setCaseState(first, acmeFinding.id, confirmCase('vendor confirmed'))

    const second = mergeImport(decided, { sourceLabel: 'b.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Beta', 'INV-2')) })
    const stillThere = second.result.findings.find((f) => f.id === acmeFinding.id)

    expect(stillThere).toBeDefined()
    expect(second.caseStates[acmeFinding.id]?.decision).toBe('confirmed')
  })

  it('tracks which findings are new after a merge, and clears them on acknowledgement', () => {
    const first = mergeImport(null, { sourceLabel: 'a.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Acme', 'INV-1')) })
    expect(first.newFindingIds.length).toBeGreaterThan(0)

    const second = mergeImport(first, { sourceLabel: 'b.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Beta', 'INV-2')) })
    // new-since set reflects only the findings introduced by the second import
    const betaFindingIds = second.result.findings.filter((f) => f.vendor === 'Beta').map((f) => f.id)
    expect(second.newFindingIds.sort()).toEqual(betaFindingIds.sort())

    const acknowledged = acknowledgeNewFindings(second)
    expect(acknowledged.newFindingIds).toHaveLength(0)
  })

  it('round-trips through localStorage-style (de)serialization, including Date fields', () => {
    const env = mergeImport(null, { sourceLabel: 'a.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Acme', 'INV-1')) })
    const revived = deserializeEnvironment(serializeEnvironment(env))

    expect(revived.records[0].paymentDate).toBeInstanceOf(Date)
    expect(revived.records[0].paymentDate.getTime()).toBe(env.records[0].paymentDate.getTime())
    expect(revived.result.findings[0].relatedRecords[0].paymentDate).toBeInstanceOf(Date)
    expect(revived.records).toHaveLength(env.records.length)
  })

  it('saves to and loads from localStorage, and clears cleanly', () => {
    const env = mergeImport(null, { sourceLabel: 'a.csv', mode: 'upload', parsed: parseCsv(csvWithDuplicate('Acme', 'INV-1')) })
    saveEnvironment(env)

    const loaded = loadEnvironment()
    expect(loaded).not.toBeNull()
    expect(loaded!.records).toHaveLength(env.records.length)

    clearEnvironment()
    expect(loadEnvironment()).toBeNull()
  })

  it('returns null from loadEnvironment when nothing has been saved', () => {
    expect(loadEnvironment()).toBeNull()
  })

  it('a real near-duplicate finding survives a merge that adds unrelated records, preserving relatedRecords identity', () => {
    const csv = [
      HEADER,
      'Acme,INV-1,2025-01-01,2025-01-10,100,100,,,',
      'Acme,INV-2,2025-01-01,2025-01-15,100,100,,,',
    ].join('\n')
    const first: LedgerEnvironment = mergeImport(null, { sourceLabel: 'a.csv', mode: 'upload', parsed: parseCsv(csv) })
    const nearDup = first.result.findings.find((f) => f.type === 'near_duplicate')
    expect(nearDup).toBeDefined()

    const second = mergeImport(first, {
      sourceLabel: 'b.csv',
      mode: 'upload',
      parsed: parseCsv([HEADER, 'Unrelated Vendor,INV-9,2025-03-01,2025-03-05,50,50,,,'].join('\n')),
    })
    expect(second.result.findings.some((f) => f.id === nearDup!.id)).toBe(true)
  })
})
