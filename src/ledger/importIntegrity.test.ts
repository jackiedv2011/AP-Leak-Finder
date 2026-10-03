import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { mergeImport, serializeEnvironment, deserializeEnvironment } from './store'

const header = 'vendor,invoice_number,payment_date,amount_paid,currency,transaction_id,company,source_account'
const a = 'ABC Supply LLC ,INV-0042,2025-01-01,100,USD,P1,Books,AP'
const b = 'ABC Supply LLC ,0042,2025-01-02,100,USD,P2,Books,AP'
const input = (rows: string[], name = 'one.csv') => ({ sourceLabel: name, mode: 'upload' as const, parsed: parseCsv([header, ...rows].join('\n')) })

describe('import identity and source preservation', () => {
  it('same content, renamed uploads and retries do not mutate the ledger', () => {
    const env = mergeImport(null, input([a,b]))
    expect(mergeImport(env, input([a,b]))).toEqual(env)
    expect(mergeImport(env, input([a,b], 'renamed.csv'))).toEqual(env)
    const restored = deserializeEnvironment(serializeEnvironment(env))
    expect(mergeImport(restored, input([a,b]))).toEqual(restored)
  })
  it('overlapping batches retain only new transaction identities', () => {
    const env = mergeImport(null, input([a]))
    const next = mergeImport(env, input([a,b], 'two.csv'))
    expect(next.records).toHaveLength(2)
    expect(next.imports[1].rowResults?.map(r => r.status)).toEqual(['exact_duplicate','newly_imported'])
  })
  it('distinct external payments with identical financial fields remain separate', () => {
    const env = mergeImport(null, input([a, a.replace('P1','P2')]))
    expect(env.records).toHaveLength(2)
    expect(new Set(env.records.map(r => r.rowFingerprint)).size).toBe(2)
  })
  it('identity never crosses independent tenant/project environments', () => {
    const first = mergeImport(null, input([a,b]))
    const second = mergeImport(null, input([a,b]))
    expect(second.records).toHaveLength(first.records.length)
    expect(second.imports[0].rowResults?.every(r => r.status === 'newly_imported')).toBe(true)
  })
  it('ambiguous overlap is retained for inspection instead of silently discarded', () => {
    const noId = a.replace('P1','')
    const env = mergeImport(null, input([noId]))
    const next = mergeImport(env, input([noId,b]))
    expect(next.records).toHaveLength(2)
    expect(next.imports[1].rowResults?.[0]).toMatchObject({ status:'possible_overlap', raw: expect.objectContaining({ vendor:'ABC Supply LLC ' }) })
  })
  it('conflicting external identity is quarantined with raw facts', () => {
    const env = mergeImport(null, input([a]))
    const next = mergeImport(env, input([a.replace(',100,',',200,')]))
    expect(next.records).toHaveLength(1)
    expect(next.imports[1].rowResults?.[0].status).toBe('possible_overlap')
  })
  it('preserves raw values, normalization steps and source locations', () => {
    const env = mergeImport(null, input([a,b]))
    expect(env.records[0].vendor).toBe('ABC Supply LLC')
    expect(env.records[0].source).toMatchObject({ rawAvailable:true, filename:'one.csv', rowNumber:2, batchId:env.imports[0].id, raw:{vendor:'ABC Supply LLC ',invoice_number:'INV-0042'}, normalized:{vendor:'abc supply',invoiceReference:'0042'} })
    expect(env.records[0].source?.transformations.invoiceReference).toContain('remove_invoice_prefix')
  })
})
