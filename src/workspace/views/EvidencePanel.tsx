import { useState, type ReactNode } from 'react'
import type { Finding } from '@/types'
import type { ImportBatch } from '@/ledger/store'
import { formatCurrency, formatDate } from '@/lib/format'
import { evaluateEligibility, type EvidenceCheck, type PriorReturn, type RecoveryEvidence } from '@/recovery/eligibility'
import { autofillKey, quickBooksEvidence } from '@/recovery/quickbooksEvidence'
import { dollarsToCents } from './amounts'
import { useOptionalAuth } from '@/lib/auth/AuthContext'

const pulledDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** The gate's checks, asked the way an owner would answer them. The gate itself is unchanged. */
const CHECK_QUESTION: Record<EvidenceCheck, string> = {
  duplicateImport: 'This isn’t the same payment imported twice',
  refund: 'I checked for refunds',
  credit: 'I checked for applied credits',
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

/**
 * A CSV finding starts from what the ledger already says: the bill number and amount the rows share, and the
 * currency when present. The reviewer checks these against the bill; unknown
 * currency stays blank. Bank references and the checks stay blank:
 * the ledger can't vouch for those.
 */
function fromLedger(finding: Finding): RecoveryEvidence {
  const emptyStamp = { reference: '', confirmedBy: '', confirmedAt: 0 }
  const first = finding.relatedRecords[0]
  const sameBill = first?.invoiceNumber && finding.relatedRecords.every((r) => r.invoiceNumber === first.invoiceNumber) ? first.invoiceNumber : ''
  const billAmount = first?.invoiceAmount ?? null
  const currency = (r?: Finding['relatedRecords'][number]) => (r?.currency ?? '').toUpperCase()
  const companies = new Set(finding.relatedRecords.map((r) => r.company?.trim()).filter(Boolean))
  return {
    entity: { ...emptyStamp, entityId: companies.size === 1 ? [...companies][0]! : '' },
    supplier: { ...emptyStamp, supplierId: '' },
    payments: finding.relatedRecords.map((r) => ({ ...emptyStamp, recordId: r.id, paymentId: '', amountMinor: Math.round(r.amountPaid * 100), currency: currency(r), settled: false, obligationId: sameBill })),
    obligation: { ...emptyStamp, obligationId: sameBill, amountMinor: billAmount ? Math.round(billAmount * 100) : 0, currency: currency(first) },
    checks: {},
    contradictions: [],
    notes: '',
  }
}

export function EvidencePanel({ finding, findings, imports = [], initialEvidence, onSave }: { finding: Finding; findings: Finding[]; imports?: ImportBatch[]; initialEvidence?: RecoveryEvidence; onSave: (evidence: RecoveryEvidence) => void }) {
  const emptyStamp = { reference: '', confirmedBy: '', confirmedAt: 0 }
  const auth = useOptionalAuth()
  // Saved evidence wins; otherwise start from what QuickBooks already knows, then from what the ledger says.
  const [evidence, setEvidence] = useState<RecoveryEvidence>(() => finding.evidence ?? initialEvidence ?? quickBooksEvidence(finding, imports) ?? fromLedger(finding))
  const [billAmount, setBillAmount] = useState(() => centsToDollars(evidence.obligation.amountMinor))
  const [actor,setActor] = useState(() => (auth?.user && !auth.user.isGuest ? auth.user.name : ''))
  const [saved,setSaved] = useState(false)
  const [returnAmount, setReturnAmount] = useState('')
  const [returnMethod, setReturnMethod] = useState<PriorReturn['method']>('refund')
  const [returnReference, setReturnReference] = useState('')
  const [appliedBill, setAppliedBill] = useState('')
  const priorReturns = evidence.priorReturns ?? []
  const contact = evidence.supplier?.contact
  const contactInvalid = contact && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) || !contact.reference.trim())
  function editContact(patch: Partial<NonNullable<typeof contact>>) {
    setEvidence((prev) => ({
      ...prev,
      supplier: {
        ...emptyStamp,
        supplierId: '',
        ...prev.supplier,
        contact: { email: '', source: 'supplier_record', reference: '', ...prev.supplier?.contact, ...patch },
      },
    }))
  }
  const returnMinor = dollarsToCents(returnAmount)
  function addPriorReturn() {
    setEvidence((prev) => ({
      ...prev,
      priorReturns: [...(prev.priorReturns ?? []), { ...emptyStamp, amountMinor: returnMinor, method: returnMethod, reference: returnReference.trim(), appliedToBill: returnMethod === 'credit' ? appliedBill.trim() : undefined }],
    }))
    setReturnAmount('')
    setReturnReference('')
    setAppliedBill('')
  }
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
  const answered = Boolean(evidence.entity?.entityId || evidence.supplier?.supplierId || evidence.obligation.obligationId.trim() || evidence.payments.some(p=>p.paymentId.trim() || p.settled) || Object.values(evidence.checks).some(c=>c?.confirmed))

  const check = (key:EvidenceCheck) => <div className="wk-evq-check" key={key}>
    <label className="wk-evq-tick"><input type="checkbox" checked={evidence.checks[key]?.confirmed ?? false} onChange={event=>edit([autofillKey.check(key)],prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,...prev.checks[key],confirmed:event.target.checked}}}))}/> <span>{CHECK_QUESTION[key]}</span> {fromQuickBooks(autofillKey.check(key))}</label>
    {field(key === 'customerConfirmation' ? 'How you know' : 'Where you checked',evidence.checks[key]?.reference ?? '',value=>edit([autofillKey.check(key)],prev=>({...prev,checks:{...prev.checks,[key]:{...emptyStamp,confirmed:false,...prev.checks[key],reference:value}}})),undefined,{placeholder:CHECK_HINT[key]})}
  </div>

  const status = gate.eligible
    ? <p className="wk-evq-status" data-tone="ready"><strong>Possible request supported up to {formatCurrency(gate.potentialAmountMinor! / 100)}.</strong> This is a reviewer assertion until the cited records are independently checked. Approve the recipient, amount and resolution before outreach.</p>
    : answered && gate.contradictoryEvidence.length > 0
      ? <p className="wk-evq-status" data-tone="conflict"><strong>Some answers don’t line up yet.</strong> Open Details to see which.</p>
      : <p className="wk-evq-status"><strong>Not ready to claim yet.</strong> Answer the questions below, then save. Confirming the evidence doesn’t contact the vendor.</p>

  return <section className="wk-panelcard" id="evidence-review" aria-labelledby="evidence-review-title">
    <div className="wk-panelcard-head"><div><h2 id="evidence-review-title">Review the evidence</h2><p>Your answers are assertions based on the cited records, not independent bank verification.</p></div></div>
    <div className="wk-panelcard-body wk-stack">
      {status}
      <form className="wk-evq" onSubmit={event=>{event.preventDefault();const stamp={confirmedBy:actor.trim(),confirmedAt:Date.now()};const next={...evidence,entity:{...(evidence.entity ?? {entityId:'',reference:''}),...stamp},supplier:{...(evidence.supplier ?? {supplierId:'',reference:''}),...stamp,contact:contact ? {...contact,email:contact.email.trim(),reference:contact.reference.trim()} : undefined},payments:evidence.payments.map(p=>({...p,...stamp})),obligation:{...evidence.obligation,...stamp},checks:Object.fromEntries(Object.entries(evidence.checks).map(([key,value])=>[key,{...value,...stamp}])),priorReturns:priorReturns.map(entry=>({...entry,...stamp}))};setEvidence(next);onSave(next);setSaved(true)}}>
        {autofillDates.length > 0 && <div className="wk-callout" role="note" data-testid="quickbooks-autofill-note"><div className="wk-callout-body"><p>Answers marked <strong>From QuickBooks</strong> were filled from the QuickBooks import{Math.max(...autofillDates) > 0 ? ` of ${pulledDate.format(Math.max(...autofillDates))}` : ''}: the payment IDs, the bill they paid, and the refund and credit searches. Check each one before saving. QuickBooks doesn’t report whether a payment cleared the bank, so settlement still needs your confirmation.</p></div></div>}

        <fieldset className="wk-evq-group"><legend>1. Which company and supplier?</legend>
          <p className="wk-field-hint">Confirm the legal entity and a stable supplier account or vendor ID. Similar names are only alias suggestions.</p>
          <div className="wk-evq-grid">
            {field('Company or legal entity',evidence.entity?.entityId ?? '',value=>edit([autofillKey.entityId],prev=>({...prev,entity:{...emptyStamp,...prev.entity,entityId:value}})),autofillKey.entityId,{placeholder:'Company name or entity ID'})}
            {field('Where the company is identified',evidence.entity?.reference ?? '',value=>edit([autofillKey.entityReference],prev=>({...prev,entity:{...emptyStamp,entityId:'',...prev.entity,reference:value}})),autofillKey.entityReference,{placeholder:'Source file, bill, or accounting company'})}
            {field('Supplier account or vendor ID',evidence.supplier?.supplierId ?? '',value=>edit([autofillKey.supplierId],prev=>({...prev,supplier:{...emptyStamp,...prev.supplier,supplierId:value,contact:undefined}})),autofillKey.supplierId,{placeholder:'Vendor number from your accounting records'})}
            {field('Where the supplier ID is shown',evidence.supplier?.reference ?? '',value=>edit([autofillKey.supplierReference],prev=>({...prev,supplier:{...emptyStamp,supplierId:'',...prev.supplier,reference:value}})),autofillKey.supplierReference,{placeholder:'Supplier master record or bill'})}
          </div>
          <details className="wk-evq-details">
            <summary>Supplier billing contact (optional)</summary>
            <p className="wk-field-hint">Save a suggestion for this supplier ID in this case. The sender confirms the address at approval.</p>
            {contact ? <>
              <div className="wk-evq-grid">
                {field('Billing email from source', contact.email, (email) => editContact({ email }))}
                <label className="wk-field">Contact source
                  <select className="wk-input" value={contact.source} onChange={(event) => editContact({ source: event.target.value as typeof contact.source })}>
                    <option value="supplier_record">Workspace supplier record</option>
                    <option value="document">Address found in document</option>
                  </select>
                </label>
                {field('Contact source reference', contact.reference, (reference) => editContact({ reference }))}
              </div>
              {contactInvalid ? <p className="wk-field-hint">Enter a valid email and cite where you found it.</p> : null}
              <button type="button" className="wk-linklike" onClick={() => setEvidence((prev) => ({ ...prev, supplier: prev.supplier && { ...prev.supplier, contact: undefined } }))}>Remove contact suggestion</button>
            </> : <button type="button" className="wk-btn" data-variant="outline" onClick={() => editContact({})}>Add contact suggestion</button>}
          </details>
        </fieldset>

        <fieldset className="wk-evq-group"><legend>2. Is this one bill?</legend>
          <p className="wk-field-hint">The bill or invoice both payments were for. {!finding.evidence && !autofillDates.length ? 'Filled in from your ledger — check it against the bill.' : null}</p>
          <div className="wk-evq-grid">
            {field('Bill or invoice number',evidence.obligation.obligationId,value=>edit([autofillKey.obligationId],prev=>({...prev,obligation:{...prev.obligation,obligationId:value},payments:prev.payments.map(p=>({...p,obligationId:value}))})),autofillKey.obligationId,{placeholder:finding.relatedRecords[0]?.invoiceNumber ?? 'INV-1001'})}
            {field('Bill amount, in dollars',billAmount,value=>{setBillAmount(value);edit([autofillKey.obligationAmount],prev=>({...prev,obligation:{...prev.obligation,amountMinor:dollarsToCents(value)}}))},autofillKey.obligationAmount,{placeholder:'0.00',inputMode:'decimal',hint:billAmountInvalid ? 'Enter an amount like 1250.00' : undefined,invalid:billAmountInvalid})}
            {field('Link to the bill, or where it’s filed',evidence.obligation.reference,value=>edit([autofillKey.obligationReference],prev=>({...prev,obligation:{...prev.obligation,reference:value}})),autofillKey.obligationReference,{placeholder:'A link, or “Bills folder, Feb 2025”'})}
            {field('Currency',evidence.obligation.currency,value=>edit([autofillKey.obligationCurrency],prev=>({...prev,obligation:{...prev.obligation,currency:value.toUpperCase()}})),autofillKey.obligationCurrency,{placeholder:'USD',hint:'Recovery works in US dollars for now.'})}
          </div>
        </fieldset>

        <fieldset className="wk-evq-group"><legend>3. Did {evidence.payments.length === 2 ? 'both' : 'all the'} payments clear?</legend>
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

        <fieldset className="wk-evq-group"><legend>4. Any refund, credit or void?</legend>
          <p className="wk-field-hint">Make sure the extra payment hasn’t already come back some other way.</p>
          {MONEY_BACK_CHECKS.map(check)}
          <details className="wk-evq-details">
            <summary>Refunds and applied credits already confirmed</summary>
            <p className="wk-field-hint">Use the bank deposit or accounting entry for money already returned against this duplicate.</p>
            {priorReturns.map((entry, index) => (
              <div className="wk-inline-form" key={index}>
                <span>{formatCurrency(entry.amountMinor / 100)} · {entry.method === 'refund' ? 'Refund' : 'Applied credit'} · {entry.reference}</span>
                <button type="button" className="wk-linklike" onClick={() => setEvidence((prev) => ({ ...prev, priorReturns: priorReturns.filter((_, i) => i !== index) }))}>Remove return {index + 1}</button>
              </div>
            ))}
            <div className="wk-evq-grid">
              <label className="wk-field">Return type
                <select className="wk-input" value={returnMethod} onChange={(event) => setReturnMethod(event.target.value as PriorReturn['method'])}>
                  <option value="refund">Refund received</option>
                  <option value="credit">Credit applied</option>
                </select>
              </label>
              {field('Prior return amount', returnAmount, setReturnAmount, undefined, { inputMode: 'decimal' })}
              {field('Confirmation reference', returnReference, setReturnReference)}
              {returnMethod === 'credit' ? field('Bill the credit was applied to', appliedBill, setAppliedBill) : null}
            </div>
            <button type="button" className="wk-btn" data-variant="outline" disabled={!returnMinor || !returnReference.trim() || (returnMethod === 'credit' && !appliedBill.trim()) || priorReturns.length >= 30} onClick={addPriorReturn}>Add confirmed prior return</button>
          </details>
        </fieldset>

        <fieldset className="wk-evq-group"><legend>5. Is it really a duplicate?</legend>
          {REALLY_DUPLICATE_CHECKS.map(check)}
        </fieldset>

        <div className="wk-evq-grid" data-columns="1">
          <label className="wk-field">Anything else worth noting<textarea className="wk-input" value={evidence.notes} onChange={e=>setEvidence(prev=>({...prev,notes:e.target.value}))}/></label>
          <label className="wk-field">Anything that says it isn’t a duplicate? One reason per line.<textarea className="wk-input" value={evidence.contradictions.join('\n')} onChange={e=>setEvidence(prev=>({...prev,contradictions:e.target.value.split('\n')}))}/></label>
        </div>

        <div className="wk-evq-save">
          {field('Person confirming these facts',actor,setActor,undefined,{placeholder:'Your name'})}
          <button className="wk-btn" data-variant="primary" disabled={!actor.trim() || billAmountInvalid || contactInvalid || Boolean(returnAmount.trim() || returnReference.trim() || appliedBill.trim())}>Save evidence</button>
          {saved && <p role="status" className="wk-field-hint">Saved. {gate.eligible ? 'Review the possible request and get customer approval before outreach.' : 'Answer the rest when you have it.'}</p>}
        </div>
      </form>

      <details className="wk-evq-details">
        <summary>Details</summary>
        <dl className="wk-kv">
          <div><dt>Rule</dt><dd>{finding.ruleId ?? finding.type} · version {finding.ruleVersion ?? 1}</dd></div>
          <div><dt>Engine state</dt><dd>{finding.classification ?? 'review_needed'} · {gate.evidenceState.replaceAll('_',' ')}</dd></div>
          {finding.relatedRecords.some((record) => record.suggestedVendorAlias) ? <div><dt>Alias suggestions</dt><dd>{[...new Set(finding.relatedRecords.map((record) => record.suggestedVendorAlias).filter(Boolean))].join(', ')} · requires human review</dd></div> : null}
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
