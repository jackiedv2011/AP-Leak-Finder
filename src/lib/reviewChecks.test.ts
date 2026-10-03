import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { mergeImport } from '@/ledger/store'
import { checksum } from './sourceIdentity'

const head='vendor,invoice_number,payment_date,amount_paid,invoice_amount,currency,transaction_id,terms,invoice_date,bank_account_last4'
function run(rows:string[]) { return mergeImport(null,{mode:'upload',sourceLabel:'checks.csv',parsed:parseCsv([head,...rows].join('\n'))}).result.findings }
describe('versioned review signals',()=>{
  it('uses a standard content digest',()=>expect(checksum('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'))
  it('exact raw reference repetitions on different dates remain review only',()=>{
    const findings=run(['Acme,INV-42,2025-01-01,100,100,USD,P1,,,','Acme,INV-42,2025-01-06,100,100,USD,P2,,,'])
    const exact=findings.find(f=>f.ruleId==='exact_repeated_payment_v1')!
    expect(exact).toMatchObject({classification:'review_needed',potentialAmountMinor:null,ruleVersion:1,evidenceState:'records_supported',flaggedAmount:100})
    expect(exact.missingEvidence?.length).toBeGreaterThan(0)
    expect(findings.every(f=>f.classification!=='recovery_candidate')).toBe(true)
  })
  it('distinguishes normalized variants from exact raw references',()=>{
    const findings=run(['Acme,INV-0042,2025-01-01,100,100,USD,P1,,,','Acme,0042,2025-01-06,100,100,USD,P2,,,'])
    expect(findings.some(f=>f.ruleId==='exact_repeated_payment_v1')).toBe(false)
    expect(findings.find(f=>f.ruleId==='invoice_reference_variant_v1')).toMatchObject({classification:'review_needed',potentialAmountMinor:null})
  })
  it('reviews missing references with matching known currency and amount',()=>{
    expect(run(['Acme,,2025-01-01,100,,USD,P1,,,','Acme,,2025-01-06,100,,USD,P2,,,']).some(f=>f.ruleId==='same_vendor_amount_near_duplicate_v1')).toBe(true)
    expect(run(['Acme,A,2025-01-01,100,,USD,P1,,,','Acme,B,2025-01-06,100,,EUR,P2,,,']).some(f=>f.ruleId==='same_vendor_amount_near_duplicate_v1')).toBe(false)
  })
  it('retains recurring context without promoting recurring rows',()=>{
    const findings=run(['Acme,A,2025-01-01,100,,USD,P1,,,','Acme,B,2025-02-01,100,,USD,P2,,,','Acme,C,2025-03-01,100,,USD,P3,,,'])
    const near=findings.filter(f=>f.ruleId==='same_vendor_amount_near_duplicate_v1')
    expect(near.every(f=>f.suppressionReason?.includes('Recurring'))).toBe(true)
    expect(near.every(f=>f.potentialAmountMinor===null)).toBe(true)
  })
  it('discounts and changed bank accounts have non-recovery categories',()=>{
    const findings=run(['Acme,A,2025-01-05,100,100,USD,P1,2/10 net 30,2025-01-01,1111','Acme,B,2025-02-20,110,100,USD,P2,2/10 net 30,2025-02-01,2222'])
    expect(findings.find(f=>f.type==='overpayment')?.classification).toBe('review_needed')
    expect(findings.find(f=>f.type==='unclaimed_discount')?.classification).toBe('future_savings')
    expect(findings.find(f=>f.type==='missed_discount')?.classification).toBe('future_savings')
    expect(findings.find(f=>f.type==='bank_account_change')?.classification).toBe('preventive_security')
  })
})
