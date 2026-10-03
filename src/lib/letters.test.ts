import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCsv } from '@/lib/csv'
import { detectFindings } from '@/lib/detection'
import { generateLetter } from '@/lib/letters'
import { formatCurrency } from '@/lib/format'
import type { Finding } from '@/types'
import { EVIDENCE_CHECKS, evaluateEligibility } from '@/recovery/eligibility'

const csv = readFileSync(resolve(process.cwd(), 'src/test/fixtures/messy-ap-ledger.csv'), 'utf8')
const findings = detectFindings(parseCsv(csv).records.map((r, i) => ({ ...r, id: `rec_${i}`, importBatchId: 'x' }))).findings

function eligibleDuplicate(): Finding {
  const finding=findings.find(f=>f.type==='exact_duplicate' && f.vendor==='Sierra Coffee Supply')!
  const stamp={reference:'Accounting payment and obligation records',confirmedBy:'Dana',confirmedAt:100}
  const evidence={payments:finding.relatedRecords.map(r=>({...stamp,recordId:r.id,paymentId:`trace-${r.id}`,amountMinor:Math.round(r.amountPaid*100),currency:'USD',settled:true,obligationId:'INV-1001'})),obligation:{...stamp,obligationId:'INV-1001',amountMinor:Math.round(finding.relatedRecords[0].amountPaid*100),currency:'USD'},checks:Object.fromEntries(EVIDENCE_CHECKS.map(([key])=>[key,{...stamp,confirmed:true}])),notes:'',contradictions:[]}
  const candidate={...finding,evidence,classification:'recovery_candidate' as const,class:'recoverable' as const,currency:'USD'}
  expect(evaluateEligibility(candidate).eligible).toBe(true)
  return candidate
}

describe('letter generator', () => {
  it('drafts a vendor request for an evidenced candidate with exactly its supported amount', () => {
    for (const f of [eligibleDuplicate()]) {
      const { subject, body } = generateLetter(f, { businessName: 'Bean Co', senderName: 'Dana', senderEmail: 'ap@bean.co' })
      expect(subject).toMatch(/Request for/)
      expect(body).toContain(formatCurrency(f.dollarImpact))
      expect(body).not.toContain('INTERNAL')
      expect(body).toContain('Dana')
      expect(body).toContain('Bean Co')
    }
  })

  it('never drafts a vendor-facing letter for review or opportunity findings — those become internal notes', () => {
    for (const f of findings.filter((f) => f.class !== 'recoverable')) {
      const { body } = generateLetter(f)
      expect(body).toContain('INTERNAL REVIEW NOTE')
      expect(body).toContain('do not send to the vendor')
    }
  })

  it('the requested resolution actually changes the ask', () => {
    const dup = eligibleDuplicate()
    expect(generateLetter(dup, undefined, 'refund').body).toMatch(/a refund of/)
    expect(generateLetter(dup, undefined, 'credit').body).toMatch(/an account credit of/)
    expect(generateLetter(dup, undefined, 'offset').body).toMatch(/applied against our next payment/)
    const discount = findings.find((f) => f.type === 'unclaimed_discount')!
    expect(generateLetter(discount, undefined, 'refund').body).toContain('INTERNAL REVIEW NOTE')
    expect(generateLetter(discount, undefined, 'credit').body).toContain('INTERNAL REVIEW NOTE')
  })

  it('names every invoice the duplicate covers, once', () => {
    const dup = eligibleDuplicate()
    const { subject } = generateLetter(dup)
    expect(subject).toContain('invoice INV-1001')
    expect(subject).not.toContain('INV-1001 and INV-1001')
  })

  it('falls back to a generic sign-off when no sender profile exists', () => {
    const dup = eligibleDuplicate()
    expect(generateLetter(dup).body).toContain('Accounts Payable Team')
  })
})

describe('letter generator — adversarial', () => {
  it('a partial request lowers the ask but never rewrites what the records show', () => {
    const dup = eligibleDuplicate()
    const { subject, body } = generateLetter(dup, undefined, 'refund', 2500)
    expect(body).toContain(`supported excess is ${formatCurrency(6800)}`)
    expect(body).toContain(`a refund of ${formatCurrency(2500)}`)
    expect(body).not.toContain(`a refund of ${formatCurrency(6800)}`)
    expect(subject).toContain('INV-1001')
  })

  it('never asks for more than the finding supports, even if called with a larger amount', () => {
    const dup = eligibleDuplicate()
    const { body } = generateLetter(dup, undefined, 'credit', dup.dollarImpact * 10)
    expect(body).toContain(`an account credit of ${formatCurrency(dup.dollarImpact)}`)
    expect(body).not.toContain(formatCurrency(dup.dollarImpact * 10))
    // An overpayment is a review signal only; it never becomes a vendor request.
    const over = findings.find((f) => f.type === 'overpayment')!
    expect(generateLetter(over, undefined, 'credit', over.dollarImpact * 10).body).toContain('INTERNAL REVIEW NOTE')
  })

  it("no letter mentions another finding's vendor or invoice", () => {
    for (const f of findings) {
      const { subject, body } = generateLetter(f, { businessName: 'Test Cafe', senderName: 'Pat Doe', senderEmail: 'pat@example.com' })
      const text = `${subject}\n${body}`
      const ownInvoices = new Set(f.relatedRecords.map((r) => r.invoiceNumber))
      const ownVendors = f.vendor.toLowerCase()
      for (const other of findings) {
        if (other.id === f.id) continue
        for (const r of other.relatedRecords) {
          if (r.invoiceNumber && !ownInvoices.has(r.invoiceNumber) && !f.relatedRecords.some((o) => o.invoiceNumber?.includes(r.invoiceNumber!))) {
            expect(text, `${f.id} leaks ${r.invoiceNumber}`).not.toContain(r.invoiceNumber)
          }
        }
        if (!ownVendors.includes(other.vendor.toLowerCase()) && !other.vendor.toLowerCase().includes(ownVendors)) {
          expect(text, `${f.id} leaks ${other.vendor}`).not.toContain(other.vendor)
        }
      }
    }
  })

  it('special characters and very long vendor names come through verbatim, with no template holes', () => {
    const base = eligibleDuplicate()
    const vendor = `Smith & O'Neil "Bros" <Café> ${'Ltd '.repeat(60)}`.trim()
    const f = { ...base, vendor, explanation: base.explanation.replaceAll(base.vendor, vendor) }
    const { subject, body } = generateLetter(f, { businessName: '', senderName: '', senderEmail: '' })
    expect(body).toContain(vendor)
    for (const text of [subject, body]) {
      expect(text).not.toMatch(/undefined|null|NaN|\[object|\$\{/)
    }
    expect(body).toContain('Accounts Payable Team')
  })
})
