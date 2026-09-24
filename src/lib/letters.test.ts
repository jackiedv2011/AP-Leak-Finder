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
