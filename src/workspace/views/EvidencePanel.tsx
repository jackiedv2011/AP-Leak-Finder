import { useState } from 'react'
import type { Finding } from '@/types'
import type { ImportBatch } from '@/ledger/store'
import { EVIDENCE_CHECKS, evaluateEligibility, type RecoveryEvidence } from '@/recovery/eligibility'
import { autofillKey, quickBooksEvidence } from '@/recovery/quickbooksEvidence'

const pulledDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function EvidencePanel({ finding, findings, imports = [], onSave }: { finding: Finding; findings: Finding[]; imports?: ImportBatch[]; onSave: (evidence: RecoveryEvidence) => void }) {
  const emptyStamp = { reference: '', confirmedBy: '', confirmedAt: 0 }
  // Saved evidence wins; otherwise start from what QuickBooks already knows, then from blank.
  const [evidence, setEvidence] = useState<RecoveryEvidence>(() => finding.evidence ?? quickBooksEvidence(finding, imports) ?? {payments: finding.relatedRecords.map(r => ({...emptyStamp,recordId:r.id,paymentId:'',amountMinor:Math.round(r.amountPaid*100),currency:r.currency ?? '',settled:false,obligationId:''})),obligation:{...emptyStamp,obligationId:'',amountMinor:0,currency:''},checks:{},contradictions:[],notes:''})
  const [actor,setActor] = useState('')
  const [saved,setSaved] = useState(false)
  const gate = evaluateEligibility({...finding,contradictoryEvidence:[]},evidence,findings)
  const autofilled = evidence.autofilled ?? {}
  const fromQuickBooks = (key:string) => autofilled[key]?.source === 'quickbooks' ? <span className="wk-chip" data-tone="accent" data-testid="from-quickbooks" title={`Filled from QuickBooks (${autofilled[key].txnIds.join(', ')}). Check it before saving.`}>From QuickBooks</span> : null
  // Editing a field makes it the reviewer's own: it is no longer marked as automatic.
  const edit = (keys:string[],update:(prev:RecoveryEvidence)=>RecoveryEvidence) => setEvidence(prev=>{const next=update(prev);if(!next.autofilled||!keys.some(k=>k in next.autofilled!))return next;const rest={...next.autofilled};for(const k of keys)delete rest[k];return {...next,autofilled:rest}})
  const field = (label:string,value:string,change:(value:string)=>void,key?:string) => <label className="wk-field">{label}{key && fromQuickBooks(key) ? <> {fromQuickBooks(key)}</> : null}<input className="wk-input" value={value} onChange={event=>change(event.target.value)} /></label>
  const patchPayment = (index:number,key:string,patch:Partial<RecoveryEvidence['payments'][number]>) => edit([key],prev=>({...prev,payments:prev.payments.map((payment,i)=>i===index?{...payment,...patch}:payment)}))
  const autofillDates = Object.values(autofilled).filter(a=>a.source==='quickbooks').map(a=>a.pulledAt).filter(Boolean)
  return <section className="wk-section" id="evidence-review"><h2 className="wk-display wk-h2">Review evidence</h2>
    <p>The ledger supports a review signal. Separate payment traces, settlement confirmation and the searches below establish whether money is owed. Evidence confirmation does not authorize vendor contact.</p>
    <p><strong>{finding.ruleId ?? finding.type} · version {finding.ruleVersion ?? 1}</strong> · {finding.classification ?? 'review_needed'} · {gate.evidenceState.replaceAll('_',' ')}</p>
    <p>{gate.eligible ? `Potential recovery: ${gate.currency} ${(gate.potentialAmountMinor! / 100).toFixed(2)}` : `${gate.missingEvidence.length} evidence items still missing. Potential recovery unavailable.`}</p>
    {gate.contradictoryEvidence.length > 0 && <ul role="alert">{gate.contradictoryEvidence.map((text,i)=><li key={i}>{text}</li>)}</ul>}
    <details><summary>What is missing and what could explain this signal</summary><ul>{gate.missingEvidence.map((text,i)=><li key={i}>{text}</li>)}</ul><p>A repeated import, void, reversal, refund, credit, installment, split or recurring bill may explain these records.</p></details>
    <form className="wk-card" onSubmit={event=>{event.preventDefault();const stamp={confirmedBy:actor.trim(),confirmedAt:Date.now()};const next={...evidence,payments:evidence.payments.map(p=>({...p,...stamp})),obligation:{...evidence.obligation,...stamp},checks:Object.fromEntries(Object.entries(evidence.checks).map(([key,value])=>[key,{...value,...stamp}]))};setEvidence(next);onSave(next);setSaved(true)}} style={{display:'grid',gap:16,marginTop:16}}>
      {autofillDates.length > 0 && <div className="wk-callout" role="note" data-testid="quickbooks-autofill-note"><div className="wk-callout-body"><p>Fields marked <strong>From QuickBooks</strong> were filled from the QuickBooks import{Math.max(...autofillDates) > 0 ? ` of ${pulledDate.format(Math.max(...autofillDates))}` : ''}: the payment IDs, the bill they paid, and the refund and credit searches. Check each one before saving. QuickBooks doesn’t report whether a payment cleared the bank, so settlement still needs your confirmation.</p></div></div>}
      {field('Person confirming these facts',actor,setActor)}
      <fieldset><legend>Obligation or invoice</legend>
        {field('Obligation identity',evidence.obligation.obligationId,value=>edit([autofillKey.obligationId],prev=>({...prev,obligation:{...prev.obligation,obligationId:value},payments:prev.payments.map(p=>({...p,obligationId:value}))})),autofillKey.obligationId)}
        {field('Invoice / bill copy reference or external link',evidence.obligation.reference,value=>edit([autofillKey.obligationReference],prev=>({...prev,obligation:{...prev.obligation,reference:value}})),autofillKey.obligationReference)}
        {field('Obligation amount in minor units (for example 10000 cents)',String(evidence.obligation.amountMinor || ''),value=>edit([autofillKey.obligationAmount],prev=>({...prev,obligation:{...prev.obligation,amountMinor:Number(value)}})),autofillKey.obligationAmount)}
        {field('Currency code',evidence.obligation.currency,value=>edit([autofillKey.obligationCurrency],prev=>({...prev,obligation:{...prev.obligation,currency:value.toUpperCase()}})),autofillKey.obligationCurrency)}
      </fieldset>
      {evidence.payments.map((payment,index)=><fieldset key={payment.recordId}><legend>Ledger record {payment.recordId} · {payment.amountMinor} minor units</legend>
        {field('Distinct payment identity',payment.paymentId,value=>patchPayment(index,autofillKey.paymentId(payment.recordId),{paymentId:value}),autofillKey.paymentId(payment.recordId))}
        {field('Payment trace / bank settlement reference',payment.reference,value=>patchPayment(index,autofillKey.paymentReference(payment.recordId),{reference:value}),autofillKey.paymentReference(payment.recordId))}
        {field('Payment currency',payment.currency,value=>patchPayment(index,autofillKey.paymentCurrency(payment.recordId),{currency:value.toUpperCase()}),autofillKey.paymentCurrency(payment.recordId))}
        <label><input type="checkbox" checked={payment.settled} onChange={e=>patchPayment(index,'',{settled:e.target.checked})}/> Settled or cleared against the obligation above</label>
      </fieldset>)}
      {EVIDENCE_CHECKS.map(([key,label])=><fieldset key={key}><legend>{label} {fromQuickBooks(autofillKey.check(key))}</legend><label><input type="checkbox" checked={evidence.checks[key]?.confirmed ?? false} onChange={event=>edit([autofillKey.check(key)],prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,...prev.checks[key],confirmed:event.target.checked}}}))}/> Confirmed from the search or explanation below</label>{field('Search / explanation / supporting reference',evidence.checks[key]?.reference ?? '',value=>edit([autofillKey.check(key)],prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,confirmed:false,...prev.checks[key],reference:value}}})))}</fieldset>)}
      <label className="wk-field">Customer notes<textarea className="wk-input" value={evidence.notes} onChange={e=>setEvidence(prev=>({...prev,notes:e.target.value}))}/></label>
      <label className="wk-field">Contradictory evidence (one reason per line)<textarea className="wk-input" value={evidence.contradictions.join('\n')} onChange={e=>setEvidence(prev=>({...prev,contradictions:e.target.value.split('\n')}))}/></label>
      <button className="wk-btn" data-variant="primary" disabled={!actor.trim()}>Save evidence and evaluate eligibility</button>{saved && <p role="status">Evidence saved. Eligibility has been recalculated.</p>}
    </form>
    {finding.evidence && <details><summary>Saved confirmations and references</summary><ul>{[...finding.evidence.payments,finding.evidence.obligation,...Object.values(finding.evidence.checks)].map((item,index)=>item && <li key={index}>{item.reference || 'No reference'} · {item.confirmedBy || 'Not confirmed'} · {item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : 'No confirmation time'}</li>)}</ul></details>}
  </section>
}
