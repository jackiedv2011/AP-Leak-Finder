import type { Finding } from '@/types'
import type { ImportBatch } from '@/ledger/store'
import type { QuickBooksTxnRef, QuickBooksVendorActivity } from '../../server/quickbooksFacts.ts'
import type { EvidenceAutofill, RecoveryEvidence } from './eligibility'

/**
 * Evidence keys for fields filled from a source system. A person editing a
 * field removes its key, so what stays marked is exactly what came from QuickBooks.
 */
export const autofillKey = {
  paymentId: (recordId: string) => `payment:${recordId}:paymentId`,
  paymentReference: (recordId: string) => `payment:${recordId}:reference`,
  paymentCurrency: (recordId: string) => `payment:${recordId}:currency`,
  obligationId: 'obligation:obligationId',
  obligationReference: 'obligation:reference',
  obligationAmount: 'obligation:amountMinor',
  obligationCurrency: 'obligation:currency',
  check: (check: string) => `check:${check}`,
}

const label = (t: QuickBooksTxnRef) => `${t.txnType} ${t.id}`
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`
  }
}
const listed = (items: string[]) => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)
const uniqueRefs = (refs: QuickBooksTxnRef[]) => [...new Map(refs.map((r) => [`${r.txnType}:${r.id}`, r])).values()]

/**
 * The evidence QuickBooks can supply for a duplicate-payment finding whose
 * records came from a QuickBooks import: each payment's QuickBooks ID, the
 * bill they both paid (when it is one bill), and the refund and credit
 * searches, with QuickBooks transaction IDs as references.
 *
 * Nothing here is attested: confirmedBy stays empty and confirmedAt 0, so the
 * gate still needs a person to review and save it. Settlement is never set —
 * QuickBooks' API has no cleared or reconciled status. Duplicate import,
 * installments, recurring bills, reversal and the customer's confirmation are
 * left to the person. Returns null when no record came from QuickBooks.
 */
export function quickBooksEvidence(finding: Finding, imports: ImportBatch[] = []): RecoveryEvidence | null {
  const records = finding.relatedRecords
  if (!records.some((r) => r.quickbooks)) return null
  const empty = { reference: '', confirmedBy: '', confirmedAt: 0 }
  const autofilled: Record<string, EvidenceAutofill> = {}

  // The freshest QuickBooks searches of this company: a later import re-ran them.
  const companies = new Set(records.map((r) => r.company ?? ''))
  const ownBatches = new Set(records.map((r) => r.importBatchId))
  const snapshot = imports
    .filter((b) => b.quickbooks && (companies.has(b.quickbooks.companyName) || ownBatches.has(b.id)))
    .sort((a, b) => b.quickbooks!.pulledAt - a.quickbooks!.pulledAt)[0]?.quickbooks
  const pulledAt = snapshot?.pulledAt ?? 0
  const mark = (key: string, txnIds: string[]) => (autofilled[key] = { source: 'quickbooks', pulledAt, txnIds })

  const facts = records.flatMap((r) => (r.quickbooks ? [r.quickbooks] : []))
  const bills = new Map(facts.flatMap((f) => (f.bill ? [[f.bill.id, f.bill] as const] : [])))
  const allFromQuickBooks = facts.length === records.length
  const sharedBill = allFromQuickBooks && facts.every((f) => f.bill) && bills.size === 1 ? [...bills.values()][0] : null
  const currencies = new Set(facts.map((f) => f.currency))
  const currency = currencies.size === 1 ? [...currencies][0] : ''
  const obligationId = sharedBill ? `qbo:Bill:${sharedBill.id}` : ''

  const payments: RecoveryEvidence['payments'] = records.map((r) => {
    const fact = r.quickbooks
    const base = { ...empty, recordId: r.id, paymentId: '', amountMinor: Math.round(r.amountPaid * 100), currency: r.currency ?? '', settled: false, obligationId }
    if (!fact || !r.externalTransactionId) return base
    const p = fact.payment
    const paid = fact.bill ? ` paid to Bill ${fact.bill.id}${fact.bill.docNumber ? ` (${fact.bill.docNumber})` : ''}` : ''
    mark(autofillKey.paymentId(r.id), [label(p)])
    mark(autofillKey.paymentReference(r.id), [label(p)])
    mark(autofillKey.paymentCurrency(r.id), [label(p)])
    return {
      ...base,
      // The row's QuickBooks transaction id: unique per payment line, and the key the import used.
      paymentId: r.externalTransactionId,
      reference: `QuickBooks ${label(p)}${p.payType ? ` · ${p.payType}` : ''}${p.txnDate ? ` · ${p.txnDate}` : ''} · ${money(p.amountMinor, fact.currency)}${paid}`,
      currency: fact.currency,
    }
  })

  const obligation: RecoveryEvidence['obligation'] = { ...empty, obligationId, amountMinor: 0, currency: '' }
  if (sharedBill) {
    const paidBy = listed(facts.map((f) => label(f.payment)))
    Object.assign(obligation, {
      amountMinor: sharedBill.amountMinor,
      currency,
      reference: `QuickBooks Bill ${sharedBill.id}${sharedBill.docNumber ? ` · ${sharedBill.docNumber}` : ''}${sharedBill.txnDate ? ` · dated ${sharedBill.txnDate}` : ''} · ${money(sharedBill.amountMinor, currency)}. QuickBooks links ${paidBy} to this bill.`,
    })
    const ids = [label(sharedBill), ...facts.map((f) => label(f.payment))]
    for (const key of [autofillKey.obligationId, autofillKey.obligationReference, autofillKey.obligationAmount, autofillKey.obligationCurrency]) mark(key, ids)
  }

  const checks: RecoveryEvidence['checks'] = {}
  const contradictions: string[] = []
  const vendorIds = [...new Set(facts.map((f) => f.vendorId).filter((id): id is string => Boolean(id)))]
  if (snapshot && allFromQuickBooks && vendorIds.length > 0) {
    const activity: QuickBooksVendorActivity = { credits: [], refunds: [], voided: [] }
    for (const id of vendorIds) {
      const v = snapshot.vendors[id]
      if (v) for (const kind of ['credits', 'refunds', 'voided'] as const) activity[kind].push(...v[kind])
    }
    // A refund or credit that resolves a duplicate can't predate the first payment.
    const since = facts.map((f) => f.payment.txnDate).filter((d): d is string => Boolean(d)).sort()[0] ?? null
    const after = (t: QuickBooksTxnRef) => !since || !t.txnDate || t.txnDate >= since
    const searched = `QuickBooks search, ${day(pulledAt)}`
    const paymentList = listed(facts.map((f) => label(f.payment)))
    const describe = (t: QuickBooksTxnRef) => `${label(t)} (${money(t.amountMinor, currency || 'USD')}${t.txnDate ? `, ${t.txnDate}` : ''})`
    const search = (key: 'refund' | 'credit', found: QuickBooksTxnRef[], noun: string, scope: string) => {
      checks[key] = found.length
        ? { ...empty, confirmed: false, reference: `${searched}: found ${listed(found.map(describe))}. Check whether ${found.length === 1 ? 'it resolves' : 'they resolve'} this duplicate before confirming.` }
        : { ...empty, confirmed: true, reference: `${searched}: no ${noun} from ${finding.vendor} on or after ${since ?? 'the first payment'}, and none applied in ${paymentList}. Searched ${scope}.` }
      mark(autofillKey.check(key), found.length ? found.map(label) : facts.map((f) => label(f.payment)))
    }
    search('refund', uniqueRefs([...activity.refunds.filter(after), ...facts.flatMap((f) => f.refundsApplied)]), 'vendor refunds', `${snapshot.searched.deposits} deposits and ${snapshot.searched.purchases} purchases`)
    search('credit', uniqueRefs([...activity.credits.filter(after), ...facts.flatMap((f) => f.creditsApplied)]), 'vendor credits', `${snapshot.searched.vendorCredits} vendor credits`)

    // A payment voided after it was imported is a source-backed contradiction, not a judgement call.
    const own = new Set(facts.map((f) => label(f.payment)))
    for (const v of activity.voided) if (own.has(label(v))) contradictions.push(`QuickBooks shows ${label(v)} as voided (${searched}).`)
    // Other voided payments to this vendor are worth a look; whether they bear on this finding is the reviewer's call.
    const otherVoids = activity.voided.filter((v) => !own.has(label(v)) && after(v))
    if (otherVoids.length) {
      checks.void = { ...empty, confirmed: false, reference: `${searched}: ${listed(otherVoids.map(describe))} ${otherVoids.length === 1 ? 'is' : 'are'} voided for this vendor. ${paymentList} ${facts.length === 1 ? 'is' : 'are'} not. Confirm the voided one isn't a copy of these payments.` }
      mark(autofillKey.check('void'), otherVoids.map(label))
    }
  }

  return { payments, obligation, checks, contradictions, notes: '', autofilled }
}
