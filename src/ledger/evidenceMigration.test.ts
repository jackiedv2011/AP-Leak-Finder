import { describe,expect,it } from 'vitest'
import { deserializeEnvironment,serializeEnvironment,mergeImport } from './store'
import { parseCsv } from '@/lib/csv'

describe('evidence migration preserves history',()=>{
  it('preserves legacy decisions, proof and events while revalidating open cases',()=>{
    const env=mergeImport(null,{mode:'upload',sourceLabel:'old.csv',parsed:parseCsv('vendor,invoice_number,payment_date,amount_paid\nAcme,1,2025-01-01,100\nAcme,1,2025-01-02,100')})
    const raw=JSON.parse(serializeEnvironment(env))
    delete raw.schemaVersion
    raw.records.forEach((r:Record<string,unknown>)=>{delete r.source;delete r.currency})
    const id=raw.result.findings[0].id
    raw.result.findings[0].class='recoverable'
    raw.caseStates[id]={decision:'confirmed',reason:'original review',decidedAt:10,recoveryStage:'requested',requestedAmount:100,recoveredAmount:25,recoverySettlements:[{amount:25,method:'refund',source:'bank',reference:'bank-1',settledAt:100}],history:[{action:'stage:requested',at:20,summary:'Original request'}]}
    const migrated=deserializeEnvironment(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.records[0].source).toMatchObject({rawAvailable:false,raw:null})
    expect(migrated.records[0].currency).toBeUndefined()
    expect(migrated.historicalFindings?.[0].class).toBe('recoverable')
    expect(migrated.caseStates[id]).toEqual({...raw.caseStates[id],requiresRevalidation:true})
    expect(migrated.result.findings[0]).toMatchObject({classification:'review_needed',potentialAmountMinor:null})
    const reloaded=deserializeEnvironment(serializeEnvironment(migrated))
    expect(reloaded.caseStates[id]).toEqual(migrated.caseStates[id])
    expect(reloaded.historicalFindings).toHaveLength(migrated.historicalFindings!.length)
  })
  it('keeps historical findings readable as revived records after save/reload',()=>{
    const env=mergeImport(null,{mode:'upload',sourceLabel:'old.csv',parsed:parseCsv('vendor,invoice_number,payment_date,amount_paid\nAcme,1,2025-01-01,100\nAcme,1,2025-01-02,100')})
    const raw=JSON.parse(serializeEnvironment(env));delete raw.schemaVersion
    const migrated=deserializeEnvironment(JSON.stringify(raw))
    const reloaded=deserializeEnvironment(serializeEnvironment(migrated))
    expect(reloaded.historicalFindings?.[0].relatedRecords[0].paymentDate).toBeInstanceOf(Date)
  })
})
