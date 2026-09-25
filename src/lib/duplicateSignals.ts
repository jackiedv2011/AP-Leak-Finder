import type { APRecord, Finding } from '@/types'
import { normalizeVendor, daysBetween, toCents } from './format'
import { checksum, normalizeReference } from './sourceIdentity'
import { reviewMetadata } from './findingMetadata'

export const DEFAULT_REVIEW_WINDOW_DAYS = 45
const vendorKey = (r:APRecord) => JSON.stringify([r.company ?? null,r.canonicalVendorId ?? normalizeVendor(r.vendor)])
const rawReference = (r:APRecord) => { const raw=r.source?.rawAvailable ? r.source.raw?.invoice_number ?? null : r.invoiceNumber; return raw?.trim() ? raw : null }
const ref = (r:APRecord) => normalizeReference(rawReference(r)).value
function groups(records:APRecord[], key:(r:APRecord)=>string) {
  const map=new Map<string,APRecord[]>()
  for(const record of records) {const k=key(record);map.set(k,[...(map.get(k)??[]),record])}
  return map
}
function signal(ruleId:string, rows:APRecord[], title:string, explanation:string, suppressionReason:string|null=null):Finding {
  const ids=rows.map(r=>r.id).sort()
  const key=JSON.stringify([vendorKey(rows[0]),rows[0].currency??null,ruleId,ruleId==='exact_repeated_payment_v1' ? [rawReference(rows[0]),toCents(rows[0].amountPaid)] : ids])
  return reviewMetadata({id:`${ruleId}-${checksum(key)}`,type:['exact_repeated_payment_v1','repeated_invoice_review_v1'].includes(ruleId)?'exact_duplicate':'near_duplicate',class:'review',severity:ruleId==='exact_repeated_payment_v1'?'high':'medium',vendor:rows[0].vendor,dollarImpact:rows[0].amountPaid*(rows.length-1),title,explanation,relatedRecords:rows,ruleId,suppressionReason,deduplicationGroup:`payments:${ids.join('|')}`})
}
/** Matching rows are review signals. Payment identity and settlement are never inferred here. */
export function duplicateSignals(records:APRecord[],windowDays=DEFAULT_REVIEW_WINDOW_DAYS):Finding[] {
  const findings:Finding[]=[]
  const positive=records.filter(r=>r.amountPaid>0)
  for(const rows of groups(positive.filter(r=>rawReference(r)!==null),r=>JSON.stringify([vendorKey(r),rawReference(r),r.currency??null])).values()) {
    const amounts=groups(rows,r=>String(toCents(r.amountPaid)))
    if(amounts.size<2) continue
    const sorted=[...rows].sort((a,b)=>a.paymentDate.getTime()-b.paymentDate.getTime())
    const total=sorted.reduce((s,r)=>s+toCents(r.amountPaid),0)
    const invoiceAmounts=new Set(sorted.map(r=>r.invoiceAmount===null?null:toCents(r.invoiceAmount)))
    const invoice=invoiceAmounts.size===1?[...invoiceAmounts][0]:null
    const singles=[...amounts.values()].filter(group=>group.length===1).flat()
    const amount=(singles.length===rows.length?sorted.slice(1):singles).reduce((s,r)=>s+r.amountPaid,0)
    const finding=signal('repeated_invoice_review_v1',sorted,'Repeated invoice: different payment amounts','These rows repeat an invoice reference with different payment amounts. Installments, allocations and corrections may explain the activity. Confirm each obligation and payment before recovery.',invoice!==null&&total<=invoice?'Payments may be installments within the invoice amount. Confirm their purpose.':null)
    findings.push({...finding,dollarImpact:amount,flaggedAmount:amount})
  }
  const grouped=groups(positive,r=>JSON.stringify([vendorKey(r),toCents(r.amountPaid),r.currency??null]))
  for(const sameAmount of grouped.values()) {
    const exact=groups(sameAmount.filter(r=>rawReference(r)!==null),r=>rawReference(r)!)
    for(const rows of exact.values()) if(rows.length>1) {
      const total=rows.reduce((s,r)=>s+toCents(r.amountPaid),0)
      const amounts=new Set(rows.map(r=>r.invoiceAmount===null?null:toCents(r.invoiceAmount)))
      const invoice=amounts.size===1?[...amounts][0]:null
      const resolved=records.some(r=>vendorKey(r)===vendorKey(rows[0]) && ref(r)===ref(rows[0]) && r.amountPaid<0)
      const reason=resolved?'A negative ledger row may be a refund or credit. Resolve its meaning before recovery.':invoice!==null&&total<=invoice?'Payments may be installments within the invoice amount. Confirm their purpose.':null
      findings.push(signal('exact_repeated_payment_v1',rows,'Repeated payment records',`Separate imported rows have the same vendor grouping, exact invoice reference and amount. Dates may differ. These rows do not prove distinct settled payments or money owed.${rows.some(r=>!r.source?.rawAvailable)?' Original raw references are unavailable for some rows.':''}`,reason))
    }
    const sorted=[...sameAmount].sort((a,b)=>a.paymentDate.getTime()-b.paymentDate.getTime()||a.id.localeCompare(b.id))
    const gaps=sorted.slice(1).map((r,i)=>daysBetween(sorted[i].paymentDate,r.paymentDate))
    const recurring=sorted.length>=3 && new Set(sorted.map(ref)).size===sorted.length && gaps.every(g=>g>=20) && Math.max(...gaps)-Math.min(...gaps)<=10
    for(let i=1;i<sorted.length;i++) {
      const later=sorted[i]
      for(let j=i-1;j>=0;j--) {
        const earlier=sorted[j]
        const gap=daysBetween(earlier.paymentDate,later.paymentDate)
        if(gap>windowDays) break
        if(rawReference(earlier)!==null && rawReference(earlier)===rawReference(later)) continue
        const variant=ref(earlier)!==null && ref(earlier)===ref(later)
        findings.push(signal(variant?'invoice_reference_variant_v1':'same_vendor_amount_near_duplicate_v1',[earlier,later],variant?'Invoice reference variant':'Same vendor and amount: review payments',variant?'The original invoice references differ but match after the recorded prefix, case, spacing and punctuation transformations. A normalized match is not proof of a duplicate payment.':`The vendor grouping and amounts match within ${windowDays} days, with different or missing invoice references. The date window selects records for review; it does not establish recovery eligibility.`,recurring?'Recurring payment cadence: confirm these are not separate recurring obligations.':null))
        break
      }
    }
  }
  return findings
}
