import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCsv } from '@/lib/csv'
import { detectFindings } from '@/lib/detection'
import { generateLetter } from '@/lib/letters'
import { formatCurrency } from '@/lib/format'

const csv = readFileSync(resolve(process.cwd(), 'src/test/fixtures/messy-ap-ledger.csv'), 'utf8')
const findings = detectFindings(parseCsv(csv).records.map((r, i) => ({ ...r, id: `rec_${i}`, importBatchId: 'x' }))).findings

describe('letter generator', () => {
  it('drafts a vendor request for every recoverable finding, asking for exactly the flagged amount', () => {
    for (const f of findings.filter((f) => f.class === 'recoverable')) {
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
    const dup = findings.find((f) => f.type === 'exact_duplicate')!
    expect(generateLetter(dup, undefined, 'refund').body).toMatch(/a refund of/)
    expect(generateLetter(dup, undefined, 'credit').body).toMatch(/an account credit of/)
    expect(generateLetter(dup, undefined, 'offset').body).toMatch(/applied against our next payment/)
    const discount = findings.find((f) => f.type === 'unclaimed_discount')!
    expect(generateLetter(discount, undefined, 'refund').subject).toMatch(/refund/i)
    expect(generateLetter(discount, undefined, 'credit').subject).toMatch(/credit/i)
  })

  it('names every invoice the duplicate covers, once', () => {
    const dup = findings.find((f) => f.vendor === 'Sierra Coffee Supply')!
    const { subject } = generateLetter(dup)
    expect(subject).toContain('invoice INV-1001')
    expect(subject).not.toContain('INV-1001 and INV-1001')
  })

  it('falls back to a generic sign-off when no sender profile exists', () => {
    const dup = findings.find((f) => f.type === 'exact_duplicate')!
    expect(generateLetter(dup).body).toContain('Accounts Payable Team')
  })
})

describe('letter generator — adversarial', () => {
  const recoverable = findings.filter((f) => f.class === 'recoverable')

  it('a partial request lowers the ask but never rewrites what the records show', () => {
    const dup = recoverable.find((f) => f.type === 'exact_duplicate' && f.dollarImpact === 6800)!
    const { subject, body } = generateLetter(dup, undefined, 'refund', 2500)
    expect(body).toContain(`combined duplicate amount of ${formatCurrency(6800)}`)
    expect(body).toContain(`a refund of ${formatCurrency(2500)}`)
    expect(body).not.toContain(`a refund of ${formatCurrency(6800)}`)
    expect(subject).toContain('INV-1001')
  })

  it('never asks for more than the finding supports, even if called with a larger amount', () => {
    const over = recoverable.find((f) => f.type === 'overpayment')!
    const { body } = generateLetter(over, undefined, 'credit', over.dollarImpact * 10)
    expect(body).toContain(`an account credit of ${formatCurrency(over.dollarImpact)}`)
    expect(body).not.toContain(formatCurrency(over.dollarImpact * 10))
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
    const [base] = recoverable
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
