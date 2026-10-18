import { useState, type ReactNode } from 'react'
import type { Finding } from '@/types'
import type { ImportBatch } from '@/ledger/store'
import { formatCurrency, formatDate } from '@/lib/format'
import { evaluateEligibility, type EvidenceCheck, type RecoveryEvidence } from '@/recovery/eligibility'
import { autofillKey, quickBooksEvidence } from '@/recovery/quickbooksEvidence'
import { dollarsToCents } from './amounts'

const pulledDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** The gate's checks, asked the way an owner would answer them. The gate itself is unchanged. */
const CHECK_QUESTION: Record<EvidenceCheck, string> = {
  duplicateImport: 'This isn’t the same payment imported twice',
  refund: 'No refund has already covered it',
  credit: 'No vendor credit has already covered it',
  void: 'Neither payment was voided',
  reversal: 'Neither payment was reversed',
  installment: 'It isn’t an installment, a split or retainage',
  recurring: 'These aren’t two separate recurring bills',
  customerConfirmation: 'I confirm the bill was paid more than once',
}
const CHECK_HINT: Record<EvidenceCheck, string> = {
  duplicateImport: 'For example: both show on the bank statement',
  refund: 'For example: searched deposits since the second payment',
  credit: 'For example: searched vendor credits, none found',
  void: 'For example: checked the bank statement',
  reversal: 'For example: checked the bank statement',
  installment: 'For example: the bill shows one full amount',
  recurring: 'For example: same bill number and date on both',
  customerConfirmation: 'For example: matched both payments to the same bill',
}
// Together these ask every check in EVIDENCE_CHECKS once (EvidencePanel.test.tsx holds that).
const MONEY_BACK_CHECKS: EvidenceCheck[] = ['refund', 'credit', 'void', 'reversal']
const REALLY_DUPLICATE_CHECKS: EvidenceCheck[] = ['duplicateImport', 'installment', 'recurring', 'customerConfirmation']

const centsToDollars = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : '')

export function EvidencePanel({ finding, findings, imports = [], onSave }: { finding: Finding; findings: Finding[]; imports?: ImportBatch[]; onSave: (evidence: RecoveryEvidence) => void }) {
  const emptyStamp = { reference: '', confirmedBy: '', confirmedAt: 0 }
  // Saved evidence wins; otherwise start from what QuickBooks already knows, then from blank.
  const [evidence, setEvidence] = useState<RecoveryEvidence>(() => finding.evidence ?? quickBooksEvidence(finding, imports) ?? {payments: finding.relatedRecords.map(r => ({...emptyStamp,recordId:r.id,paymentId:'',amountMinor:Math.round(r.amountPaid*100),currency:r.currency ?? '',settled:false,obligationId:''})),obligation:{...emptyStamp,obligationId:'',amountMinor:0,currency:''},checks:{},contradictions:[],notes:''})
  const [billAmount, setBillAmount] = useState(() => centsToDollars(evidence.obligation.amountMinor))
  const [actor,setActor] = useState('')
  const [saved,setSaved] = useState(false)
  const gate = evaluateEligibility({...finding,contradictoryEvidence:[]},evidence,findings)
  const autofilled = evidence.autofilled ?? {}
  const fromQuickBooks = (key:string) => autofilled[key]?.source === 'quickbooks' ? <span className="wk-chip" data-tone="accent" data-testid="from-quickbooks" title={`Filled from QuickBooks (${autofilled[key].txnIds.join(', ')}). Check it before saving.`}>From QuickBooks</span> : null
  // Editing a field makes it the reviewer's own: it is no longer marked as automatic.
  const edit = (keys:string[],update:(prev:RecoveryEvidence)=>RecoveryEvidence) => setEvidence(prev=>{const next=update(prev);if(!next.autofilled||!keys.some(k=>k in next.autofilled!))return next;const rest={...next.autofilled};for(const k of keys)delete rest[k];return {...next,autofilled:rest}})
  const field = (label:string,value:string,change:(value:string)=>void,key?:string,extra?:{placeholder?:string;hint?:ReactNode;inputMode?:'decimal';invalid?:boolean}) => <label className="wk-field">{label}{key && fromQuickBooks(key) ? <> {fromQuickBooks(key)}</> : null}<input className="wk-input" value={value} placeholder={extra?.placeholder} inputMode={extra?.inputMode} aria-invalid={extra?.invalid || undefined} onChange={event=>change(event.target.value)} />{extra?.hint ? <span className="wk-field-hint">{extra.hint}</span> : null}</label>
  const patchPayment = (index:number,key:string,patch:Partial<RecoveryEvidence['payments'][number]>) => edit([key],prev=>({...prev,payments:prev.payments.map((payment,i)=>i===index?{...payment,...patch}:payment)}))
  const autofillDates = Object.values(autofilled).filter(a=>a.source==='quickbooks').map(a=>a.pulledAt).filter(Boolean)
  const recordOf = (recordId:string) => finding.relatedRecords.find(r=>r.id===recordId)
  const billAmountInvalid = billAmount.trim() !== '' && dollarsToCents(billAmount) === 0
  const answered = Boolean(evidence.obligation.obligationId.trim() || evidence.payments.some(p=>p.paymentId.trim() || p.settled) || Object.values(evidence.checks).some(c=>c?.confirmed))

  const check = (key:EvidenceCheck) => <div className="wk-evq-check" key={key}>
    <label className="wk-evq-tick"><input type="checkbox" checked={evidence.checks[key]?.confirmed ?? false} onChange={event=>edit([autofillKey.check(key)],prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,...prev.checks[key],confirmed:event.target.checked}}}))}/> <span>{CHECK_QUESTION[key]}</span> {fromQuickBooks(autofillKey.check(key))}</label>
    {field(key === 'customerConfirmation' ? 'How you know' : 'Where you checked',evidence.checks[key]?.reference ?? '',value=>edit([autofillKey.check(key)],prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,confirmed:false,...prev.checks[key],reference:value}}})),undefined,{placeholder:CHECK_HINT[key]})}
  </div>

  const status = gate.eligible
    ? <p className="wk-evq-status" data-tone="ready"><strong>Ready to claim {formatCurrency(gate.potentialAmountMinor! / 100)}.</strong> Approve the request next. Nothing is sent to the vendor until you do.</p>
    : answered && gate.contradictoryEvidence.length > 0
      ? <p className="wk-evq-status" data-tone="conflict"><strong>Some answers don’t line up yet.</strong> Open Details to see which.</p>
      : <p className="wk-evq-status"><strong>Not ready to claim yet.</strong> Answer the questions below, then save. Confirming the evidence doesn’t contact the vendor.</p>

  return <section className="wk-panelcard" id="evidence-review" aria-labelledby="evidence-review-title">
    <div className="wk-panelcard-head"><div><h2 id="evidence-review-title">Confirm the evidence</h2><p>A few questions decide whether this is money you can ask the vendor for.</p></div></div>
    <div className="wk-panelcard-body wk-stack">
      {status}
      <form className="wk-evq" onSubmit={event=>{event.preventDefault();const stamp={confirmedBy:actor.trim(),confirmedAt:Date.now()};const next={...evidence,payments:evidence.payments.map(p=>({...p,...stamp})),obligation:{...evidence.obligation,...stamp},checks:Object.fromEntries(Object.entries(evidence.checks).map(([key,value])=>[key,{...value,...stamp}]))};setEvidence(next);onSave(next);setSaved(true)}}>
        {autofillDates.length > 0 && <div className="wk-callout" role="note" data-testid="quickbooks-autofill-note"><div className="wk-callout-body"><p>Answers marked <strong>From QuickBooks</strong> were filled from the QuickBooks import{Math.max(...autofillDates) > 0 ? ` of ${pulledDate.format(Math.max(...autofillDates))}` : ''}: the payment IDs, the bill they paid, and the refund and credit searches. Check each one before saving. QuickBooks doesn’t report whether a payment cleared the bank, so settlement still needs your confirmation.</p></div></div>}

        <fieldset className="wk-evq-group"><legend>1. Is this one bill?</legend>
          <p className="wk-field-hint">The bill or invoice both payments were for.</p>
          <div className="wk-evq-grid">
            {field('Bill or invoice number',evidence.obligation.obligationId,value=>edit([autofillKey.obligationId],prev=>({...prev,obligation:{...prev.obligation,obligationId:value},payments:prev.payments.map(p=>({...p,obligationId:value}))})),autofillKey.obligationId,{placeholder:finding.relatedRecords[0]?.invoiceNumber ?? 'INV-1001'})}
            {field('Bill amount, in dollars',billAmount,value=>{setBillAmount(value);edit([autofillKey.obligationAmount],prev=>({...prev,obligation:{...prev.obligation,amountMinor:dollarsToCents(value)}}))},autofillKey.obligationAmount,{placeholder:'6800.00',inputMode:'decimal',hint:billAmountInvalid ? 'Enter an amount like 6800.00' : undefined,invalid:billAmountInvalid})}
            {field('Link to the bill, or where it’s filed',evidence.obligation.reference,value=>edit([autofillKey.obligationReference],prev=>({...prev,obligation:{...prev.obligation,reference:value}})),autofillKey.obligationReference,{placeholder:'A link, or “Bills folder, Feb 2025”'})}
            {field('Currency',evidence.obligation.currency,value=>edit([autofillKey.obligationCurrency],prev=>({...prev,obligation:{...prev.obligation,currency:value.toUpperCase()}})),autofillKey.obligationCurrency,{placeholder:'USD',hint:'Recovery works in US dollars for now.'})}
          </div>
        </fieldset>

        <fieldset className="wk-evq-group"><legend>2. Did {evidence.payments.length === 2 ? 'both' : 'all the'} payments clear?</legend>
          <p className="wk-field-hint">Check your bank statement for each one.</p>
          {evidence.payments.map((payment,index)=>{const record=recordOf(payment.recordId);return <div className="wk-evq-payment" key={payment.recordId}>
            <strong className="wk-evq-payment-title">{formatCurrency(payment.amountMinor / 100)}{record ? ` paid ${formatDate(record.paymentDate)}` : ''}</strong>
            <div className="wk-evq-grid">
              {field('Payment or check number',payment.paymentId,value=>patchPayment(index,autofillKey.paymentId(payment.recordId),{paymentId:value}),autofillKey.paymentId(payment.recordId),{placeholder:'Check 1043, or the bank transfer ID'})}
              {field('Bank reference showing it cleared',payment.reference,value=>patchPayment(index,autofillKey.paymentReference(payment.recordId),{reference:value}),autofillKey.paymentReference(payment.recordId),{placeholder:'Statement line or trace number'})}
              {field('Currency',payment.currency,value=>patchPayment(index,autofillKey.paymentCurrency(payment.recordId),{currency:value.toUpperCase()}),autofillKey.paymentCurrency(payment.recordId),{placeholder:'USD'})}
            </div>
            <label className="wk-evq-tick"><input type="checkbox" checked={payment.settled} onChange={e=>patchPayment(index,'',{settled:e.target.checked})}/> <span>Settled or cleared against the bill above</span></label>
          </div>})}
        </fieldset>

        <fieldset className="wk-evq-group"><legend>3. Any refund, credit or void?</legend>
          <p className="wk-field-hint">Make sure the extra payment hasn’t already come back some other way.</p>
          {MONEY_BACK_CHECKS.map(check)}
        </fieldset>

        <fieldset className="wk-evq-group"><legend>4. Is it really a duplicate?</legend>
          {REALLY_DUPLICATE_CHECKS.map(check)}
        </fieldset>

        <div className="wk-evq-grid" data-columns="1">
          <label className="wk-field">Anything else worth noting<textarea className="wk-input" value={evidence.notes} onChange={e=>setEvidence(prev=>({...prev,notes:e.target.value}))}/></label>
          <label className="wk-field">Anything that says it isn’t a duplicate? One reason per line.<textarea className="wk-input" value={evidence.contradictions.join('\n')} onChange={e=>setEvidence(prev=>({...prev,contradictions:e.target.value.split('\n')}))}/></label>
        </div>

        <div className="wk-evq-save">
          {field('Person confirming these facts',actor,setActor,undefined,{placeholder:'Your name'})}
          <button className="wk-btn" data-variant="primary" disabled={!actor.trim() || billAmountInvalid}>Save evidence</button>
          {saved && <p role="status" className="wk-field-hint">Saved. {gate.eligible ? 'This is ready to claim.' : 'Answer the rest when you have it.'}</p>}
        </div>
      </form>

      <details className="wk-evq-details">
        <summary>Details</summary>
        <dl className="wk-kv">
          <div><dt>Rule</dt><dd>{finding.ruleId ?? finding.type} · version {finding.ruleVersion ?? 1}</dd></div>
          <div><dt>Engine state</dt><dd>{finding.classification ?? 'review_needed'} · {gate.evidenceState.replaceAll('_',' ')}</dd></div>
          {evidence.payments.map(payment=><div key={payment.recordId}><dt>Ledger record {payment.recordId}</dt><dd>{payment.amountMinor} cents</dd></div>)}
        </dl>
        {gate.contradictoryEvidence.length > 0 && <><h3 className="wk-subhead">What doesn’t line up</h3><ul>{gate.contradictoryEvidence.map((text,i)=><li key={i}>{text}</li>)}</ul></>}
        {gate.missingEvidence.length > 0 && <><h3 className="wk-subhead">Still missing</h3><ul>{gate.missingEvidence.map((text,i)=><li key={i}>{text}</li>)}</ul></>}
        <p className="wk-field-hint">A repeated import, void, reversal, refund, credit, installment, split or recurring bill can explain records like these.</p>
        {finding.evidence && <><h3 className="wk-subhead">Who confirmed what</h3><ul>{[...finding.evidence.payments,finding.evidence.obligation,...Object.values(finding.evidence.checks)].map((item,index)=>item && <li key={index}>{item.reference || 'No reference'} · {item.confirmedBy || 'Not confirmed'} · {item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : 'No confirmation time'}</li>)}</ul></>}
      </details>
    </div>
  </section>
}
