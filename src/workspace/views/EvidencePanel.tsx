import { useState } from 'react'
import type { Finding } from '@/types'
import { EVIDENCE_CHECKS, evaluateEligibility, type RecoveryEvidence } from '@/recovery/eligibility'

export function EvidencePanel({ finding, findings, onSave }: { finding: Finding; findings: Finding[]; onSave: (evidence: RecoveryEvidence) => void }) {
  const emptyStamp = { reference: '', confirmedBy: '', confirmedAt: 0 }
  const [evidence, setEvidence] = useState<RecoveryEvidence>(() => finding.evidence ?? {payments: finding.relatedRecords.map(r => ({...emptyStamp,recordId:r.id,paymentId:'',amountMinor:Math.round(r.amountPaid*100),currency:r.currency ?? '',settled:false,obligationId:''})),obligation:{...emptyStamp,obligationId:'',amountMinor:0,currency:''},checks:{},contradictions:[],notes:''})
  const [actor,setActor] = useState('')
  const [saved,setSaved] = useState(false)
  const gate = evaluateEligibility({...finding,contradictoryEvidence:[]},evidence,findings)
  const field = (label:string,value:string,change:(value:string)=>void) => <label className="wk-field">{label}<input className="wk-input" value={value} onChange={event=>change(event.target.value)} /></label>
  const patchPayment = (index:number,patch:Partial<RecoveryEvidence['payments'][number]>) => setEvidence(prev=>({...prev,payments:prev.payments.map((payment,i)=>i===index?{...payment,...patch}:payment)}))
  return <section className="wk-section" id="evidence-review"><h2 className="wk-display wk-h2">Review evidence</h2>
    <p>The ledger supports a review signal. Separate payment traces, settlement confirmation and the searches below establish whether money is owed. Evidence confirmation does not authorize vendor contact.</p>
    <p><strong>{finding.ruleId ?? finding.type} · version {finding.ruleVersion ?? 1}</strong> · {finding.classification ?? 'review_needed'} · {gate.evidenceState.replaceAll('_',' ')}</p>
    <p>{gate.eligible ? `Potential recovery: ${gate.currency} ${(gate.potentialAmountMinor! / 100).toFixed(2)}` : `${gate.missingEvidence.length} evidence items still missing. Potential recovery unavailable.`}</p>
    {gate.contradictoryEvidence.length > 0 && <ul role="alert">{gate.contradictoryEvidence.map((text,i)=><li key={i}>{text}</li>)}</ul>}
    <details><summary>What is missing and what could explain this signal</summary><ul>{gate.missingEvidence.map((text,i)=><li key={i}>{text}</li>)}</ul><p>A repeated import, void, reversal, refund, credit, installment, split or recurring bill may explain these records.</p></details>
    <form className="wk-card" onSubmit={event=>{event.preventDefault();const stamp={confirmedBy:actor.trim(),confirmedAt:Date.now()};const next={...evidence,payments:evidence.payments.map(p=>({...p,...stamp})),obligation:{...evidence.obligation,...stamp},checks:Object.fromEntries(Object.entries(evidence.checks).map(([key,value])=>[key,{...value,...stamp}]))};setEvidence(next);onSave(next);setSaved(true)}} style={{display:'grid',gap:16,marginTop:16}}>
      {field('Person confirming these facts',actor,setActor)}
      <fieldset><legend>Obligation or invoice</legend>
        {field('Obligation identity',evidence.obligation.obligationId,value=>setEvidence(prev=>({...prev,obligation:{...prev.obligation,obligationId:value},payments:prev.payments.map(p=>({...p,obligationId:value}))})))}
        {field('Invoice / bill copy reference or external link',evidence.obligation.reference,value=>setEvidence(prev=>({...prev,obligation:{...prev.obligation,reference:value}})))}
        {field('Obligation amount in minor units (for example 10000 cents)',String(evidence.obligation.amountMinor || ''),value=>setEvidence(prev=>({...prev,obligation:{...prev.obligation,amountMinor:Number(value)}})))}
        {field('Currency code',evidence.obligation.currency,value=>setEvidence(prev=>({...prev,obligation:{...prev.obligation,currency:value.toUpperCase()}})))}
      </fieldset>
      {evidence.payments.map((payment,index)=><fieldset key={payment.recordId}><legend>Ledger record {payment.recordId} · {payment.amountMinor} minor units</legend>
        {field('Distinct payment identity',payment.paymentId,value=>patchPayment(index,{paymentId:value}))}
        {field('Payment trace / bank settlement reference',payment.reference,value=>patchPayment(index,{reference:value}))}
        {field('Payment currency',payment.currency,value=>patchPayment(index,{currency:value.toUpperCase()}))}
        <label><input type="checkbox" checked={payment.settled} onChange={e=>patchPayment(index,{settled:e.target.checked})}/> Settled or cleared against the obligation above</label>
      </fieldset>)}
      {EVIDENCE_CHECKS.map(([key,label])=><fieldset key={key}><legend>{label}</legend><label><input type="checkbox" checked={evidence.checks[key]?.confirmed ?? false} onChange={event=>setEvidence(prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,...prev.checks[key],confirmed:event.target.checked}}}))}/> Confirmed from the search or explanation below</label>{field('Search / explanation / supporting reference',evidence.checks[key]?.reference ?? '',value=>setEvidence(prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,confirmed:false,...prev.checks[key],reference:value}}})))}</fieldset>)}
      <label className="wk-field">Customer notes<textarea className="wk-input" value={evidence.notes} onChange={e=>setEvidence(prev=>({...prev,notes:e.target.value}))}/></label>
      <label className="wk-field">Contradictory evidence (one reason per line)<textarea className="wk-input" value={evidence.contradictions.join('\n')} onChange={e=>setEvidence(prev=>({...prev,contradictions:e.target.value.split('\n')}))}/></label>
      <button className="wk-btn" data-variant="primary" disabled={!actor.trim()}>Save evidence and evaluate eligibility</button>{saved && <p role="status">Evidence saved. Eligibility has been recalculated.</p>}
    </form>
    {finding.evidence && <details><summary>Saved confirmations and references</summary><ul>{[...finding.evidence.payments,finding.evidence.obligation,...Object.values(finding.evidence.checks)].map((item,index)=>item && <li key={index}>{item.reference || 'No reference'} · {item.confirmedBy || 'Not confirmed'} · {item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : 'No confirmation time'}</li>)}</ul></details>}
  </section>
}
